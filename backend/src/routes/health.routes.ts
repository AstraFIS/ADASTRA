import { Router } from 'express';
import { dbState } from '../config/db.js';
import { DEMO, EXCEL_FILE } from '../config/demo.js';

export const healthRouter = Router();

healthRouter.get('/', (_req, res) => {
  if (DEMO) {
    // Excel mode: no database by design
    res.json({ status: 'ok', db: 'not used (Excel mode)', data: EXCEL_FILE, uptime: Math.round(process.uptime()) });
    return;
  }
  const db = dbState();
  res.status(db === 'connected' ? 200 : 503).json({
    status: db === 'connected' ? 'ok' : 'degraded',
    db,
    uptime: Math.round(process.uptime()),
    timestamp: new Date().toISOString(),
  });
});
