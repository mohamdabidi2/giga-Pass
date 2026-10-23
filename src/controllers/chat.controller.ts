import { Response } from 'express';
import { AuthenticatedRequest } from '../types';
import { ChatService } from '../services/chat.service';
import { UserRole } from '../types';
import { UnauthorizedError, BadRequestError } from '../utils/errors';

export class ChatController {
  private chatService: ChatService;

  constructor() {
    this.chatService = new ChatService();
  }

  sendMessage = async (req: AuthenticatedRequest, res: Response) => {
    if (!req.user) throw new UnauthorizedError();
    const { receiverId, message } = req.body;

    const chatMessage = await this.chatService.sendMessage(
      req.user.userId,
      receiverId,
      message
    );

    res.status(201).json({
      success: true,
      message: 'تم إرسال الرسالة بنجاح',
      data: chatMessage
    });
  };

  getMessages = async (req: AuthenticatedRequest, res: Response) => {
    if (!req.user) throw new UnauthorizedError();
    let partnerId = req.query.partnerId as string | undefined;

    // If client didn't supply partnerId, get their admin
    if (!partnerId && req.user.role === UserRole.CLIENT) {
      const info = await this.chatService.getClientChatInfo(req.user.userId);
      partnerId = info.partner._id;
    }

    if (!partnerId) {
      throw new BadRequestError('يرجى تحديد الطرف الآخر للمحادثة');
    }

    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 50;

    const result = await this.chatService.getMessages(
      req.user.userId,
      partnerId,
      page,
      limit
    );

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

  markAsRead = async (req: AuthenticatedRequest, res: Response) => {
    if (!req.user) throw new UnauthorizedError();
    const { partnerId } = req.body;

    if (!partnerId) {
      throw new BadRequestError('يرجى تحديد معرف الطرف الآخر');
    }

    const count = await this.chatService.markAsRead(req.user.userId, partnerId);

    res.status(200).json({
      success: true,
      message: 'تم تحديد الرسائل كمقروءة',
      data: { modifiedCount: count }
    });
  };

  getConversations = async (req: AuthenticatedRequest, res: Response) => {
    if (!req.user) throw new UnauthorizedError();
    const conversations = await this.chatService.getAdminConversations(req.user.userId);

    res.status(200).json({
      success: true,
      data: conversations
    });
  };

  getClientChatInfo = async (req: AuthenticatedRequest, res: Response) => {
    if (!req.user) throw new UnauthorizedError();
    const info = await this.chatService.getClientChatInfo(req.user.userId);

    res.status(200).json({
      success: true,
      data: info
    });
  };

  getUnreadCount = async (req: AuthenticatedRequest, res: Response) => {
    if (!req.user) throw new UnauthorizedError();
    const count = await this.chatService.getTotalUnreadCount(req.user.userId);

    res.status(200).json({
      success: true,
      data: { unreadCount: count }
    });
  };
}
