import { Router } from 'express';
import { getPortfolioOverview } from '../services/platforms.service.js';
import { facebookRouter } from './facebook.routes.js';

export const platformsRouter = Router();

platformsRouter.get('/overview', (_req, res) => {
  res.json(getPortfolioOverview());
});

platformsRouter.use('/facebook', facebookRouter);
