import type { Request, Response } from 'express';
import { getFbOptions } from '../services/fbOptions.service.js';

/** GET /api/platforms/facebook/options — filter choices (ads, offers, providers, date ranges) from the report collection */
export async function getOptions(_req: Request, res: Response): Promise<void> {
  res.json(await getFbOptions());
}
