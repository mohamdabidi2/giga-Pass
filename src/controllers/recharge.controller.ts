import { Response, NextFunction } from 'express';
import { RechargeService } from '../services/recharge.service';
import { ApiResponse } from '../utils/response';
import { AuthenticatedRequest, Operator } from '../types';

export class RechargeController {
  private rechargeService: RechargeService;

  constructor() {
    this.rechargeService = new RechargeService();
  }

  // ─── Recharge Lists ────────────────────────────────────────────────────────

  createList = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const adminId = req.user!.userId;
      const { name, email, password, operator } = req.body;
      const list = await this.rechargeService.createList(adminId, {
        name,
        email,
        password,
        operator
      });
      return ApiResponse.success(res, list, 'تم إنشاء قائمة الشحن بنجاح', 201);
    } catch (error) {
      next(error);
    }
  };

  getLists = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const adminId = req.user!.userId;
      const operator = req.query.operator as Operator | undefined;
      const lists = await this.rechargeService.getLists(adminId, operator);
      return ApiResponse.success(res, lists, 'تم جلب قوائم الشحن بنجاح');
    } catch (error) {
      next(error);
    }
  };

  getListById = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const adminId = req.user!.userId;
      const list = await this.rechargeService.getListById(req.params.id, adminId);
      return ApiResponse.success(res, list);
    } catch (error) {
      next(error);
    }
  };

  updateList = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const adminId = req.user!.userId;
      const list = await this.rechargeService.updateList(req.params.id, adminId, req.body);
      return ApiResponse.success(res, list, 'تم تعديل قائمة الشحن بنجاح');
    } catch (error) {
      next(error);
    }
  };

  deleteList = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const adminId = req.user!.userId;
      await this.rechargeService.deleteList(req.params.id, adminId);
      return ApiResponse.success(res, null, 'تم حذف قائمة الشحن بنجاح');
    } catch (error) {
      next(error);
    }
  };

  // ─── SIMs ──────────────────────────────────────────────────────────────────

  createSim = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const adminId = req.user!.userId;
      const { listId, phoneNumber, initialGiga, remainingGiga, notes } = req.body;
      const sim = await this.rechargeService.createSim(adminId, {
        listId: listId || req.params.listId,
        phoneNumber,
        initialGiga: parseFloat(initialGiga),
        remainingGiga: remainingGiga !== undefined ? parseFloat(remainingGiga) : undefined,
        notes
      });
      return ApiResponse.success(res, sim, 'تمت إضافة الشريحة بنجاح', 201);
    } catch (error) {
      next(error);
    }
  };

  getSimsByList = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const adminId = req.user!.userId;
      const sims = await this.rechargeService.getSimsByList(req.params.listId, adminId);
      return ApiResponse.success(res, sims, 'تم جلب شرائح القائمة بنجاح');
    } catch (error) {
      next(error);
    }
  };

  adjustSimGiga = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const adminId = req.user!.userId;
      const { adjustment } = req.body;
      const sim = await this.rechargeService.adjustSimGiga(req.params.id, adminId, parseFloat(adjustment));
      return ApiResponse.success(res, sim, 'تم تحديث رصيد الشريحة بنجاح');
    } catch (error) {
      next(error);
    }
  };

  updateSim = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const adminId = req.user!.userId;
      const sim = await this.rechargeService.updateSim(req.params.id, adminId, req.body);
      return ApiResponse.success(res, sim, 'تم تعديل بيانات الشريحة بنجاح');
    } catch (error) {
      next(error);
    }
  };

  deleteSim = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const adminId = req.user!.userId;
      await this.rechargeService.deleteSim(req.params.id, adminId);
      return ApiResponse.success(res, null, 'تم حذف الشريحة بنجاح');
    } catch (error) {
      next(error);
    }
  };

  // ─── Recharge Flow (Dialog 'تم الشحن') ──────────────────────────────────────

  completeRecharge = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const adminId = req.user!.userId;
      const { orderId, listId, simId, notes, screenshotBase64 } = req.body;
      const result = await this.rechargeService.completeRecharge({
        adminId,
        orderId,
        listId,
        simId,
        notes,
        screenshotBase64
      });
      return ApiResponse.success(res, result, 'تم إتمام عملية الشحن وخصم الرصيد بنجاح! 🚀');
    } catch (error) {
      next(error);
    }
  };
}
