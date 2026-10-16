import mongoose, { Types } from 'mongoose';
import { RechargeListRepository } from '../repositories/recharge-list.repository';
import { SimRepository } from '../repositories/sim.repository';
import { RechargeHistoryRepository } from '../repositories/recharge-history.repository';
import { OrderRepository } from '../repositories/order.repository';
import { UserRepository } from '../repositories/user.repository';
import { NotificationRepository } from '../repositories/notification.repository';
import { decryptPassword, encryptPassword } from '../models/recharge-list.model';
import {
  ErrorCode,
  Operator,
  OrderStatus,
  NotificationType,
  AuditAction
} from '../types';
import { AppError, NotFoundError, ForbiddenError } from '../utils/errors';
import { SocketEmitter } from '../sockets/socket.service';
import { FcmEmitter } from './fcm.service';
import { AuditLogRepository } from '../repositories/audit-log.repository';

export class RechargeService {
  private listRepo: RechargeListRepository;
  private simRepo: SimRepository;
  private historyRepo: RechargeHistoryRepository;
  private orderRepo: OrderRepository;
  private userRepo: UserRepository;
  private notifRepo: NotificationRepository;
  private auditRepo: AuditLogRepository;

  constructor() {
    this.listRepo = new RechargeListRepository();
    this.simRepo = new SimRepository();
    this.historyRepo = new RechargeHistoryRepository();
    this.orderRepo = new OrderRepository();
    this.userRepo = new UserRepository();
    this.notifRepo = new NotificationRepository();
    this.auditRepo = new AuditLogRepository();
  }

  // ─── Recharge Lists ────────────────────────────────────────────────────────

  async createList(adminId: string, data: { name: string; email: string; password: string; operator: Operator }) {
    if (!data.name || !data.email || !data.password || !data.operator) {
      throw new AppError('يرجى تقديم كافة بيانات قائمة الشحن (الاسم، البريد، كلمة المرور، المشغل)', 400, ErrorCode.VALIDATION_ERROR);
    }

    const encrypted = encryptPassword(data.password);
    const list = await this.listRepo.create({
      adminId: new Types.ObjectId(adminId),
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

  async getLists(adminId: string, operator?: Operator) {
    const lists = await this.listRepo.findByAdminId(adminId, operator);
    const listsWithSims = await Promise.all(
      lists.map(async (list) => {
        const sims = await this.simRepo.findByListId(list._id.toString());
        const plainPassword = decryptPassword(list.encryptedPassword);
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
      })
    );

    return listsWithSims;
  }

  async getListById(listId: string, adminId: string) {
    const list = await this.listRepo.findById(listId);
    if (!list) {
      throw new NotFoundError('قائمة الشحن غير موجودة', ErrorCode.RECHARGE_LIST_NOT_FOUND);
    }
    if (list.adminId.toString() !== adminId) {
      throw new ForbiddenError('غير مصرح بالوصول إلى هذه القائمة', ErrorCode.FORBIDDEN);
    }

    const sims = await this.simRepo.findByListId(listId);
    const plainPassword = decryptPassword(list.encryptedPassword);

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

  async updateList(
    listId: string,
    adminId: string,
    data: { name?: string; email?: string; password?: string; operator?: Operator; isActive?: boolean }
  ) {
    await this.getListById(listId, adminId);

    const update: any = {};
    if (data.name) update.name = data.name.trim();
    if (data.email) update.email = data.email.trim().toLowerCase();
    if (data.operator) update.operator = data.operator;
    if (data.isActive !== undefined) update.isActive = data.isActive;
    if (data.password) {
      update.encryptedPassword = encryptPassword(data.password);
    }

    const updated = await this.listRepo.updateById(listId, update);
    return updated;
  }

  async deleteList(listId: string, adminId: string) {
    await this.getListById(listId, adminId);
    // Delete associated SIM cards
    await this.simRepo.deleteByListId(listId);
    await this.listRepo.deleteById(listId);
  }

  // ─── SIMs ──────────────────────────────────────────────────────────────────

  async createSim(
    adminId: string,
    data: { listId: string; phoneNumber: string; initialGiga: number; remainingGiga?: number; notes?: string }
  ) {
    const list = await this.getListById(data.listId, adminId);

    if (!data.phoneNumber || data.initialGiga === undefined || data.initialGiga < 0) {
      throw new AppError('يرجى تقديم رقم الهاتف وكمية الجيجا الأولية بشكل صحيح', 400, ErrorCode.VALIDATION_ERROR);
    }

    const remaining = data.remainingGiga !== undefined ? data.remainingGiga : data.initialGiga;

    const sim = await this.simRepo.create({
      adminId: new Types.ObjectId(adminId),
      listId: new Types.ObjectId(data.listId),
      phoneNumber: data.phoneNumber.trim(),
      operator: list.operator,
      initialGiga: data.initialGiga,
      remainingGiga: remaining,
      notes: data.notes?.trim() || '',
      isActive: true
    });

    return sim;
  }

  async getSimsByList(listId: string, adminId: string) {
    await this.getListById(listId, adminId);
    return this.simRepo.findByListId(listId);
  }

  async getAllSims(adminId: string, operator?: Operator) {
    return this.simRepo.findByAdminId(adminId, operator);
  }

  async adjustSimGiga(simId: string, adminId: string, adjustment: number) {
    const sim = await this.simRepo.findById(simId);
    if (!sim) {
      throw new NotFoundError('الشريحة غير موجودة', ErrorCode.SIM_NOT_FOUND);
    }
    if (sim.adminId.toString() !== adminId) {
      throw new ForbiddenError('غير مصرح بالتعديل على هذه الشريحة', ErrorCode.FORBIDDEN);
    }

    const newRemaining = sim.remainingGiga + adjustment;
    if (newRemaining < 0) {
      throw new AppError('رصيد الشريحة لا يمكن أن يصبح أقل من الصفر', 400, ErrorCode.INSUFFICIENT_SIM_BALANCE);
    }

    sim.remainingGiga = Math.round(newRemaining * 1000) / 1000;
    await sim.save();
    return sim;
  }

  async updateSim(simId: string, adminId: string, data: { phoneNumber?: string; remainingGiga?: number; isActive?: boolean; notes?: string }) {
    const sim = await this.simRepo.findById(simId);
    if (!sim) {
      throw new NotFoundError('الشريحة غير موجودة', ErrorCode.SIM_NOT_FOUND);
    }
    if (sim.adminId.toString() !== adminId) {
      throw new ForbiddenError('غير مصرح بالتعديل على هذه الشريحة', ErrorCode.FORBIDDEN);
    }

    if (data.phoneNumber) sim.phoneNumber = data.phoneNumber.trim();
    if (data.remainingGiga !== undefined) {
      if (data.remainingGiga < 0) throw new AppError('الرصيد لا يمكن أن يكون سالباً', 400, ErrorCode.VALIDATION_ERROR);
      sim.remainingGiga = data.remainingGiga;
    }
    if (data.isActive !== undefined) sim.isActive = data.isActive;
    if (data.notes !== undefined) sim.notes = data.notes.trim();

    await sim.save();
    return sim;
  }

  async deleteSim(simId: string, adminId: string) {
    const sim = await this.simRepo.findById(simId);
    if (!sim) {
      throw new NotFoundError('الشريحة غير موجودة', ErrorCode.SIM_NOT_FOUND);
    }
    if (sim.adminId.toString() !== adminId) {
      throw new ForbiddenError('غير مصرح بحذف هذه الشريحة', ErrorCode.FORBIDDEN);
    }

    await this.simRepo.deleteById(simId);
  }

  // ─── Execution Flow (Dialog 'تم الشحن') ─────────────────────────────────────

  async completeRecharge(params: {
    adminId: string;
    orderId: string;
    listId: string;
    simId: string;
    notes?: string;
  }) {
    const { adminId, orderId, listId, simId, notes } = params;

    // 1. Fetch order
    const order = await this.orderRepo.findById(orderId);
    if (!order) {
      throw new NotFoundError('الطلب غير موجود', ErrorCode.ORDER_NOT_FOUND);
    }

    // 2. Multi-admin validation: order must belong to this admin
    if (order.adminId.toString() !== adminId) {
      throw new ForbiddenError('غير مصرح بإتمام طلب لا يتبع لإدارتك', ErrorCode.FORBIDDEN);
    }

    // 3. Status validation: cannot complete if already completed or cancelled
    if (order.status === OrderStatus.COMPLETED) {
      throw new AppError('هذا الطلب مكتمل مسبقاً', 400, ErrorCode.ORDER_ALREADY_COMPLETED);
    }
    if (order.status === OrderStatus.CANCELLED || order.status === OrderStatus.REJECTED) {
      throw new AppError('لا يمكن إتمام طلب ملغي أو مرفوض', 400, ErrorCode.INVALID_STATUS_TRANSITION);
    }

    // 4. Verify list belongs to admin
    const list = await this.listRepo.findById(listId);
    if (!list || list.adminId.toString() !== adminId) {
      throw new NotFoundError('قائمة الشحن غير موجودة أو لا تتبع لك', ErrorCode.RECHARGE_LIST_NOT_FOUND);
    }

    // 5. Verify SIM belongs to list & admin
    const sim = await this.simRepo.findById(simId);
    if (!sim || sim.adminId.toString() !== adminId || sim.listId.toString() !== listId) {
      throw new NotFoundError('الشريحة غير موجودة في القائمة المحددة', ErrorCode.SIM_NOT_FOUND);
    }

    // Determine giga amount needed
    const requiredGiga = order.gigaSnapshot || (order.packId as any)?.giga || 0;
    if (sim.remainingGiga < requiredGiga) {
      throw new AppError(
        `رصيد الشريحة (${sim.remainingGiga} GB) غير كافٍ لشحن الباقة (${requiredGiga} GB)`,
        400,
        ErrorCode.INSUFFICIENT_SIM_BALANCE
      );
    }

    // Operator match verification
    const orderOperator = order.operatorSnapshot || (order.packId as any)?.operator;
    if (orderOperator && sim.operator !== orderOperator) {
      throw new AppError(
        `مشغل الشريحة (${sim.operator}) لا يطابق مشغل الطلب (${orderOperator})`,
        400,
        ErrorCode.OPERATOR_MISMATCH
      );
    }

    // 6. Atomic MongoDB Transaction
    const session = await mongoose.startSession();
    session.startTransaction();

    let updatedOrder;
    let updatedSim;

    try {
      // 6.1 Check duplicate execution guard
      const alreadyRecharged = await this.historyRepo.existsByOrderId(orderId);
      if (alreadyRecharged) {
        throw new AppError('تم تنفيذ الشحن لهذا الطلب بالفعل', 400, ErrorCode.ORDER_ALREADY_COMPLETED);
      }

      // 6.2 Deduct GB atomically with DB-level guard
      const balanceBefore = sim.remainingGiga;
      updatedSim = await this.simRepo.atomicDeductGiga(simId, requiredGiga, session);
      if (!updatedSim) {
        throw new AppError('فشل خصم الرصيد: رصيد الشريحة غير كافٍ في قاعدة البيانات', 400, ErrorCode.INSUFFICIENT_SIM_BALANCE);
      }
      const balanceAfter = updatedSim.remainingGiga;

      // 6.3 Update Order
      const now = new Date();
      order.status = OrderStatus.COMPLETED;
      order.selectedListId = new Types.ObjectId(listId);
      order.selectedSimId = new Types.ObjectId(simId);
      order.completedAt = now;
      order.adminNotes = notes || order.adminNotes;
      order.timeline.push({
        status: OrderStatus.COMPLETED,
        message: `تم الشحن بنجاح بواسطة الشريحة: ${sim.phoneNumber} (خصم ${requiredGiga} GB)`,
        actorType: 'ADMIN',
        actorId: adminId,
        createdAt: now
      });

      updatedOrder = await order.save({ session });

      // 6.4 Create RechargeHistory
      await this.historyRepo.create(
        {
          adminId: new Types.ObjectId(adminId),
          orderId: new Types.ObjectId(orderId),
          listId: new Types.ObjectId(listId),
          simId: new Types.ObjectId(simId),
          beneficiaryNumber: order.targetPhone || order.beneficiaryNumber,
          deductedGiga: requiredGiga,
          balanceBefore,
          balanceAfter,
          completedAt: now
        },
        session
      );

      // Commit transaction
      await session.commitTransaction();
    } catch (err) {
      await session.abortTransaction();
      throw err;
    } finally {
      session.endSession();
    }

    // 7. Post-transaction Async Operations (Notifications & Sockets)
    const clientUserId = order.clientId._id ? order.clientId._id.toString() : order.clientId.toString();

    // Create Notification for Client
    const notif = await this.notifRepo.create({
      userId: new Types.ObjectId(clientUserId),
      title: 'تم إتمام طلب الشحن بنجاح! 🚀',
      message: `تم شحن باقة الإنترنت (${order.packSnapshot?.name || order.packNameSnapshot || 'الباقة'}) لرقم الهاتف ${order.targetPhone || order.beneficiaryNumber}.`,
      type: NotificationType.ORDER_COMPLETED,
      metadata: { orderId: order._id.toString() }
    });

    // Audit Log for Admin
    await this.auditRepo.create({
      adminId: new Types.ObjectId(adminId),
      action: AuditAction.ORDER_COMPLETED,
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
    SocketEmitter.emitToUser(clientUserId, 'order.updated', {
      orderId: order._id,
      status: OrderStatus.COMPLETED,
      completedAt: order.completedAt
    });
    SocketEmitter.emitToUser(clientUserId, 'notification.created', notif);

    // Socket to Admin
    SocketEmitter.emitToAdmin(adminId, 'order.updated', updatedOrder);
    SocketEmitter.emitToAdmin(adminId, 'sim.updated', updatedSim);

    // Push notification to client
    FcmEmitter.emitToUser(clientUserId, notif.title, notif.message, { orderId: order._id.toString() }).catch(() => {});

    return {
      order: updatedOrder,
      sim: updatedSim
    };
  }
}
