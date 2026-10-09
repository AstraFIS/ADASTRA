import { Router } from 'express';
import { classifyAds, getAdAccess, getAiStatus, saveAdAccess } from '../controllers/adAccess.controller.js';
import { requireAuth, requireRole } from '../middleware/auth.js';

export const adAccessRouter = Router();

// admin only: this decides which ads every other user can see
adAccessRouter.use(requireAuth, requireRole('admin'));

adAccessRouter.get('/', getAdAccess);
adAccessRouter.put('/', saveAdAccess);
adAccessRouter.get('/ai-status', getAiStatus);
adAccessRouter.post('/classify', classifyAds);
