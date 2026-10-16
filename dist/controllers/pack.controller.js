"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PackController = void 0;
const pack_service_1 = require("../services/pack.service");
const response_1 = require("../utils/response");
const types_1 = require("../types");
class PackController {
    packService;
    constructor() {
        this.packService = new pack_service_1.PackService();
    }
    getAll = async (req, res, next) => {
        try {
            const operator = req.query.operator;
            const activeOnly = req.query.activeOnly !== 'false';
            // If user is client, use client's adminId. If admin, use their own userId.
            let adminId;
            if (req.user?.role === types_1.UserRole.CLIENT) {
                adminId = req.user.adminId;
            }
            else if (req.user?.role === types_1.UserRole.ADMIN) {
                adminId = req.user.userId;
            }
            let packs;
            if (adminId && operator) {
                packs = await this.packService.getByOperator(adminId, operator, activeOnly);
            }
            else {
                packs = await this.packService.getAll(adminId, activeOnly);
            }
            return response_1.ApiResponse.success(res, packs, 'تم جلب الباقات بنجاح');
        }
        catch (error) {
            next(error);
        }
    };
    getById = async (req, res, next) => {
        try {
            const adminId = req.user?.role === types_1.UserRole.ADMIN ? req.user.userId : req.user?.adminId;
            const pack = await this.packService.getById(req.params.id, adminId);
            return response_1.ApiResponse.success(res, pack);
        }
        catch (error) {
            next(error);
        }
    };
    create = async (req, res, next) => {
        try {
            const adminId = req.user.userId;
            const pack = await this.packService.create(adminId, req.body);
            return response_1.ApiResponse.success(res, pack, 'تمت إضافة الباقة بنجاح', 201);
        }
        catch (error) {
            next(error);
        }
    };
    update = async (req, res, next) => {
        try {
            const adminId = req.user.userId;
            const pack = await this.packService.update(req.params.id, adminId, req.body);
            return response_1.ApiResponse.success(res, pack, 'تم تعديل الباقة بنجاح');
        }
        catch (error) {
            next(error);
        }
    };
    toggleStatus = async (req, res, next) => {
        try {
            const adminId = req.user.userId;
            const { isActive } = req.body;
            const pack = await this.packService.toggleStatus(req.params.id, adminId, Boolean(isActive));
            return response_1.ApiResponse.success(res, pack, 'تم تحديث حالة الباقة');
        }
        catch (error) {
            next(error);
        }
    };
    delete = async (req, res, next) => {
        try {
            const adminId = req.user.userId;
            await this.packService.delete(req.params.id, adminId);
            return response_1.ApiResponse.success(res, null, 'تم حذف الباقة بنجاح');
        }
        catch (error) {
            next(error);
        }
    };
}
exports.PackController = PackController;
