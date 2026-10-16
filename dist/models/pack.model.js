"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PackModel = void 0;
const mongoose_1 = require("mongoose");
const types_1 = require("../types");
const packSchema = new mongoose_1.Schema({
    adminId: {
        type: mongoose_1.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true
    },
    name: {
        type: String,
        required: true,
        trim: true
    },
    operator: {
        type: String,
        enum: Object.values(types_1.Operator),
        required: true,
        index: true
    },
    giga: {
        type: Number,
        required: true,
        min: [0.1, 'يجب أن يكون حجم الإنترنت أكبر من 0'],
        set: (val) => Math.round(val * 1000) / 1000
    },
    price: {
        type: Number,
        required: true,
        min: [0, 'لا يمكن أن يكون السعر أقل من 0'],
        set: (val) => Math.round(val * 1000) / 1000
    },
    description: {
        type: String,
        default: '',
        trim: true
    },
    validityDays: {
        type: Number,
        default: 30,
        min: [1, 'يجب أن تكون مدة الصلاحية أكبر من صفر']
    },
    isActive: {
        type: Boolean,
        default: true,
        index: true
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
packSchema.index({ adminId: 1, operator: 1, isActive: 1 });
packSchema.index({ adminId: 1, isActive: 1 });
exports.PackModel = (0, mongoose_1.model)('Pack', packSchema);
