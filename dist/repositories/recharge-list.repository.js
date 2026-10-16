"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RechargeListRepository = void 0;
const mongoose_1 = require("mongoose");
const recharge_list_model_1 = require("../models/recharge-list.model");
class RechargeListRepository {
    async create(data, session) {
        const [doc] = await recharge_list_model_1.RechargeListModel.create([data], session ? { session } : {});
        return doc;
    }
    async findById(id, session) {
        const q = recharge_list_model_1.RechargeListModel.findById(id);
        if (session)
            q.session(session);
        return q.exec();
    }
    async findByAdminId(adminId, operator) {
        const filter = { adminId: new mongoose_1.Types.ObjectId(adminId) };
        if (operator)
            filter.operator = operator;
        return recharge_list_model_1.RechargeListModel.find(filter).sort({ createdAt: -1 }).exec();
    }
    async updateById(id, update, session) {
        const q = recharge_list_model_1.RechargeListModel.findByIdAndUpdate(id, { $set: update }, { new: true });
        if (session)
            q.session(session);
        return q.exec();
    }
    async deleteById(id, session) {
        const q = recharge_list_model_1.RechargeListModel.findByIdAndDelete(id);
        if (session)
            q.session(session);
        const result = await q.exec();
        return !!result;
    }
    async count(adminId) {
        const filter = {};
        if (adminId)
            filter.adminId = new mongoose_1.Types.ObjectId(adminId);
        return recharge_list_model_1.RechargeListModel.countDocuments(filter);
    }
    async countByAdminId(adminId) {
        return this.count(adminId);
    }
    async belongsToAdmin(listId, adminId) {
        const doc = await recharge_list_model_1.RechargeListModel.findOne({
            _id: new mongoose_1.Types.ObjectId(listId),
            adminId: new mongoose_1.Types.ObjectId(adminId)
        }).lean();
        return !!doc;
    }
}
exports.RechargeListRepository = RechargeListRepository;
