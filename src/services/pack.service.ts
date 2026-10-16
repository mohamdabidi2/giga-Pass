import { Types } from 'mongoose';
import { PackRepository } from '../repositories/pack.repository';
import { IPack } from '../models/pack.model';
import { NotFoundError, AppError, ForbiddenError } from '../utils/errors';
import { ErrorCode, Operator } from '../types';

export class PackService {
  private packRepo: PackRepository;

  constructor() {
    this.packRepo = new PackRepository();
  }

  async getAll(adminId?: string, activeOnly = false): Promise<IPack[]> {
    const filter: any = {};
    if (adminId) {
      filter.adminId = new Types.ObjectId(adminId);
    }
    if (activeOnly) {
      filter.isActive = true;
    }
    return this.packRepo.findAll(filter);
  }

  async getByOperator(adminId: string, operator: Operator, activeOnly = true): Promise<IPack[]> {
    return this.packRepo.findByOperator(adminId, operator, activeOnly);
  }

  async getById(id: string, adminId?: string): Promise<IPack> {
    const pack = await this.packRepo.findById(id);
    if (!pack) {
      throw new NotFoundError('الباقة المطلوبة غير موجودة', ErrorCode.PACK_NOT_FOUND);
    }
    if (adminId && pack.adminId.toString() !== adminId) {
      throw new ForbiddenError('غير مصرح بالوصول إلى هذه الباقة', ErrorCode.FORBIDDEN);
    }
    return pack;
  }

  async create(adminId: string, data: Partial<IPack>): Promise<IPack> {
    if (!data.name || data.giga === undefined || data.price === undefined || !data.operator) {
      throw new AppError('بيانات الباقة غير مكتملة (الاسم، الجيجا، السعر، المشغل)', 400, ErrorCode.VALIDATION_ERROR);
    }

    return this.packRepo.create({
      ...data,
      adminId: new Types.ObjectId(adminId),
      isActive: data.isActive !== undefined ? data.isActive : true
    });
  }

  async update(id: string, adminId: string, data: Partial<IPack>): Promise<IPack> {
    const pack = await this.getById(id, adminId);
    const updated = await this.packRepo.updateById(pack._id.toString(), data);
    if (!updated) {
      throw new NotFoundError('الباقة غير موجودة', ErrorCode.PACK_NOT_FOUND);
    }
    return updated;
  }

  async toggleStatus(id: string, adminId: string, isActive: boolean): Promise<IPack> {
    return this.update(id, adminId, { isActive });
  }

  async delete(id: string, adminId: string): Promise<void> {
    await this.getById(id, adminId);
    const deleted = await this.packRepo.deleteById(id);
    if (!deleted) {
      throw new NotFoundError('الباقة غير موجودة', ErrorCode.PACK_NOT_FOUND);
    }
  }
}
