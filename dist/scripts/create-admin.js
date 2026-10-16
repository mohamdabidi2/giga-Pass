"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const database_1 = require("../config/database");
const env_1 = require("../config/env");
const user_model_1 = require("../models/user.model");
const types_1 = require("../types");
const logger_1 = require("../utils/logger");
async function main() {
    try {
        await (0, database_1.connectDatabase)();
        logger_1.logger.info('Connected to MongoDB. Creating/updating admin user...');
        const username = (process.argv[2] || env_1.env.ADMIN_USERNAME || 'admin_gigapass').toLowerCase().trim();
        const password = process.argv[3] || env_1.env.ADMIN_PASSWORD || 'AdminSecure@2026!';
        const fullName = process.argv[4] || env_1.env.ADMIN_FULL_NAME || 'المدير العام';
        const salt = await bcryptjs_1.default.genSalt(10);
        const passwordHash = await bcryptjs_1.default.hash(password, salt);
        let admin = await user_model_1.UserModel.findOne({ username });
        if (admin) {
            admin.passwordHash = passwordHash;
            admin.fullName = fullName;
            admin.role = types_1.UserRole.ADMIN;
            admin.status = types_1.UserStatus.ACTIVE;
            await admin.save();
            console.log('--------------------------------------------------');
            console.log('✅ تم تحديث حساب المشرف بنجاح (Admin Updated):');
            console.log(`👤 اسم المستخدم (Username): ${username}`);
            console.log(`🔑 كلمة المرور (Password): ${password}`);
            console.log(`🏷️  الاسم الكامل (Full Name): ${fullName}`);
            console.log(`🛡️  الرتبة (Role): ${admin.role}`);
            console.log('--------------------------------------------------');
        }
        else {
            admin = await user_model_1.UserModel.create({
                username,
                fullName,
                passwordHash,
                role: types_1.UserRole.ADMIN,
                status: types_1.UserStatus.ACTIVE,
                balance: 0.0,
                debt: 0.0,
            });
            console.log('--------------------------------------------------');
            console.log('✅ تم إنشاء حساب المشرف بنجاح (Admin Created):');
            console.log(`👤 اسم المستخدم (Username): ${username}`);
            console.log(`🔑 كلمة المرور (Password): ${password}`);
            console.log(`🏷️  الاسم الكامل (Full Name): ${fullName}`);
            console.log(`🛡️  الرتبة (Role): ${admin.role}`);
            console.log('--------------------------------------------------');
        }
    }
    catch (error) {
        console.error('❌ خطأ أثناء إنشاء المشرف:', error);
        process.exit(1);
    }
    finally {
        await (0, database_1.disconnectDatabase)();
    }
}
main();
