"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RechargeHistoryRepository = void 0;
const mongoose_1 = require("mongoose");
const recharge_history_model_1 = require("../models/recharge-history.model");
class RechargeHistoryRepository {
    async create(data, session) {
        const [doc] = await recharge_history_model_1.RechargeHistoryModel.create([data], session ? { session } : {});
        return doc;
    }
    async findByOrderId(orderId) {
        return recharge_history_model_1.RechargeHistoryModel.findOne({ orderId: new mongoose_1.Types.ObjectId(orderId) }).exec();
    }
    async existsByOrderId(orderId, session) {
        const q = recharge_history_model_1.RechargeHistoryModel.exists({ orderId: new mongoose_1.Types.ObjectId(orderId) });
        if (session)
            q.session(session);
        const result = await q.exec();
        return !!result;
    }
    async findBySimId(simId, page = 1, limit = 20) {
        return recharge_history_model_1.RechargeHistoryModel
            .find({ simId: new mongoose_1.Types.ObjectId(simId) })
            .sort({ completedAt: -1 })
            .skip((page - 1) * limit)
            .limit(limit)
            .exec();
    }
    async findByAdminId(adminId, page = 1, limit = 20) {
        return recharge_history_model_1.RechargeHistoryModel
            .find({ adminId: new mongoose_1.Types.ObjectId(adminId) })
            .sort({ completedAt: -1 })
            .skip((page - 1) * limit)
            .limit(limit)
            .exec();
    }
}
exports.RechargeHistoryRepository = RechargeHistoryRepository;
