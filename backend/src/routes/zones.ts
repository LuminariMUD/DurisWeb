import express, { Router } from 'express';
import logger from '../utils/logger.js';
import * as zoneService from '../services/zoneService.js';
import { requireAuth, requirePermission } from '../middleware/auth.js';
import { pool } from '../db/connection.js';

const router: Router = express.Router();

// Helper function to log admin actions
async function logAdminAction(
  accountName: string,
  actionType: string,
  target: string,
  oldValue: string | null | undefined,
  newValue: string | null | undefined,
  notes: string | null | undefined,
  ipAddress: string | null | undefined
): Promise<void> {
  try {
    await pool.query(
      `INSERT INTO admin_action_log (account_name, action_type, target, old_value, new_value, notes, ip_address)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [accountName, actionType, target, oldValue || null, newValue || null, notes || null, ipAddress]
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
      const types = String(epicTypes).split(',').map(Number).filter(n => !isNaN(n));
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
    const zoneNumber = Number(req.params.number);

    if (isNaN(zoneNumber)) {
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
router.put('/:number', async (req, res, next) => {
  try {

    const zoneNumber = Number(req.params.number);

    if (isNaN(zoneNumber)) {
      res.status(400).json({ error: 'Invalid zone number' });
      return;
    }

    const updateData: zoneService.ZoneUpdateData = {};

    // Validate and extract update fields
    if (req.body.epicType !== undefined) {
      const epicType = Number(req.body.epicType);
      if (isNaN(epicType) || epicType < 0 || epicType > 3) {
        res.status(400).json({ error: 'Epic type must be between 0 and 3' });
        return;
      }
      updateData.epicType = epicType;
    }

    if (req.body.alignment !== undefined) {
      const alignment = Number(req.body.alignment);
      if (isNaN(alignment) || alignment < -5 || alignment > 5) {
        res.status(400).json({ error: 'Alignment must be between -5 and 5' });
        return;
      }
      updateData.alignment = alignment;
    }

    if (req.body.suggestedGroupSize !== undefined) {
      const groupSize = Number(req.body.suggestedGroupSize);
      if (isNaN(groupSize) || groupSize < 1 || groupSize > 20) {
        res.status(400).json({ error: 'Suggested group size must be between 1 and 20' });
        return;
      }
      updateData.suggestedGroupSize = groupSize;
    }

    if (req.body.difficulty !== undefined) {
      const difficulty = Number(req.body.difficulty);
      if (isNaN(difficulty) || difficulty < 0 || difficulty > 10) {
        res.status(400).json({ error: 'Difficulty must be between 0 and 10' });
        return;
      }
      updateData.difficulty = difficulty;
    }

    if (req.body.epicPayout !== undefined) {
      const payout = Number(req.body.epicPayout);
      if (isNaN(payout) || payout < 0 || payout > 500) {
        res.status(400).json({ error: 'Epic payout must be between 0 and 500' });
        return;
      }
      updateData.epicPayout = payout;
    }

    if (req.body.taskZone !== undefined) {
      updateData.taskZone = Boolean(req.body.taskZone);
    }

    if (req.body.questZone !== undefined) {
      updateData.questZone = Boolean(req.body.questZone);
    }

    if (req.body.trophyZone !== undefined) {
      updateData.trophyZone = Boolean(req.body.trophyZone);
    }

    if (req.body.randomsZone !== undefined) {
      updateData.randomsZone = Boolean(req.body.randomsZone);
    }

    const updatedZone = await zoneService.updateZone(zoneNumber, updateData, req.user?.accountName || 'system');

    if (!updatedZone) {
      res.status(404).json({ error: 'Zone not found' });
      return;
    }

    // Audit log
    const changes = Object.keys(updateData).join(', ');
    await logAdminAction(
      req.user?.accountName || 'system',
      'zone_edit',
      `Zone ${zoneNumber}: ${updatedZone.name || 'Unknown'}`,
      undefined,
      `Updated: ${changes}`,
      undefined,
      req.ip || req.socket.remoteAddress
    );

    res.json(updatedZone);
  } catch (error) {
    next(error);
  }
});

// PATCH /api/zones/bulk - Bulk update zones
router.patch('/bulk', async (req, res, next) => {
  try {

    const { zoneNumbers, data } = req.body;

    if (!Array.isArray(zoneNumbers) || zoneNumbers.length === 0) {
      res.status(400).json({ error: 'zoneNumbers must be a non-empty array' });
      return;
    }

    if (!data || typeof data !== 'object') {
      res.status(400).json({ error: 'data object is required' });
      return;
    }

    // Validate zone numbers
    const validZoneNumbers = zoneNumbers.filter((n: any) => !isNaN(Number(n))).map(Number);
    if (validZoneNumbers.length === 0) {
      res.status(400).json({ error: 'No valid zone numbers provided' });
      return;
    }

    const updateData: zoneService.ZoneUpdateData = {};

    // Validate and extract update fields (same validation as single update)
    if (data.epicType !== undefined) {
      const epicType = Number(data.epicType);
      if (isNaN(epicType) || epicType < 0 || epicType > 3) {
        res.status(400).json({ error: 'Epic type must be between 0 and 3' });
        return;
      }
      updateData.epicType = epicType;
    }

    if (data.alignment !== undefined) {
      const alignment = Number(data.alignment);
      if (isNaN(alignment) || alignment < -5 || alignment > 5) {
        res.status(400).json({ error: 'Alignment must be between -5 and 5' });
        return;
      }
      updateData.alignment = alignment;
    }

    if (data.suggestedGroupSize !== undefined) {
      const groupSize = Number(data.suggestedGroupSize);
      if (isNaN(groupSize) || groupSize < 1 || groupSize > 20) {
        res.status(400).json({ error: 'Suggested group size must be between 1 and 20' });
        return;
      }
      updateData.suggestedGroupSize = groupSize;
    }

    if (data.difficulty !== undefined) {
      const difficulty = Number(data.difficulty);
      if (isNaN(difficulty) || difficulty < 0 || difficulty > 10) {
        res.status(400).json({ error: 'Difficulty must be between 0 and 10' });
        return;
      }
      updateData.difficulty = difficulty;
    }

    if (data.epicPayout !== undefined) {
      const payout = Number(data.epicPayout);
      if (isNaN(payout) || payout < 0 || payout > 500) {
        res.status(400).json({ error: 'Epic payout must be between 0 and 500' });
        return;
      }
      updateData.epicPayout = payout;
    }

    if (data.taskZone !== undefined) {
      updateData.taskZone = Boolean(data.taskZone);
    }

    if (data.questZone !== undefined) {
      updateData.questZone = Boolean(data.questZone);
    }

    if (data.trophyZone !== undefined) {
      updateData.trophyZone = Boolean(data.trophyZone);
    }

    if (data.randomsZone !== undefined) {
      updateData.randomsZone = Boolean(data.randomsZone);
    }

    const affectedRows = await zoneService.bulkUpdateZones(validZoneNumbers, updateData, req.user?.accountName || 'system');

    // Audit log
    const changes = Object.keys(updateData).join(', ');
    await logAdminAction(
      req.user?.accountName || 'system',
      'zone_edit',
      `Bulk update: ${validZoneNumbers.length} zones`,
      undefined,
      `Updated ${validZoneNumbers.length} zones: ${changes}`,
      `Zones: ${validZoneNumbers.join(', ')}`,
      req.ip || req.socket.remoteAddress
    );

    res.json({
      success: true,
      affectedRows,
      zoneCount: validZoneNumbers.length,
    });
  } catch (error) {
    next(error);
  }
});

export default router;
