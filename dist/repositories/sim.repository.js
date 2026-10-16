"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SimRepository = void 0;
const mongoose_1 = require("mongoose");
const sim_model_1 = require("../models/sim.model");
class SimRepository {
    async create(data, session) {
        const [doc] = await sim_model_1.SimModel.create([data], session ? { session } : {});
        return doc;
    }
    async findById(id, session) {
        const q = sim_model_1.SimModel.findById(id);
        if (session)
            q.session(session);
        return q.exec();
    }
    async findByListId(listId) {
        return sim_model_1.SimModel.find({ listId: new mongoose_1.Types.ObjectId(listId) }).sort({ createdAt: -1 }).exec();
    }
    async findByAdminId(adminId, operator) {
        const filter = { adminId: new mongoose_1.Types.ObjectId(adminId) };
        if (operator)
            filter.operator = operator;
        return sim_model_1.SimModel.find(filter).sort({ createdAt: -1 }).exec();
    }
    async findByListIds(listIds) {
        return sim_model_1.SimModel.find({ listId: { $in: listIds } }).sort({ listId: 1, createdAt: -1 }).exec();
    }
    async updateById(id, update, session) {
        const q = sim_model_1.SimModel.findByIdAndUpdate(id, { $set: update }, { new: true });
        if (session)
            q.session(session);
        return q.exec();
    }
    /**
     * Atomically deduct gigaToDeduct from remainingGiga.
     * Uses $inc with $gte guard to prevent negative balances.
     * Returns updated document or null if insufficient balance.
     */
    async atomicDeductGiga(simId, gigaToDeduct, session) {
        const q = sim_model_1.SimModel.findOneAndUpdate({
            _id: new mongoose_1.Types.ObjectId(simId),
            remainingGiga: { $gte: gigaToDeduct } // Guard: enough balance
        }, {
            $inc: { remainingGiga: -gigaToDeduct }
        }, { new: true });
        if (session)
            q.session(session);
        return q.exec();
    }
    async deleteById(id, session) {
        const q = sim_model_1.SimModel.findByIdAndDelete(id);
        if (session)
            q.session(session);
        const result = await q.exec();
        return !!result;
    }
    async deleteByListId(listId, session) {
        const q = sim_model_1.SimModel.deleteMany({ listId: new mongoose_1.Types.ObjectId(listId) });
        if (session)
            q.session(session);
        const result = await q.exec();
        return result.deletedCount;
    }
    async count(adminId) {
        const filter = {};
        if (adminId)
            filter.adminId = new mongoose_1.Types.ObjectId(adminId);
        return sim_model_1.SimModel.countDocuments(filter);
    }
    async countByAdminId(adminId) {
        return this.count(adminId);
    }
    async getTotalRemainingGiga(adminId) {
        const result = await sim_model_1.SimModel.aggregate([
            { $match: { adminId: new mongoose_1.Types.ObjectId(adminId) } },
            { $group: { _id: null, total: { $sum: '$remainingGiga' } } }
        ]);
        return result[0]?.total ?? 0;
    }
    async belongsToAdminAndList(simId, listId, adminId) {
        const doc = await sim_model_1.SimModel.findOne({
            _id: new mongoose_1.Types.ObjectId(simId),
            listId: new mongoose_1.Types.ObjectId(listId),
            adminId: new mongoose_1.Types.ObjectId(adminId)
        }).lean();
        return !!doc;
    }
}
exports.SimRepository = SimRepository;
