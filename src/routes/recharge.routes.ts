import { Router } from 'express';
import { RechargeController } from '../controllers/recharge.controller';
import { authenticate, requireActive, requireAdmin } from '../middleware/auth.middleware';

const router = Router();
const rechargeController = new RechargeController();

// All recharge endpoints require Admin authentication & active account
router.use(authenticate, requireActive, requireAdmin);

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

export default router;
