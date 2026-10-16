"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.OrderModel = void 0;
const mongoose_1 = require("mongoose");
const types_1 = require("../types");
const timelineEventSchema = new mongoose_1.Schema({
    status: {
        type: String,
        enum: Object.values(types_1.OrderStatus),
        required: true
    },
    message: {
        type: String,
        required: true
    },
    actorType: {
        type: String,
        enum: ['CLIENT', 'ADMIN', 'SYSTEM'],
        required: true
    },
    actorId: {
        type: String
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
}, { _id: false });
const orderSchema = new mongoose_1.Schema({
    orderNumber: {
        type: String,
        required: true,
        unique: true,
        index: true
    },
    adminId: {
        type: mongoose_1.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true
    },
    clientId: {
        type: mongoose_1.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true
    },
    packId: {
        type: mongoose_1.Schema.Types.ObjectId,
        ref: 'Pack',
        required: true
    },
    beneficiaryNumber: {
        type: String,
        required: true,
        trim: true,
        index: true
    },
    packNameSnapshot: {
        type: String,
        required: true
    },
    operatorSnapshot: {
        type: String,
        enum: Object.values(types_1.Operator),
        required: true
    },
    gigaSnapshot: {
        type: Number,
        required: true,
        min: 0
    },
    price: {
        type: Number,
        required: true,
        min: 0,
        set: (val) => Math.round(val * 1000) / 1000
    },
    status: {
        type: String,
        enum: Object.values(types_1.OrderStatus),
        default: types_1.OrderStatus.PENDING,
        index: true
    },
    timeline: [timelineEventSchema],
    selectedListId: {
        type: mongoose_1.Schema.Types.ObjectId,
        ref: 'RechargeList',
        default: null
    },
    selectedSimId: {
        type: mongoose_1.Schema.Types.ObjectId,
        ref: 'Sim',
        default: null
    },
    targetPhone: {
        type: String,
        default: null,
        trim: true
    },
    adminNotes: {
        type: String,
        default: null
    },
    rejectionReason: {
        type: String,
        default: null
    },
    packSnapshot: {
        type: mongoose_1.Schema.Types.Mixed,
        default: null
    },
    completedAt: Date,
    cancelledAt: Date,
    processedAt: Date,
    // Legacy compat fields
    networkId: { type: mongoose_1.Schema.Types.ObjectId, ref: 'Network', default: null },
    networkNameSnapshot: { type: String, default: '' },
    dataAmountSnapshot: { type: String, default: '' },
    confirmedAt: Date,
    rejectedAt: Date,
    metadata: {
        type: mongoose_1.Schema.Types.Mixed,
        default: {}
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
orderSchema.index({ adminId: 1, status: 1 });
orderSchema.index({ adminId: 1, createdAt: -1 });
orderSchema.index({ clientId: 1, status: 1 });
orderSchema.index({ status: 1, createdAt: -1 });
orderSchema.index({ createdAt: -1 });
exports.OrderModel = (0, mongoose_1.model)('Order', orderSchema);
