import { Types, ClientSession } from 'mongoose';
import { SimModel, ISim } from '../models/sim.model';
import { Operator } from '../types';

export class SimRepository {
  async create(data: Partial<ISim>, session?: ClientSession | null): Promise<ISim> {
    const [doc] = await SimModel.create([data], session ? { session } : {});
    return doc;
  }

  async findById(id: string, session?: ClientSession | null): Promise<ISim | null> {
    const q = SimModel.findById(id);
    if (session) q.session(session);
    return q.exec();
  }

  async findByListId(listId: string): Promise<ISim[]> {
    return SimModel.find({ listId: new Types.ObjectId(listId) }).sort({ createdAt: -1 }).exec();
  }

  async findByAdminId(adminId: string, operator?: Operator): Promise<ISim[]> {
    const filter: any = { adminId: new Types.ObjectId(adminId) };
    if (operator) filter.operator = operator;
    return SimModel.find(filter).sort({ createdAt: -1 }).exec();
  }

  async findByListIds(listIds: Types.ObjectId[]): Promise<ISim[]> {
    return SimModel.find({ listId: { $in: listIds } }).sort({ listId: 1, createdAt: -1 }).exec();
  }

  async updateById(id: string, update: Partial<ISim>, session?: ClientSession | null): Promise<ISim | null> {
    const q = SimModel.findByIdAndUpdate(id, { $set: update }, { new: true });
    if (session) q.session(session);
    return q.exec();
  }

  /**
   * Atomically deduct gigaToDeduct from remainingGiga.
   * Uses $inc with $gte guard to prevent negative balances.
   * Returns updated document or null if insufficient balance.
   */
  async atomicDeductGiga(
    simId: string,
    gigaToDeduct: number,
    session?: ClientSession | null
  ): Promise<ISim | null> {
    const q = SimModel.findOneAndUpdate(
      {
        _id: new Types.ObjectId(simId),
        remainingGiga: { $gte: gigaToDeduct }  // Guard: enough balance
      },
      {
        $inc: { remainingGiga: -gigaToDeduct }
      },
      { new: true }
    );
    if (session) q.session(session);
    return q.exec();
  }

  async deleteById(id: string, session?: ClientSession | null): Promise<boolean> {
    const q = SimModel.findByIdAndDelete(id);
    if (session) q.session(session);
    const result = await q.exec();
    return !!result;
  }

  async deleteByListId(listId: string, session?: ClientSession | null): Promise<number> {
    const q = SimModel.deleteMany({ listId: new Types.ObjectId(listId) });
    if (session) q.session(session);
    const result = await q.exec();
    return result.deletedCount;
  }

  async count(adminId?: string): Promise<number> {
    const filter: any = {};
    if (adminId) filter.adminId = new Types.ObjectId(adminId);
    return SimModel.countDocuments(filter);
  }

  async countByAdminId(adminId: string): Promise<number> {
    return this.count(adminId);
  }

  async getTotalRemainingGiga(adminId: string): Promise<number> {
    const result = await SimModel.aggregate([
      { $match: { adminId: new Types.ObjectId(adminId) } },
      { $group: { _id: null, total: { $sum: '$remainingGiga' } } }
    ]);
    return result[0]?.total ?? 0;
  }

  async belongsToAdminAndList(simId: string, listId: string, adminId: string): Promise<boolean> {
    const doc = await SimModel.findOne({
      _id: new Types.ObjectId(simId),
      listId: new Types.ObjectId(listId),
      adminId: new Types.ObjectId(adminId)
    }).lean();
    return !!doc;
  }
}
