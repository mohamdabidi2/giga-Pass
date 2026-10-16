"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RechargeController = void 0;
const recharge_service_1 = require("../services/recharge.service");
const response_1 = require("../utils/response");
class RechargeController {
    rechargeService;
    constructor() {
        this.rechargeService = new recharge_service_1.RechargeService();
    }
    // ─── Recharge Lists ────────────────────────────────────────────────────────
    createList = async (req, res, next) => {
        try {
            const adminId = req.user.userId;
            const { name, email, password, operator } = req.body;
            const list = await this.rechargeService.createList(adminId, {
                name,
                email,
                password,
                operator
            });
            return response_1.ApiResponse.success(res, list, 'تم إنشاء قائمة الشحن بنجاح', 201);
        }
        catch (error) {
            next(error);
        }
    };
    getLists = async (req, res, next) => {
        try {
            const adminId = req.user.userId;
            const operator = req.query.operator;
            const lists = await this.rechargeService.getLists(adminId, operator);
            return response_1.ApiResponse.success(res, lists, 'تم جلب قوائم الشحن بنجاح');
        }
        catch (error) {
            next(error);
        }
    };
    getListById = async (req, res, next) => {
        try {
            const adminId = req.user.userId;
            const list = await this.rechargeService.getListById(req.params.id, adminId);
            return response_1.ApiResponse.success(res, list);
        }
        catch (error) {
            next(error);
        }
    };
    updateList = async (req, res, next) => {
        try {
            const adminId = req.user.userId;
            const list = await this.rechargeService.updateList(req.params.id, adminId, req.body);
            return response_1.ApiResponse.success(res, list, 'تم تعديل قائمة الشحن بنجاح');
        }
        catch (error) {
            next(error);
        }
    };
    deleteList = async (req, res, next) => {
        try {
            const adminId = req.user.userId;
            await this.rechargeService.deleteList(req.params.id, adminId);
            return response_1.ApiResponse.success(res, null, 'تم حذف قائمة الشحن بنجاح');
        }
        catch (error) {
            next(error);
        }
    };
    // ─── SIMs ──────────────────────────────────────────────────────────────────
    createSim = async (req, res, next) => {
        try {
            const adminId = req.user.userId;
            const { listId, phoneNumber, initialGiga, remainingGiga, notes } = req.body;
            const sim = await this.rechargeService.createSim(adminId, {
                listId: listId || req.params.listId,
                phoneNumber,
                initialGiga: parseFloat(initialGiga),
                remainingGiga: remainingGiga !== undefined ? parseFloat(remainingGiga) : undefined,
                notes
            });
            return response_1.ApiResponse.success(res, sim, 'تمت إضافة الشريحة بنجاح', 201);
        }
        catch (error) {
            next(error);
        }
    };
    getSimsByList = async (req, res, next) => {
        try {
            const adminId = req.user.userId;
            const sims = await this.rechargeService.getSimsByList(req.params.listId, adminId);
            return response_1.ApiResponse.success(res, sims, 'تم جلب شرائح القائمة بنجاح');
        }
        catch (error) {
            next(error);
        }
    };
    adjustSimGiga = async (req, res, next) => {
        try {
            const adminId = req.user.userId;
            const { adjustment } = req.body;
            const sim = await this.rechargeService.adjustSimGiga(req.params.id, adminId, parseFloat(adjustment));
            return response_1.ApiResponse.success(res, sim, 'تم تحديث رصيد الشريحة بنجاح');
        }
        catch (error) {
            next(error);
        }
    };
    updateSim = async (req, res, next) => {
        try {
            const adminId = req.user.userId;
            const sim = await this.rechargeService.updateSim(req.params.id, adminId, req.body);
            return response_1.ApiResponse.success(res, sim, 'تم تعديل بيانات الشريحة بنجاح');
        }
        catch (error) {
            next(error);
        }
    };
    deleteSim = async (req, res, next) => {
        try {
            const adminId = req.user.userId;
            await this.rechargeService.deleteSim(req.params.id, adminId);
            return response_1.ApiResponse.success(res, null, 'تم حذف الشريحة بنجاح');
        }
        catch (error) {
            next(error);
        }
    };
    // ─── Recharge Flow (Dialog 'تم الشحن') ──────────────────────────────────────
    completeRecharge = async (req, res, next) => {
        try {
            const adminId = req.user.userId;
            const { orderId, listId, simId, notes } = req.body;
            const result = await this.rechargeService.completeRecharge({
                adminId,
                orderId,
                listId,
                simId,
                notes
            });
            return response_1.ApiResponse.success(res, result, 'تم إتمام عملية الشحن وخصم الرصيد بنجاح! 🚀');
        }
        catch (error) {
            next(error);
        }
    };
}
exports.RechargeController = RechargeController;
