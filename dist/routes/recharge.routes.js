"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const recharge_controller_1 = require("../controllers/recharge.controller");
const auth_middleware_1 = require("../middleware/auth.middleware");
const router = (0, express_1.Router)();
const rechargeController = new recharge_controller_1.RechargeController();
// All recharge endpoints require Admin authentication & active account
router.use(auth_middleware_1.authenticate, auth_middleware_1.requireActive, auth_middleware_1.requireAdmin);
// Lists
router.post('/lists', rechargeController.createList);
router.get('/lists', rechargeController.getLists);
router.get('/lists/:id', rechargeController.getListById);
router.put('/lists/:id', rechargeController.updateList);
router.delete('/lists/:id', rechargeController.deleteList);
// SIMs
router.post('/sims', rechargeController.createSim);
router.get('/lists/:listId/sims', rechargeController.getSimsByList);
router.patch('/sims/:id/giga', rechargeController.adjustSimGiga);
router.put('/sims/:id', rechargeController.updateSim);
router.delete('/sims/:id', rechargeController.deleteSim);
// Recharge execution (Dialog 'تم الشحن')
router.post('/complete', rechargeController.completeRecharge);
exports.default = router;
