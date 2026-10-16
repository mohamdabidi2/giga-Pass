"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.UserService = void 0;
const mongoose_1 = require("mongoose");
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const user_repository_1 = require("../repositories/user.repository");
const order_repository_1 = require("../repositories/order.repository");
const announcement_repository_1 = require("../repositories/announcement.repository");
const notification_repository_1 = require("../repositories/notification.repository");
const audit_log_repository_1 = require("../repositories/audit-log.repository");
const pack_repository_1 = require("../repositories/pack.repository");
const recharge_list_repository_1 = require("../repositories/recharge-list.repository");
const sim_repository_1 = require("../repositories/sim.repository");
const types_1 = require("../types");
const errors_1 = require("../utils/errors");
const socket_service_1 = require("../sockets/socket.service");
const fcm_service_1 = require("./fcm.service");
class UserService {
    userRepo;
    orderRepo;
    packRepo;
    announcementRepo;
    notifRepo;
    auditRepo;
    listRepo;
    simRepo;
    constructor() {
        this.userRepo = new user_repository_1.UserRepository();
        this.orderRepo = new order_repository_1.OrderRepository();
        this.packRepo = new pack_repository_1.PackRepository();
        this.announcementRepo = new announcement_repository_1.AnnouncementRepository();
        this.notifRepo = new notification_repository_1.NotificationRepository();
        this.auditRepo = new audit_log_repository_1.AuditLogRepository();
        this.listRepo = new recharge_list_repository_1.RechargeListRepository();
        this.simRepo = new sim_repository_1.SimRepository();
    }
    async getProfile(userId) {
        const user = await this.userRepo.findById(userId);
        if (!user) {
            throw new errors_1.NotFoundError('المستخدم غير موجود', types_1.ErrorCode.USER_NOT_FOUND);
        }
        return user;
    }
    async getClientDashboard(clientId) {
        const user = await this.userRepo.findById(clientId);
        if (!user) {
            throw new errors_1.NotFoundError('المستخدم غير موجود', types_1.ErrorCode.USER_NOT_FOUND);
        }
        const adminId = user.adminId ? user.adminId.toString() : undefined;
        const [recentOrders, announcement, unreadCount, packs] = await Promise.all([
            this.orderRepo.getRecentOrders(clientId, undefined, 5),
            this.announcementRepo.findLatestActive(),
            this.notifRepo.getUnreadCount(clientId),
            adminId ? this.packRepo.findByAdminId(adminId, true) : this.packRepo.findAll({ isActive: true })
        ]);
        return {
            user: {
                _id: user._id,
                fullName: user.fullName,
                username: user.username,
                role: user.role,
                status: user.status,
                balance: user.balance,
                debt: user.debt || 0,
                createdAt: user.createdAt
            },
            balance: user.balance,
            debt: user.debt || 0,
            packs,
            recentOrders,
            announcements: announcement ? [announcement] : [],
            unreadNotifications: unreadCount
        };
    }
    async getAdminDashboard(adminId) {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const adminObjectId = new mongoose_1.Types.ObjectId(adminId);
        const [totalClients, pendingClients, activeClients, blockedClients, totalOrders, pendingOrders, completedOrders, todayOrders, todayRevenue, totalRevenue, totalClientsBalance, totalClientsDebt, recentOrders, totalLists, totalSims] = await Promise.all([
            this.userRepo.count({ role: types_1.UserRole.CLIENT, adminId: adminObjectId }),
            this.userRepo.count({ role: types_1.UserRole.CLIENT, adminId: adminObjectId, status: types_1.UserStatus.PENDING }),
            this.userRepo.count({ role: types_1.UserRole.CLIENT, adminId: adminObjectId, status: types_1.UserStatus.ACTIVE }),
            this.userRepo.count({ role: types_1.UserRole.CLIENT, adminId: adminObjectId, status: types_1.UserStatus.BLOCKED }),
            this.orderRepo.count({ adminId: adminObjectId }),
            this.orderRepo.count({ adminId: adminObjectId, status: types_1.OrderStatus.PENDING }),
            this.orderRepo.count({ adminId: adminObjectId, status: types_1.OrderStatus.COMPLETED }),
            this.orderRepo.count({ adminId: adminObjectId, createdAt: { $gte: today } }),
            this.orderRepo.getTodayRevenue(adminId),
            this.orderRepo.getTotalRevenue(adminId),
            this.userRepo.getTotalClientsBalance(adminId),
            this.userRepo.getTotalClientsDebt(adminId),
            this.orderRepo.getRecentOrders(undefined, adminId, 8),
            this.listRepo.count(adminId),
            this.simRepo.count(adminId)
        ]);
        return {
            totalClients,
            pendingClients,
            activeClients,
            blockedClients,
            totalOrders,
            pendingOrders,
            completedOrders,
            todayOrders,
            todayRevenue,
            totalRevenue,
            totalClientsBalance,
            totalClientsDebt,
            recentOrders,
            totalLists,
            totalSims
        };
    }
    async listUsers(params) {
        const page = params.page || 1;
        const limit = params.limit || 20;
        const filter = {};
        if (params.adminId) {
            filter.adminId = new mongoose_1.Types.ObjectId(params.adminId);
        }
        if (params.status) {
            filter.status = params.status;
        }
        if (params.role) {
            filter.role = params.role;
        }
        else {
            filter.role = types_1.UserRole.CLIENT;
        }
        if (params.search) {
            const searchRegex = new RegExp(params.search.trim(), 'i');
            filter.$or = [{ username: searchRegex }, { fullName: searchRegex }, { phone: searchRegex }];
        }
        return this.userRepo.findWithPagination(filter, page, limit);
    }
    async createClient(adminId, data) {
        if (!data.fullName || !data.username || !data.password) {
            throw new errors_1.AppError('يرجى تقديم الاسم الكامل واسم المستخدم وكلمة المرور', 400, types_1.ErrorCode.VALIDATION_ERROR);
        }
        const cleanUsername = data.username.toLowerCase().trim();
        const existing = await this.userRepo.findByUsername(cleanUsername);
        if (existing) {
            throw new errors_1.ConflictError('اسم المستخدم مسجل مسبقاً، يرجى اختيار اسم مستخدم آخر', types_1.ErrorCode.DUPLICATE_USERNAME);
        }
        if (data.password.length < 6) {
            throw new errors_1.AppError('يجب أن لا تقل كلمة المرور عن 6 أحرف', 400, types_1.ErrorCode.VALIDATION_ERROR);
        }
        const salt = await bcryptjs_1.default.genSalt(10);
        const passwordHash = await bcryptjs_1.default.hash(data.password, salt);
        const client = await this.userRepo.create({
            adminId: new mongoose_1.Types.ObjectId(adminId),
            username: cleanUsername,
            fullName: data.fullName.trim(),
            passwordHash,
            phone: data.phone?.trim(),
            role: types_1.UserRole.CLIENT,
            status: types_1.UserStatus.ACTIVE,
            balance: data.balance || 0,
            debt: 0
        });
        await this.auditRepo.create({
            adminId: new mongoose_1.Types.ObjectId(adminId),
            action: types_1.AuditAction.USER_CREATED,
            entityType: 'User',
            entityId: client._id.toString(),
            metadata: { username: client.username, fullName: client.fullName }
        });
        return {
            _id: client._id,
            fullName: client.fullName,
            username: client.username,
            phone: client.phone,
            role: client.role,
            status: client.status,
            balance: client.balance,
            debt: client.debt,
            createdAt: client.createdAt
        };
    }
    async updateClient(adminId, clientId, data) {
        const client = await this.userRepo.findById(clientId);
        if (!client) {
            throw new errors_1.NotFoundError('العميل غير موجود', types_1.ErrorCode.USER_NOT_FOUND);
        }
        if (client.adminId?.toString() !== adminId) {
            throw new errors_1.ForbiddenError('لا تملك صلاحية تعديل هذا العميل', types_1.ErrorCode.FORBIDDEN);
        }
        if (data.fullName)
            client.fullName = data.fullName.trim();
        if (data.phone !== undefined)
            client.phone = data.phone.trim();
        if (data.status)
            client.status = data.status;
        if (data.password) {
            if (data.password.length < 6)
                throw new errors_1.AppError('كلمة المرور يجب أن لا تقل عن 6 أحرف', 400, types_1.ErrorCode.VALIDATION_ERROR);
            const salt = await bcryptjs_1.default.genSalt(10);
            client.passwordHash = await bcryptjs_1.default.hash(data.password, salt);
        }
        await client.save();
        return client;
    }
    async updateUserStatus(params) {
        const { targetUserId, adminId, newStatus, ip, userAgent } = params;
        const user = await this.userRepo.findById(targetUserId);
        if (!user) {
            throw new errors_1.NotFoundError('المستخدم غير موجود', types_1.ErrorCode.USER_NOT_FOUND);
        }
        if (user.role === types_1.UserRole.ADMIN) {
            throw new errors_1.AppError('لا يمكن تعديل حالة مدير النظام', 400, types_1.ErrorCode.FORBIDDEN);
        }
        if (user.adminId && user.adminId.toString() !== adminId) {
            throw new errors_1.ForbiddenError('لا تملك صلاحية تعديل حالة هذا العميل', types_1.ErrorCode.FORBIDDEN);
        }
        const oldStatus = user.status;
        user.status = newStatus;
        await user.save();
        let action;
        let notifTitle = 'تحديث حالة الحساب';
        let notifMsg = `تم تغيير حالة حسابك إلى: ${newStatus}`;
        let notifType = types_1.NotificationType.SYSTEM;
        switch (newStatus) {
            case types_1.UserStatus.ACTIVE:
                action = types_1.AuditAction.USER_APPROVED;
                notifTitle = 'تم تفعيل حسابك بنجاح! 🎉';
                notifMsg = 'تم تفعيل حسابك من قبل الإدارة. يمكنك الآن استخدام كافة خدمات التطبيق.';
                notifType = types_1.NotificationType.ACCOUNT_APPROVED;
                break;
            case types_1.UserStatus.BLOCKED:
                action = types_1.AuditAction.USER_BLOCKED;
                notifTitle = 'تم إيقاف حسابك';
                notifMsg = 'تم إيقاف حسابك مؤقتاً من قبل الإدارة.';
                notifType = types_1.NotificationType.SYSTEM;
                break;
            default:
                action = types_1.AuditAction.USER_UNBLOCKED;
                break;
        }
        await this.auditRepo.create({
            adminId: new mongoose_1.Types.ObjectId(adminId),
            action,
            entityType: 'User',
            entityId: targetUserId,
            metadata: { oldStatus, newStatus, username: user.username },
            ip,
            userAgent
        });
        const notif = await this.notifRepo.create({
            userId: new mongoose_1.Types.ObjectId(targetUserId),
            title: notifTitle,
            message: notifMsg,
            type: notifType
        });
        socket_service_1.SocketEmitter.emitToUser(targetUserId, 'user.status_changed', { status: newStatus, oldStatus });
        socket_service_1.SocketEmitter.emitToUser(targetUserId, 'notification.created', notif);
        fcm_service_1.FcmEmitter.emitToUser(targetUserId, notif.title, notif.message).catch(() => { });
        return user;
    }
    async getAdminUserDetails(userId, adminId) {
        const user = await this.userRepo.findById(userId);
        if (!user) {
            throw new errors_1.NotFoundError('العميل غير موجود', types_1.ErrorCode.USER_NOT_FOUND);
        }
        if (user.adminId && user.adminId.toString() !== adminId) {
            throw new errors_1.ForbiddenError('غير مصرح بعرض هذا العميل', types_1.ErrorCode.FORBIDDEN);
        }
        const [totalOrders, completedOrders, pendingOrders, cancelledOrders] = await Promise.all([
            this.orderRepo.count({ clientId: user._id, adminId: new mongoose_1.Types.ObjectId(adminId) }),
            this.orderRepo.count({ clientId: user._id, adminId: new mongoose_1.Types.ObjectId(adminId), status: types_1.OrderStatus.COMPLETED }),
            this.orderRepo.count({ clientId: user._id, adminId: new mongoose_1.Types.ObjectId(adminId), status: types_1.OrderStatus.PENDING }),
            this.orderRepo.count({ clientId: user._id, adminId: new mongoose_1.Types.ObjectId(adminId), status: types_1.OrderStatus.CANCELLED })
        ]);
        return {
            user,
            stats: {
                totalOrders,
                completedOrders,
                pendingOrders,
                cancelledOrders
            }
        };
    }
}
exports.UserService = UserService;
