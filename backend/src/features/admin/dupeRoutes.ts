import { Router, Request, Response, type IRouter } from 'express';
import logger from '../../utils/logger.js';
import { requireAuth, requireOverlord } from '../../middleware/auth.js';
import { requireMutationGate } from '../../middleware/mutationGate.js';
import { validateIdParam, validateBigIntIdParam } from '../../utils/validation.js';
import {
  getDupedItems,
  getDupeDetails,
  getDupeSummary,
  deletePlayerItem,
  deleteLockerItem,
  deletePlayerItems,
  deleteAllDupesForUid,
} from '../../services/dupeDetectionService.js';

export const adminDupeRoutes: IRouter = Router();

/**
 * GET /api/admin/dupes
 * Get list of all duplicated items
 */
adminDupeRoutes.get(
  '/dupes',
  requireAuth,
  requireOverlord,
  async (_req: Request, res: Response) => {
    try {
      const items = await getDupedItems();
      const summary = await getDupeSummary();
      return res.json({ items, summary });
    } catch (error) {
      logger.error('Get duped items error:', error);
      return res.status(500).json({ error: 'Failed to get duplicated items' });
    }
  },
);

/**
 * GET /api/admin/dupes/:objUid
 * Get details for a specific duped item uid
 */
adminDupeRoutes.get(
  '/dupes/:objUid',
  requireAuth,
  requireOverlord,
  async (req: Request, res: Response) => {
    try {
      const objUid = validateBigIntIdParam(req.params.objUid);
      if (objUid === null) {
        return res.status(400).json({ error: 'Invalid obj_uid' });
      }
      const details = await getDupeDetails(objUid);
      return res.json({ details });
    } catch (error) {
      logger.error('Get dupe details error:', error);
      return res.status(500).json({ error: 'Failed to get dupe details' });
    }
  },
);

/**
 * DELETE /api/admin/dupes/item/:id
 * Delete a specific item by its id
 */
adminDupeRoutes.delete(
  '/dupes/item/:id',
  requireAuth,
  requireOverlord,
  requireMutationGate('itemDeletes'),
  async (req: Request, res: Response) => {
    try {
      const itemId = validateIdParam(req.params.id);
      if (itemId === null) {
        return res.status(400).json({ error: 'Invalid item id' });
      }
      const deleted = await deletePlayerItem(itemId);
      if (!deleted) {
        return res.status(404).json({ error: 'Item not found' });
      }
      return res.json({ success: true });
    } catch (error) {
      logger.error('Delete item error:', error);
      return res.status(500).json({ error: 'Failed to delete item' });
    }
  },
);

/**
 * DELETE /api/admin/dupes/locker-item/:id
 * Delete a specific locker item by its id
 */
adminDupeRoutes.delete(
  '/dupes/locker-item/:id',
  requireAuth,
  requireOverlord,
  requireMutationGate('itemDeletes'),
  async (req: Request, res: Response) => {
    try {
      const itemId = validateIdParam(req.params.id);
      if (itemId === null) {
        return res.status(400).json({ error: 'Invalid item id' });
      }
      const deleted = await deleteLockerItem(itemId);
      if (!deleted) {
        return res.status(404).json({ error: 'Locker item not found' });
      }
      return res.json({ success: true });
    } catch (error) {
      logger.error('Delete locker item error:', error);
      return res.status(500).json({ error: 'Failed to delete locker item' });
    }
  },
);

/**
 * DELETE /api/admin/dupes/uid/:objUid/:vnum
 * Delete all duplicate copies of an item (keeps original)
 */
adminDupeRoutes.delete(
  '/dupes/uid/:objUid/:vnum',
  requireAuth,
  requireOverlord,
  requireMutationGate('itemDeletes'),
  async (req: Request, res: Response) => {
    try {
      const objUid = validateBigIntIdParam(req.params.objUid);
      const vnum = validateIdParam(req.params.vnum);
      if (objUid === null || vnum === null) {
        return res.status(400).json({ error: 'Invalid parameters' });
      }
      const deletedCount = await deleteAllDupesForUid(objUid, vnum);
      return res.json({ success: true, deletedCount });
    } catch (error) {
      logger.error('Delete dupes for uid error:', error);
      const message = error instanceof Error ? error.message : 'Failed to delete duplicates';
      const status = error instanceof Error && error.message.includes('distinct VNUMs') ? 409 : 500;
      return res.status(status).json({ error: message });
    }
  },
);

/**
 * POST /api/admin/dupes/bulk-delete
 * Delete multiple items by their ids
 */
adminDupeRoutes.post(
  '/dupes/bulk-delete',
  requireAuth,
  requireOverlord,
  requireMutationGate('itemDeletes'),
  async (req: Request, res: Response) => {
    try {
      const { itemIds } = req.body;
      if (!Array.isArray(itemIds) || itemIds.length === 0) {
        return res.status(400).json({ error: 'itemIds must be a non-empty array' });
      }
      const ids = itemIds.map((id: any) => parseInt(id, 10)).filter((id: number) => !isNaN(id));
      if (ids.length === 0) {
        return res.status(400).json({ error: 'No valid item ids provided' });
      }
      const deletedCount = await deletePlayerItems(ids);
      return res.json({ success: true, deletedCount });
    } catch (error) {
      logger.error('Bulk delete items error:', error);
      return res.status(500).json({ error: 'Failed to delete items' });
    }
  },
);
