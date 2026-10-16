"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.OrderRepository = void 0;
const mongoose_1 = require("mongoose");
const order_model_1 = require("../models/order.model");
const types_1 = require("../types");
class OrderRepository {
    async findById(id, session) {
        return order_model_1.OrderModel.findById(id)
            .populate('clientId', 'fullName username balance status')
            .populate('packId', 'name giga dataAmount price operator')
            .populate('selectedListId', 'name email operator')
            .populate('selectedSimId', 'phoneNumber operator remainingGiga')
            .session(session || null);
    }
    async findByOrderNumber(orderNumber) {
        return order_model_1.OrderModel.findOne({ orderNumber })
            .populate('clientId', 'fullName username balance')
            .populate('packId', 'name giga dataAmount price operator')
            .populate('selectedListId', 'name email operator')
            .populate('selectedSimId', 'phoneNumber operator remainingGiga');
    }
    async create(orderData, session) {
        const order = new order_model_1.OrderModel(orderData);
        return order.save({ session });
    }
    async updateById(id, update, session) {
        return order_model_1.OrderModel.findByIdAndUpdate(id, update, { new: true, session });
    }
    async findWithPagination(filter, page, limit) {
        const skip = (page - 1) * limit;
        const [orders, total] = await Promise.all([
            order_model_1.OrderModel.find(filter)
                .populate('clientId', 'fullName username balance')
                .populate('packId', 'name giga dataAmount price operator')
                .populate('selectedListId', 'name email operator')
                .populate('selectedSimId', 'phoneNumber operator remainingGiga')
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limit)
                .lean(),
            order_model_1.OrderModel.countDocuments(filter)
        ]);
        return { orders: orders, total };
    }
    async count(filter = {}) {
        return order_model_1.OrderModel.countDocuments(filter);
    }
    async getRecentOrders(clientId, adminId, limit = 5) {
        const filter = {};
        if (clientId)
            filter.clientId = new mongoose_1.Types.ObjectId(clientId);
        if (adminId)
            filter.adminId = new mongoose_1.Types.ObjectId(adminId);
        return order_model_1.OrderModel.find(filter)
            .populate('clientId', 'fullName username')
            .populate('packId', 'name giga price operator')
            .sort({ createdAt: -1 })
            .limit(limit);
    }
    async getTodayRevenue(adminId) {
        const startOfDay = new Date();
        startOfDay.setHours(0, 0, 0, 0);
        const match = {
            status: { $in: [types_1.OrderStatus.COMPLETED, types_1.OrderStatus.PROCESSING, types_1.OrderStatus.CONFIRMED] },
            createdAt: { $gte: startOfDay }
        };
        if (adminId) {
            match.adminId = new mongoose_1.Types.ObjectId(adminId);
        }
        const result = await order_model_1.OrderModel.aggregate([
            { $match: match },
            {
                $group: {
                    _id: null,
                    total: { $sum: '$price' }
                }
            }
        ]);
        return result[0]?.total || 0;
    }
    async getTotalRevenue(adminId) {
        const match = {
            status: { $in: [types_1.OrderStatus.COMPLETED, types_1.OrderStatus.PROCESSING, types_1.OrderStatus.CONFIRMED] }
        };
        if (adminId) {
            match.adminId = new mongoose_1.Types.ObjectId(adminId);
        }
        const result = await order_model_1.OrderModel.aggregate([
            { $match: match },
            {
                $group: {
                    _id: null,
                    total: { $sum: '$price' }
                }
            }
        ]);
        return result[0]?.total || 0;
    }
}
exports.OrderRepository = OrderRepository;
