import { Types, ClientSession } from 'mongoose';
import { RechargeHistoryModel, IRechargeHistory } from '../models/recharge-history.model';

export class RechargeHistoryRepository {
  async create(data: Partial<IRechargeHistory>, session?: ClientSession | null): Promise<IRechargeHistory> {
    const [doc] = await RechargeHistoryModel.create([data], session ? { session } : {});
    return doc;
  }

  async findByOrderId(orderId: string): Promise<IRechargeHistory | null> {
    return RechargeHistoryModel.findOne({ orderId: new Types.ObjectId(orderId) }).exec();
  }

  async existsByOrderId(orderId: string, session?: ClientSession | null): Promise<boolean> {
    const q = RechargeHistoryModel.exists({ orderId: new Types.ObjectId(orderId) });
    if (session) q.session(session);
    const result = await q.exec();
    return !!result;
  }

  async findBySimId(simId: string, page = 1, limit = 20): Promise<IRechargeHistory[]> {
    return RechargeHistoryModel
      .find({ simId: new Types.ObjectId(simId) })
      .sort({ completedAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .exec();
  }

  async findByAdminId(adminId: string, page = 1, limit = 20): Promise<IRechargeHistory[]> {
    return RechargeHistoryModel
      .find({ adminId: new Types.ObjectId(adminId) })
      .sort({ completedAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .exec();
  }
}
