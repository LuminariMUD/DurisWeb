/**
 * Admin API for hook state and toggles.
 */

import { Router, type Request, type Response, type IRouter } from 'express';
import crypto from 'node:crypto';

import { requireAuth, requirePermission } from '../middleware/auth.js';
import logger from '../utils/logger.js';
import { getHookStatuses, setHookEnabled, HookToggleError } from '../hooks/hookSettingsService.js';
import { isHookId } from '../hooks/registry.js';
import { getMudReportReceivedAt } from '../hooks/mudHookStateClient.js';
import { getMudTransportStatus } from '../services/mudTransportStatus.js';
import { reconcileHook } from '../services/hookReconcileService.js';
import { getHookAuditHealth, processHookAuditJournal } from '../hooks/hookToggleJournal.js';

const router: IRouter = Router();
function reportFailure(
  reason: 'status_failed' | 'toggle_failed' | 'reconcile_failed' | 'audit_health_unavailable',
): void {
  logger.error('[hooks] Control operation failed', { reason, reference: crypto.randomUUID() });
}

function serialize(row: Awaited<ReturnType<typeof getHookStatuses>>[number]) {
  return {
    id: row.hook.id,
    channel: row.hook.channel,
    direction: row.hook.direction,
    alwaysOn: row.hook.alwaysOn,
    description: row.hook.description,
    webEnabled: row.webEnabled,
    change: row.change ?? null,
    mudState: row.mudState,
    provenance: {
      web: row.webProvenance,
      mud: {
        source:
          row.mudState === 'enabled' || row.mudState === 'disabled' ? 'authenticated_bridge' : null,
        reportedAt: getMudReportReceivedAt(),
      },
    },
    lastActivityAt: row.lastActivityAt,
    resource: row.resource
      ? {
          availability: row.resource.availability,
          reason: row.resource.reason,
          droppedInputs: row.resource.droppedInputs,
          retryAt: row.resource.retryAt,
        }
      : null,
    effective: row.effective,
    active: row.active,
    reason: row.reason,
  };
}

/**
 * GET /api/hooks
 * Website state, MUD state, and effective state for every hook.
 */
router.get(
  '/',
  requireAuth,
  requirePermission('manage_mud_properties'),
  async (_req: Request, res: Response) => {
    try {
      const [statuses, transport] = await Promise.all([getHookStatuses(), getMudTransportStatus()]);
      return res.json({
        hooks: statuses.map(serialize),
        transport,
        refreshedAt: new Date().toISOString(),
      });
    } catch {
      reportFailure('status_failed');
      return res.status(500).json({ error: 'Failed to read hook statuses' });
    }
  },
);

/** Safe aggregates only; journal payloads are never a settings/debug response. */
router.get(
  '/audit',
  requireAuth,
  requirePermission('manage_mud_properties'),
  async (_req: Request, res: Response) => {
    try {
      return res.json(await getHookAuditHealth());
    } catch {
      reportFailure('audit_health_unavailable');
      return res.status(503).json({ error: 'Audit health is unavailable' });
    }
  },
);
router.post(
  '/audit/retry',
  requireAuth,
  requirePermission('manage_mud_properties'),
  async (req: Request, res: Response) => {
    const size: unknown = (req.body as Record<string, unknown>)?.batchSize ?? 25;
    if (typeof size !== 'number' || !Number.isInteger(size) || size < 1 || size > 100)
      return res.status(400).json({ error: 'Batch size must be an integer from 1 to 100' });
    return res.json(await processHookAuditJournal({ batchSize: size, force: true }));
  },
);

/**
 * PATCH /api/hooks/:id
 * Set the website-side toggle for one hook.
 */
router.patch(
  '/:id',
  requireAuth,
  requirePermission('manage_mud_properties'),
  async (req: Request, res: Response) => {
    const { id } = req.params;

    // Validate at the boundary: the id must name a registered hook, and
    // `enabled` must be an actual boolean rather than anything truthy.
    if (!isHookId(id)) {
      return res.status(404).json({ error: 'Unknown hook id' });
    }

    const enabled: unknown = (req.body as Record<string, unknown>)?.enabled;
    if (typeof enabled !== 'boolean') {
      return res.status(400).json({ error: 'Field "enabled" must be a boolean' });
    }

    const actor = req.user?.accountName;
    if (!actor) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    try {
      const status = await setHookEnabled(id, enabled, actor, req.get('Idempotency-Key'));
      return res.json({ hook: serialize(status) });
    } catch (error) {
      if (error instanceof HookToggleError) {
        const code =
          error.code === 'unknown_hook'
            ? 404
            : error.code === 'invalid_request'
              ? 400
              : error.code === 'storage_unavailable'
                ? 503
                : 409;
        return res.status(code).json({ error: error.message });
      }
      reportFailure('toggle_failed');
      return res.status(500).json({ error: 'Failed to update hook toggle' });
    }
  },
);

/** POST /api/hooks/:id/reconcile - set both owned ends, fail-closed. */
router.post(
  '/:id/reconcile',
  requireAuth,
  requirePermission('manage_mud_properties'),
  async (req: Request, res: Response) => {
    const { id } = req.params;
    if (!isHookId(id)) return res.status(404).json({ error: 'Unknown hook id' });
    const enabled: unknown = (req.body as Record<string, unknown>)?.enabled;
    if (typeof enabled !== 'boolean') {
      return res.status(400).json({ error: 'Field "enabled" must be a boolean' });
    }
    const actor = req.user?.accountName;
    if (!actor) return res.status(401).json({ error: 'Not authenticated' });

    try {
      const result = await reconcileHook(id, enabled, actor);
      return res.json({
        complete: result.complete,
        warning: result.warning,
        hook: serialize(result.hook),
      });
    } catch (error) {
      if (error instanceof HookToggleError) {
        return res
          .status(
            error.code === 'unknown_hook'
              ? 404
              : error.code === 'invalid_request'
                ? 400
                : error.code === 'storage_unavailable'
                  ? 503
                  : 409,
          )
          .json({
            error: error.message,
          });
      }
      reportFailure('reconcile_failed');
      return res.status(500).json({ error: 'Failed to reconcile hook state' });
    }
  },
);

export default router;
