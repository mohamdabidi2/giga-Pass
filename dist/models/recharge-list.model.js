"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.RechargeListModel = void 0;
exports.encryptPassword = encryptPassword;
exports.decryptPassword = decryptPassword;
const mongoose_1 = require("mongoose");
const types_1 = require("../types");
const crypto_1 = __importDefault(require("crypto"));
// Encryption helpers (AES-256-GCM)
const ALGORITHM = 'aes-256-gcm';
const KEY_LEN = 32;
function getEncryptionKey() {
    const secret = process.env.ENCRYPTION_SECRET || 'giga_pass_default_encryption_key_32chars!!';
    return Buffer.from(secret.padEnd(KEY_LEN, '0').substring(0, KEY_LEN), 'utf8');
}
function encryptPassword(plaintext) {
    const iv = crypto_1.default.randomBytes(12);
    const key = getEncryptionKey();
    const cipher = crypto_1.default.createCipheriv(ALGORITHM, key, iv);
    const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    const authTag = cipher.getAuthTag();
    // Format: iv_hex:authTag_hex:encrypted_hex
    return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted.toString('hex')}`;
}
// All possible encryption keys to try during decryption (for migration safety)
const FALLBACK_SECRETS = [
    'giga_pass_default_encryption_key_32chars!!',
    'giga_pass_aes256_super_secret_key_2026_pass',
    'GigaPassHexor',
];
function tryDecryptWithKey(parts, keyBuf) {
    try {
        const [ivHex, authTagHex, encryptedHex] = parts;
        const iv = Buffer.from(ivHex, 'hex');
        const authTag = Buffer.from(authTagHex, 'hex');
        const encrypted = Buffer.from(encryptedHex, 'hex');
        const decipher = crypto_1.default.createDecipheriv(ALGORITHM, keyBuf, iv);
        decipher.setAuthTag(authTag);
        const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
        return decrypted.toString('utf8');
    }
    catch {
        return null;
    }
}
function decryptPassword(encryptedData) {
    if (!encryptedData)
        return '';
    const parts = encryptedData.split(':');
    // Not in encrypted format → return as-is (plain text stored directly)
    if (parts.length !== 3)
        return encryptedData;
    // 1. Try current key first
    const currentKey = getEncryptionKey();
    const result = tryDecryptWithKey(parts, currentKey);
    if (result !== null)
        return result;
    // 2. Try all fallback keys
    for (const secret of FALLBACK_SECRETS) {
        const keyBuf = Buffer.from(secret.padEnd(KEY_LEN, '0').substring(0, KEY_LEN), 'utf8');
        const fallbackResult = tryDecryptWithKey(parts, keyBuf);
        if (fallbackResult !== null)
            return fallbackResult;
    }
    // 3. Last resort: return raw stored value so admin sees something
    return encryptedData;
}
const rechargeListSchema = new mongoose_1.Schema({
    adminId: {
        type: mongoose_1.Schema.Types.ObjectId,
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
        enum: Object.values(types_1.Operator),
        required: true,
        index: true
    },
    isActive: {
        type: Boolean,
        default: true
    }
}, {
    timestamps: true,
    toJSON: {
        transform: (_, ret) => {
            delete ret.__v;
            // Never expose encryptedPassword in JSON responses
            delete ret.encryptedPassword;
            return ret;
        }
    }
});
rechargeListSchema.index({ adminId: 1, operator: 1 });
exports.RechargeListModel = (0, mongoose_1.model)('RechargeList', rechargeListSchema);
