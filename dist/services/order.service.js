"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.OrderService = void 0;
const mongoose_1 = require("mongoose");
const uuid_1 = require("uuid");
const order_repository_1 = require("../repositories/order.repository");
const pack_repository_1 = require("../repositories/pack.repository");
const user_repository_1 = require("../repositories/user.repository");
const wallet_repository_1 = require("../repositories/wallet.repository");
const notification_repository_1 = require("../repositories/notification.repository");
const audit_log_repository_1 = require("../repositories/audit-log.repository");
const types_1 = require("../types");
const errors_1 = require("../utils/errors");
const transaction_util_1 = require("../utils/transaction.util");
const socket_service_1 = require("../sockets/socket.service");
const fcm_service_1 = require("./fcm.service");
class OrderService {
    orderRepo;
    packRepo;
    userRepo;
    walletRepo;
    notifRepo;
    auditRepo;
    constructor() {
        this.orderRepo = new order_repository_1.OrderRepository();
        this.packRepo = new pack_repository_1.PackRepository();
        this.userRepo = new user_repository_1.UserRepository();
        this.walletRepo = new wallet_repository_1.WalletRepository();
        this.notifRepo = new notification_repository_1.NotificationRepository();
        this.auditRepo = new audit_log_repository_1.AuditLogRepository();
    }
    static isValidTunisianPhone(phone) {
        const cleaned = phone.replace(/[\s-]/g, '');
        return /^(2|4|5|9)[0-9]{7}$/.test(cleaned);
    }
    generateOrderNumber() {
        const today = new Date();
        const yyyy = today.getFullYear();
        const mm = String(today.getMonth() + 1).padStart(2, '0');
        const dd = String(today.getDate()).padStart(2, '0');
        const randomHex = Math.floor(100000 + Math.random() * 900000).toString();
        return `GP-${yyyy}${mm}${dd}-${randomHex}`;
    }
    async createOrder(clientId, packId, beneficiaryNumber) {
        const cleanedPhone = beneficiaryNumber.replace(/[\s-]/g, '');
        if (!OrderService.isValidTunisianPhone(cleanedPhone)) {
            throw new errors_1.AppError('رقم الهاتف غير صالح. يجب أن يتكون من 8 أرقام ويبدأ بـ (2 أو 4 أو 5 أو 9)', 400, types_1.ErrorCode.VALIDATION_ERROR);
        }
        const pack = await this.packRepo.findById(packId);
        if (!pack) {
            throw new errors_1.NotFoundError('الباقة غير موجودة', types_1.ErrorCode.PACK_NOT_FOUND);
        }
        if (!pack.isActive) {
            throw new errors_1.AppError('هذه الباقة غير متاحة حالياً', 400, types_1.ErrorCode.PACK_DISABLED);
        }
        return (0, transaction_util_1.runInTransaction)(async (session) => {
            // 1. Verify User and active status
            const user = await this.userRepo.findById(clientId, session);
            if (!user) {
                throw new errors_1.NotFoundError('العميل غير موجود', types_1.ErrorCode.USER_NOT_FOUND);
            }
            if (user.status !== types_1.UserStatus.ACTIVE) {
                throw new errors_1.ForbiddenError('حسابك غير مفعل لإتمام الطلبات', types_1.ErrorCode.ACCOUNT_PENDING);
            }
            const adminId = user.adminId ? user.adminId.toString() : pack.adminId?.toString();
            if (!adminId) {
                throw new errors_1.AppError('العميل غير مرتبط بأي مسؤول', 400, types_1.ErrorCode.VALIDATION_ERROR);
            }
            // 2. Track debt
            const debtBefore = user.debt || 0;
            const updatedUser = await this.userRepo.updateDebt(clientId, pack.price, session);
            const debtAfter = updatedUser ? (updatedUser.debt || 0) : Math.round((debtBefore + pack.price) * 1000) / 1000;
            // 3. Create Order
            const orderNumber = this.generateOrderNumber();
            const order = await this.orderRepo.create({
                orderNumber,
                adminId: new mongoose_1.Types.ObjectId(adminId),
                clientId: new mongoose_1.Types.ObjectId(clientId),
                packId: new mongoose_1.Types.ObjectId(pack._id.toString()),
                targetPhone: cleanedPhone,
                beneficiaryNumber: cleanedPhone,
                operatorSnapshot: pack.operator,
                gigaSnapshot: pack.giga,
                packNameSnapshot: pack.name, // Required field in schema
                packSnapshot: {
                    name: pack.name,
                    giga: pack.giga,
                    price: pack.price,
                    operator: pack.operator
                },
                price: pack.price,
                status: types_1.OrderStatus.PENDING,
                timeline: [
                    {
                        status: types_1.OrderStatus.PENDING,
                        message: `تم إنشاء الطلب وتقييد ${pack.price.toFixed(3)} د.ت كدين على الحساب`,
                        actorType: 'CLIENT',
                        actorId: clientId,
                        createdAt: new Date()
                    }
                ]
            }, session);
            // 4. Create Wallet Transaction for the debt purchase
            const transactionId = `TX-${Date.now()}-${(0, uuid_1.v4)().substring(0, 8).toUpperCase()}`;
            const financialOpId = `ORDER_PURCHASE_${order._id.toString()}`;
            await this.walletRepo.createTransaction({
                transactionId,
                financialOperationId: financialOpId,
                userId: new mongoose_1.Types.ObjectId(clientId),
                adminId: new mongoose_1.Types.ObjectId(adminId),
                orderId: new mongoose_1.Types.ObjectId(order._id.toString()),
                type: types_1.WalletTransactionType.CHARGE,
                amount: pack.price,
                balanceBefore: debtBefore,
                balanceAfter: debtAfter,
                description: `شراء باقة ${pack.name} (${pack.giga} GB) للرقم ${cleanedPhone} - قيد دين`,
                reference: orderNumber
            }, session);
            // 5. Create Notification for client
            const notification = await this.notifRepo.create({
                userId: new mongoose_1.Types.ObjectId(clientId),
                title: 'طلب شحن جديد',
                message: `تم استلام طلب شحن ${pack.name} للرقم ${cleanedPhone} بنجاح برقم ${orderNumber}.`,
                type: types_1.NotificationType.ORDER_CREATED,
                metadata: { orderId: order._id.toString(), orderNumber }
            }, session);
            // 6. Create Notification for ONLY the owning admin
            const adminNotifTitle = '🛒 طلب شراء جديد';
            const adminNotifMessage = `قام العميل ${user.fullName} (${user.username}) بطلب باقة ${pack.name} (${pack.giga} GB) للرقم ${cleanedPhone}`;
            const adminNotif = await this.notifRepo.create({
                userId: new mongoose_1.Types.ObjectId(adminId),
                title: adminNotifTitle,
                message: adminNotifMessage,
                type: types_1.NotificationType.ORDER_CREATED,
                metadata: {
                    orderId: order._id.toString(),
                    orderNumber,
                    clientId,
                    clientName: user.fullName,
                    clientUsername: user.username,
                    targetPhone: cleanedPhone,
                    packName: pack.name,
                    giga: pack.giga,
                    price: pack.price
                }
            }, session);
            // 7. Emit real-time events scoped strictly to client and owning admin
            socket_service_1.SocketEmitter.emitToUser(clientId, 'user.debt_updated', { debt: debtAfter });
            socket_service_1.SocketEmitter.emitToUser(clientId, 'wallet.updated', { debt: debtAfter });
            socket_service_1.SocketEmitter.emitToUser(clientId, 'order.created', order);
            socket_service_1.SocketEmitter.emitToUser(clientId, 'notification.created', notification);
            socket_service_1.SocketEmitter.emitToAdmin(adminId, 'order.created', { order, client: { fullName: user.fullName, username: user.username } });
            socket_service_1.SocketEmitter.emitToAdmin(adminId, 'notification.created', adminNotif);
            // FCM: notify client + owning admin
            fcm_service_1.FcmEmitter.emitToUser(clientId, notification.title, notification.message).catch(() => { });
            fcm_service_1.FcmEmitter.emitToAdmin(adminId, adminNotifTitle, adminNotifMessage, {
                orderId: order._id.toString(),
                orderNumber,
                type: 'ORDER_CREATED'
            }).catch(() => { });
            return order;
        });
    }
    async clientCancelOrder(orderId, clientId) {
        return (0, transaction_util_1.runInTransaction)(async (session) => {
            const order = await this.orderRepo.findById(orderId, session);
            if (!order) {
                throw new errors_1.NotFoundError('الطلب غير موجود', types_1.ErrorCode.ORDER_NOT_FOUND);
            }
            if (order.clientId._id.toString() !== clientId && order.clientId.toString() !== clientId) {
                throw new errors_1.ForbiddenError('لا يمكنك إلغاء طلب لا يخصك', types_1.ErrorCode.FORBIDDEN);
            }
            if (order.status === types_1.OrderStatus.CANCELLED) {
                throw new errors_1.AppError('تم إلغاء هذا الطلب مسبقاً', 400, types_1.ErrorCode.ORDER_ALREADY_CANCELLED);
            }
            if (order.status !== types_1.OrderStatus.PENDING) {
                throw new errors_1.AppError('لا يمكن إلغاء الطلب بعد البدء في تنفيذه أو اكتماله', 400, types_1.ErrorCode.ORDER_CANNOT_BE_CANCELLED);
            }
            const refundOpId = `REFUND_ORDER_${order._id.toString()}`;
            const existingRefund = await this.walletRepo.findByFinancialOperationId(refundOpId, session);
            if (existingRefund) {
                throw new errors_1.AppError('تم استرجاع مبلغ هذا الطلب مسبقاً', 400, types_1.ErrorCode.ORDER_ALREADY_CANCELLED);
            }
            const user = await this.userRepo.findById(clientId, session);
            if (!user) {
                throw new errors_1.NotFoundError('العميل غير موجود', types_1.ErrorCode.USER_NOT_FOUND);
            }
            const debtBefore = user.debt || 0;
            const updatedUser = await this.userRepo.updateDebt(clientId, -order.price, session);
            const debtAfter = updatedUser ? (updatedUser.debt || 0) : Math.max(0, Math.round((debtBefore - order.price) * 1000) / 1000);
            order.status = types_1.OrderStatus.CANCELLED;
            order.cancelledAt = new Date();
            order.timeline.push({
                status: types_1.OrderStatus.CANCELLED,
                message: `تم إلغاء الطلب من قبل العميل وخصم ${order.price.toFixed(3)} د.ت من الدين`,
                actorType: 'CLIENT',
                actorId: clientId,
                createdAt: new Date()
            });
            await order.save({ session });
            const transactionId = `TX-${Date.now()}-${(0, uuid_1.v4)().substring(0, 8).toUpperCase()}`;
            await this.walletRepo.createTransaction({
                transactionId,
                financialOperationId: refundOpId,
                userId: new mongoose_1.Types.ObjectId(clientId),
                adminId: order.adminId,
                orderId: new mongoose_1.Types.ObjectId(order._id.toString()),
                type: types_1.WalletTransactionType.REFUND,
                amount: -order.price,
                balanceBefore: debtBefore,
                balanceAfter: debtAfter,
                description: `خصم قيمة الطلب الملغى ${order.orderNumber} من الدين`,
                reference: order.orderNumber
            }, session);
            const notif = await this.notifRepo.create({
                userId: new mongoose_1.Types.ObjectId(clientId),
                title: 'إلغاء الطلب وتعديل الدين',
                message: `تم إلغاء طلبك ${order.orderNumber} وخصم مبلغ ${order.price.toFixed(3)} د.ت من دينك.`,
                type: types_1.NotificationType.ORDER_CANCELLED,
                metadata: { orderId: order._id.toString(), orderNumber: order.orderNumber }
            }, session);
            const adminId = order.adminId.toString();
            const adminCancelTitle = '⚠️ إلغاء طلب شراء';
            const adminCancelMessage = `قام العميل ${user.fullName} بإلغاء طلب الشحن رقم ${order.orderNumber}`;
            const adminNotif = await this.notifRepo.create({
                userId: new mongoose_1.Types.ObjectId(adminId),
                title: adminCancelTitle,
                message: adminCancelMessage,
                type: types_1.NotificationType.ORDER_CANCELLED,
                metadata: { orderId: order._id.toString(), orderNumber: order.orderNumber, clientId }
            }, session);
            socket_service_1.SocketEmitter.emitToUser(clientId, 'user.debt_updated', { debt: debtAfter });
            socket_service_1.SocketEmitter.emitToUser(clientId, 'wallet.updated', { debt: debtAfter });
            socket_service_1.SocketEmitter.emitToUser(clientId, 'order.cancelled', order);
            socket_service_1.SocketEmitter.emitToUser(clientId, 'order.updated', order);
            socket_service_1.SocketEmitter.emitToUser(clientId, 'notification.created', notif);
            socket_service_1.SocketEmitter.emitToAdmin(adminId, 'order.updated', order);
            socket_service_1.SocketEmitter.emitToAdmin(adminId, 'order.cancelled', order);
            socket_service_1.SocketEmitter.emitToAdmin(adminId, 'notification.created', adminNotif);
            fcm_service_1.FcmEmitter.emitToUser(clientId, notif.title, notif.message).catch(() => { });
            fcm_service_1.FcmEmitter.emitToAdmin(adminId, adminCancelTitle, adminCancelMessage).catch(() => { });
            return order;
        });
    }
    async adminStartRecharge(orderId, adminId) {
        const order = await this.orderRepo.findById(orderId);
        if (!order) {
            throw new errors_1.NotFoundError('الطلب غير موجود', types_1.ErrorCode.ORDER_NOT_FOUND);
        }
        if (order.adminId.toString() !== adminId) {
            throw new errors_1.ForbiddenError('غير مصرح بهذا الإجراء', types_1.ErrorCode.FORBIDDEN);
        }
        if (order.status !== types_1.OrderStatus.PENDING) {
            return order; // already processing or done
        }
        order.status = types_1.OrderStatus.PROCESSING;
        order.timeline.push({
            status: types_1.OrderStatus.PROCESSING,
            message: 'بدأ المسؤول عملية شحن الباقة',
            actorType: 'ADMIN',
            actorId: adminId,
            createdAt: new Date()
        });
        await order.save();
        const clientId = order.clientId._id ? order.clientId._id.toString() : order.clientId.toString();
        socket_service_1.SocketEmitter.emitToUser(clientId, 'order.updated', { orderId: order._id, status: types_1.OrderStatus.PROCESSING });
        socket_service_1.SocketEmitter.emitToAdmin(adminId, 'order.updated', order);
        return order;
    }
    async adminReleaseOrder(orderId, adminId) {
        const order = await this.orderRepo.findById(orderId);
        if (!order) {
            throw new errors_1.NotFoundError('الطلب غير موجود', types_1.ErrorCode.ORDER_NOT_FOUND);
        }
        if (order.adminId.toString() !== adminId) {
            throw new errors_1.ForbiddenError('غير مصرح بهذا الإجراء', types_1.ErrorCode.FORBIDDEN);
        }
        if (order.status === types_1.OrderStatus.PROCESSING) {
            order.status = types_1.OrderStatus.PENDING;
            order.timeline.push({
                status: types_1.OrderStatus.PENDING,
                message: 'تم إعادة الطلب لقائمة الانتظار',
                actorType: 'ADMIN',
                actorId: adminId,
                createdAt: new Date()
            });
            await order.save();
            const clientId = order.clientId._id ? order.clientId._id.toString() : order.clientId.toString();
            socket_service_1.SocketEmitter.emitToUser(clientId, 'order.updated', { orderId: order._id, status: types_1.OrderStatus.PENDING });
            socket_service_1.SocketEmitter.emitToAdmin(adminId, 'order.updated', order);
        }
        return order;
    }
    async adminRejectOrder(orderId, adminId, reason) {
        return (0, transaction_util_1.runInTransaction)(async (session) => {
            const order = await this.orderRepo.findById(orderId, session);
            if (!order) {
                throw new errors_1.NotFoundError('الطلب غير موجود', types_1.ErrorCode.ORDER_NOT_FOUND);
            }
            if (order.adminId.toString() !== adminId) {
                throw new errors_1.ForbiddenError('غير مصرح برفض طلب لا يتبع لإدارتك', types_1.ErrorCode.FORBIDDEN);
            }
            if (order.status === types_1.OrderStatus.COMPLETED ||
                order.status === types_1.OrderStatus.CANCELLED ||
                order.status === types_1.OrderStatus.REJECTED) {
                throw new errors_1.AppError(`لا يمكن رفض الطلب وهو في الحالة (${order.status})`, 400, types_1.ErrorCode.INVALID_STATUS_TRANSITION);
            }
            const refundOpId = `REFUND_ORDER_${order._id.toString()}`;
            const existingRefund = await this.walletRepo.findByFinancialOperationId(refundOpId, session);
            const clientId = order.clientId._id ? order.clientId._id.toString() : order.clientId.toString();
            const user = await this.userRepo.findById(clientId, session);
            if (!user) {
                throw new errors_1.NotFoundError('العميل غير موجود', types_1.ErrorCode.USER_NOT_FOUND);
            }
            let debtAfter = user.debt || 0;
            if (!existingRefund) {
                const debtBefore = user.debt || 0;
                const updatedUser = await this.userRepo.updateDebt(clientId, -order.price, session);
                debtAfter = updatedUser ? (updatedUser.debt || 0) : Math.max(0, Math.round((debtBefore - order.price) * 1000) / 1000);
                const transactionId = `TX-${Date.now()}-${(0, uuid_1.v4)().substring(0, 8).toUpperCase()}`;
                await this.walletRepo.createTransaction({
                    transactionId,
                    financialOperationId: refundOpId,
                    userId: new mongoose_1.Types.ObjectId(clientId),
                    adminId: new mongoose_1.Types.ObjectId(adminId),
                    orderId: new mongoose_1.Types.ObjectId(order._id.toString()),
                    type: types_1.WalletTransactionType.REFUND,
                    amount: -order.price,
                    balanceBefore: debtBefore,
                    balanceAfter: debtAfter,
                    description: `خصم قيمة الطلب المرفوض ${order.orderNumber} من الدين ${reason ? `(السبب: ${reason})` : ''}`,
                    reference: order.orderNumber
                }, session);
            }
            order.status = types_1.OrderStatus.REJECTED;
            order.rejectedAt = new Date();
            order.rejectionReason = reason;
            order.timeline.push({
                status: types_1.OrderStatus.REJECTED,
                message: `تم رفض الطلب من قبل الإدارة ${reason ? `(${reason})` : ''} وخصم ${order.price.toFixed(3)} د.ت من الدين`,
                actorType: 'ADMIN',
                actorId: adminId,
                createdAt: new Date()
            });
            await order.save({ session });
            await this.auditRepo.create({
                adminId: new mongoose_1.Types.ObjectId(adminId),
                action: types_1.AuditAction.ORDER_REJECTED,
                entityType: 'Order',
                entityId: order._id.toString(),
                metadata: { orderNumber: order.orderNumber, reason }
            });
            const notif = await this.notifRepo.create({
                userId: new mongoose_1.Types.ObjectId(clientId),
                title: 'تم رفض طلب الشحن وتعديل الدين',
                message: `تم رفض طلبك ${order.orderNumber}. تم خصم ${order.price.toFixed(3)} د.ت من دينك.`,
                type: types_1.NotificationType.ORDER_REJECTED,
                metadata: { orderId: order._id.toString(), orderNumber: order.orderNumber, reason }
            }, session);
            socket_service_1.SocketEmitter.emitToUser(clientId, 'user.debt_updated', { debt: debtAfter });
            socket_service_1.SocketEmitter.emitToUser(clientId, 'wallet.updated', { debt: debtAfter });
            socket_service_1.SocketEmitter.emitToUser(clientId, 'order.rejected', order);
            socket_service_1.SocketEmitter.emitToUser(clientId, 'order.updated', order);
            socket_service_1.SocketEmitter.emitToUser(clientId, 'notification.created', notif);
            socket_service_1.SocketEmitter.emitToAdmin(adminId, 'order.updated', order);
            fcm_service_1.FcmEmitter.emitToUser(clientId, notif.title, notif.message).catch(() => { });
            return order;
        });
    }
    async getClientOrders(clientId, page = 1, limit = 20, status) {
        const filter = { clientId: new mongoose_1.Types.ObjectId(clientId) };
        if (status) {
            filter.status = status;
        }
        return this.orderRepo.findWithPagination(filter, page, limit);
    }
    async getOrderById(orderId, requestingUserId, isAdmin = false) {
        const order = await this.orderRepo.findById(orderId);
        if (!order) {
            throw new errors_1.NotFoundError('الطلب غير موجود', types_1.ErrorCode.ORDER_NOT_FOUND);
        }
        if (!isAdmin && requestingUserId) {
            const orderClientId = order.clientId._id ? order.clientId._id.toString() : order.clientId.toString();
            if (orderClientId !== requestingUserId) {
                throw new errors_1.ForbiddenError('لا يمكنك عرض تفاصيل هذا الطلب', types_1.ErrorCode.FORBIDDEN);
            }
        }
        if (isAdmin && requestingUserId && order.adminId.toString() !== requestingUserId) {
            throw new errors_1.ForbiddenError('لا يمكنك عرض طلب لا يتبع لإدارتك', types_1.ErrorCode.FORBIDDEN);
        }
        return order;
    }
    async getAdminOrders(params) {
        const page = params.page || 1;
        const limit = params.limit || 20;
        const filter = {
            adminId: new mongoose_1.Types.ObjectId(params.adminId)
        };
        if (params.status) {
            filter.status = params.status;
        }
        if (params.operator) {
            filter.operatorSnapshot = params.operator;
        }
        if (params.search) {
            const searchRegex = new RegExp(params.search.trim(), 'i');
            filter.$or = [
                { orderNumber: searchRegex },
                { targetPhone: searchRegex },
                { beneficiaryNumber: searchRegex }
            ];
        }
        if (params.dateFrom || params.dateTo) {
            filter.createdAt = {};
            if (params.dateFrom) {
                filter.createdAt.$gte = new Date(params.dateFrom);
            }
            if (params.dateTo) {
                const to = new Date(params.dateTo);
                to.setHours(23, 59, 59, 999);
                filter.createdAt.$lte = to;
            }
        }
        return this.orderRepo.findWithPagination(filter, page, limit);
    }
}
exports.OrderService = OrderService;
