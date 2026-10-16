import bcrypt from 'bcryptjs';
import { connectDatabase, disconnectDatabase } from '../config/database';
import { env } from '../config/env';
import { UserModel } from '../models/user.model';
import { UserRole, UserStatus } from '../types';
import { logger } from '../utils/logger';

async function main() {
  try {
    await connectDatabase();
    logger.info('Connected to MongoDB. Creating/updating admin user...');

    const username = (process.argv[2] || env.ADMIN_USERNAME || 'admin_gigapass').toLowerCase().trim();
    const password = process.argv[3] || env.ADMIN_PASSWORD || 'AdminSecure@2026!';
    const fullName = process.argv[4] || env.ADMIN_FULL_NAME || 'المدير العام';

    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    let admin = await UserModel.findOne({ username });
    if (admin) {
      admin.passwordHash = passwordHash;
      admin.fullName = fullName;
      admin.role = UserRole.ADMIN;
      admin.status = UserStatus.ACTIVE;
      await admin.save();
      console.log('--------------------------------------------------');
      console.log('✅ تم تحديث حساب المشرف بنجاح (Admin Updated):');
      console.log(`👤 اسم المستخدم (Username): ${username}`);
      console.log(`🔑 كلمة المرور (Password): ${password}`);
      console.log(`🏷️  الاسم الكامل (Full Name): ${fullName}`);
      console.log(`🛡️  الرتبة (Role): ${admin.role}`);
      console.log('--------------------------------------------------');
    } else {
      admin = await UserModel.create({
        username,
        fullName,
        passwordHash,
        role: UserRole.ADMIN,
        status: UserStatus.ACTIVE,
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
  } catch (error) {
    console.error('❌ خطأ أثناء إنشاء المشرف:', error);
    process.exit(1);
  } finally {
    await disconnectDatabase();
  }
}

main();
