import { FilterQuery, Types } from 'mongoose';
import { IPack, PackModel } from '../models/pack.model';
import { Operator } from '../types';

export class PackRepository {
  async findAll(filter: FilterQuery<IPack> = {}): Promise<IPack[]> {
    return PackModel.find(filter).sort({ price: 1 });
  }

  async findByAdminId(adminId: string, activeOnly = true): Promise<IPack[]> {
    const filter: FilterQuery<IPack> = { adminId: new Types.ObjectId(adminId) };
    if (activeOnly) {
      filter.isActive = true;
    }
    return PackModel.find(filter).sort({ price: 1 });
  }

  async findByOperator(adminId: string, operator: Operator, activeOnly = true): Promise<IPack[]> {
    const filter: FilterQuery<IPack> = {
      adminId: new Types.ObjectId(adminId),
      operator
    };
    if (activeOnly) {
      filter.isActive = true;
    }
    return PackModel.find(filter).sort({ price: 1 });
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
