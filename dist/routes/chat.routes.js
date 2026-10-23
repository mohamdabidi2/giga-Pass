"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const chat_controller_1 = require("../controllers/chat.controller");
const auth_middleware_1 = require("../middleware/auth.middleware");
const router = (0, express_1.Router)();
const controller = new chat_controller_1.ChatController();
router.use(auth_middleware_1.authenticate, auth_middleware_1.requireActive);
// Client & Admin common chat endpoints
router.post('/messages', controller.sendMessage);
router.get('/messages', controller.getMessages);
router.post('/read', controller.markAsRead);
router.get('/unread-count', controller.getUnreadCount);
router.get('/info', controller.getClientChatInfo);
// Admin-only endpoints
router.get('/conversations', auth_middleware_1.requireAdmin, controller.getConversations);
exports.default = router;
