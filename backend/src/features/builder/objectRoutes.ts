import { Router, Request, Response, type IRouter } from 'express';
import logger, { getErrorMessage } from '../../utils/logger.js';
import { getObjectData } from '../../services/zoneBuilderParser.js';
import {
  updateObject,
  createObject,
  deleteObject,
  getNextVnum,
} from '../../services/zoneBuilderWriter.js';
import { validateObject, clearValidationCache } from '../../services/zoneBuilderValidator.js';
import type { ZoneObject } from '../../types/builder.js';
import { logBuilderActivity } from './shared.js';

export const builderObjectRoutes: IRouter = Router();

// GET /api/builder/zones/:id/objects/:vnum - Get single object
builderObjectRoutes.get('/zones/:id/objects/:vnum', async (req: Request, res: Response) => {
  try {
    const zoneId = req.params.id;
    const vnum = parseInt(req.params.vnum, 10);

    if (!zoneId || zoneId.trim() === '' || isNaN(vnum)) {
      res.status(400).json({ error: 'Invalid zone ID or vnum' });
      return;
    }

    const object = await getObjectData(zoneId, vnum);
    if (!object) {
      res.status(404).json({ error: 'Object not found' });
      return;
    }

    res.json({ object });
  } catch (error) {
    logger.error('Error getting object:', error);
    res.status(500).json({ error: 'Failed to get object', message: getErrorMessage(error) });
  }
});

// PUT /api/builder/zones/:id/objects/:vnum - Update object
builderObjectRoutes.put('/zones/:id/objects/:vnum', async (req: Request, res: Response) => {
  try {
    const zoneId = req.params.id;
    const vnum = parseInt(req.params.vnum, 10);

    if (!zoneId || zoneId.trim() === '' || isNaN(vnum)) {
      res.status(400).json({ error: 'Invalid zone ID or vnum' });
      return;
    }

    const objectData: ZoneObject = {
      ...req.body,
      vnum,
    };

    // Run cross-reference validation
    const validation = await validateObject(zoneId, objectData);

    // Block save if there are hard errors (not warnings)
    if (!validation.valid) {
      res.status(400).json({
        error: 'Validation failed',
        errors: validation.errors,
        warnings: validation.warnings,
      });
      return;
    }

    await updateObject(zoneId, objectData);

    // Clear validation cache after updating
    clearValidationCache();

    await logBuilderActivity(
      req.user?.accountName || 'unknown',
      'object_update',
      zoneId,
      null,
      'object',
      vnum,
      objectData.shortDesc,
      req.ip || req.socket.remoteAddress || null,
    );

    // Return success with any warnings
    res.json({
      success: true,
      object: objectData,
      warnings: validation.warnings.length > 0 ? validation.warnings : undefined,
    });
  } catch (error) {
    logger.error('Error updating object:', error);
    res.status(500).json({ error: 'Failed to update object', message: getErrorMessage(error) });
  }
});

// POST /api/builder/zones/:id/objects - Create new object
builderObjectRoutes.post('/zones/:id/objects', async (req: Request, res: Response) => {
  try {
    const zoneId = req.params.id;

    if (!zoneId || zoneId.trim() === '') {
      res.status(400).json({ error: 'Invalid zone ID' });
      return;
    }

    let vnum = req.body.vnum;
    if (!vnum) {
      vnum = await getNextVnum(zoneId, 'obj');
    }

    const objectData: ZoneObject = {
      vnum,
      keywords: req.body.keywords || 'object',
      shortDesc: req.body.shortDesc || 'an object',
      longDesc: req.body.longDesc || 'An object is lying here.',
      actionDesc: req.body.actionDesc || '',
      itemType: req.body.itemType || 12, // OTHER
      material: req.body.material || 0,
      craftsmanship: req.body.craftsmanship || 0,
      extraFlags: req.body.extraFlags || 0,
      extraFlags2: req.body.extraFlags2 || 0,
      wearFlags: req.body.wearFlags || 0,
      values: req.body.values || [0, 0, 0, 0, 0, 0, 0, 0],
      weight: req.body.weight || 1,
      cost: req.body.cost || 0,
      condition: req.body.condition || 0,
      applies: req.body.applies || [],
      extras: req.body.extras || [],
      antiFlags: req.body.antiFlags || 0,
      antiFlags2: req.body.antiFlags2 || 0,
    };

    const object = await createObject(zoneId, objectData);

    await logBuilderActivity(
      req.user?.accountName || 'unknown',
      'object_create',
      zoneId,
      null,
      'object',
      vnum,
      object.shortDesc,
      req.ip || req.socket.remoteAddress || null,
    );

    res.status(201).json({ success: true, object });
  } catch (error) {
    logger.error('Error creating object:', error);
    res.status(500).json({ error: 'Failed to create object', message: getErrorMessage(error) });
  }
});

// DELETE /api/builder/zones/:id/objects/:vnum - Delete object
builderObjectRoutes.delete('/zones/:id/objects/:vnum', async (req: Request, res: Response) => {
  try {
    const zoneId = req.params.id;
    const vnum = parseInt(req.params.vnum, 10);

    if (!zoneId || zoneId.trim() === '' || isNaN(vnum)) {
      res.status(400).json({ error: 'Invalid zone ID or vnum' });
      return;
    }

    const deleted = await deleteObject(zoneId, vnum);
    if (!deleted) {
      res.status(404).json({ error: 'Object not found' });
      return;
    }

    await logBuilderActivity(
      req.user?.accountName || 'unknown',
      'object_delete',
      zoneId,
      null,
      'object',
      vnum,
      null,
      req.ip || req.socket.remoteAddress || null,
    );

    res.json({ success: true });
  } catch (error) {
    logger.error('Error deleting object:', error);
    res.status(500).json({ error: 'Failed to delete object', message: getErrorMessage(error) });
  }
});
