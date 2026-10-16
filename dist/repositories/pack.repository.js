"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PackRepository = void 0;
const mongoose_1 = require("mongoose");
const pack_model_1 = require("../models/pack.model");
class PackRepository {
    async findAll(filter = {}) {
        return pack_model_1.PackModel.find(filter).sort({ price: 1 });
    }
    async findByAdminId(adminId, activeOnly = true) {
        const filter = { adminId: new mongoose_1.Types.ObjectId(adminId) };
        if (activeOnly) {
            filter.isActive = true;
        }
        return pack_model_1.PackModel.find(filter).sort({ price: 1 });
    }
    async findByOperator(adminId, operator, activeOnly = true) {
        const filter = {
            adminId: new mongoose_1.Types.ObjectId(adminId),
            operator
        };
        if (activeOnly) {
            filter.isActive = true;
        }
        return pack_model_1.PackModel.find(filter).sort({ price: 1 });
    }
    async findById(id) {
        return pack_model_1.PackModel.findById(id);
    }
    async create(data) {
        const pack = new pack_model_1.PackModel(data);
        return pack.save();
    }
    async updateById(id, data) {
        return pack_model_1.PackModel.findByIdAndUpdate(id, data, { new: true });
    }
    async deleteById(id) {
        return pack_model_1.PackModel.findByIdAndDelete(id);
    }
    async countByOperator(adminId) {
        const match = { isActive: true };
        if (adminId) {
            match.adminId = new mongoose_1.Types.ObjectId(adminId);
        }
        return pack_model_1.PackModel.aggregate([
            { $match: match },
            { $group: { _id: '$operator', count: { $sum: 1 } } },
            { $project: { operator: '$_id', count: 1, _id: 0 } }
        ]);
    }
}
exports.PackRepository = PackRepository;
