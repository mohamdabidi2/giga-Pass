import { Router } from 'express';
import { ChatController } from '../controllers/chat.controller';
import { authenticate, requireActive, requireAdmin } from '../middleware/auth.middleware';

const router = Router();
const controller = new ChatController();

router.use(authenticate, requireActive);

// Client & Admin common chat endpoints
router.post('/messages', controller.sendMessage);
router.get('/messages', controller.getMessages);
router.post('/read', controller.markAsRead);
router.get('/unread-count', controller.getUnreadCount);
router.get('/info', controller.getClientChatInfo);

// Admin-only endpoints
router.get('/conversations', requireAdmin, controller.getConversations);

export default router;
