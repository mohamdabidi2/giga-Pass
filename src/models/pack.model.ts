import { Schema, model, Document, Types } from 'mongoose';
import { Operator } from '../types';

export interface IPack extends Document {
  _id: Types.ObjectId;
  adminId: Types.ObjectId; // The admin who owns this pack
  name: string;
  operator: Operator; // TUNISIE_TELECOM | ORANGE | OOREDOO
  giga: number; // Internet quantity in GB (numeric, no float errors)
  price: number;
  validityDays: number; // Validity in days
  description: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const packSchema = new Schema<IPack>(
  {
    adminId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true
    },
    name: {
      type: String,
      required: true,
      trim: true
    },
    operator: {
      type: String,
      enum: Object.values(Operator),
      required: true,
      index: true
    },
    giga: {
      type: Number,
      required: true,
      min: [0.1, 'يجب أن يكون حجم الإنترنت أكبر من 0'],
      set: (val: number) => Math.round(val * 1000) / 1000
    },
    price: {
      type: Number,
      required: true,
      min: [0, 'لا يمكن أن يكون السعر أقل من 0'],
      set: (val: number) => Math.round(val * 1000) / 1000
    },
    description: {
      type: String,
      default: '',
      trim: true
    },
    validityDays: {
      type: Number,
      default: 30,
      min: [1, 'يجب أن تكون مدة الصلاحية أكبر من صفر']
    },
    isActive: {
      type: Boolean,
      default: true,
      index: true
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

packSchema.index({ adminId: 1, operator: 1, isActive: 1 });
packSchema.index({ adminId: 1, isActive: 1 });

export const PackModel = model<IPack>('Pack', packSchema);
