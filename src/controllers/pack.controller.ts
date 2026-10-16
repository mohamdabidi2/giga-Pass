import { Response, NextFunction } from 'express';
import { PackService } from '../services/pack.service';
import { ApiResponse } from '../utils/response';
import { AuthenticatedRequest, Operator, UserRole } from '../types';

export class PackController {
  private packService: PackService;

  constructor() {
    this.packService = new PackService();
  }

  getAll = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const operator = req.query.operator as Operator | undefined;
      const activeOnly = req.query.activeOnly !== 'false';

      // If user is client, use client's adminId. If admin, use their own userId.
      let adminId: string | undefined;
      if (req.user?.role === UserRole.CLIENT) {
        adminId = req.user.adminId;
      } else if (req.user?.role === UserRole.ADMIN) {
        adminId = req.user.userId;
      }

      let packs;
      if (adminId && operator) {
        packs = await this.packService.getByOperator(adminId, operator, activeOnly);
      } else {
        packs = await this.packService.getAll(adminId, activeOnly);
      }

      return ApiResponse.success(res, packs, 'تم جلب الباقات بنجاح');
    } catch (error) {
      next(error);
    }
  };

  getById = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const adminId = req.user?.role === UserRole.ADMIN ? req.user.userId : req.user?.adminId;
      const pack = await this.packService.getById(req.params.id, adminId);
      return ApiResponse.success(res, pack);
    } catch (error) {
      next(error);
    }
  };

  create = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const adminId = req.user!.userId;
      const pack = await this.packService.create(adminId, req.body);
      return ApiResponse.success(res, pack, 'تمت إضافة الباقة بنجاح', 201);
    } catch (error) {
      next(error);
    }
  };

  update = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const adminId = req.user!.userId;
      const pack = await this.packService.update(req.params.id, adminId, req.body);
      return ApiResponse.success(res, pack, 'تم تعديل الباقة بنجاح');
    } catch (error) {
      next(error);
    }
  };

  toggleStatus = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const adminId = req.user!.userId;
      const { isActive } = req.body;
      const pack = await this.packService.toggleStatus(req.params.id, adminId, Boolean(isActive));
      return ApiResponse.success(res, pack, 'تم تحديث حالة الباقة');
    } catch (error) {
      next(error);
    }
  };

  delete = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const adminId = req.user!.userId;
      await this.packService.delete(req.params.id, adminId);
      return ApiResponse.success(res, null, 'تم حذف الباقة بنجاح');
    } catch (error) {
      next(error);
    }
  };
}
