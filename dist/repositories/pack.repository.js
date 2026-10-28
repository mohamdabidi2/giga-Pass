"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PackRepository = void 0;
const mongoose_1 = require("mongoose");
const pack_model_1 = require("../models/pack.model");
const types_1 = require("../types");
class PackRepository {
    async findAll(filter = {}) {
        const packs = await pack_model_1.PackModel.find(filter);
        const opOrder = {
            [types_1.Operator.TUNISIE_TELECOM]: 1,
            [types_1.Operator.ORANGE]: 2,
            [types_1.Operator.OOREDOO]: 3
        };
        return packs.sort((a, b) => {
            const orderA = opOrder[a.operator] || 99;
            const orderB = opOrder[b.operator] || 99;
            if (orderA !== orderB)
                return orderA - orderB;
            if (a.giga !== b.giga)
                return a.giga - b.giga;
            return a.price - b.price;
        });
    }
    async findByAdminId(adminId, activeOnly = true) {
        const filter = { adminId: new mongoose_1.Types.ObjectId(adminId) };
        if (activeOnly) {
            filter.isActive = true;
        }
        return this.findAll(filter);
    }
    async findByOperator(adminId, operator, activeOnly = true) {
        const filter = {
            adminId: new mongoose_1.Types.ObjectId(adminId),
            operator
        };
        if (activeOnly) {
            filter.isActive = true;
        }
        const packs = await pack_model_1.PackModel.find(filter);
        return packs.sort((a, b) => {
            if (a.giga !== b.giga)
                return a.giga - b.giga;
            return a.price - b.price;
        });
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
