import { Schema, model, Document, Types } from 'mongoose';
import { Operator } from '../types';

export interface ISim extends Document {
  _id: Types.ObjectId;
  adminId: Types.ObjectId;
  listId: Types.ObjectId; // parent RechargeList
  phoneNumber: string;
  operator: Operator;
  initialGiga: number;   // in GB (integer or precise decimal)
  remainingGiga: number; // in GB, decremented atomically on recharge
  isActive: boolean;
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}

const simSchema = new Schema<ISim>(
  {
    adminId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true
    },
    listId: {
      type: Schema.Types.ObjectId,
      ref: 'RechargeList',
      required: true,
      index: true
    },
    phoneNumber: {
      type: String,
      required: true,
      trim: true,
      index: true
    },
    operator: {
      type: String,
      enum: Object.values(Operator),
      required: true,
      index: true
    },
    initialGiga: {
      type: Number,
      required: true,
      min: [0, 'يجب أن يكون حجم الإنترنت الأولي أكبر من أو يساوي الصفر']
    },
    remainingGiga: {
      type: Number,
      required: true,
      min: [0, 'لا يمكن أن يكون رصيد الإنترنت المتبقي سالباً']
    },
    isActive: {
      type: Boolean,
      default: true
    },
    notes: {
      type: String,
      default: ''
    }
  },
  {
    timestamps: true,
    toJSON: {
      transform: (_, ret: any) => {
        delete ret.__v;
        return ret;
      }
    }
  }
);

simSchema.index({ adminId: 1, listId: 1 });
simSchema.index({ adminId: 1, operator: 1 });
simSchema.index({ listId: 1, remainingGiga: 1 });

export const SimModel = model<ISim>('Sim', simSchema);
