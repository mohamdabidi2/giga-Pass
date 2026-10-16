import { Types, ClientSession } from 'mongoose';
import { RechargeListModel, IRechargeList } from '../models/recharge-list.model';
import { Operator } from '../types';

export class RechargeListRepository {
  async create(data: Partial<IRechargeList>, session?: ClientSession | null): Promise<IRechargeList> {
    const [doc] = await RechargeListModel.create([data], session ? { session } : {});
    return doc;
  }

  async findById(id: string, session?: ClientSession | null): Promise<IRechargeList | null> {
    const q = RechargeListModel.findById(id);
    if (session) q.session(session);
    return q.exec();
  }

  async findByAdminId(adminId: string, operator?: Operator): Promise<IRechargeList[]> {
    const filter: any = { adminId: new Types.ObjectId(adminId) };
    if (operator) filter.operator = operator;
    return RechargeListModel.find(filter).sort({ createdAt: -1 }).exec();
  }

  async updateById(id: string, update: Partial<IRechargeList>, session?: ClientSession | null): Promise<IRechargeList | null> {
    const q = RechargeListModel.findByIdAndUpdate(id, { $set: update }, { new: true });
    if (session) q.session(session);
    return q.exec();
  }

  async deleteById(id: string, session?: ClientSession | null): Promise<boolean> {
    const q = RechargeListModel.findByIdAndDelete(id);
    if (session) q.session(session);
    const result = await q.exec();
    return !!result;
  }

  async count(adminId?: string): Promise<number> {
    const filter: any = {};
    if (adminId) filter.adminId = new Types.ObjectId(adminId);
    return RechargeListModel.countDocuments(filter);
  }

  async countByAdminId(adminId: string): Promise<number> {
    return this.count(adminId);
  }

  async belongsToAdmin(listId: string, adminId: string): Promise<boolean> {
    const doc = await RechargeListModel.findOne({
      _id: new Types.ObjectId(listId),
      adminId: new Types.ObjectId(adminId)
    }).lean();
    return !!doc;
  }
}
