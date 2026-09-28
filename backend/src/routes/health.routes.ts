import { Router } from 'express';
import { dbState } from '../config/db.js';

export const healthRouter = Router();

healthRouter.get('/', (_req, res) => {
  const db = dbState();
  res.status(db === 'connected' ? 200 : 503).json({
    status: db === 'connected' ? 'ok' : 'degraded',
    db,
    uptime: Math.round(process.uptime()),
    timestamp: new Date().toISOString(),
  });
});
