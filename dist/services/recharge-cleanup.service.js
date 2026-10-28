"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ensureUploadsDirExists = ensureUploadsDirExists;
exports.saveRechargeScreenshot = saveRechargeScreenshot;
exports.cleanupExpiredScreenshots = cleanupExpiredScreenshots;
exports.startPeriodicScreenshotCleanup = startPeriodicScreenshotCleanup;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const order_model_1 = require("../models/order.model");
const recharge_history_model_1 = require("../models/recharge-history.model");
const logger_1 = require("../utils/logger");
const UPLOAD_DIR = path_1.default.join(process.cwd(), 'uploads', 'recharges');
const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000; // 7 days in milliseconds
/**
 * Ensures the uploads directory exists on disk.
 */
function ensureUploadsDirExists() {
    if (!fs_1.default.existsSync(UPLOAD_DIR)) {
        fs_1.default.mkdirSync(UPLOAD_DIR, { recursive: true });
        logger_1.logger.info(`📁 Created uploads directory: ${UPLOAD_DIR}`);
    }
}
/**
 * Saves a screenshot (base64 data URI or plain base64 string) to disk and returns its relative URL.
 */
async function saveRechargeScreenshot(orderId, base64Data) {
    ensureUploadsDirExists();
    // Strip potential data URL prefix: e.g. "data:image/jpeg;base64,"
    let cleanBase64 = base64Data.trim();
    let ext = 'jpg';
    if (cleanBase64.startsWith('data:image/')) {
        const headerMatch = cleanBase64.match(/^data:image\/([a-zA-Z0-9+]+);base64,/);
        if (headerMatch) {
            const rawExt = headerMatch[1].toLowerCase();
            ext = rawExt === 'jpeg' ? 'jpg' : rawExt;
            cleanBase64 = cleanBase64.substring(headerMatch[0].length);
        }
    }
    const fileName = `recharge_${orderId}_${Date.now()}.${ext}`;
    const filePath = path_1.default.join(UPLOAD_DIR, fileName);
    const buffer = Buffer.from(cleanBase64, 'base64');
    await fs_1.default.promises.writeFile(filePath, buffer);
    logger_1.logger.info(`📸 Saved recharge screenshot: ${fileName} (${buffer.length} bytes)`);
    return `/uploads/recharges/${fileName}`;
}
/**
 * Cleans up recharge screenshots older than 7 days.
 * Deletes files from disk and marks orders as screenshot expired to free up storage.
 */
async function cleanupExpiredScreenshots() {
    ensureUploadsDirExists();
    const cutoffDate = new Date(Date.now() - SEVEN_DAYS_MS);
    let deletedFiles = 0;
    let updatedOrders = 0;
    try {
        // 1. Find orders with screenshots older than 7 days
        const expiredOrders = await order_model_1.OrderModel.find({
            rechargeScreenshot: { $ne: null },
            $or: [
                { rechargeScreenshotUploadedAt: { $lt: cutoffDate } },
                { rechargeScreenshotUploadedAt: null, completedAt: { $lt: cutoffDate } }
            ]
        });
        for (const order of expiredOrders) {
            if (order.rechargeScreenshot) {
                // Resolve file path on disk
                const relative = order.rechargeScreenshot.startsWith('/')
                    ? order.rechargeScreenshot.substring(1)
                    : order.rechargeScreenshot;
                const filePath = path_1.default.join(process.cwd(), relative);
                try {
                    if (fs_1.default.existsSync(filePath)) {
                        await fs_1.default.promises.unlink(filePath);
                        deletedFiles++;
                    }
                }
                catch (err) {
                    logger_1.logger.warn(`Could not delete file ${filePath}: ${err}`);
                }
                order.rechargeScreenshot = undefined;
                order.rechargeScreenshotExpired = true;
                await order.save();
                updatedOrders++;
            }
        }
        // 2. Update matching recharge history records
        await recharge_history_model_1.RechargeHistoryModel.updateMany({
            screenshot: { $ne: null },
            $or: [
                { screenshotUploadedAt: { $lt: cutoffDate } },
                { screenshotUploadedAt: null, completedAt: { $lt: cutoffDate } }
            ]
        }, {
            $set: {
                screenshot: null,
                screenshotExpired: true
            }
        });
        // 3. Scan disk directory for any orphan image files older than 7 days
        const files = await fs_1.default.promises.readdir(UPLOAD_DIR);
        for (const file of files) {
            const filePath = path_1.default.join(UPLOAD_DIR, file);
            try {
                const stats = await fs_1.default.promises.stat(filePath);
                if (Date.now() - stats.mtimeMs > SEVEN_DAYS_MS) {
                    await fs_1.default.promises.unlink(filePath);
                    deletedFiles++;
                    logger_1.logger.info(`🗑️ Purged expired recharge screenshot file from disk: ${file}`);
                }
            }
            catch (err) {
                // Ignore single file stat errors
            }
        }
        if (deletedFiles > 0 || updatedOrders > 0) {
            logger_1.logger.info(`🧹 Screenshot cleanup complete: deleted ${deletedFiles} files, updated ${updatedOrders} orders.`);
        }
    }
    catch (err) {
        logger_1.logger.error(`Error during screenshot cleanup: ${err}`);
    }
    return { deletedFiles, updatedOrders };
}
/**
 * Starts periodic cleanup timer running every 6 hours.
 */
function startPeriodicScreenshotCleanup() {
    // Run on startup
    cleanupExpiredScreenshots().catch(() => { });
    // Run every 6 hours (4 times a day)
    return setInterval(() => {
        cleanupExpiredScreenshots().catch((err) => {
            logger_1.logger.error(`Scheduled screenshot cleanup failed: ${err}`);
        });
    }, 6 * 60 * 60 * 1000);
}
