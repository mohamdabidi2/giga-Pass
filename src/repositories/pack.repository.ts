import { FilterQuery, Types } from 'mongoose';
import { IPack, PackModel } from '../models/pack.model';
import { Operator } from '../types';

export class PackRepository {
  async findAll(filter: FilterQuery<IPack> = {}): Promise<IPack[]> {
    const packs = await PackModel.find(filter);
    const opOrder: Record<string, number> = {
      [Operator.TUNISIE_TELECOM]: 1,
      [Operator.ORANGE]: 2,
      [Operator.OOREDOO]: 3
    };
    return packs.sort((a, b) => {
      const orderA = opOrder[a.operator] || 99;
      const orderB = opOrder[b.operator] || 99;
      if (orderA !== orderB) return orderA - orderB;
      if (a.giga !== b.giga) return a.giga - b.giga;
      return a.price - b.price;
    });
  }

  async findByAdminId(adminId: string, activeOnly = true): Promise<IPack[]> {
    const filter: FilterQuery<IPack> = { adminId: new Types.ObjectId(adminId) };
    if (activeOnly) {
      filter.isActive = true;
    }
    return this.findAll(filter);
  }

  async findByOperator(adminId: string, operator: Operator, activeOnly = true): Promise<IPack[]> {
    const filter: FilterQuery<IPack> = {
      adminId: new Types.ObjectId(adminId),
      operator
    };
    if (activeOnly) {
      filter.isActive = true;
    }
    const packs = await PackModel.find(filter);
    return packs.sort((a, b) => {
      if (a.giga !== b.giga) return a.giga - b.giga;
      return a.price - b.price;
    });
  }

  async findById(id: string): Promise<IPack | null> {
    return PackModel.findById(id);
  }

  async create(data: Partial<IPack>): Promise<IPack> {
    const pack = new PackModel(data);
    return pack.save();
  }

  async updateById(id: string, data: Partial<IPack>): Promise<IPack | null> {
    return PackModel.findByIdAndUpdate(id, data, { new: true });
  }

  async deleteById(id: string): Promise<IPack | null> {
    return PackModel.findByIdAndDelete(id);
  }

  async countByOperator(adminId?: string): Promise<{ operator: Operator; count: number }[]> {
    const match: any = { isActive: true };
    if (adminId) {
      match.adminId = new Types.ObjectId(adminId);
    }
    return PackModel.aggregate([
      { $match: match },
      { $group: { _id: '$operator', count: { $sum: 1 } } },
      { $project: { operator: '$_id', count: 1, _id: 0 } }
    ]);
  }
}
