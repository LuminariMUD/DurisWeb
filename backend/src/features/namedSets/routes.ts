import { Router, type Router as ExpressRouter } from 'express';
import { getNamedSetReport } from './service.js';

export const namedSetsRouter: ExpressRouter = Router();

/**
 * GET /api/named-sets
 * Public: the spells each zone's named set grants, as the in-game `namedreport` shows.
 */
namedSetsRouter.get('/', async (_req, res) => {
  const lookup = await getNamedSetReport();
  if (lookup.status !== 'available') {
    res.set('Cache-Control', 'no-store');
    return res.status(503).json({ error: 'Named set report is not available right now' });
  }
  res.set('Cache-Control', 'public, max-age=300');
  return res.json({ ...lookup.report, fetchedAt: lookup.fetchedAt });
});
