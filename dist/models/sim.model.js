"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SimModel = void 0;
const mongoose_1 = require("mongoose");
const types_1 = require("../types");
const simSchema = new mongoose_1.Schema({
    adminId: {
        type: mongoose_1.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true
    },
    listId: {
        type: mongoose_1.Schema.Types.ObjectId,
        ref: 'RechargeList',
        required: true,
        index: true
    },
    phoneNumber: {
        type: String,
        required: true,
        trim: true,
        index: true
    },
    operator: {
        type: String,
        enum: Object.values(types_1.Operator),
        required: true,
        index: true
    },
    initialGiga: {
        type: Number,
        required: true,
        min: [0, 'يجب أن يكون حجم الإنترنت الأولي أكبر من أو يساوي الصفر']
    },
    remainingGiga: {
        type: Number,
        required: true,
        min: [0, 'لا يمكن أن يكون رصيد الإنترنت المتبقي سالباً']
    },
    isActive: {
        type: Boolean,
        default: true
    },
    notes: {
        type: String,
        default: ''
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
simSchema.index({ adminId: 1, listId: 1 });
simSchema.index({ adminId: 1, operator: 1 });
simSchema.index({ listId: 1, remainingGiga: 1 });
exports.SimModel = (0, mongoose_1.model)('Sim', simSchema);
