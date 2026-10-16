import { Response, NextFunction } from 'express';
import { OrderService } from '../services/order.service';
import { ApiResponse } from '../utils/response';
import { AuthenticatedRequest, OrderStatus, Operator } from '../types';

export class OrderController {
  private orderService: OrderService;

  constructor() {
    this.orderService = new OrderService();
  }

  createOrder = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const clientId = req.user!.userId;
      const { packId, beneficiaryNumber, targetPhone } = req.body;
      const phone = targetPhone || beneficiaryNumber;
      const order = await this.orderService.createOrder(clientId, packId, phone);
      return ApiResponse.success(res, order, 'تم إرسال طلبك بنجاح', 201);
    } catch (error) {
      next(error);
    }
  };

  getMyOrders = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const clientId = req.user!.userId;
      const page = parseInt(req.query.page as string, 10) || 1;
      const limit = parseInt(req.query.limit as string, 10) || 20;
      const status = req.query.status as OrderStatus | undefined;

      const { orders, total } = await this.orderService.getClientOrders(clientId, page, limit, status);
      return ApiResponse.paginated(res, orders, page, limit, total, 'تم جلب طلباتك بنجاح');
    } catch (error) {
      next(error);
    }
  };

  getOrderById = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const orderId = req.params.id;
      const userId = req.user?.userId;
      const isAdmin = req.user?.role === 'ADMIN';

      const order = await this.orderService.getOrderById(orderId, userId, isAdmin);
      return ApiResponse.success(res, order, 'تم جلب تفاصيل الطلب');
    } catch (error) {
      next(error);
    }
  };

  cancelOrder = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const clientId = req.user!.userId;
      const orderId = req.params.id;

      const order = await this.orderService.clientCancelOrder(orderId, clientId);
      return ApiResponse.success(res, order, 'تم إلغاء الطلب واسترجاع المبلغ إلى رصيدك بنجاح');
    } catch (error) {
      next(error);
    }
  };

  startRecharge = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const adminId = req.user!.userId;
      const orderId = req.params.id;

      const order = await this.orderService.adminStartRecharge(orderId, adminId);
      return ApiResponse.success(res, order, 'تم نقل الطلب إلى قيد التنفيذ');
    } catch (error) {
      next(error);
    }
  };

  releaseOrder = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const adminId = req.user!.userId;
      const orderId = req.params.id;

      const order = await this.orderService.adminReleaseOrder(orderId, adminId);
      return ApiResponse.success(res, order, 'تم إعادة الطلب لقائمة الانتظار');
    } catch (error) {
      next(error);
    }
  };

  rejectOrder = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const adminId = req.user!.userId;
      const orderId = req.params.id;
      const { reason } = req.body;

      const order = await this.orderService.adminRejectOrder(orderId, adminId, reason);
      return ApiResponse.success(res, order, 'تم رفض الطلب واسترجاع الرصيد للعميل');
    } catch (error) {
      next(error);
    }
  };

  getAdminOrders = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const adminId = req.user!.userId;
      const page = parseInt(req.query.page as string, 10) || 1;
      const limit = parseInt(req.query.limit as string, 10) || 20;
      const status = req.query.status as OrderStatus | undefined;
      const operator = req.query.operator as Operator | undefined;
      const search = req.query.search as string | undefined;
      const dateFrom = req.query.dateFrom as string | undefined;
      const dateTo = req.query.dateTo as string | undefined;

      const { orders, total } = await this.orderService.getAdminOrders({
        adminId,
        page,
        limit,
        status,
        operator,
        search,
        dateFrom,
        dateTo
      });

      return ApiResponse.paginated(res, orders, page, limit, total, 'تم جلب الطلبات بنجاح');
    } catch (error) {
      next(error);
    }
  };
}
