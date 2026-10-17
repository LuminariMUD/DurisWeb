import { Router, type IRouter, type Response } from 'express';
import { requireAuth, requireOverlord } from '../middleware/auth.js';
import { verifyCsrfToken } from '../middleware/csrf.js';
import {
  createDataHold,
  getDataHold,
  listDataHolds,
  releaseDataHold,
  DataHoldError,
} from '../services/dataHoldService.js';
import logger from '../utils/logger.js';

const router: IRouter = Router();
const readiness = {
  enforcementReady: false,
  warning:
    'General cleanup and restore enforcement remains incomplete; global protection is not ready.',
} as const;
router.use((_req, res, next) => {
  res.set('Cache-Control', 'no-store');
  res.vary('Cookie');
  next();
});
router.use(requireAuth, requireOverlord);
function failure(res: Response, error: unknown) {
  const problem = error instanceof DataHoldError ? error : new DataHoldError('storage_unavailable');
  if (problem.status >= 500)
    logger.warn('data_hold_operation_failed', {
      reason: problem.reason,
      reference: problem.reference,
    });
  return res
    .status(problem.status)
    .json({ error: problem.message, reference: problem.reference, ...readiness });
}
router.get('/', async (req, res) => {
  try {
    if (Object.keys(req.query).some((key) => !['after', 'includeReleased', 'limit'].includes(key)))
      throw new DataHoldError('invalid_request');
    const { after, includeReleased, limit } = req.query;
    if (
      (after !== undefined && typeof after !== 'string') ||
      (includeReleased !== undefined &&
        (typeof includeReleased !== 'string' || !['true', 'false'].includes(includeReleased))) ||
      (limit !== undefined && (typeof limit !== 'string' || !/^[1-9][0-9]*$/.test(limit)))
    )
      throw new DataHoldError('invalid_request');
    return res.json({
      ...readiness,
      ...(await listDataHolds({
        after: after ?? null,
        includeReleased: includeReleased === 'true',
        limit: limit === undefined ? 50 : Number(limit),
      })),
    });
  } catch (error) {
    return failure(res, error);
  }
});
router.get('/:id', async (req, res) => {
  try {
    return res.json({ ...readiness, hold: await getDataHold(String(req.params.id)) });
  } catch (error) {
    return failure(res, error);
  }
});
router.post('/', verifyCsrfToken, async (req, res) => {
  try {
    return res.json({ ...readiness, hold: await createDataHold(req.user!.accountName, req.body) });
  } catch (error) {
    return failure(res, error);
  }
});
router.post('/:id/release', verifyCsrfToken, async (req, res) => {
  try {
    return res.json({
      ...readiness,
      hold: await releaseDataHold(req.user!.accountName, String(req.params.id), req.body),
    });
  } catch (error) {
    return failure(res, error);
  }
});
export default router;
