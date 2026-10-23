"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ChatController = void 0;
const chat_service_1 = require("../services/chat.service");
const types_1 = require("../types");
const errors_1 = require("../utils/errors");
class ChatController {
    chatService;
    constructor() {
        this.chatService = new chat_service_1.ChatService();
    }
    sendMessage = async (req, res) => {
        if (!req.user)
            throw new errors_1.UnauthorizedError();
        const { receiverId, message } = req.body;
        const chatMessage = await this.chatService.sendMessage(req.user.userId, receiverId, message);
        res.status(201).json({
            success: true,
            message: 'تم إرسال الرسالة بنجاح',
            data: chatMessage
        });
    };
    getMessages = async (req, res) => {
        if (!req.user)
            throw new errors_1.UnauthorizedError();
        let partnerId = req.query.partnerId;
        // If client didn't supply partnerId, get their admin
        if (!partnerId && req.user.role === types_1.UserRole.CLIENT) {
            const info = await this.chatService.getClientChatInfo(req.user.userId);
            partnerId = info.partner._id;
        }
        if (!partnerId) {
            throw new errors_1.BadRequestError('يرجى تحديد الطرف الآخر للمحادثة');
        }
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 50;
        const result = await this.chatService.getMessages(req.user.userId, partnerId, page, limit);
        res.status(200).json({
            success: true,
            data: result.items,
            pagination: {
                page: result.page,
                limit,
                total: result.total,
                totalPages: result.totalPages
            }
        });
    };
    markAsRead = async (req, res) => {
        if (!req.user)
            throw new errors_1.UnauthorizedError();
        const { partnerId } = req.body;
        if (!partnerId) {
            throw new errors_1.BadRequestError('يرجى تحديد معرف الطرف الآخر');
        }
        const count = await this.chatService.markAsRead(req.user.userId, partnerId);
        res.status(200).json({
            success: true,
            message: 'تم تحديد الرسائل كمقروءة',
            data: { modifiedCount: count }
        });
    };
    getConversations = async (req, res) => {
        if (!req.user)
            throw new errors_1.UnauthorizedError();
        const conversations = await this.chatService.getAdminConversations(req.user.userId);
        res.status(200).json({
            success: true,
            data: conversations
        });
    };
    getClientChatInfo = async (req, res) => {
        if (!req.user)
            throw new errors_1.UnauthorizedError();
        const info = await this.chatService.getClientChatInfo(req.user.userId);
        res.status(200).json({
            success: true,
            data: info
        });
    };
    getUnreadCount = async (req, res) => {
        if (!req.user)
            throw new errors_1.UnauthorizedError();
        const count = await this.chatService.getTotalUnreadCount(req.user.userId);
        res.status(200).json({
            success: true,
            data: { unreadCount: count }
        });
    };
}
exports.ChatController = ChatController;
