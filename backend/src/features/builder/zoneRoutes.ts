import { Router, Request, Response, type IRouter } from 'express';
import { pool } from '../../db/connection.js';
import {
  listZones,
  getZoneMapData,
  parseZonFile,
  getZonePositions,
  saveZonePositions,
  globalSearch,
} from '../../services/zoneBuilderParser.js';
import {
  getNextVnum,
  createZone,
  deleteZone,
  cloneZone,
} from '../../services/zoneBuilderWriter.js';
import zoneInfoService from '../../services/zoneInfoService.js';
import type { RowDataPacket } from 'mysql2';
import { logBuilderActivity } from './shared.js';
import { sendRouteError } from '../../utils/routeError.js';

export const builderZoneRoutes: IRouter = Router();

// GET /api/builder/zones - List zones with pagination
builderZoneRoutes.get('/zones', async (req: Request, res: Response) => {
  try {
    const page = parseInt(req.query.page as string, 10) || 1;
    const limit = parseInt(req.query.limit as string, 10) || 10;
    const search = (req.query.search as string) || '';
    const filterByAccess = req.query.filterByAccess === 'true';

    // Determine zone ID filtering based on user permissions
    let filterByZoneIds: string[] | null = null;

    if (filterByAccess) {
      const accountName = req.user?.accountName;
      // Overlords and users with manage_zones see all zones
      if (
        req.user?.permissions?.role !== 'overlord' &&
        !req.user?.adminPermissions?.has('manage_zones')
      ) {
        // Regular users only see zones they have access to
        if (accountName) {
          filterByZoneIds = await zoneInfoService.getAccessibleZoneIds(accountName);
        } else {
          filterByZoneIds = []; // No access if not authenticated
        }
      }
      // For overlords/manage_zones, filterByZoneIds stays null (no filtering)
    }

    const result = await listZones({ page, limit, search, filterByZoneIds });
    res.json(result);
  } catch (error) {
    sendRouteError(res, error, 'Failed to list zones', 'Failed to list zones');
  }
});

// GET /api/builder/search - Global search across all zones
builderZoneRoutes.get('/search', async (req: Request, res: Response) => {
  try {
    const query = (req.query.query as string) || '';
    const type = (req.query.type as 'all' | 'room' | 'mob' | 'object') || 'all';
    const page = parseInt(req.query.page as string, 10) || 1;
    const limit = parseInt(req.query.limit as string, 10) || 20;

    if (!query || query.trim().length < 2) {
      res.status(400).json({ error: 'Search query must be at least 2 characters' });
      return;
    }

    const result = await globalSearch(query, type, page, limit);
    res.json(result);
  } catch (error) {
    sendRouteError(res, error, 'Failed to search', 'Failed to search');
  }
});

// GET /api/builder/activity - Get recent builder activity
builderZoneRoutes.get('/activity', async (req: Request, res: Response) => {
  try {
    const account = req.query.account as string | undefined;
    const zone = req.query.zone as string | undefined;
    const entityType = req.query.entity_type as string | undefined;
    const limit = Math.min(parseInt(req.query.limit as string, 10) || 50, 200);
    const offset = parseInt(req.query.offset as string, 10) || 0;

    // Build query
    let query = 'SELECT * FROM builder_activity_log WHERE 1=1';
    const params: (string | number)[] = [];

    // Filter by account if provided
    if (account) {
      query += ' AND account_name = ?';
      params.push(account);
    }

    // Filter by zone if provided
    if (zone) {
      query += ' AND zone_id = ?';
      params.push(zone);
    }

    // Filter by entity type if provided (exclude system-level actions from normal view)
    if (entityType) {
      query += ' AND entity_type = ?';
      params.push(entityType);
    } else {
      // By default, exclude system-level actions
      query += ' AND entity_type != ?';
      params.push('system');
    }

    // Get total count
    const countQuery = query.replace('SELECT *', 'SELECT COUNT(*) as total');
    const [countRows] = await pool.query<RowDataPacket[]>(countQuery, params);
    const total = countRows[0]?.total || 0;

    // Add ordering and pagination
    query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
    params.push(limit, offset);

    const [rows] = await pool.query<RowDataPacket[]>(query, params);

    // Convert snake_case to camelCase
    const activities = rows.map((row) => ({
      id: row.id,
      accountName: row.account_name,
      actionType: row.action_type,
      zoneId: row.zone_id,
      zoneName: row.zone_name,
      entityType: row.entity_type,
      entityVnum: row.entity_vnum,
      entityName: row.entity_name,
      createdAt: row.created_at,
    }));

    res.json({
      activities,
      total,
      hasMore: offset + rows.length < total,
    });
  } catch (error) {
    sendRouteError(res, error, 'Failed to fetch activity', 'Failed to fetch activity');
  }
});

// GET /api/builder/zones/:id - Get zone map data (Tier 1)
// :id is zone ID (filename without extension, e.g., "afterlife_gh")
builderZoneRoutes.get('/zones/:id', async (req: Request, res: Response) => {
  try {
    const zoneId = req.params.id;
    if (!zoneId || zoneId.trim() === '') {
      res.status(400).json({ error: 'Invalid zone ID' });
      return;
    }

    const zone = await getZoneMapData(zoneId);
    res.json({ zone });
  } catch (error) {
    sendRouteError(res, error, 'Failed to get zone', 'Failed to get zone');
  }
});

// GET /api/builder/zones/:id/header - Get zone header info
builderZoneRoutes.get('/zones/:id/header', async (req: Request, res: Response) => {
  try {
    const zoneId = req.params.id;
    if (!zoneId || zoneId.trim() === '') {
      res.status(400).json({ error: 'Invalid zone ID' });
      return;
    }

    const { header, resets } = await parseZonFile(zoneId);
    res.json({ header, resetCount: resets.length });
  } catch (error) {
    sendRouteError(res, error, 'Failed to get zone header', 'Failed to get zone header');
  }
});

// GET /api/builder/zones/:id/next-vnum/:type - Get next available vnum
builderZoneRoutes.get('/zones/:id/next-vnum/:type', async (req: Request, res: Response) => {
  try {
    const zoneId = req.params.id;
    const type = req.params.type as 'room' | 'mob' | 'obj';

    if (!zoneId || zoneId.trim() === '') {
      res.status(400).json({ error: 'Invalid zone ID' });
      return;
    }

    if (!['room', 'mob', 'obj'].includes(type)) {
      res.status(400).json({ error: 'Invalid type. Must be room, mob, or obj' });
      return;
    }

    const nextVnum = await getNextVnum(zoneId, type);
    res.json({ nextVnum });
  } catch (error) {
    sendRouteError(res, error, 'Failed to get next vnum', 'Failed to get next vnum');
  }
});

// POST /api/builder/zones - Create a new zone
builderZoneRoutes.post('/zones', async (req: Request, res: Response) => {
  try {
    const { zoneNumber, zoneName } = req.body;

    if (!zoneNumber || isNaN(parseInt(zoneNumber, 10))) {
      res.status(400).json({ error: 'Valid zone number is required' });
      return;
    }

    if (!zoneName || zoneName.trim() === '') {
      res.status(400).json({ error: 'Zone name is required' });
      return;
    }

    const zoneNum = parseInt(zoneNumber, 10);

    const zoneId = await createZone(zoneNum, zoneName.trim());

    await logBuilderActivity(
      req.user?.accountName || 'unknown',
      'zone_create',
      zoneId,
      zoneName.trim(),
      'zone',
      null,
      zoneName.trim(),
      req.ip || req.socket.remoteAddress || null,
    );

    res.status(201).json({ success: true, zoneId, zoneNumber: zoneNum, zoneName });
  } catch (error) {
    sendRouteError(res, error, 'Failed to create zone', 'Failed to create zone');
  }
});

// DELETE /api/builder/zones/:id - Delete a zone
builderZoneRoutes.delete('/zones/:id', async (req: Request, res: Response) => {
  try {
    const zoneId = req.params.id;

    if (!zoneId || zoneId.trim() === '') {
      res.status(400).json({ error: 'Invalid zone ID' });
      return;
    }

    const deleted = await deleteZone(zoneId);

    if (!deleted) {
      res.status(404).json({ error: 'Zone not found or could not be deleted' });
      return;
    }

    await logBuilderActivity(
      req.user?.accountName || 'unknown',
      'zone_delete',
      zoneId,
      null,
      'zone',
      null,
      null,
      req.ip || req.socket.remoteAddress || null,
    );

    res.json({ success: true });
  } catch (error) {
    sendRouteError(res, error, 'Failed to delete zone', 'Failed to delete zone');
  }
});

// POST /api/builder/zones/:id/clone - Clone a zone
builderZoneRoutes.post('/zones/:id/clone', async (req: Request, res: Response) => {
  try {
    const sourceZoneId = req.params.id;
    const { targetZoneNumber, zoneName } = req.body;

    if (!sourceZoneId || sourceZoneId.trim() === '') {
      res.status(400).json({ error: 'Invalid source zone ID' });
      return;
    }

    if (!targetZoneNumber || isNaN(parseInt(targetZoneNumber, 10))) {
      res.status(400).json({ error: 'Valid target zone number is required' });
      return;
    }

    const targetZoneNum = parseInt(targetZoneNumber, 10);

    const newZoneId = await cloneZone(sourceZoneId, targetZoneNum, zoneName);

    await logBuilderActivity(
      req.user?.accountName || 'unknown',
      'zone_clone',
      newZoneId,
      zoneName || null,
      'zone',
      null,
      zoneName || `Clone of ${sourceZoneId}`,
      req.ip || req.socket.remoteAddress || null,
    );

    res
      .status(201)
      .json({ success: true, sourceZoneId, newZoneId, targetZoneNumber: targetZoneNum });
  } catch (error) {
    sendRouteError(res, error, 'Failed to clone zone', 'Failed to clone zone');
  }
});

// GET /api/builder/zones/:id/positions - Get room positions for zone map
builderZoneRoutes.get('/zones/:id/positions', async (req: Request, res: Response) => {
  try {
    const zoneId = req.params.id;
    if (!zoneId || zoneId.trim() === '') {
      res.status(400).json({ error: 'Invalid zone ID' });
      return;
    }

    const positionData = await getZonePositions(zoneId);
    res.json({
      zoneId,
      positions: positionData?.positions || {},
      lastModified: positionData?.lastModified || null,
    });
  } catch (error) {
    sendRouteError(res, error, 'Failed to get zone positions', 'Failed to get zone positions');
  }
});

// PUT /api/builder/zones/:id/positions - Save room positions for zone map
builderZoneRoutes.put('/zones/:id/positions', async (req: Request, res: Response) => {
  try {
    const zoneId = req.params.id;
    if (!zoneId || zoneId.trim() === '') {
      res.status(400).json({ error: 'Invalid zone ID' });
      return;
    }

    const { positions } = req.body;
    if (!positions || typeof positions !== 'object') {
      res.status(400).json({ error: 'Positions object is required' });
      return;
    }

    await saveZonePositions(zoneId, positions);

    res.json({ success: true, zoneId });
  } catch (error) {
    sendRouteError(res, error, 'Failed to save zone positions', 'Failed to save zone positions');
  }
});
