"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RechargeHistoryModel = void 0;
const mongoose_1 = require("mongoose");
const rechargeHistorySchema = new mongoose_1.Schema({
    adminId: {
        type: mongoose_1.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true
    },
    orderId: {
        type: mongoose_1.Schema.Types.ObjectId,
        ref: 'Order',
        required: true,
        unique: true, // One recharge record per order — prevents duplicates
        index: true
    },
    listId: {
        type: mongoose_1.Schema.Types.ObjectId,
        ref: 'RechargeList',
        required: true
    },
    simId: {
        type: mongoose_1.Schema.Types.ObjectId,
        ref: 'Sim',
        required: true,
        index: true
    },
    beneficiaryNumber: {
        type: String,
        required: true,
        trim: true
    },
    deductedGiga: {
        type: Number,
        required: true,
        min: 0
    },
    balanceBefore: {
        type: Number,
        required: true,
        min: 0
    },
    balanceAfter: {
        type: Number,
        required: true,
        min: 0
    },
    completedAt: {
        type: Date,
        required: true,
        default: Date.now
    },
    screenshot: {
        type: String,
        default: null
    },
    screenshotUploadedAt: {
        type: Date,
        default: null
    },
    screenshotExpired: {
        type: Boolean,
        default: false
    }
}, {
    timestamps: { createdAt: true, updatedAt: false },
    toJSON: {
        transform: (_, ret) => {
            delete ret.__v;
            return ret;
        }
    }
});
rechargeHistorySchema.index({ adminId: 1, completedAt: -1 });
rechargeHistorySchema.index({ simId: 1, completedAt: -1 });
exports.RechargeHistoryModel = (0, mongoose_1.model)('RechargeHistory', rechargeHistorySchema);
