"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PackService = void 0;
const mongoose_1 = require("mongoose");
const pack_repository_1 = require("../repositories/pack.repository");
const errors_1 = require("../utils/errors");
const types_1 = require("../types");
class PackService {
    packRepo;
    constructor() {
        this.packRepo = new pack_repository_1.PackRepository();
    }
    async getAll(adminId, activeOnly = false) {
        const filter = {};
        if (adminId) {
            filter.adminId = new mongoose_1.Types.ObjectId(adminId);
        }
        if (activeOnly) {
            filter.isActive = true;
        }
        return this.packRepo.findAll(filter);
    }
    async getByOperator(adminId, operator, activeOnly = true) {
        return this.packRepo.findByOperator(adminId, operator, activeOnly);
    }
    async getById(id, adminId) {
        const pack = await this.packRepo.findById(id);
        if (!pack) {
            throw new errors_1.NotFoundError('الباقة المطلوبة غير موجودة', types_1.ErrorCode.PACK_NOT_FOUND);
        }
        if (adminId && pack.adminId.toString() !== adminId) {
            throw new errors_1.ForbiddenError('غير مصرح بالوصول إلى هذه الباقة', types_1.ErrorCode.FORBIDDEN);
        }
        return pack;
    }
    async create(adminId, data) {
        if (!data.name || data.giga === undefined || data.price === undefined || !data.operator) {
            throw new errors_1.AppError('بيانات الباقة غير مكتملة (الاسم، الجيجا، السعر، المشغل)', 400, types_1.ErrorCode.VALIDATION_ERROR);
        }
        return this.packRepo.create({
            ...data,
            adminId: new mongoose_1.Types.ObjectId(adminId),
            isActive: data.isActive !== undefined ? data.isActive : true
        });
    }
    async update(id, adminId, data) {
        const pack = await this.getById(id, adminId);
        const updated = await this.packRepo.updateById(pack._id.toString(), data);
        if (!updated) {
            throw new errors_1.NotFoundError('الباقة غير موجودة', types_1.ErrorCode.PACK_NOT_FOUND);
        }
        return updated;
    }
    async toggleStatus(id, adminId, isActive) {
        return this.update(id, adminId, { isActive });
    }
    async delete(id, adminId) {
        await this.getById(id, adminId);
        const deleted = await this.packRepo.deleteById(id);
        if (!deleted) {
            throw new errors_1.NotFoundError('الباقة غير موجودة', types_1.ErrorCode.PACK_NOT_FOUND);
        }
    }
}
exports.PackService = PackService;
