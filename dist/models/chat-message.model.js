"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ChatMessageModel = exports.getConversationId = void 0;
const mongoose_1 = require("mongoose");
const getConversationId = (id1, id2) => {
    return [id1.toString(), id2.toString()].sort().join('_');
};
exports.getConversationId = getConversationId;
const chatMessageSchema = new mongoose_1.Schema({
    senderId: {
        type: mongoose_1.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true
    },
    receiverId: {
        type: mongoose_1.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true
    },
    conversationId: {
        type: String,
        required: true,
        index: true
    },
    message: {
        type: String,
        required: true,
        trim: true
    },
    isRead: {
        type: Boolean,
        default: false,
        index: true
    },
    readAt: {
        type: Date,
        default: null
    }
}, {
    timestamps: true,
    toJSON: {
        transform: (_, ret) => {
            delete ret.__v;
            return ret;
        }
    }
});
chatMessageSchema.index({ conversationId: 1, createdAt: -1 });
chatMessageSchema.index({ receiverId: 1, isRead: 1 });
chatMessageSchema.index({ senderId: 1, receiverId: 1 });
exports.ChatMessageModel = (0, mongoose_1.model)('ChatMessage', chatMessageSchema);
