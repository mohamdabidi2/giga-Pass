import { Schema, model, Document, Types } from 'mongoose';

export interface IRechargeHistory extends Document {
  _id: Types.ObjectId;
  adminId: Types.ObjectId;
  orderId: Types.ObjectId;
  listId: Types.ObjectId;
  simId: Types.ObjectId;
  beneficiaryNumber: string;
  deductedGiga: number;
  balanceBefore: number;
  balanceAfter: number;
  screenshot?: string;
  screenshotUploadedAt?: Date;
  screenshotExpired?: boolean;
  completedAt: Date;
  createdAt: Date;
}

const rechargeHistorySchema = new Schema<IRechargeHistory>(
  {
    adminId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true
    },
    orderId: {
      type: Schema.Types.ObjectId,
      ref: 'Order',
      required: true,
      unique: true, // One recharge record per order — prevents duplicates
      index: true
    },
    listId: {
      type: Schema.Types.ObjectId,
      ref: 'RechargeList',
      required: true
    },
    simId: {
      type: Schema.Types.ObjectId,
      ref: 'Sim',
      required: true,
      index: true
    },
    beneficiaryNumber: {
      type: String,
      required: true,
      trim: true
    },
    deductedGiga: {
      type: Number,
      required: true,
      min: 0
    },
    balanceBefore: {
      type: Number,
      required: true,
      min: 0
    },
    balanceAfter: {
      type: Number,
      required: true,
      min: 0
    },
    completedAt: {
      type: Date,
      required: true,
      default: Date.now
    },
    screenshot: {
      type: String,
      default: null
    },
    screenshotUploadedAt: {
      type: Date,
      default: null
    },
    screenshotExpired: {
      type: Boolean,
      default: false
    }
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
    toJSON: {
      transform: (_, ret: any) => {
        delete ret.__v;
        return ret;
      }
    }
  }
);

rechargeHistorySchema.index({ adminId: 1, completedAt: -1 });
rechargeHistorySchema.index({ simId: 1, completedAt: -1 });

export const RechargeHistoryModel = model<IRechargeHistory>('RechargeHistory', rechargeHistorySchema);
