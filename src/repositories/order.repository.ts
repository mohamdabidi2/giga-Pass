import { ClientSession, FilterQuery, UpdateQuery, Types } from 'mongoose';
import { IOrder, OrderModel } from '../models/order.model';
import { OrderStatus } from '../types';
import { getTunisiaDayBounds } from '../utils/date.util';

export class OrderRepository {
  async findById(id: string, session?: ClientSession): Promise<IOrder | null> {
    return OrderModel.findById(id)
      .populate('clientId', 'fullName username balance status')
      .populate('packId', 'name giga dataAmount price operator')
      .populate('selectedListId', 'name email operator')
      .populate('selectedSimId', 'phoneNumber operator remainingGiga')
      .session(session || null);
  }

  async findByOrderNumber(orderNumber: string): Promise<IOrder | null> {
    return OrderModel.findOne({ orderNumber })
      .populate('clientId', 'fullName username balance')
      .populate('packId', 'name giga dataAmount price operator')
      .populate('selectedListId', 'name email operator')
      .populate('selectedSimId', 'phoneNumber operator remainingGiga');
  }

  async create(orderData: Partial<IOrder>, session?: ClientSession): Promise<IOrder> {
    const order = new OrderModel(orderData);
    return order.save({ session });
  }

  async updateById(id: string, update: UpdateQuery<IOrder>, session?: ClientSession): Promise<IOrder | null> {
    return OrderModel.findByIdAndUpdate(id, update, { new: true, session });
  }

  async findWithPagination(
    filter: FilterQuery<IOrder>,
    page: number,
    limit: number
  ): Promise<{ orders: IOrder[]; total: number }> {
    const skip = (page - 1) * limit;
    const [orders, total] = await Promise.all([
      OrderModel.find(filter)
        .populate('clientId', 'fullName username balance')
        .populate('packId', 'name giga dataAmount price operator')
        .populate('selectedListId', 'name email operator')
        .populate('selectedSimId', 'phoneNumber operator remainingGiga')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      OrderModel.countDocuments(filter)
    ]);

    return { orders: orders as unknown as IOrder[], total };
  }

  async count(filter: FilterQuery<IOrder> = {}): Promise<number> {
    return OrderModel.countDocuments(filter);
  }

  async getRecentOrders(clientId?: string, adminId?: string, limit = 5): Promise<IOrder[]> {
    const filter: any = {};
    if (clientId) filter.clientId = new Types.ObjectId(clientId);
    if (adminId) filter.adminId = new Types.ObjectId(adminId);

    return OrderModel.find(filter)
      .populate('clientId', 'fullName username')
      .populate('packId', 'name giga price operator')
      .sort({ createdAt: -1 })
      .limit(limit);
  }

  async getTodayRevenue(adminId?: string, startOfDay?: Date, endOfDay?: Date): Promise<number> {
    const bounds = startOfDay && endOfDay ? { startOfDay, endOfDay } : getTunisiaDayBounds();

    const match: any = {
      $or: [
        {
          createdAt: { $gte: bounds.startOfDay, $lte: bounds.endOfDay },
          status: { $nin: [OrderStatus.CANCELLED, OrderStatus.REJECTED, OrderStatus.FAILED] }
        },
        {
          completedAt: { $gte: bounds.startOfDay, $lte: bounds.endOfDay },
          status: OrderStatus.COMPLETED
        }
      ]
    };
    if (adminId) {
      match.adminId = new Types.ObjectId(adminId);
    }

    const result = await OrderModel.aggregate([
      { $match: match },
      {
        $group: {
          _id: null,
          total: { $sum: '$price' }
        }
      }
    ]);

    return result[0]?.total || 0;
  }

  async getTodayOrdersCount(adminId?: string, startOfDay?: Date, endOfDay?: Date): Promise<number> {
    const bounds = startOfDay && endOfDay ? { startOfDay, endOfDay } : getTunisiaDayBounds();

    const match: any = {
      $or: [
        {
          createdAt: { $gte: bounds.startOfDay, $lte: bounds.endOfDay },
          status: { $nin: [OrderStatus.CANCELLED, OrderStatus.REJECTED, OrderStatus.FAILED] }
        },
        {
          completedAt: { $gte: bounds.startOfDay, $lte: bounds.endOfDay },
          status: OrderStatus.COMPLETED
        }
      ]
    };
    if (adminId) {
      match.adminId = new Types.ObjectId(adminId);
    }

    return OrderModel.countDocuments(match);
  }

  async getTotalRevenue(adminId?: string): Promise<number> {
    const match: any = {
      status: { $in: [OrderStatus.COMPLETED, OrderStatus.PROCESSING, OrderStatus.CONFIRMED] }
    };
    if (adminId) {
      match.adminId = new Types.ObjectId(adminId);
    }

    const result = await OrderModel.aggregate([
      { $match: match },
      {
        $group: {
          _id: null,
          total: { $sum: '$price' }
        }
      }
    ]);

    return result[0]?.total || 0;
  }
}
