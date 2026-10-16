import { Schema, model, Document, Types } from 'mongoose';
import { Operator } from '../types';
import crypto from 'crypto';

// Encryption helpers (AES-256-GCM)
const ALGORITHM = 'aes-256-gcm';
const KEY_LEN = 32;

function getEncryptionKey(): Buffer {
  const secret = process.env.ENCRYPTION_SECRET || 'giga_pass_default_encryption_key_32chars!!';
  return Buffer.from(secret.padEnd(KEY_LEN, '0').substring(0, KEY_LEN), 'utf8');
}

export function encryptPassword(plaintext: string): string {
  const iv = crypto.randomBytes(12);
  const key = getEncryptionKey();
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  // Format: iv_hex:authTag_hex:encrypted_hex
  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted.toString('hex')}`;
}

export function decryptPassword(encryptedData: string): string {
  const [ivHex, authTagHex, encryptedHex] = encryptedData.split(':');
  if (!ivHex || !authTagHex || !encryptedHex) {
    throw new Error('Invalid encrypted data format');
  }
  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(authTagHex, 'hex');
  const encrypted = Buffer.from(encryptedHex, 'hex');
  const key = getEncryptionKey();
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
  return decrypted.toString('utf8');
}

export interface IRechargeList extends Document {
  _id: Types.ObjectId;
  adminId: Types.ObjectId;
  name: string;
  email: string;
  encryptedPassword: string; // AES-256-GCM encrypted
  operator: Operator;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const rechargeListSchema = new Schema<IRechargeList>(
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
    email: {
      type: String,
      required: true,
      trim: true,
      lowercase: true
    },
    encryptedPassword: {
      type: String,
      required: true
    },
    operator: {
      type: String,
      enum: Object.values(Operator),
      required: true,
      index: true
    },
    isActive: {
      type: Boolean,
      default: true
    }
  },
  {
    timestamps: true,
    toJSON: {
      transform: (_, ret: any) => {
        delete ret.__v;
        // Never expose encryptedPassword in JSON responses
        delete ret.encryptedPassword;
        return ret;
      }
    }
  }
);

rechargeListSchema.index({ adminId: 1, operator: 1 });

export const RechargeListModel = model<IRechargeList>('RechargeList', rechargeListSchema);
