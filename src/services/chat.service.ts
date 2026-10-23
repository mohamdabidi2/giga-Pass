import { Types } from 'mongoose';
import { ChatMessageModel, getConversationId, IChatMessage } from '../models/chat-message.model';
import { UserModel, IUser } from '../models/user.model';
import { NotificationModel } from '../models/notification.model';
import { NotificationType, UserRole } from '../types';
import { NotFoundError, BadRequestError } from '../utils/errors';
import { SocketEmitter } from '../sockets/socket.service';
import { FcmEmitter } from './fcm.service';
import { logger } from '../utils/logger';

export interface ChatConversationSummary {
  partner: {
    _id: string;
    fullName: string;
    username: string;
    phone?: string;
    role: UserRole;
    balance?: number;
    debt?: number;
  };
  lastMessage?: {
    _id: string;
    senderId: string;
    message: string;
    createdAt: Date;
    isRead: boolean;
  };
  unreadCount: number;
}

export class ChatService {
  /**
   * Send a chat message between client and admin.
   */
  async sendMessage(senderId: string, receiverId?: string, messageText?: string): Promise<IChatMessage> {
    if (!messageText || messageText.trim().length === 0) {
      throw new BadRequestError('نص الرسالة لا يمكن أن يكون فارغًا');
    }

    const trimmedMessage = messageText.trim();
    const sender = await UserModel.findById(senderId);
    if (!sender) {
      throw new NotFoundError('المستخدم المرسل غير موجود');
    }

    let targetReceiverId = receiverId;

    // If sender is a CLIENT, resolve their admin
    if (sender.role === UserRole.CLIENT) {
      if (!targetReceiverId) {
        if (sender.adminId) {
          targetReceiverId = sender.adminId.toString();
        } else {
          // Fallback to first available admin
          const defaultAdmin = await UserModel.findOne({ role: UserRole.ADMIN });
          if (!defaultAdmin) {
            throw new BadRequestError('لا يوجد مدير متاح حاليًا');
          }
          targetReceiverId = defaultAdmin._id.toString();
        }
      }
    } else {
      // Sender is ADMIN: targetReceiverId is required
      if (!targetReceiverId) {
        throw new BadRequestError('يرجى تحديد العميل المستلم');
      }
    }

    const receiver = await UserModel.findById(targetReceiverId);
    if (!receiver) {
      throw new NotFoundError('المستلم غير موجود');
    }

    const convId = getConversationId(sender._id, receiver._id);

    // Create the message in DB
    const chatMessage = await ChatMessageModel.create({
      senderId: sender._id,
      receiverId: receiver._id,
      conversationId: convId,
      message: trimmedMessage,
      isRead: false
    });

    const populatedMessage = await ChatMessageModel.findById(chatMessage._id)
      .populate('senderId', 'fullName username role')
      .populate('receiverId', 'fullName username role')
      .lean();

    // 1. Emit real-time socket events
    SocketEmitter.emitToUser(receiver._id.toString(), 'chat.message', populatedMessage);
    SocketEmitter.emitToUser(sender._id.toString(), 'chat.message', populatedMessage);

    // If receiver is admin, also notify admin room so all active admin sessions get the alert
    if (receiver.role === UserRole.ADMIN) {
      SocketEmitter.emitToAdmin(receiver._id.toString(), 'chat.message', populatedMessage);
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
    SocketEmitter.emitToUser(receiver._id.toString(), 'chat.conversation_updated', convUpdate);
    SocketEmitter.emitToUser(sender._id.toString(), 'chat.conversation_updated', {
      ...convUpdate,
      partnerId: receiver._id.toString(),
      partnerName: receiver.fullName
    });

    // 2. In-app Notification for bell & persistent log
    try {
      const notifTitle = `رسالة جديدة من ${sender.fullName}`;
      const notifBody = trimmedMessage.length > 80 ? trimmedMessage.slice(0, 77) + '...' : trimmedMessage;

      const notif = await NotificationModel.create({
        userId: receiver._id,
        title: notifTitle,
        message: notifBody,
        type: NotificationType.CHAT_MESSAGE,
        isRead: false,
        metadata: {
          senderId: sender._id.toString(),
          senderName: sender.fullName,
          conversationId: convId,
          route: receiver.role === UserRole.ADMIN ? `/admin/chat/${sender._id}` : '/chat'
        }
      });

      // Emit notification to receiver's socket for toast & bell count
      SocketEmitter.emitToUser(receiver._id.toString(), 'notification.created', notif);
      if (receiver.role === UserRole.ADMIN) {
        SocketEmitter.emitToAdmin(receiver._id.toString(), 'notification.created', notif);
      }

      // 3. Send Push Notification via FCM (works when app is in background/closed)
      const targetRoute = receiver.role === UserRole.ADMIN ? `/admin/chat/${sender._id}` : '/chat';
      await FcmEmitter.emitToUser(receiver._id.toString(), notifTitle, notifBody, {
        route: targetRoute,
        type: 'chat',
        senderId: sender._id.toString(),
        conversationId: convId
      });
    } catch (err: any) {
      logger.warn({ err: err?.message }, 'Failed to dispatch chat push notification');
    }

    return populatedMessage as unknown as IChatMessage;
  }

  /**
   * Get message history between two users (paginated).
   */
  async getMessages(
    user1Id: string,
    user2Id: string,
    page = 1,
    limit = 50
  ): Promise<{ items: IChatMessage[]; total: number; page: number; totalPages: number }> {
    const convId = getConversationId(user1Id, user2Id);
    const skip = (page - 1) * limit;

    const [items, total] = await Promise.all([
      ChatMessageModel.find({ conversationId: convId })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate('senderId', 'fullName username role')
        .populate('receiverId', 'fullName username role')
        .lean(),
      ChatMessageModel.countDocuments({ conversationId: convId })
    ]);

    // Return in chronological order (oldest to newest for chat view)
    return {
      items: (items.reverse() as unknown) as IChatMessage[],
      total,
      page,
      totalPages: Math.ceil(total / limit)
    };
  }

  /**
   * Mark all unread messages from a partner as read.
   */
  async markAsRead(currentUserId: string, partnerId: string): Promise<number> {
    const convId = getConversationId(currentUserId, partnerId);
    const result = await ChatMessageModel.updateMany(
      {
        conversationId: convId,
        receiverId: new Types.ObjectId(currentUserId),
        isRead: false
      },
      {
        $set: {
          isRead: true,
          readAt: new Date()
        }
      }
    );

    if (result.modifiedCount > 0) {
      // Notify partner that messages were read
      SocketEmitter.emitToUser(partnerId, 'chat.read', {
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
  async getAdminConversations(adminId: string): Promise<ChatConversationSummary[]> {
    // 1. Get all clients associated with this admin
    const adminObjectId = new Types.ObjectId(adminId);
    const clients = await UserModel.find({
      $or: [
        { adminId: adminObjectId },
        { role: UserRole.CLIENT } // If clients aren't strictly partitioned, include all
      ]
    })
      .select('_id fullName username phone role balance debt status')
      .lean();

    if (!clients.length) return [];

    const summaries: ChatConversationSummary[] = [];

    // 2. Fetch last message and unread count for each client
    for (const client of clients) {
      const convId = getConversationId(adminId, client._id);

      const [lastMsg, unreadCount] = await Promise.all([
        ChatMessageModel.findOne({ conversationId: convId })
          .sort({ createdAt: -1 })
          .lean(),
        ChatMessageModel.countDocuments({
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
      if (aTime !== bTime) return bTime - aTime;
      // If neither has messages, sort by unread count then name
      if (b.unreadCount !== a.unreadCount) return b.unreadCount - a.unreadCount;
      return a.partner.fullName.localeCompare(b.partner.fullName);
    });

    return summaries;
  }

  /**
   * For Client: Get their assigned admin info, last message, and unread count.
   */
  async getClientChatInfo(clientId: string): Promise<ChatConversationSummary> {
    const client = await UserModel.findById(clientId);
    if (!client) {
      throw new NotFoundError('العميل غير موجود');
    }

    let admin: IUser | null = null;
    if (client.adminId) {
      admin = await UserModel.findById(client.adminId);
    }
    if (!admin) {
      admin = await UserModel.findOne({ role: UserRole.ADMIN });
    }
    if (!admin) {
      throw new NotFoundError('لا يوجد مدير متاح حاليًا');
    }

    const convId = getConversationId(clientId, admin._id);

    const [lastMsg, unreadCount] = await Promise.all([
      ChatMessageModel.findOne({ conversationId: convId })
        .sort({ createdAt: -1 })
        .lean(),
      ChatMessageModel.countDocuments({
        conversationId: convId,
        receiverId: new Types.ObjectId(clientId),
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
  async getTotalUnreadCount(userId: string): Promise<number> {
    return ChatMessageModel.countDocuments({
      receiverId: new Types.ObjectId(userId),
      isRead: false
    });
  }
}
