import express, { Router } from 'express';
import logger from '../utils/logger.js';
import * as zoneService from '../services/zoneService.js';
import { requireAuth, requirePermission } from '../middleware/auth.js';
import rateLimit from 'express-rate-limit';
import {
  parseZoneNumber,
  validateBulkZoneUpdatePayload,
  validateZoneUpdatePayload,
} from '../utils/zoneMutationValidation.js';
import { pool } from '../db/connection.js';

const router: Router = express.Router();

const zoneMutationLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many zone mutation requests; please try again later' },
});

// Helper function to log admin actions
async function logAdminAction(
  accountName: string,
  actionType: string,
  target: string,
  oldValue: string | null | undefined,
  newValue: string | null | undefined,
  notes: string | null | undefined,
  ipAddress: string | null | undefined,
): Promise<void> {
  try {
    await pool.query(
      `INSERT INTO admin_action_log (account_name, action_type, target, old_value, new_value, notes, ip_address)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        accountName,
        actionType,
        target,
        oldValue || null,
        newValue || null,
        notes || null,
        ipAddress,
      ],
    );
  } catch (error) {
    logger.error('Failed to log admin action:', error);
  }
}

// Apply auth and permission middleware to all routes
router.use(requireAuth);
router.use(requirePermission('manage_zones'));

// GET /api/zones - Get paginated zones with filters
router.get('/', async (req, res, next) => {
  try {
    const {
      page = '1',
      limit = '50',
      sortBy = 'number',
      sortOrder = 'asc',
      epicTypes,
      search,
      alignmentMin,
      alignmentMax,
      difficultyMin,
      difficultyMax,
      onlyEpicZones,
    } = req.query;

    const filters: zoneService.ZoneFilters = {};

    if (epicTypes) {
      const types = String(epicTypes)
        .split(',')
        .map(Number)
        .filter((n) => !isNaN(n));
      if (types.length > 0) {
        filters.epicTypes = types;
      }
    }

    if (search) {
      filters.search = String(search);
    }

    if (alignmentMin) {
      filters.alignmentMin = Number(alignmentMin);
    }

    if (alignmentMax) {
      filters.alignmentMax = Number(alignmentMax);
    }

    if (difficultyMin) {
      filters.difficultyMin = Number(difficultyMin);
    }

    if (difficultyMax) {
      filters.difficultyMax = Number(difficultyMax);
    }

    if (onlyEpicZones === 'true') {
      filters.onlyEpicZones = true;
    }

    const pagination: zoneService.PaginationParams = {
      page: Number(page),
      limit: Number(limit),
      sortBy: String(sortBy),
      sortOrder: sortOrder === 'desc' ? 'desc' : 'asc',
    };

    const result = await zoneService.getZones(filters, pagination);

    res.json(result);
  } catch (error) {
    next(error);
  }
});

// GET /api/zones/stats - Get zone statistics
router.get('/stats', async (_req, res, next) => {
  try {
    const stats = await zoneService.getZoneStats();
    // Transform response to match frontend expectations
    res.json({
      totalZones: stats.total,
      epicZones: stats.zonesWithEpics,
      avgDifficulty: stats.avgDifficulty,
      epicTypeDistribution: stats.byEpicType,
      alignmentDistribution: stats.byAlignment,
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/zones/:number - Get single zone by number
router.get('/:number', async (req, res, next) => {
  try {
    const zoneNumber = parseZoneNumber(req.params.number);

    if (zoneNumber === null) {
      res.status(400).json({ error: 'Invalid zone number' });
      return;
    }

    const zone = await zoneService.getZoneByNumber(zoneNumber);

    if (!zone) {
      res.status(404).json({ error: 'Zone not found' });
      return;
    }

    res.json(zone);
  } catch (error) {
    next(error);
  }
});

// PUT /api/zones/:number - Update zone
router.put('/:number', zoneMutationLimiter, async (req, res, next) => {
  try {
    const zoneNumber = parseZoneNumber(req.params.number);

    if (zoneNumber === null) {
      return res.status(400).json({ error: 'Invalid zone number' });
    }

    const validationError = validateZoneUpdatePayload(req.body);
    if (validationError) {
      return res.status(400).json({ error: validationError });
    }

    const updateData = { ...(req.body as zoneService.ZoneUpdateData) };
    const updatedZone = await zoneService.updateZone(zoneNumber, updateData, req.user!.accountName);

    if (!updatedZone) {
      return res.status(404).json({ error: 'Zone not found' });
    }

    // Audit log
    const changes = Object.keys(updateData).join(', ');
    await logAdminAction(
      req.user!.accountName,
      'zone_edit',
      `Zone ${zoneNumber}: ${updatedZone.name || 'Unknown'}`,
      undefined,
      `Updated: ${changes}`,
      undefined,
      req.ip || req.socket.remoteAddress,
    );

    return res.json(updatedZone);
  } catch (error) {
    return next(error);
  }
});

// PATCH /api/zones/bulk - Bulk update zones
router.patch('/bulk', zoneMutationLimiter, async (req, res, next) => {
  try {
    const validationError = validateBulkZoneUpdatePayload(req.body);
    if (validationError) {
      return res.status(400).json({ error: validationError });
    }

    const { zoneNumbers, data } = req.body as {
      zoneNumbers: number[];
      data: zoneService.ZoneUpdateData;
    };
    const updateData = { ...data };
    const affectedRows = await zoneService.bulkUpdateZones(
      zoneNumbers,
      updateData,
      req.user!.accountName,
    );

    // Audit log
    const changes = Object.keys(updateData).join(', ');
    await logAdminAction(
      req.user!.accountName,
      'zone_edit',
      `Bulk update: ${zoneNumbers.length} zones`,
      undefined,
      `Updated ${zoneNumbers.length} zones: ${changes}`,
      `Zones: ${zoneNumbers.join(', ')}`,
      req.ip || req.socket.remoteAddress,
    );

    return res.json({
      success: true,
      affectedRows,
      zoneCount: zoneNumbers.length,
    });
  } catch (error) {
    return next(error);
  }
});

export default router;
