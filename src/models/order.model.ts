import { Schema, model, Document, Types } from 'mongoose';
import { OrderStatus, Operator, OrderTimelineEvent } from '../types';

export interface IOrder extends Document {
  _id: Types.ObjectId;
  orderNumber: string;
  adminId: Types.ObjectId;   // The admin who owns the client
  clientId: Types.ObjectId;
  packId: Types.ObjectId;
  beneficiaryNumber: string;
  targetPhone?: string;
  adminNotes?: string;
  rejectionReason?: string;
  // Pack snapshot — preserved even if pack changes later
  packNameSnapshot: string;
  packSnapshot?: {
    name: string;
    giga: number;
    price: number;
    operator: Operator;
  };
  operatorSnapshot: Operator;
  gigaSnapshot: number;     // GB quantity snapshot
  price: number;
  status: OrderStatus;
  timeline: OrderTimelineEvent[];
  // Recharge data (filled when admin completes)
  selectedListId?: Types.ObjectId;
  selectedSimId?: Types.ObjectId;
  completedAt?: Date;
  cancelledAt?: Date;
  processedAt?: Date;
  // Legacy fields for backward compat
  networkId?: Types.ObjectId;
  networkNameSnapshot?: string;
  dataAmountSnapshot?: string;
  confirmedAt?: Date;
  rejectedAt?: Date;
  metadata?: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

const timelineEventSchema = new Schema<OrderTimelineEvent>(
  {
    status: {
      type: String,
      enum: Object.values(OrderStatus),
      required: true
    },
    message: {
      type: String,
      required: true
    },
    actorType: {
      type: String,
      enum: ['CLIENT', 'ADMIN', 'SYSTEM'],
      required: true
    },
    actorId: {
      type: String
    },
    createdAt: {
      type: Date,
      default: Date.now
    }
  },
  { _id: false }
);

const orderSchema = new Schema<IOrder>(
  {
    orderNumber: {
      type: String,
      required: true,
      unique: true,
      index: true
    },
    adminId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true
    },
    clientId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true
    },
    packId: {
      type: Schema.Types.ObjectId,
      ref: 'Pack',
      required: true
    },
    beneficiaryNumber: {
      type: String,
      required: true,
      trim: true,
      index: true
    },
    packNameSnapshot: {
      type: String,
      required: true
    },
    operatorSnapshot: {
      type: String,
      enum: Object.values(Operator),
      required: true
    },
    gigaSnapshot: {
      type: Number,
      required: true,
      min: 0
    },
    price: {
      type: Number,
      required: true,
      min: 0,
      set: (val: number) => Math.round(val * 1000) / 1000
    },
    status: {
      type: String,
      enum: Object.values(OrderStatus),
      default: OrderStatus.PENDING,
      index: true
    },
    timeline: [timelineEventSchema],
    selectedListId: {
      type: Schema.Types.ObjectId,
      ref: 'RechargeList',
      default: null
    },
    selectedSimId: {
      type: Schema.Types.ObjectId,
      ref: 'Sim',
      default: null
    },
    targetPhone: {
      type: String,
      default: null,
      trim: true
    },
    adminNotes: {
      type: String,
      default: null
    },
    rejectionReason: {
      type: String,
      default: null
    },
    packSnapshot: {
      type: Schema.Types.Mixed,
      default: null
    },
    completedAt: Date,
    cancelledAt: Date,
    processedAt: Date,
    // Legacy compat fields
    networkId: { type: Schema.Types.ObjectId, ref: 'Network', default: null },
    networkNameSnapshot: { type: String, default: '' },
    dataAmountSnapshot: { type: String, default: '' },
    confirmedAt: Date,
    rejectedAt: Date,
    metadata: {
      type: Schema.Types.Mixed,
      default: {}
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

orderSchema.index({ adminId: 1, status: 1 });
orderSchema.index({ adminId: 1, createdAt: -1 });
orderSchema.index({ clientId: 1, status: 1 });
orderSchema.index({ status: 1, createdAt: -1 });
orderSchema.index({ createdAt: -1 });

export const OrderModel = model<IOrder>('Order', orderSchema);
