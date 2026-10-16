import { Types } from 'mongoose';
import bcrypt from 'bcryptjs';
import { UserRepository } from '../repositories/user.repository';
import { OrderRepository } from '../repositories/order.repository';
import { AnnouncementRepository } from '../repositories/announcement.repository';
import { NotificationRepository } from '../repositories/notification.repository';
import { AuditLogRepository } from '../repositories/audit-log.repository';
import { PackRepository } from '../repositories/pack.repository';
import { RechargeListRepository } from '../repositories/recharge-list.repository';
import { SimRepository } from '../repositories/sim.repository';
import {
  UserRole,
  UserStatus,
  OrderStatus,
  NotificationType,
  AuditAction,
  ErrorCode
} from '../types';
import { NotFoundError, AppError, ForbiddenError, ConflictError } from '../utils/errors';
import { SocketEmitter } from '../sockets/socket.service';
import { FcmEmitter } from './fcm.service';

export class UserService {
  private userRepo: UserRepository;
  private orderRepo: OrderRepository;
  private packRepo: PackRepository;
  private announcementRepo: AnnouncementRepository;
  private notifRepo: NotificationRepository;
  private auditRepo: AuditLogRepository;
  private listRepo: RechargeListRepository;
  private simRepo: SimRepository;

  constructor() {
    this.userRepo = new UserRepository();
    this.orderRepo = new OrderRepository();
    this.packRepo = new PackRepository();
    this.announcementRepo = new AnnouncementRepository();
    this.notifRepo = new NotificationRepository();
    this.auditRepo = new AuditLogRepository();
    this.listRepo = new RechargeListRepository();
    this.simRepo = new SimRepository();
  }

  async getProfile(userId: string) {
    const user = await this.userRepo.findById(userId);
    if (!user) {
      throw new NotFoundError('المستخدم غير موجود', ErrorCode.USER_NOT_FOUND);
    }
    return user;
  }

  async getClientDashboard(clientId: string) {
    const user = await this.userRepo.findById(clientId);
    if (!user) {
      throw new NotFoundError('المستخدم غير موجود', ErrorCode.USER_NOT_FOUND);
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

  async getAdminDashboard(adminId: string) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const adminObjectId = new Types.ObjectId(adminId);

    const [
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
    ] = await Promise.all([
      this.userRepo.count({ role: UserRole.CLIENT, adminId: adminObjectId }),
      this.userRepo.count({ role: UserRole.CLIENT, adminId: adminObjectId, status: UserStatus.PENDING }),
      this.userRepo.count({ role: UserRole.CLIENT, adminId: adminObjectId, status: UserStatus.ACTIVE }),
      this.userRepo.count({ role: UserRole.CLIENT, adminId: adminObjectId, status: UserStatus.BLOCKED }),
      this.orderRepo.count({ adminId: adminObjectId }),
      this.orderRepo.count({ adminId: adminObjectId, status: OrderStatus.PENDING }),
      this.orderRepo.count({ adminId: adminObjectId, status: OrderStatus.COMPLETED }),
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

  async listUsers(params: {
    adminId?: string;
    page?: number;
    limit?: number;
    status?: UserStatus;
    role?: UserRole;
    search?: string;
  }) {
    const page = params.page || 1;
    const limit = params.limit || 20;
    const filter: any = {};

    if (params.adminId) {
      filter.adminId = new Types.ObjectId(params.adminId);
    }
    if (params.status) {
      filter.status = params.status;
    }
    if (params.role) {
      filter.role = params.role;
    } else {
      filter.role = UserRole.CLIENT;
    }
    if (params.search) {
      const searchRegex = new RegExp(params.search.trim(), 'i');
      filter.$or = [{ username: searchRegex }, { fullName: searchRegex }, { phone: searchRegex }];
    }

    return this.userRepo.findWithPagination(filter, page, limit);
  }

  async createClient(adminId: string, data: { fullName: string; username: string; password: string; phone?: string; balance?: number }) {
    if (!data.fullName || !data.username || !data.password) {
      throw new AppError('يرجى تقديم الاسم الكامل واسم المستخدم وكلمة المرور', 400, ErrorCode.VALIDATION_ERROR);
    }

    const cleanUsername = data.username.toLowerCase().trim();
    const existing = await this.userRepo.findByUsername(cleanUsername);
    if (existing) {
      throw new ConflictError('اسم المستخدم مسجل مسبقاً، يرجى اختيار اسم مستخدم آخر', ErrorCode.DUPLICATE_USERNAME);
    }

    if (data.password.length < 6) {
      throw new AppError('يجب أن لا تقل كلمة المرور عن 6 أحرف', 400, ErrorCode.VALIDATION_ERROR);
    }

    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(data.password, salt);

    const client = await this.userRepo.create({
      adminId: new Types.ObjectId(adminId),
      username: cleanUsername,
      fullName: data.fullName.trim(),
      passwordHash,
      phone: data.phone?.trim(),
      role: UserRole.CLIENT,
      status: UserStatus.ACTIVE,
      balance: data.balance || 0,
      debt: 0
    });

    await this.auditRepo.create({
      adminId: new Types.ObjectId(adminId),
      action: AuditAction.USER_CREATED,
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

  async updateClient(adminId: string, clientId: string, data: { fullName?: string; phone?: string; password?: string; status?: UserStatus }) {
    const client = await this.userRepo.findById(clientId);
    if (!client) {
      throw new NotFoundError('العميل غير موجود', ErrorCode.USER_NOT_FOUND);
    }

    if (client.adminId?.toString() !== adminId) {
      throw new ForbiddenError('لا تملك صلاحية تعديل هذا العميل', ErrorCode.FORBIDDEN);
    }

    if (data.fullName) client.fullName = data.fullName.trim();
    if (data.phone !== undefined) client.phone = data.phone.trim();
    if (data.status) client.status = data.status;
    if (data.password) {
      if (data.password.length < 6) throw new AppError('كلمة المرور يجب أن لا تقل عن 6 أحرف', 400, ErrorCode.VALIDATION_ERROR);
      const salt = await bcrypt.genSalt(10);
      client.passwordHash = await bcrypt.hash(data.password, salt);
    }

    await client.save();
    return client;
  }

  async updateUserStatus(params: {
    targetUserId: string;
    adminId: string;
    newStatus: UserStatus;
    ip?: string;
    userAgent?: string;
  }) {
    const { targetUserId, adminId, newStatus, ip, userAgent } = params;

    const user = await this.userRepo.findById(targetUserId);
    if (!user) {
      throw new NotFoundError('المستخدم غير موجود', ErrorCode.USER_NOT_FOUND);
    }

    if (user.role === UserRole.ADMIN) {
      throw new AppError('لا يمكن تعديل حالة مدير النظام', 400, ErrorCode.FORBIDDEN);
    }

    if (user.adminId && user.adminId.toString() !== adminId) {
      throw new ForbiddenError('لا تملك صلاحية تعديل حالة هذا العميل', ErrorCode.FORBIDDEN);
    }

    const oldStatus = user.status;
    user.status = newStatus;
    await user.save();

    let action: AuditAction;
    let notifTitle = 'تحديث حالة الحساب';
    let notifMsg = `تم تغيير حالة حسابك إلى: ${newStatus}`;
    let notifType = NotificationType.SYSTEM;

    switch (newStatus) {
      case UserStatus.ACTIVE:
        action = AuditAction.USER_APPROVED;
        notifTitle = 'تم تفعيل حسابك بنجاح! 🎉';
        notifMsg = 'تم تفعيل حسابك من قبل الإدارة. يمكنك الآن استخدام كافة خدمات التطبيق.';
        notifType = NotificationType.ACCOUNT_APPROVED;
        break;
      case UserStatus.BLOCKED:
        action = AuditAction.USER_BLOCKED;
        notifTitle = 'تم إيقاف حسابك';
        notifMsg = 'تم إيقاف حسابك مؤقتاً من قبل الإدارة.';
        notifType = NotificationType.SYSTEM;
        break;
      default:
        action = AuditAction.USER_UNBLOCKED;
        break;
    }

    await this.auditRepo.create({
      adminId: new Types.ObjectId(adminId),
      action,
      entityType: 'User',
      entityId: targetUserId,
      metadata: { oldStatus, newStatus, username: user.username },
      ip,
      userAgent
    });

    const notif = await this.notifRepo.create({
      userId: new Types.ObjectId(targetUserId),
      title: notifTitle,
      message: notifMsg,
      type: notifType
    });

    SocketEmitter.emitToUser(targetUserId, 'user.status_changed', { status: newStatus, oldStatus });
    SocketEmitter.emitToUser(targetUserId, 'notification.created', notif);
    FcmEmitter.emitToUser(targetUserId, notif.title, notif.message).catch(() => {});

    return user;
  }

  async getAdminUserDetails(userId: string, adminId: string) {
    const user = await this.userRepo.findById(userId);
    if (!user) {
      throw new NotFoundError('العميل غير موجود', ErrorCode.USER_NOT_FOUND);
    }

    if (user.adminId && user.adminId.toString() !== adminId) {
      throw new ForbiddenError('غير مصرح بعرض هذا العميل', ErrorCode.FORBIDDEN);
    }

    const [totalOrders, completedOrders, pendingOrders, cancelledOrders] = await Promise.all([
      this.orderRepo.count({ clientId: user._id, adminId: new Types.ObjectId(adminId) }),
      this.orderRepo.count({ clientId: user._id, adminId: new Types.ObjectId(adminId), status: OrderStatus.COMPLETED }),
      this.orderRepo.count({ clientId: user._id, adminId: new Types.ObjectId(adminId), status: OrderStatus.PENDING }),
      this.orderRepo.count({ clientId: user._id, adminId: new Types.ObjectId(adminId), status: OrderStatus.CANCELLED })
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
