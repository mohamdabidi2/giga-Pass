"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.RechargeService = void 0;
const mongoose_1 = __importStar(require("mongoose"));
const recharge_list_repository_1 = require("../repositories/recharge-list.repository");
const sim_repository_1 = require("../repositories/sim.repository");
const recharge_history_repository_1 = require("../repositories/recharge-history.repository");
const order_repository_1 = require("../repositories/order.repository");
const user_repository_1 = require("../repositories/user.repository");
const notification_repository_1 = require("../repositories/notification.repository");
const recharge_list_model_1 = require("../models/recharge-list.model");
const types_1 = require("../types");
const errors_1 = require("../utils/errors");
const socket_service_1 = require("../sockets/socket.service");
const fcm_service_1 = require("./fcm.service");
const audit_log_repository_1 = require("../repositories/audit-log.repository");
class RechargeService {
    listRepo;
    simRepo;
    historyRepo;
    orderRepo;
    userRepo;
    notifRepo;
    auditRepo;
    constructor() {
        this.listRepo = new recharge_list_repository_1.RechargeListRepository();
        this.simRepo = new sim_repository_1.SimRepository();
        this.historyRepo = new recharge_history_repository_1.RechargeHistoryRepository();
        this.orderRepo = new order_repository_1.OrderRepository();
        this.userRepo = new user_repository_1.UserRepository();
        this.notifRepo = new notification_repository_1.NotificationRepository();
        this.auditRepo = new audit_log_repository_1.AuditLogRepository();
    }
    // ─── Recharge Lists ────────────────────────────────────────────────────────
    async createList(adminId, data) {
        if (!data.name || !data.email || !data.password || !data.operator) {
            throw new errors_1.AppError('يرجى تقديم كافة بيانات قائمة الشحن (الاسم، البريد، كلمة المرور، المشغل)', 400, types_1.ErrorCode.VALIDATION_ERROR);
        }
        const encrypted = (0, recharge_list_model_1.encryptPassword)(data.password);
        const list = await this.listRepo.create({
            adminId: new mongoose_1.Types.ObjectId(adminId),
            name: data.name.trim(),
            email: data.email.trim().toLowerCase(),
            encryptedPassword: encrypted,
            operator: data.operator,
            isActive: true
        });
        return {
            _id: list._id,
            name: list.name,
            email: list.email,
            password: data.password,
            operator: list.operator,
            isActive: list.isActive,
            createdAt: list.createdAt
        };
    }
    async getLists(adminId, operator) {
        const lists = await this.listRepo.findByAdminId(adminId, operator);
        const listsWithSims = await Promise.all(lists.map(async (list) => {
            const sims = await this.simRepo.findByListId(list._id.toString());
            const plainPassword = (0, recharge_list_model_1.decryptPassword)(list.encryptedPassword);
            return {
                _id: list._id,
                name: list.name,
                email: list.email,
                password: plainPassword,
                operator: list.operator,
                isActive: list.isActive,
                simsCount: sims.length,
                totalRemainingGiga: sims.reduce((acc, s) => acc + s.remainingGiga, 0),
                sims: sims.map(s => ({
                    _id: s._id,
                    phoneNumber: s.phoneNumber,
                    remainingGiga: s.remainingGiga,
                    initialGiga: s.initialGiga,
                    isActive: s.isActive
                })),
                createdAt: list.createdAt
            };
        }));
        return listsWithSims;
    }
    async getListById(listId, adminId) {
        const list = await this.listRepo.findById(listId);
        if (!list) {
            throw new errors_1.NotFoundError('قائمة الشحن غير موجودة', types_1.ErrorCode.RECHARGE_LIST_NOT_FOUND);
        }
        if (list.adminId.toString() !== adminId) {
            throw new errors_1.ForbiddenError('غير مصرح بالوصول إلى هذه القائمة', types_1.ErrorCode.FORBIDDEN);
        }
        const sims = await this.simRepo.findByListId(listId);
        const plainPassword = (0, recharge_list_model_1.decryptPassword)(list.encryptedPassword);
        return {
            _id: list._id,
            name: list.name,
            email: list.email,
            password: plainPassword,
            operator: list.operator,
            isActive: list.isActive,
            sims,
            createdAt: list.createdAt
        };
    }
    async updateList(listId, adminId, data) {
        await this.getListById(listId, adminId);
        const update = {};
        if (data.name)
            update.name = data.name.trim();
        if (data.email)
            update.email = data.email.trim().toLowerCase();
        if (data.operator)
            update.operator = data.operator;
        if (data.isActive !== undefined)
            update.isActive = data.isActive;
        if (data.password) {
            update.encryptedPassword = (0, recharge_list_model_1.encryptPassword)(data.password);
        }
        const updated = await this.listRepo.updateById(listId, update);
        return updated;
    }
    async deleteList(listId, adminId) {
        await this.getListById(listId, adminId);
        // Delete associated SIM cards
        await this.simRepo.deleteByListId(listId);
        await this.listRepo.deleteById(listId);
    }
    // ─── SIMs ──────────────────────────────────────────────────────────────────
    async createSim(adminId, data) {
        const list = await this.getListById(data.listId, adminId);
        if (!data.phoneNumber || data.initialGiga === undefined || data.initialGiga < 0) {
            throw new errors_1.AppError('يرجى تقديم رقم الهاتف وكمية الجيجا الأولية بشكل صحيح', 400, types_1.ErrorCode.VALIDATION_ERROR);
        }
        const remaining = data.remainingGiga !== undefined ? data.remainingGiga : data.initialGiga;
        const sim = await this.simRepo.create({
            adminId: new mongoose_1.Types.ObjectId(adminId),
            listId: new mongoose_1.Types.ObjectId(data.listId),
            phoneNumber: data.phoneNumber.trim(),
            operator: list.operator,
            initialGiga: data.initialGiga,
            remainingGiga: remaining,
            notes: data.notes?.trim() || '',
            isActive: true
        });
        return sim;
    }
    async getSimsByList(listId, adminId) {
        await this.getListById(listId, adminId);
        return this.simRepo.findByListId(listId);
    }
    async getAllSims(adminId, operator) {
        return this.simRepo.findByAdminId(adminId, operator);
    }
    async adjustSimGiga(simId, adminId, adjustment) {
        const sim = await this.simRepo.findById(simId);
        if (!sim) {
            throw new errors_1.NotFoundError('الشريحة غير موجودة', types_1.ErrorCode.SIM_NOT_FOUND);
        }
        if (sim.adminId.toString() !== adminId) {
            throw new errors_1.ForbiddenError('غير مصرح بالتعديل على هذه الشريحة', types_1.ErrorCode.FORBIDDEN);
        }
        const newRemaining = sim.remainingGiga + adjustment;
        if (newRemaining < 0) {
            throw new errors_1.AppError('رصيد الشريحة لا يمكن أن يصبح أقل من الصفر', 400, types_1.ErrorCode.INSUFFICIENT_SIM_BALANCE);
        }
        sim.remainingGiga = Math.round(newRemaining * 1000) / 1000;
        await sim.save();
        return sim;
    }
    async updateSim(simId, adminId, data) {
        const sim = await this.simRepo.findById(simId);
        if (!sim) {
            throw new errors_1.NotFoundError('الشريحة غير موجودة', types_1.ErrorCode.SIM_NOT_FOUND);
        }
        if (sim.adminId.toString() !== adminId) {
            throw new errors_1.ForbiddenError('غير مصرح بالتعديل على هذه الشريحة', types_1.ErrorCode.FORBIDDEN);
        }
        if (data.phoneNumber)
            sim.phoneNumber = data.phoneNumber.trim();
        if (data.remainingGiga !== undefined) {
            if (data.remainingGiga < 0)
                throw new errors_1.AppError('الرصيد لا يمكن أن يكون سالباً', 400, types_1.ErrorCode.VALIDATION_ERROR);
            sim.remainingGiga = data.remainingGiga;
        }
        if (data.isActive !== undefined)
            sim.isActive = data.isActive;
        if (data.notes !== undefined)
            sim.notes = data.notes.trim();
        await sim.save();
        return sim;
    }
    async deleteSim(simId, adminId) {
        const sim = await this.simRepo.findById(simId);
        if (!sim) {
            throw new errors_1.NotFoundError('الشريحة غير موجودة', types_1.ErrorCode.SIM_NOT_FOUND);
        }
        if (sim.adminId.toString() !== adminId) {
            throw new errors_1.ForbiddenError('غير مصرح بحذف هذه الشريحة', types_1.ErrorCode.FORBIDDEN);
        }
        await this.simRepo.deleteById(simId);
    }
    // ─── Execution Flow (Dialog 'تم الشحن') ─────────────────────────────────────
    async completeRecharge(params) {
        const { adminId, orderId, listId, simId, notes } = params;
        // 1. Fetch order
        const order = await this.orderRepo.findById(orderId);
        if (!order) {
            throw new errors_1.NotFoundError('الطلب غير موجود', types_1.ErrorCode.ORDER_NOT_FOUND);
        }
        // 2. Multi-admin validation: order must belong to this admin
        if (order.adminId.toString() !== adminId) {
            throw new errors_1.ForbiddenError('غير مصرح بإتمام طلب لا يتبع لإدارتك', types_1.ErrorCode.FORBIDDEN);
        }
        // 3. Status validation: cannot complete if already completed or cancelled
        if (order.status === types_1.OrderStatus.COMPLETED) {
            throw new errors_1.AppError('هذا الطلب مكتمل مسبقاً', 400, types_1.ErrorCode.ORDER_ALREADY_COMPLETED);
        }
        if (order.status === types_1.OrderStatus.CANCELLED || order.status === types_1.OrderStatus.REJECTED) {
            throw new errors_1.AppError('لا يمكن إتمام طلب ملغي أو مرفوض', 400, types_1.ErrorCode.INVALID_STATUS_TRANSITION);
        }
        // 4. Verify list belongs to admin
        const list = await this.listRepo.findById(listId);
        if (!list || list.adminId.toString() !== adminId) {
            throw new errors_1.NotFoundError('قائمة الشحن غير موجودة أو لا تتبع لك', types_1.ErrorCode.RECHARGE_LIST_NOT_FOUND);
        }
        // 5. Verify SIM belongs to list & admin
        const sim = await this.simRepo.findById(simId);
        if (!sim || sim.adminId.toString() !== adminId || sim.listId.toString() !== listId) {
            throw new errors_1.NotFoundError('الشريحة غير موجودة في القائمة المحددة', types_1.ErrorCode.SIM_NOT_FOUND);
        }
        // Determine giga amount needed
        const requiredGiga = order.gigaSnapshot || order.packId?.giga || 0;
        if (sim.remainingGiga < requiredGiga) {
            throw new errors_1.AppError(`رصيد الشريحة (${sim.remainingGiga} GB) غير كافٍ لشحن الباقة (${requiredGiga} GB)`, 400, types_1.ErrorCode.INSUFFICIENT_SIM_BALANCE);
        }
        // Operator match verification
        const orderOperator = order.operatorSnapshot || order.packId?.operator;
        if (orderOperator && sim.operator !== orderOperator) {
            throw new errors_1.AppError(`مشغل الشريحة (${sim.operator}) لا يطابق مشغل الطلب (${orderOperator})`, 400, types_1.ErrorCode.OPERATOR_MISMATCH);
        }
        // 6. Atomic MongoDB Transaction
        const session = await mongoose_1.default.startSession();
        session.startTransaction();
        let updatedOrder;
        let updatedSim;
        try {
            // 6.1 Check duplicate execution guard
            const alreadyRecharged = await this.historyRepo.existsByOrderId(orderId);
            if (alreadyRecharged) {
                throw new errors_1.AppError('تم تنفيذ الشحن لهذا الطلب بالفعل', 400, types_1.ErrorCode.ORDER_ALREADY_COMPLETED);
            }
            // 6.2 Deduct GB atomically with DB-level guard
            const balanceBefore = sim.remainingGiga;
            updatedSim = await this.simRepo.atomicDeductGiga(simId, requiredGiga, session);
            if (!updatedSim) {
                throw new errors_1.AppError('فشل خصم الرصيد: رصيد الشريحة غير كافٍ في قاعدة البيانات', 400, types_1.ErrorCode.INSUFFICIENT_SIM_BALANCE);
            }
            const balanceAfter = updatedSim.remainingGiga;
            // 6.3 Update Order
            const now = new Date();
            order.status = types_1.OrderStatus.COMPLETED;
            order.selectedListId = new mongoose_1.Types.ObjectId(listId);
            order.selectedSimId = new mongoose_1.Types.ObjectId(simId);
            order.completedAt = now;
            order.adminNotes = notes || order.adminNotes;
            order.timeline.push({
                status: types_1.OrderStatus.COMPLETED,
                message: `تم الشحن بنجاح بواسطة الشريحة: ${sim.phoneNumber} (خصم ${requiredGiga} GB)`,
                actorType: 'ADMIN',
                actorId: adminId,
                createdAt: now
            });
            updatedOrder = await order.save({ session });
            // 6.4 Create RechargeHistory
            await this.historyRepo.create({
                adminId: new mongoose_1.Types.ObjectId(adminId),
                orderId: new mongoose_1.Types.ObjectId(orderId),
                listId: new mongoose_1.Types.ObjectId(listId),
                simId: new mongoose_1.Types.ObjectId(simId),
                beneficiaryNumber: order.targetPhone || order.beneficiaryNumber,
                deductedGiga: requiredGiga,
                balanceBefore,
                balanceAfter,
                completedAt: now
            }, session);
            // Commit transaction
            await session.commitTransaction();
        }
        catch (err) {
            await session.abortTransaction();
            throw err;
        }
        finally {
            session.endSession();
        }
        // 7. Post-transaction Async Operations (Notifications & Sockets)
        const clientUserId = order.clientId._id ? order.clientId._id.toString() : order.clientId.toString();
        // Create Notification for Client
        const notif = await this.notifRepo.create({
            userId: new mongoose_1.Types.ObjectId(clientUserId),
            title: 'تم إتمام طلب الشحن بنجاح! 🚀',
            message: `تم شحن باقة الإنترنت (${order.packSnapshot?.name || order.packNameSnapshot || 'الباقة'}) لرقم الهاتف ${order.targetPhone || order.beneficiaryNumber}.`,
            type: types_1.NotificationType.ORDER_COMPLETED,
            metadata: { orderId: order._id.toString() }
        });
        // Audit Log for Admin
        await this.auditRepo.create({
            adminId: new mongoose_1.Types.ObjectId(adminId),
            action: types_1.AuditAction.ORDER_COMPLETED,
            entityType: 'Order',
            entityId: order._id.toString(),
            metadata: {
                orderNumber: order.orderNumber,
                simPhone: sim.phoneNumber,
                deductedGiga: requiredGiga,
                remainingGiga: updatedSim?.remainingGiga
            }
        });
        // Realtime Sockets
        socket_service_1.SocketEmitter.emitToUser(clientUserId, 'order.updated', {
            orderId: order._id,
            status: types_1.OrderStatus.COMPLETED,
            completedAt: order.completedAt
        });
        socket_service_1.SocketEmitter.emitToUser(clientUserId, 'notification.created', notif);
        // Socket to Admin
        socket_service_1.SocketEmitter.emitToAdmin(adminId, 'order.updated', updatedOrder);
        socket_service_1.SocketEmitter.emitToAdmin(adminId, 'sim.updated', updatedSim);
        // Push notification to client
        fcm_service_1.FcmEmitter.emitToUser(clientUserId, notif.title, notif.message, { orderId: order._id.toString() }).catch(() => { });
        return {
            order: updatedOrder,
            sim: updatedSim
        };
    }
}
exports.RechargeService = RechargeService;
