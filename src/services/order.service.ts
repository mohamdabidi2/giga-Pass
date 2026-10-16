import { Types } from 'mongoose';
import { v4 as uuidv4 } from 'uuid';
import { OrderRepository } from '../repositories/order.repository';
import { PackRepository } from '../repositories/pack.repository';
import { UserRepository } from '../repositories/user.repository';
import { WalletRepository } from '../repositories/wallet.repository';
import { NotificationRepository } from '../repositories/notification.repository';
import { AuditLogRepository } from '../repositories/audit-log.repository';
import {
  OrderStatus,
  WalletTransactionType,
  NotificationType,
  UserRole,
  UserStatus,
  AuditAction,
  ErrorCode,
  Operator
} from '../types';
import {
  AppError,
  NotFoundError,
  ForbiddenError
} from '../utils/errors';
import { runInTransaction } from '../utils/transaction.util';
import { SocketEmitter } from '../sockets/socket.service';
import { FcmEmitter } from './fcm.service';

export class OrderService {
  private orderRepo: OrderRepository;
  private packRepo: PackRepository;
  private userRepo: UserRepository;
  private walletRepo: WalletRepository;
  private notifRepo: NotificationRepository;
  private auditRepo: AuditLogRepository;

  constructor() {
    this.orderRepo = new OrderRepository();
    this.packRepo = new PackRepository();
    this.userRepo = new UserRepository();
    this.walletRepo = new WalletRepository();
    this.notifRepo = new NotificationRepository();
    this.auditRepo = new AuditLogRepository();
  }

  static isValidTunisianPhone(phone: string): boolean {
    const cleaned = phone.replace(/[\s-]/g, '');
    return /^(2|4|5|9)[0-9]{7}$/.test(cleaned);
  }

  private generateOrderNumber(): string {
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const dd = String(today.getDate()).padStart(2, '0');
    const randomHex = Math.floor(100000 + Math.random() * 900000).toString();
    return `GP-${yyyy}${mm}${dd}-${randomHex}`;
  }

  async createOrder(clientId: string, packId: string, beneficiaryNumber: string) {
    const cleanedPhone = beneficiaryNumber.replace(/[\s-]/g, '');
    if (!OrderService.isValidTunisianPhone(cleanedPhone)) {
      throw new AppError('رقم الهاتف غير صالح. يجب أن يتكون من 8 أرقام ويبدأ بـ (2 أو 4 أو 5 أو 9)', 400, ErrorCode.VALIDATION_ERROR);
    }

    const pack = await this.packRepo.findById(packId);
    if (!pack) {
      throw new NotFoundError('الباقة غير موجودة', ErrorCode.PACK_NOT_FOUND);
    }
    if (!pack.isActive) {
      throw new AppError('هذه الباقة غير متاحة حالياً', 400, ErrorCode.PACK_DISABLED);
    }

    return runInTransaction(async (session) => {
      // 1. Verify User and active status
      const user = await this.userRepo.findById(clientId, session);
      if (!user) {
        throw new NotFoundError('العميل غير موجود', ErrorCode.USER_NOT_FOUND);
      }
      if (user.status !== UserStatus.ACTIVE) {
        throw new ForbiddenError('حسابك غير مفعل لإتمام الطلبات', ErrorCode.ACCOUNT_PENDING);
      }

      const adminId = user.adminId ? user.adminId.toString() : pack.adminId?.toString();
      if (!adminId) {
        throw new AppError('العميل غير مرتبط بأي مسؤول', 400, ErrorCode.VALIDATION_ERROR);
      }

      // 2. Track debt
      const debtBefore = user.debt || 0;
      const updatedUser = await this.userRepo.updateDebt(clientId, pack.price, session);
      const debtAfter = updatedUser ? (updatedUser.debt || 0) : Math.round((debtBefore + pack.price) * 1000) / 1000;

      // 3. Create Order
      const orderNumber = this.generateOrderNumber();
      const order = await this.orderRepo.create(
        {
          orderNumber,
          adminId: new Types.ObjectId(adminId),
          clientId: new Types.ObjectId(clientId),
          packId: new Types.ObjectId(pack._id.toString()),
          targetPhone: cleanedPhone,
          beneficiaryNumber: cleanedPhone,
          operatorSnapshot: pack.operator,
          gigaSnapshot: pack.giga,
          packSnapshot: {
            name: pack.name,
            giga: pack.giga,
            price: pack.price,
            operator: pack.operator
          },
          price: pack.price,
          status: OrderStatus.PENDING,
          timeline: [
            {
              status: OrderStatus.PENDING,
              message: `تم إنشاء الطلب وتقييد ${pack.price.toFixed(3)} د.ت كدين على الحساب`,
              actorType: 'CLIENT',
              actorId: clientId,
              createdAt: new Date()
            }
          ]
        },
        session
      );

      // 4. Create Wallet Transaction for the debt purchase
      const transactionId = `TX-${Date.now()}-${uuidv4().substring(0, 8).toUpperCase()}`;
      const financialOpId = `ORDER_PURCHASE_${order._id.toString()}`;

      await this.walletRepo.createTransaction(
        {
          transactionId,
          financialOperationId: financialOpId,
          userId: new Types.ObjectId(clientId),
          adminId: new Types.ObjectId(adminId),
          orderId: new Types.ObjectId(order._id.toString()),
          type: WalletTransactionType.CHARGE,
          amount: pack.price,
          balanceBefore: debtBefore,
          balanceAfter: debtAfter,
          description: `شراء باقة ${pack.name} (${pack.giga} GB) للرقم ${cleanedPhone} - قيد دين`,
          reference: orderNumber
        },
        session
      );

      // 5. Create Notification for client
      const notification = await this.notifRepo.create(
        {
          userId: new Types.ObjectId(clientId),
          title: 'طلب شحن جديد',
          message: `تم استلام طلب شحن ${pack.name} للرقم ${cleanedPhone} بنجاح برقم ${orderNumber}.`,
          type: NotificationType.ORDER_CREATED,
          metadata: { orderId: order._id.toString(), orderNumber }
        },
        session
      );

      // 6. Create Notification for ONLY the owning admin
      const adminNotifTitle = '🛒 طلب شراء جديد';
      const adminNotifMessage = `قام العميل ${user.fullName} (${user.username}) بطلب باقة ${pack.name} (${pack.giga} GB) للرقم ${cleanedPhone}`;
      const adminNotif = await this.notifRepo.create(
        {
          userId: new Types.ObjectId(adminId),
          title: adminNotifTitle,
          message: adminNotifMessage,
          type: NotificationType.ORDER_CREATED,
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
        },
        session
      );

      // 7. Emit real-time events scoped strictly to client and owning admin
      SocketEmitter.emitToUser(clientId, 'user.debt_updated', { debt: debtAfter });
      SocketEmitter.emitToUser(clientId, 'wallet.updated', { debt: debtAfter });
      SocketEmitter.emitToUser(clientId, 'order.created', order);
      SocketEmitter.emitToUser(clientId, 'notification.created', notification);

      SocketEmitter.emitToAdmin(adminId, 'order.created', { order, client: { fullName: user.fullName, username: user.username } });
      SocketEmitter.emitToAdmin(adminId, 'notification.created', adminNotif);

      // FCM: notify client + owning admin
      FcmEmitter.emitToUser(clientId, notification.title, notification.message).catch(() => {});
      FcmEmitter.emitToAdmin(
        adminId,
        adminNotifTitle,
        adminNotifMessage,
        {
          orderId: order._id.toString(),
          orderNumber,
          type: 'ORDER_CREATED'
        }
      ).catch(() => {});

      return order;
    });
  }

  async clientCancelOrder(orderId: string, clientId: string) {
    return runInTransaction(async (session) => {
      const order = await this.orderRepo.findById(orderId, session);
      if (!order) {
        throw new NotFoundError('الطلب غير موجود', ErrorCode.ORDER_NOT_FOUND);
      }

      if (order.clientId._id.toString() !== clientId && order.clientId.toString() !== clientId) {
        throw new ForbiddenError('لا يمكنك إلغاء طلب لا يخصك', ErrorCode.FORBIDDEN);
      }

      if (order.status === OrderStatus.CANCELLED) {
        throw new AppError('تم إلغاء هذا الطلب مسبقاً', 400, ErrorCode.ORDER_ALREADY_CANCELLED);
      }

      if (order.status !== OrderStatus.PENDING) {
        throw new AppError('لا يمكن إلغاء الطلب بعد البدء في تنفيذه أو اكتماله', 400, ErrorCode.ORDER_CANNOT_BE_CANCELLED);
      }

      const refundOpId = `REFUND_ORDER_${order._id.toString()}`;
      const existingRefund = await this.walletRepo.findByFinancialOperationId(refundOpId, session);
      if (existingRefund) {
        throw new AppError('تم استرجاع مبلغ هذا الطلب مسبقاً', 400, ErrorCode.ORDER_ALREADY_CANCELLED);
      }

      const user = await this.userRepo.findById(clientId, session);
      if (!user) {
        throw new NotFoundError('العميل غير موجود', ErrorCode.USER_NOT_FOUND);
      }

      const debtBefore = user.debt || 0;
      const updatedUser = await this.userRepo.updateDebt(clientId, -order.price, session);
      const debtAfter = updatedUser ? (updatedUser.debt || 0) : Math.max(0, Math.round((debtBefore - order.price) * 1000) / 1000);

      order.status = OrderStatus.CANCELLED;
      order.cancelledAt = new Date();
      order.timeline.push({
        status: OrderStatus.CANCELLED,
        message: `تم إلغاء الطلب من قبل العميل وخصم ${order.price.toFixed(3)} د.ت من الدين`,
        actorType: 'CLIENT',
        actorId: clientId,
        createdAt: new Date()
      });
      await order.save({ session });

      const transactionId = `TX-${Date.now()}-${uuidv4().substring(0, 8).toUpperCase()}`;
      await this.walletRepo.createTransaction(
        {
          transactionId,
          financialOperationId: refundOpId,
          userId: new Types.ObjectId(clientId),
          adminId: order.adminId,
          orderId: new Types.ObjectId(order._id.toString()),
          type: WalletTransactionType.REFUND,
          amount: -order.price,
          balanceBefore: debtBefore,
          balanceAfter: debtAfter,
          description: `خصم قيمة الطلب الملغى ${order.orderNumber} من الدين`,
          reference: order.orderNumber
        },
        session
      );

      const notif = await this.notifRepo.create(
        {
          userId: new Types.ObjectId(clientId),
          title: 'إلغاء الطلب وتعديل الدين',
          message: `تم إلغاء طلبك ${order.orderNumber} وخصم مبلغ ${order.price.toFixed(3)} د.ت من دينك.`,
          type: NotificationType.ORDER_CANCELLED,
          metadata: { orderId: order._id.toString(), orderNumber: order.orderNumber }
        },
        session
      );

      const adminId = order.adminId.toString();
      const adminCancelTitle = '⚠️ إلغاء طلب شراء';
      const adminCancelMessage = `قام العميل ${user.fullName} بإلغاء طلب الشحن رقم ${order.orderNumber}`;
      const adminNotif = await this.notifRepo.create(
        {
          userId: new Types.ObjectId(adminId),
          title: adminCancelTitle,
          message: adminCancelMessage,
          type: NotificationType.ORDER_CANCELLED,
          metadata: { orderId: order._id.toString(), orderNumber: order.orderNumber, clientId }
        },
        session
      );

      SocketEmitter.emitToUser(clientId, 'user.debt_updated', { debt: debtAfter });
      SocketEmitter.emitToUser(clientId, 'wallet.updated', { debt: debtAfter });
      SocketEmitter.emitToUser(clientId, 'order.cancelled', order);
      SocketEmitter.emitToUser(clientId, 'order.updated', order);
      SocketEmitter.emitToUser(clientId, 'notification.created', notif);

      SocketEmitter.emitToAdmin(adminId, 'order.updated', order);
      SocketEmitter.emitToAdmin(adminId, 'order.cancelled', order);
      SocketEmitter.emitToAdmin(adminId, 'notification.created', adminNotif);

      FcmEmitter.emitToUser(clientId, notif.title, notif.message).catch(() => {});
      FcmEmitter.emitToAdmin(adminId, adminCancelTitle, adminCancelMessage).catch(() => {});

      return order;
    });
  }

  async adminStartRecharge(orderId: string, adminId: string) {
    const order = await this.orderRepo.findById(orderId);
    if (!order) {
      throw new NotFoundError('الطلب غير موجود', ErrorCode.ORDER_NOT_FOUND);
    }
    if (order.adminId.toString() !== adminId) {
      throw new ForbiddenError('غير مصرح بهذا الإجراء', ErrorCode.FORBIDDEN);
    }

    if (order.status !== OrderStatus.PENDING) {
      return order; // already processing or done
    }

    order.status = OrderStatus.PROCESSING;
    order.timeline.push({
      status: OrderStatus.PROCESSING,
      message: 'بدأ المسؤول عملية شحن الباقة',
      actorType: 'ADMIN',
      actorId: adminId,
      createdAt: new Date()
    });
    await order.save();

    const clientId = order.clientId._id ? order.clientId._id.toString() : order.clientId.toString();
    SocketEmitter.emitToUser(clientId, 'order.updated', { orderId: order._id, status: OrderStatus.PROCESSING });
    SocketEmitter.emitToAdmin(adminId, 'order.updated', order);

    return order;
  }

  async adminReleaseOrder(orderId: string, adminId: string) {
    const order = await this.orderRepo.findById(orderId);
    if (!order) {
      throw new NotFoundError('الطلب غير موجود', ErrorCode.ORDER_NOT_FOUND);
    }
    if (order.adminId.toString() !== adminId) {
      throw new ForbiddenError('غير مصرح بهذا الإجراء', ErrorCode.FORBIDDEN);
    }

    if (order.status === OrderStatus.PROCESSING) {
      order.status = OrderStatus.PENDING;
      order.timeline.push({
        status: OrderStatus.PENDING,
        message: 'تم إعادة الطلب لقائمة الانتظار',
        actorType: 'ADMIN',
        actorId: adminId,
        createdAt: new Date()
      });
      await order.save();

      const clientId = order.clientId._id ? order.clientId._id.toString() : order.clientId.toString();
      SocketEmitter.emitToUser(clientId, 'order.updated', { orderId: order._id, status: OrderStatus.PENDING });
      SocketEmitter.emitToAdmin(adminId, 'order.updated', order);
    }

    return order;
  }

  async adminRejectOrder(orderId: string, adminId: string, reason?: string) {
    return runInTransaction(async (session) => {
      const order = await this.orderRepo.findById(orderId, session);
      if (!order) {
        throw new NotFoundError('الطلب غير موجود', ErrorCode.ORDER_NOT_FOUND);
      }
      if (order.adminId.toString() !== adminId) {
        throw new ForbiddenError('غير مصرح برفض طلب لا يتبع لإدارتك', ErrorCode.FORBIDDEN);
      }

      if (
        order.status === OrderStatus.COMPLETED ||
        order.status === OrderStatus.CANCELLED ||
        order.status === OrderStatus.REJECTED
      ) {
        throw new AppError(`لا يمكن رفض الطلب وهو في الحالة (${order.status})`, 400, ErrorCode.INVALID_STATUS_TRANSITION);
      }

      const refundOpId = `REFUND_ORDER_${order._id.toString()}`;
      const existingRefund = await this.walletRepo.findByFinancialOperationId(refundOpId, session);

      const clientId = order.clientId._id ? order.clientId._id.toString() : order.clientId.toString();
      const user = await this.userRepo.findById(clientId, session);
      if (!user) {
        throw new NotFoundError('العميل غير موجود', ErrorCode.USER_NOT_FOUND);
      }

      let debtAfter = user.debt || 0;
      if (!existingRefund) {
        const debtBefore = user.debt || 0;
        const updatedUser = await this.userRepo.updateDebt(clientId, -order.price, session);
        debtAfter = updatedUser ? (updatedUser.debt || 0) : Math.max(0, Math.round((debtBefore - order.price) * 1000) / 1000);

        const transactionId = `TX-${Date.now()}-${uuidv4().substring(0, 8).toUpperCase()}`;
        await this.walletRepo.createTransaction(
          {
            transactionId,
            financialOperationId: refundOpId,
            userId: new Types.ObjectId(clientId),
            adminId: new Types.ObjectId(adminId),
            orderId: new Types.ObjectId(order._id.toString()),
            type: WalletTransactionType.REFUND,
            amount: -order.price,
            balanceBefore: debtBefore,
            balanceAfter: debtAfter,
            description: `خصم قيمة الطلب المرفوض ${order.orderNumber} من الدين ${reason ? `(السبب: ${reason})` : ''}`,
            reference: order.orderNumber
          },
          session
        );
      }

      order.status = OrderStatus.REJECTED;
      order.rejectedAt = new Date();
      order.rejectionReason = reason;
      order.timeline.push({
        status: OrderStatus.REJECTED,
        message: `تم رفض الطلب من قبل الإدارة ${reason ? `(${reason})` : ''} وخصم ${order.price.toFixed(3)} د.ت من الدين`,
        actorType: 'ADMIN',
        actorId: adminId,
        createdAt: new Date()
      });
      await order.save({ session });

      await this.auditRepo.create({
        adminId: new Types.ObjectId(adminId),
        action: AuditAction.ORDER_REJECTED,
        entityType: 'Order',
        entityId: order._id.toString(),
        metadata: { orderNumber: order.orderNumber, reason }
      });

      const notif = await this.notifRepo.create(
        {
          userId: new Types.ObjectId(clientId),
          title: 'تم رفض طلب الشحن وتعديل الدين',
          message: `تم رفض طلبك ${order.orderNumber}. تم خصم ${order.price.toFixed(3)} د.ت من دينك.`,
          type: NotificationType.ORDER_REJECTED,
          metadata: { orderId: order._id.toString(), orderNumber: order.orderNumber, reason }
        },
        session
      );

      SocketEmitter.emitToUser(clientId, 'user.debt_updated', { debt: debtAfter });
      SocketEmitter.emitToUser(clientId, 'wallet.updated', { debt: debtAfter });
      SocketEmitter.emitToUser(clientId, 'order.rejected', order);
      SocketEmitter.emitToUser(clientId, 'order.updated', order);
      SocketEmitter.emitToUser(clientId, 'notification.created', notif);
      SocketEmitter.emitToAdmin(adminId, 'order.updated', order);

      FcmEmitter.emitToUser(clientId, notif.title, notif.message).catch(() => {});

      return order;
    });
  }

  async getClientOrders(clientId: string, page = 1, limit = 20, status?: OrderStatus) {
    const filter: any = { clientId: new Types.ObjectId(clientId) };
    if (status) {
      filter.status = status;
    }
    return this.orderRepo.findWithPagination(filter, page, limit);
  }

  async getOrderById(orderId: string, requestingUserId?: string, isAdmin = false) {
    const order = await this.orderRepo.findById(orderId);
    if (!order) {
      throw new NotFoundError('الطلب غير موجود', ErrorCode.ORDER_NOT_FOUND);
    }

    if (!isAdmin && requestingUserId) {
      const orderClientId = order.clientId._id ? order.clientId._id.toString() : order.clientId.toString();
      if (orderClientId !== requestingUserId) {
        throw new ForbiddenError('لا يمكنك عرض تفاصيل هذا الطلب', ErrorCode.FORBIDDEN);
      }
    }

    if (isAdmin && requestingUserId && order.adminId.toString() !== requestingUserId) {
      throw new ForbiddenError('لا يمكنك عرض طلب لا يتبع لإدارتك', ErrorCode.FORBIDDEN);
    }

    return order;
  }

  async getAdminOrders(params: {
    adminId: string;
    page?: number;
    limit?: number;
    status?: OrderStatus;
    operator?: Operator;
    search?: string;
    dateFrom?: string;
    dateTo?: string;
  }) {
    const page = params.page || 1;
    const limit = params.limit || 20;
    const filter: any = {
      adminId: new Types.ObjectId(params.adminId)
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
