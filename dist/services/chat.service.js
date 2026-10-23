"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ChatService = void 0;
const mongoose_1 = require("mongoose");
const chat_message_model_1 = require("../models/chat-message.model");
const user_model_1 = require("../models/user.model");
const notification_model_1 = require("../models/notification.model");
const types_1 = require("../types");
const errors_1 = require("../utils/errors");
const socket_service_1 = require("../sockets/socket.service");
const fcm_service_1 = require("./fcm.service");
const logger_1 = require("../utils/logger");
class ChatService {
    /**
     * Send a chat message between client and admin.
     */
    async sendMessage(senderId, receiverId, messageText) {
        if (!messageText || messageText.trim().length === 0) {
            throw new errors_1.BadRequestError('نص الرسالة لا يمكن أن يكون فارغًا');
        }
        const trimmedMessage = messageText.trim();
        const sender = await user_model_1.UserModel.findById(senderId);
        if (!sender) {
            throw new errors_1.NotFoundError('المستخدم المرسل غير موجود');
        }
        let targetReceiverId = receiverId;
        // If sender is a CLIENT, resolve their admin
        if (sender.role === types_1.UserRole.CLIENT) {
            if (!targetReceiverId) {
                if (sender.adminId) {
                    targetReceiverId = sender.adminId.toString();
                }
                else {
                    // Fallback to first available admin
                    const defaultAdmin = await user_model_1.UserModel.findOne({ role: types_1.UserRole.ADMIN });
                    if (!defaultAdmin) {
                        throw new errors_1.BadRequestError('لا يوجد مدير متاح حاليًا');
                    }
                    targetReceiverId = defaultAdmin._id.toString();
                }
            }
        }
        else {
            // Sender is ADMIN: targetReceiverId is required
            if (!targetReceiverId) {
                throw new errors_1.BadRequestError('يرجى تحديد العميل المستلم');
            }
        }
        const receiver = await user_model_1.UserModel.findById(targetReceiverId);
        if (!receiver) {
            throw new errors_1.NotFoundError('المستلم غير موجود');
        }
        const convId = (0, chat_message_model_1.getConversationId)(sender._id, receiver._id);
        // Create the message in DB
        const chatMessage = await chat_message_model_1.ChatMessageModel.create({
            senderId: sender._id,
            receiverId: receiver._id,
            conversationId: convId,
            message: trimmedMessage,
            isRead: false
        });
        const populatedMessage = await chat_message_model_1.ChatMessageModel.findById(chatMessage._id)
            .populate('senderId', 'fullName username role')
            .populate('receiverId', 'fullName username role')
            .lean();
        // 1. Emit real-time socket events
        socket_service_1.SocketEmitter.emitToUser(receiver._id.toString(), 'chat.message', populatedMessage);
        socket_service_1.SocketEmitter.emitToUser(sender._id.toString(), 'chat.message', populatedMessage);
        // If receiver is admin, also notify admin room so all active admin sessions get the alert
        if (receiver.role === types_1.UserRole.ADMIN) {
            socket_service_1.SocketEmitter.emitToAdmin(receiver._id.toString(), 'chat.message', populatedMessage);
        }
        // Emit conversation updated event
        const convUpdate = {
            conversationId: convId,
            partnerId: sender._id.toString(),
            partnerName: sender.fullName,
            lastMessage: {
                _id: chatMessage._id.toString(),
                senderId: sender._id.toString(),
                message: trimmedMessage,
                createdAt: chatMessage.createdAt,
                isRead: false
            }
        };
        socket_service_1.SocketEmitter.emitToUser(receiver._id.toString(), 'chat.conversation_updated', convUpdate);
        socket_service_1.SocketEmitter.emitToUser(sender._id.toString(), 'chat.conversation_updated', {
            ...convUpdate,
            partnerId: receiver._id.toString(),
            partnerName: receiver.fullName
        });
        // 2. In-app Notification for bell & persistent log
        try {
            const notifTitle = `رسالة جديدة من ${sender.fullName}`;
            const notifBody = trimmedMessage.length > 80 ? trimmedMessage.slice(0, 77) + '...' : trimmedMessage;
            const notif = await notification_model_1.NotificationModel.create({
                userId: receiver._id,
                title: notifTitle,
                message: notifBody,
                type: types_1.NotificationType.CHAT_MESSAGE,
                isRead: false,
                metadata: {
                    senderId: sender._id.toString(),
                    senderName: sender.fullName,
                    conversationId: convId,
                    route: receiver.role === types_1.UserRole.ADMIN ? `/admin/chat/${sender._id}` : '/chat'
                }
            });
            // Emit notification to receiver's socket for toast & bell count
            socket_service_1.SocketEmitter.emitToUser(receiver._id.toString(), 'notification.created', notif);
            if (receiver.role === types_1.UserRole.ADMIN) {
                socket_service_1.SocketEmitter.emitToAdmin(receiver._id.toString(), 'notification.created', notif);
            }
            // 3. Send Push Notification via FCM (works when app is in background/closed)
            const targetRoute = receiver.role === types_1.UserRole.ADMIN ? `/admin/chat/${sender._id}` : '/chat';
            await fcm_service_1.FcmEmitter.emitToUser(receiver._id.toString(), notifTitle, notifBody, {
                route: targetRoute,
                type: 'chat',
                senderId: sender._id.toString(),
                conversationId: convId
            });
        }
        catch (err) {
            logger_1.logger.warn({ err: err?.message }, 'Failed to dispatch chat push notification');
        }
        return populatedMessage;
    }
    /**
     * Get message history between two users (paginated).
     */
    async getMessages(user1Id, user2Id, page = 1, limit = 50) {
        const convId = (0, chat_message_model_1.getConversationId)(user1Id, user2Id);
        const skip = (page - 1) * limit;
        const [items, total] = await Promise.all([
            chat_message_model_1.ChatMessageModel.find({ conversationId: convId })
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limit)
                .populate('senderId', 'fullName username role')
                .populate('receiverId', 'fullName username role')
                .lean(),
            chat_message_model_1.ChatMessageModel.countDocuments({ conversationId: convId })
        ]);
        // Return in chronological order (oldest to newest for chat view)
        return {
            items: items.reverse(),
            total,
            page,
            totalPages: Math.ceil(total / limit)
        };
    }
    /**
     * Mark all unread messages from a partner as read.
     */
    async markAsRead(currentUserId, partnerId) {
        const convId = (0, chat_message_model_1.getConversationId)(currentUserId, partnerId);
        const result = await chat_message_model_1.ChatMessageModel.updateMany({
            conversationId: convId,
            receiverId: new mongoose_1.Types.ObjectId(currentUserId),
            isRead: false
        }, {
            $set: {
                isRead: true,
                readAt: new Date()
            }
        });
        if (result.modifiedCount > 0) {
            // Notify partner that messages were read
            socket_service_1.SocketEmitter.emitToUser(partnerId, 'chat.read', {
                readBy: currentUserId,
                conversationId: convId,
                readAt: new Date()
            });
        }
        return result.modifiedCount;
    }
    /**
     * For Admin: Get list of client conversations with last message and unread count.
     */
    async getAdminConversations(adminId) {
        // 1. Get all clients associated with this admin
        const adminObjectId = new mongoose_1.Types.ObjectId(adminId);
        const clients = await user_model_1.UserModel.find({
            $or: [
                { adminId: adminObjectId },
                { role: types_1.UserRole.CLIENT } // If clients aren't strictly partitioned, include all
            ]
        })
            .select('_id fullName username phone role balance debt status')
            .lean();
        if (!clients.length)
            return [];
        const summaries = [];
        // 2. Fetch last message and unread count for each client
        for (const client of clients) {
            const convId = (0, chat_message_model_1.getConversationId)(adminId, client._id);
            const [lastMsg, unreadCount] = await Promise.all([
                chat_message_model_1.ChatMessageModel.findOne({ conversationId: convId })
                    .sort({ createdAt: -1 })
                    .lean(),
                chat_message_model_1.ChatMessageModel.countDocuments({
                    conversationId: convId,
                    receiverId: adminObjectId,
                    isRead: false
                })
            ]);
            summaries.push({
                partner: {
                    _id: client._id.toString(),
                    fullName: client.fullName,
                    username: client.username,
                    phone: client.phone,
                    role: client.role,
                    balance: client.balance,
                    debt: client.debt
                },
                lastMessage: lastMsg
                    ? {
                        _id: lastMsg._id.toString(),
                        senderId: lastMsg.senderId.toString(),
                        message: lastMsg.message,
                        createdAt: lastMsg.createdAt,
                        isRead: lastMsg.isRead
                    }
                    : undefined,
                unreadCount
            });
        }
        // Sort by latest message date descending (conversations with latest activity first)
        summaries.sort((a, b) => {
            const aTime = a.lastMessage?.createdAt ? new Date(a.lastMessage.createdAt).getTime() : 0;
            const bTime = b.lastMessage?.createdAt ? new Date(b.lastMessage.createdAt).getTime() : 0;
            if (aTime !== bTime)
                return bTime - aTime;
            // If neither has messages, sort by unread count then name
            if (b.unreadCount !== a.unreadCount)
                return b.unreadCount - a.unreadCount;
            return a.partner.fullName.localeCompare(b.partner.fullName);
        });
        return summaries;
    }
    /**
     * For Client: Get their assigned admin info, last message, and unread count.
     */
    async getClientChatInfo(clientId) {
        const client = await user_model_1.UserModel.findById(clientId);
        if (!client) {
            throw new errors_1.NotFoundError('العميل غير موجود');
        }
        let admin = null;
        if (client.adminId) {
            admin = await user_model_1.UserModel.findById(client.adminId);
        }
        if (!admin) {
            admin = await user_model_1.UserModel.findOne({ role: types_1.UserRole.ADMIN });
        }
        if (!admin) {
            throw new errors_1.NotFoundError('لا يوجد مدير متاح حاليًا');
        }
        const convId = (0, chat_message_model_1.getConversationId)(clientId, admin._id);
        const [lastMsg, unreadCount] = await Promise.all([
            chat_message_model_1.ChatMessageModel.findOne({ conversationId: convId })
                .sort({ createdAt: -1 })
                .lean(),
            chat_message_model_1.ChatMessageModel.countDocuments({
                conversationId: convId,
                receiverId: new mongoose_1.Types.ObjectId(clientId),
                isRead: false
            })
        ]);
        return {
            partner: {
                _id: admin._id.toString(),
                fullName: admin.fullName,
                username: admin.username,
                phone: admin.phone,
                role: admin.role
            },
            lastMessage: lastMsg
                ? {
                    _id: lastMsg._id.toString(),
                    senderId: lastMsg.senderId.toString(),
                    message: lastMsg.message,
                    createdAt: lastMsg.createdAt,
                    isRead: lastMsg.isRead
                }
                : undefined,
            unreadCount
        };
    }
    /**
     * Get total unread chat messages for any user.
     */
    async getTotalUnreadCount(userId) {
        return chat_message_model_1.ChatMessageModel.countDocuments({
            receiverId: new mongoose_1.Types.ObjectId(userId),
            isRead: false
        });
    }
}
exports.ChatService = ChatService;
