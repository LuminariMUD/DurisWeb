import express, { Router, Request, Response } from 'express';
import logger, { getErrorMessage } from '../utils/logger.js';
import * as fs from 'fs';
import * as path from 'path';
import archiver from 'archiver';
import { requireAuth, requirePermission } from '../middleware/auth.js';
import { pool } from '../db/connection.js';
import { processContentForWrite } from '../utils/contentParser.js';
import { UnsafeZonePathError, resolveSafeZoneFilePath } from '../utils/safeZonePath.js';
import { validateIdParam } from '../utils/validation.js';

const MUD_DIR = process.env.MUD_DIR || '/home/resakse/Coding/DurisMUD';
const AREAS_DIR = path.join(MUD_DIR, 'areas');
import {
  listZones,
  getZoneMapData,
  getRoomData,
  getMobileData,
  getObjectData,
  parseZonFile,
  getZonePositions,
  saveZonePositions,
  globalSearch,
  getZoneName,
} from '../services/zoneBuilderParser.js';
import {
  countZoneItems,
  streamRooms,
  streamMobs,
  streamObjects,
} from '../services/zoneBuilderStreamer.js';
import {
  updateRoom,
  createRoom,
  deleteRoom,
  updateMobile,
  createMobile,
  deleteMobile,
  updateObject,
  createObject,
  deleteObject,
  getNextVnum,
  createZone,
  deleteZone,
  cloneZone,
  cloneRoom,
  writeZoneResets,
} from '../services/zoneBuilderWriter.js';
import { MudFlagParser } from '../services/mudFlagParser.js';
import {
  validateRoom,
  validateObject,
  quickValidate,
  clearValidationCache,
} from '../services/zoneBuilderValidator.js';
import {
  getZoneGitStatus,
  commitZoneFiles,
} from '../services/gitService.js';
import zoneInfoService from '../services/zoneInfoService.js';
import procRequestService from '../services/procRequestService.js';
import zoneCommentService from '../services/zoneCommentService.js';
import builderNotificationService from '../services/builderNotificationService.js';
import { searchAccounts } from '../services/accountService.js';
import type { RowDataPacket } from 'mysql2';
import type {
  Room,
  Mobile,
  ZoneObject,
  ResetCommand,
  ZonePermissionLevel,
  CreateProcRequest,
  UpdateProcRequest,
  ProcRequestStatus,
  CreateZoneComment,
} from '../types/builder.js';

const router: Router = express.Router();

type OptionalHtmlResult = { contentHtml: string | null } | { error: string };

function validateOptionalHtml(value: unknown): OptionalHtmlResult {
  if (value === undefined || value === null || value === '') {
    return { contentHtml: null };
  }

  if (typeof value !== 'string') {
    return { error: 'Comment HTML must be a string' };
  }

  const processed = processContentForWrite(value);
  return processed.error
    ? { error: processed.error }
    : { contentHtml: processed.content };
}

// Helper function to log builder activity to the dedicated activity log table
async function logBuilderActivity(
  accountName: string,
  actionType: string, // 'room_create', 'room_update', 'room_delete', 'mob_create', etc.
  zoneId: string,
  zoneName: string | null,
  entityType: string, // 'room', 'mob', 'object', 'reset', 'zone'
  entityVnum: number | null,
  entityName: string | null,
  ipAddress: string | null
): Promise<void> {
  try {
    await pool.query(
      `INSERT INTO builder_activity_log
       (account_name, action_type, zone_id, zone_name, entity_type, entity_vnum, entity_name, ip_address)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [accountName, actionType, zoneId, zoneName, entityType, entityVnum, entityName, ipAddress]
    );
  } catch (error) {
    logger.error('Failed to log builder activity:', error);
  }
}

// Apply auth middleware to all routes
router.use(requireAuth);
// For now, require manage_zones permission - can be changed to a specific builder permission later
router.use(requirePermission('manage_zones'));

// GET /api/builder/zones - List zones with pagination
router.get('/zones', async (req: Request, res: Response) => {
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
      if (req.user?.permissions?.role !== 'overlord' && !req.user?.adminPermissions?.has('manage_zones')) {
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
    logger.error('Error listing zones:', error);
    res.status(500).json({ error: 'Failed to list zones', message: getErrorMessage(error) });
  }
});

// GET /api/builder/search - Global search across all zones
router.get('/search', async (req: Request, res: Response) => {
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
    logger.error('Error searching:', error);
    res.status(500).json({ error: 'Failed to search', message: getErrorMessage(error) });
  }
});

// GET /api/builder/activity - Get recent builder activity
router.get('/activity', async (req: Request, res: Response) => {
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
    logger.error('Error fetching builder activity:', error);
    res.status(500).json({ error: 'Failed to fetch activity', message: getErrorMessage(error) });
  }
});

// GET /api/builder/zones/:id - Get zone map data (Tier 1)
// :id is zone ID (filename without extension, e.g., "afterlife_gh")
router.get('/zones/:id', async (req: Request, res: Response) => {
  try {
    const zoneId = req.params.id;
    if (!zoneId || zoneId.trim() === '') {
      res.status(400).json({ error: 'Invalid zone ID' });
      return;
    }

    const zone = await getZoneMapData(zoneId);
    res.json({ zone });
  } catch (error) {
    logger.error('Error getting zone:', error);
    res.status(500).json({ error: 'Failed to get zone', message: getErrorMessage(error) });
  }
});

// GET /api/builder/zones/:id/header - Get zone header info
router.get('/zones/:id/header', async (req: Request, res: Response) => {
  try {
    const zoneId = req.params.id;
    if (!zoneId || zoneId.trim() === '') {
      res.status(400).json({ error: 'Invalid zone ID' });
      return;
    }

    const { header, resets } = await parseZonFile(zoneId);
    res.json({ header, resetCount: resets.length });
  } catch (error) {
    logger.error('Error getting zone header:', error);
    res.status(500).json({ error: 'Failed to get zone header', message: getErrorMessage(error) });
  }
});

// GET /api/builder/zones/:id/rooms/:vnum - Get single room (Tier 3)
router.get('/zones/:id/rooms/:vnum', async (req: Request, res: Response) => {
  try {
    const zoneId = req.params.id;
    const vnum = parseInt(req.params.vnum, 10);

    if (!zoneId || zoneId.trim() === '' || isNaN(vnum)) {
      res.status(400).json({ error: 'Invalid zone ID or vnum' });
      return;
    }

    const room = await getRoomData(zoneId, vnum);
    if (!room) {
      res.status(404).json({ error: 'Room not found' });
      return;
    }

    res.json({ room });
  } catch (error) {
    logger.error('Error getting room:', error);
    res.status(500).json({ error: 'Failed to get room', message: getErrorMessage(error) });
  }
});

// PUT /api/builder/zones/:id/rooms/:vnum - Update room
router.put('/zones/:id/rooms/:vnum', async (req: Request, res: Response) => {
  try {
    const zoneId = req.params.id;
    const vnum = parseInt(req.params.vnum, 10);

    if (!zoneId || zoneId.trim() === '' || isNaN(vnum)) {
      res.status(400).json({ error: 'Invalid zone ID or vnum' });
      return;
    }

    const roomData: Room = {
      ...req.body,
      vnum,
      zoneNumber: req.body.zoneNumber || 0,
    };

    // Validate required fields
    if (!roomData.name || roomData.name.trim() === '') {
      res.status(400).json({ error: 'Room name is required' });
      return;
    }

    // Run cross-reference validation
    const validation = await validateRoom(zoneId, roomData);

    // Block save if there are hard errors (not warnings)
    if (!validation.valid) {
      res.status(400).json({
        error: 'Validation failed',
        errors: validation.errors,
        warnings: validation.warnings,
      });
      return;
    }

    await updateRoom(zoneId, roomData);

    // Clear validation cache after updating
    clearValidationCache();

    await logBuilderActivity(
      req.user?.accountName || 'unknown',
      'room_update',
      zoneId,
      null, // Zone name fetched from DB later or use null
      'room',
      vnum,
      roomData.name,
      req.ip || req.socket.remoteAddress || null
    );

    // Return success with any warnings
    res.json({
      success: true,
      room: roomData,
      warnings: validation.warnings.length > 0 ? validation.warnings : undefined,
    });
  } catch (error) {
    logger.error('Error updating room:', error);
    res.status(500).json({ error: 'Failed to update room', message: getErrorMessage(error) });
  }
});

// POST /api/builder/zones/:id/rooms - Create new room
router.post('/zones/:id/rooms', async (req: Request, res: Response) => {
  try {
    const zoneId = req.params.id;

    if (!zoneId || zoneId.trim() === '') {
      res.status(400).json({ error: 'Invalid zone ID' });
      return;
    }

    // Get next available vnum if not provided
    let vnum = req.body.vnum;
    if (!vnum) {
      vnum = await getNextVnum(zoneId, 'room');
    }

    const roomData: Room = {
      vnum,
      name: req.body.name || 'New Room',
      description: req.body.description || '',
      zoneNumber: req.body.zoneNumber || 0,
      roomFlags: req.body.roomFlags || 0,
      sectorType: req.body.sectorType || 0,
      exits: req.body.exits || [],
      extras: req.body.extras || [],
    };

    const room = await createRoom(zoneId, roomData);

    await logBuilderActivity(
      req.user?.accountName || 'unknown',
      'room_create',
      zoneId,
      null,
      'room',
      vnum,
      room.name,
      req.ip || req.socket.remoteAddress || null
    );

    res.status(201).json({ success: true, room });
  } catch (error) {
    logger.error('Error creating room:', error);
    res.status(500).json({ error: 'Failed to create room', message: getErrorMessage(error) });
  }
});

// DELETE /api/builder/zones/:id/rooms/:vnum - Delete room
router.delete('/zones/:id/rooms/:vnum', async (req: Request, res: Response) => {
  try {
    const zoneId = req.params.id;
    const vnum = parseInt(req.params.vnum, 10);

    if (!zoneId || zoneId.trim() === '' || isNaN(vnum)) {
      res.status(400).json({ error: 'Invalid zone ID or vnum' });
      return;
    }

    const deleted = await deleteRoom(zoneId, vnum);
    if (!deleted) {
      res.status(404).json({ error: 'Room not found' });
      return;
    }

    await logBuilderActivity(
      req.user?.accountName || 'unknown',
      'room_delete',
      zoneId,
      null,
      'room',
      vnum,
      null, // Room already deleted, no name available
      req.ip || req.socket.remoteAddress || null
    );

    res.json({ success: true });
  } catch (error) {
    logger.error('Error deleting room:', error);
    res.status(500).json({ error: 'Failed to delete room', message: getErrorMessage(error) });
  }
});

// POST /api/builder/zones/:id/rooms/:vnum/clone - Clone a room (supports multiple copies)
router.post('/zones/:id/rooms/:vnum/clone', async (req: Request, res: Response) => {
  try {
    const zoneId = req.params.id;
    const sourceVnum = parseInt(req.params.vnum, 10);

    if (!zoneId || zoneId.trim() === '' || isNaN(sourceVnum)) {
      res.status(400).json({ error: 'Invalid zone ID or vnum' });
      return;
    }

    // targetVnum is optional - if not provided, auto-assigns next available
    const targetVnum = req.body.targetVnum !== undefined
      ? parseInt(req.body.targetVnum, 10)
      : undefined;

    if (targetVnum !== undefined && isNaN(targetVnum)) {
      res.status(400).json({ error: 'Invalid target vnum' });
      return;
    }

    // count is optional - defaults to 1, max 100
    const count = Math.max(1, Math.min(100, parseInt(req.body.count, 10) || 1));

    // Clone the room(s)
    const clonedRooms: Awaited<ReturnType<typeof cloneRoom>>[] = [];
    let nextTargetVnum = targetVnum;

    for (let i = 0; i < count; i++) {
      const clonedRoom = await cloneRoom(zoneId, sourceVnum, nextTargetVnum);
      clonedRooms.push(clonedRoom);
      // For subsequent clones, use auto-assign (undefined) to get next available
      nextTargetVnum = undefined;
    }

    const vnums = clonedRooms.map(r => r.vnum);

    await logBuilderActivity(
      req.user?.accountName || 'unknown',
      'room_clone',
      zoneId,
      null,
      'room',
      vnums[0], // First cloned room's vnum
      clonedRooms[0].name,
      req.ip || req.socket.remoteAddress || null
    );

    res.status(201).json({
      success: true,
      room: clonedRooms[clonedRooms.length - 1], // Return last cloned room
      vnum: clonedRooms[clonedRooms.length - 1].vnum,
      vnums, // Array of all created vnums
    });
  } catch (error) {
    logger.error('Error cloning room:', error);
    res.status(500).json({ error: 'Failed to clone room', message: getErrorMessage(error) });
  }
});

// GET /api/builder/zones/:id/mobs/:vnum - Get single mobile
router.get('/zones/:id/mobs/:vnum', async (req: Request, res: Response) => {
  try {
    const zoneId = req.params.id;
    const vnum = parseInt(req.params.vnum, 10);

    if (!zoneId || zoneId.trim() === '' || isNaN(vnum)) {
      res.status(400).json({ error: 'Invalid zone ID or vnum' });
      return;
    }

    const mobile = await getMobileData(zoneId, vnum);
    if (!mobile) {
      res.status(404).json({ error: 'Mobile not found' });
      return;
    }

    res.json({ mobile });
  } catch (error) {
    logger.error('Error getting mobile:', error);
    res.status(500).json({ error: 'Failed to get mobile', message: getErrorMessage(error) });
  }
});

// PUT /api/builder/zones/:id/mobs/:vnum - Update mobile
router.put('/zones/:id/mobs/:vnum', async (req: Request, res: Response) => {
  try {
    const zoneId = req.params.id;
    const vnum = parseInt(req.params.vnum, 10);

    if (!zoneId || zoneId.trim() === '' || isNaN(vnum)) {
      res.status(400).json({ error: 'Invalid zone ID or vnum' });
      return;
    }

    const mobileData: Mobile = {
      ...req.body,
      vnum,
    };

    await updateMobile(zoneId, mobileData);

    await logBuilderActivity(
      req.user?.accountName || 'unknown',
      'mob_update',
      zoneId,
      null,
      'mob',
      vnum,
      mobileData.shortDesc,
      req.ip || req.socket.remoteAddress || null
    );

    res.json({ success: true, mobile: mobileData });
  } catch (error) {
    logger.error('Error updating mobile:', error);
    res.status(500).json({ error: 'Failed to update mobile', message: getErrorMessage(error) });
  }
});

// POST /api/builder/zones/:id/mobs - Create new mobile
router.post('/zones/:id/mobs', async (req: Request, res: Response) => {
  try {
    const zoneId = req.params.id;

    if (!zoneId || zoneId.trim() === '') {
      res.status(400).json({ error: 'Invalid zone ID' });
      return;
    }

    let vnum = req.body.vnum;
    if (!vnum) {
      vnum = await getNextVnum(zoneId, 'mob');
    }

    const mobileData: Mobile = {
      vnum,
      keywords: req.body.keywords || 'mob',
      shortDesc: req.body.shortDesc || 'a mobile',
      longDesc: req.body.longDesc || 'A mobile is standing here.',
      detailedDesc: req.body.detailedDesc || '',
      actFlags: req.body.actFlags || 8, // ISNPC
      affFlags1: req.body.affFlags1 || 0,
      affFlags2: req.body.affFlags2 || 0,
      affFlags3: req.body.affFlags3 || 0,
      affFlags4: req.body.affFlags4 || 0,
      alignment: req.body.alignment || 0,
      species: req.body.species || 0,
      hometown: req.body.hometown || 0,
      mobClass: req.body.mobClass || 0,
      level: req.body.level || 1,
      thac0: req.body.thac0 || 20,
      ac: req.body.ac || 100,
      hitDice: req.body.hitDice || '1d10+0',
      damDice: req.body.damDice || '1d4+0',
      gold: req.body.gold || 0,
      exp: req.body.exp || 0,
      position: req.body.position || 8, // STANDING
      defaultPosition: req.body.defaultPosition || 8,
      sex: req.body.sex || 0,
    };

    const mobile = await createMobile(zoneId, mobileData);

    await logBuilderActivity(
      req.user?.accountName || 'unknown',
      'mob_create',
      zoneId,
      null,
      'mob',
      vnum,
      mobile.shortDesc,
      req.ip || req.socket.remoteAddress || null
    );

    res.status(201).json({ success: true, mobile });
  } catch (error) {
    logger.error('Error creating mobile:', error);
    res.status(500).json({ error: 'Failed to create mobile', message: getErrorMessage(error) });
  }
});

// DELETE /api/builder/zones/:id/mobs/:vnum - Delete mobile
router.delete('/zones/:id/mobs/:vnum', async (req: Request, res: Response) => {
  try {
    const zoneId = req.params.id;
    const vnum = parseInt(req.params.vnum, 10);

    if (!zoneId || zoneId.trim() === '' || isNaN(vnum)) {
      res.status(400).json({ error: 'Invalid zone ID or vnum' });
      return;
    }

    const deleted = await deleteMobile(zoneId, vnum);
    if (!deleted) {
      res.status(404).json({ error: 'Mobile not found' });
      return;
    }

    await logBuilderActivity(
      req.user?.accountName || 'unknown',
      'mob_delete',
      zoneId,
      null,
      'mob',
      vnum,
      null,
      req.ip || req.socket.remoteAddress || null
    );

    res.json({ success: true });
  } catch (error) {
    logger.error('Error deleting mobile:', error);
    res.status(500).json({ error: 'Failed to delete mobile', message: getErrorMessage(error) });
  }
});

// GET /api/builder/zones/:id/objects/:vnum - Get single object
router.get('/zones/:id/objects/:vnum', async (req: Request, res: Response) => {
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
router.put('/zones/:id/objects/:vnum', async (req: Request, res: Response) => {
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
      req.ip || req.socket.remoteAddress || null
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
router.post('/zones/:id/objects', async (req: Request, res: Response) => {
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
      req.ip || req.socket.remoteAddress || null
    );

    res.status(201).json({ success: true, object });
  } catch (error) {
    logger.error('Error creating object:', error);
    res.status(500).json({ error: 'Failed to create object', message: getErrorMessage(error) });
  }
});

// DELETE /api/builder/zones/:id/objects/:vnum - Delete object
router.delete('/zones/:id/objects/:vnum', async (req: Request, res: Response) => {
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
      req.ip || req.socket.remoteAddress || null
    );

    res.json({ success: true });
  } catch (error) {
    logger.error('Error deleting object:', error);
    res.status(500).json({ error: 'Failed to delete object', message: getErrorMessage(error) });
  }
});

// =============================================================================
// ZONE RESETS
// =============================================================================

// PUT /api/builder/zones/:id/resets - Save all reset commands (atomic replacement)
router.put('/zones/:id/resets', async (req: Request, res: Response) => {
  try {
    const zoneId = req.params.id;
    const { resets } = req.body as { resets: ResetCommand[] };

    if (!zoneId || zoneId.trim() === '') {
      res.status(400).json({ error: 'Invalid zone ID' });
      return;
    }

    if (!Array.isArray(resets)) {
      res.status(400).json({ error: 'resets must be an array' });
      return;
    }

    // Validate each reset command has required fields
    const validCommands = ['M', 'O', 'G', 'E', 'P', 'D', 'F', 'R'];
    for (let i = 0; i < resets.length; i++) {
      const reset = resets[i];
      if (!validCommands.includes(reset.command)) {
        res.status(400).json({ error: `Invalid command "${reset.command}" at index ${i}` });
        return;
      }
      if (typeof reset.ifFlag !== 'number' || typeof reset.arg1 !== 'number' ||
          typeof reset.arg2 !== 'number' || typeof reset.arg3 !== 'number') {
        res.status(400).json({ error: `Invalid arguments at index ${i}` });
        return;
      }
    }

    // Write resets to file
    await writeZoneResets(zoneId, resets);

    await logBuilderActivity(
      req.user?.accountName || 'unknown',
      'reset_update',
      zoneId,
      null,
      'reset',
      null, // No single VNUM for resets
      `${resets.length} commands`,
      req.ip || req.socket.remoteAddress || null
    );

    res.json({
      success: true,
      resetCount: resets.length,
    });
  } catch (error) {
    logger.error('Error saving resets:', error);
    res.status(500).json({ error: 'Failed to save resets', message: getErrorMessage(error) });
  }
});

// GET /api/builder/flags - Get all flag definitions from database
router.get('/flags', async (_req: Request, res: Response) => {
  try {
    // Fetch all flags from database grouped by category
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT category, name, value, description, ansi_name, short_code, editable, sort_order
       FROM builder_flags
       ORDER BY category, sort_order, name`
    );

    // Group flags by category
    const flagsByCategory: Record<string, Array<{
      name: string;
      value: number;
      description?: string;
      ansiName?: string;
      shortCode?: string;
      editable?: number;
    }>> = {};

    for (const row of rows) {
      if (!flagsByCategory[row.category]) {
        flagsByCategory[row.category] = [];
      }
      flagsByCategory[row.category].push({
        name: row.name,
        value: Number(row.value),
        description: row.description || undefined,
        ansiName: row.ansi_name || undefined,
        shortCode: row.short_code || undefined,
        editable: row.editable,
      });
    }

    // Map database categories to frontend property names
    const categoryMapping: Record<string, string> = {
      obj_wear: 'objWearFlags',
      obj_extra: 'objExtraFlags',
      obj_extra2: 'objExtra2Flags',
      obj_type: 'objectTypes',
      obj_apply: 'objApplyTypes',
      obj_craftsmanship: 'objCraftsmanship',
      obj_material: 'objMaterials',
      // Note: ITEM_ANTI_*, ITEM_ANTI2_*, ITEM_ALLOW2_* are commented out in defines.h - not in use
      weapon_type: 'objWeaponTypes',
      weapon_damage: 'objWeaponDamageTypes',
      room_flags: 'roomFlags',
      room_sector: 'sectorTypes',
      exit_flags: 'doorFlags',
      mob_action: 'mobActFlags',
      mob_action2: 'mobActFlags2',
      mob_aggro: 'mobAggroFlags',
      mob_aggro2: 'mobAggroFlags2',
      mob_class: 'mobClasses',
      mob_race: 'mobRaces',
      mob_affected1: 'mobAffFlags',
      mob_affected2: 'mobAffFlags2',
      mob_affected3: 'mobAffFlags3',
      mob_affected4: 'mobAffFlags4',
      mob_affected5: 'mobAffFlags5',
      player_flags: 'playerFlags',
      player2_flags: 'playerFlags2',
    };

    // Build response object
    const response: Record<string, any> = {};
    for (const [dbCategory, frontendKey] of Object.entries(categoryMapping)) {
      response[frontendKey] = flagsByCategory[dbCategory] || [];
    }

    // Include any categories not in the mapping (for extensibility)
    for (const [category, flags] of Object.entries(flagsByCategory)) {
      if (!categoryMapping[category]) {
        response[category] = flags;
      }
    }

    // Also provide affected flags under mobAffected1-4 naming for object bitvectors
    // (Object bitvectors use the same flags as mob affected_by)
    response.mobAffected1 = flagsByCategory['mob_affected1'] || [];
    response.mobAffected2 = flagsByCategory['mob_affected2'] || [];
    response.mobAffected3 = flagsByCategory['mob_affected3'] || [];
    response.mobAffected4 = flagsByCategory['mob_affected4'] || [];

    res.json(response);
  } catch (error) {
    logger.error('Error fetching flags:', error);
    res.status(500).json({ error: 'Failed to fetch flags', message: getErrorMessage(error) });
  }
});

// POST /api/builder/flags/sync - Sync flags from MUD source code to database
router.post('/flags/sync', async (req: Request, res: Response) => {
  try {
    const parser = new MudFlagParser();
    const results = await parser.parseAllFlags();

    let totalInserted = 0;
    let totalUpdated = 0;
    let totalDeleted = 0;

    // Track which categories we're updating
    const parsedCategories = new Set<string>();

    // Get a connection for transaction
    const connection = await pool.getConnection();

    try {
      await connection.beginTransaction();

      for (const result of results) {
        if (result.flags.length === 0) continue;

        parsedCategories.add(result.category);

        // Get existing flag names for this category
        const [existingFlags] = await connection.query<RowDataPacket[]>(
          `SELECT name FROM builder_flags WHERE category = ?`,
          [result.category]
        );
        const existingFlagNames = new Set(existingFlags.map(f => f.name));
        const parsedFlagNames = new Set(result.flags.map(f => f.name));

        // Batch upsert using INSERT ... ON DUPLICATE KEY UPDATE
        // Process in batches of 50 to avoid query size limits
        const BATCH_SIZE = 50;
        for (let batch = 0; batch < result.flags.length; batch += BATCH_SIZE) {
          const batchFlags = result.flags.slice(batch, batch + BATCH_SIZE);

          const values: unknown[] = [];
          const placeholders: string[] = [];

          batchFlags.forEach((flag, idx) => {
            const sortOrder = batch + idx;
            placeholders.push('(?, ?, ?, ?, ?, ?, 1, ?, ?)');
            values.push(
              result.category,
              flag.name,
              flag.value,
              flag.description || null,
              flag.ansiName || null,
              flag.shortCode || null,
              sortOrder,
              flag.sourceFile || result.sourceFile
            );
          });

          await connection.query(
            `INSERT INTO builder_flags
             (category, name, value, description, ansi_name, short_code, editable, sort_order, source_file)
             VALUES ${placeholders.join(', ')}
             ON DUPLICATE KEY UPDATE
               value = VALUES(value),
               description = VALUES(description),
               ansi_name = VALUES(ansi_name),
               short_code = VALUES(short_code),
               sort_order = VALUES(sort_order),
               source_file = VALUES(source_file),
               updated_at = NOW()`,
            values
          );
        }

        // Count new vs existing
        for (const flag of result.flags) {
          if (existingFlagNames.has(flag.name)) {
            totalUpdated++;
          } else {
            totalInserted++;
          }
        }

        // Delete flags that no longer exist in source
        const toDelete = [...existingFlagNames].filter(name => !parsedFlagNames.has(name));
        if (toDelete.length > 0) {
          await connection.query(
            `DELETE FROM builder_flags WHERE category = ? AND name IN (?)`,
            [result.category, toDelete]
          );
          totalDeleted += toDelete.length;
        }
      }

      await connection.commit();
    } catch (err) {
      await connection.rollback();
      throw err;
    } finally {
      connection.release();
    }

    // Log the sync action (system-level, not shown in activity feed)
    await logBuilderActivity(
      req.user?.accountName || 'unknown',
      'flags_sync',
      'system',
      null,
      'system',
      null,
      `${totalInserted} inserted, ${totalUpdated} updated, ${totalDeleted} deleted`,
      req.ip || req.socket.remoteAddress || null
    );

    res.json({
      success: true,
      stats: {
        inserted: totalInserted,
        updated: totalUpdated,
        deleted: totalDeleted,
        categories: Array.from(parsedCategories),
      },
    });
  } catch (error) {
    logger.error('Error syncing flags:', error);
    res.status(500).json({ error: 'Failed to sync flags', message: getErrorMessage(error) });
  }
});

// GET /api/builder/flags/categories - Get list of all flag categories
router.get('/flags/categories', async (_req: Request, res: Response) => {
  try {
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT category, COUNT(*) as count, MAX(updated_at) as lastUpdated
       FROM builder_flags
       GROUP BY category
       ORDER BY category`
    );

    res.json(rows.map(r => ({
      category: r.category,
      count: r.count,
      lastUpdated: r.lastUpdated,
    })));
  } catch (error) {
    logger.error('Error fetching flag categories:', error);
    res.status(500).json({ error: 'Failed to fetch categories', message: getErrorMessage(error) });
  }
});

// GET /api/builder/zones/:id/next-vnum/:type - Get next available vnum
router.get('/zones/:id/next-vnum/:type', async (req: Request, res: Response) => {
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
    logger.error('Error getting next vnum:', error);
    res.status(500).json({ error: 'Failed to get next vnum', message: getErrorMessage(error) });
  }
});

// POST /api/builder/zones - Create a new zone
router.post('/zones', async (req: Request, res: Response) => {
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
      req.ip || req.socket.remoteAddress || null
    );

    res.status(201).json({ success: true, zoneId, zoneNumber: zoneNum, zoneName });
  } catch (error) {
    logger.error('Error creating zone:', error);
    res.status(500).json({ error: 'Failed to create zone', message: getErrorMessage(error) });
  }
});

// DELETE /api/builder/zones/:id - Delete a zone
router.delete('/zones/:id', async (req: Request, res: Response) => {
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
      req.ip || req.socket.remoteAddress || null
    );

    res.json({ success: true });
  } catch (error) {
    logger.error('Error deleting zone:', error);
    res.status(500).json({ error: 'Failed to delete zone', message: getErrorMessage(error) });
  }
});

// POST /api/builder/zones/:id/clone - Clone a zone
router.post('/zones/:id/clone', async (req: Request, res: Response) => {
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
      req.ip || req.socket.remoteAddress || null
    );

    res.status(201).json({ success: true, sourceZoneId, newZoneId, targetZoneNumber: targetZoneNum });
  } catch (error) {
    logger.error('Error cloning zone:', error);
    res.status(500).json({ error: 'Failed to clone zone', message: getErrorMessage(error) });
  }
});

// GET /api/builder/zones/:id/positions - Get room positions for zone map
router.get('/zones/:id/positions', async (req: Request, res: Response) => {
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
    logger.error('Error getting zone positions:', error);
    res.status(500).json({ error: 'Failed to get zone positions', message: getErrorMessage(error) });
  }
});

// PUT /api/builder/zones/:id/positions - Save room positions for zone map
router.put('/zones/:id/positions', async (req: Request, res: Response) => {
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
    logger.error('Error saving zone positions:', error);
    res.status(500).json({ error: 'Failed to save zone positions', message: getErrorMessage(error) });
  }
});

// GET /api/builder/zones/:id/counts - Get item counts for progress estimation
router.get('/zones/:id/counts', async (req: Request, res: Response) => {
  try {
    const zoneId = req.params.id;
    if (!zoneId || zoneId.trim() === '') {
      res.status(400).json({ error: 'Invalid zone ID' });
      return;
    }

    const counts = await countZoneItems(zoneId);
    res.json(counts);
  } catch (error) {
    logger.error('Error getting zone counts:', error);
    res.status(500).json({ error: 'Failed to get zone counts', message: getErrorMessage(error) });
  }
});

// GET /api/builder/zones/:id/stream/:type - SSE streaming endpoint for zone data
// type = 'rooms' | 'mobs' | 'objects'
router.get('/zones/:id/stream/:type', async (req: Request, res: Response) => {
  const zoneId = req.params.id;
  const type = req.params.type as 'rooms' | 'mobs' | 'objects';

  if (!zoneId || zoneId.trim() === '') {
    res.status(400).json({ error: 'Invalid zone ID' });
    return;
  }

  if (!['rooms', 'mobs', 'objects'].includes(type)) {
    res.status(400).json({ error: 'Invalid type. Must be rooms, mobs, or objects' });
    return;
  }

  // Set SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no'); // Disable nginx buffering

  // Flush headers immediately
  res.flushHeaders();

  try {
    // Get counts for progress tracking
    const counts = await countZoneItems(zoneId);
    const total = counts[type];

    // Helper to flush response buffer
    const flush = () => {
      if (typeof (res as any).flush === 'function') {
        (res as any).flush();
      }
    };

    // Send start event
    res.write(`event: start\ndata: ${JSON.stringify({ type, total })}\n\n`);
    flush();

    // Select the appropriate streamer
    const streamer = type === 'rooms' ? streamRooms : type === 'mobs' ? streamMobs : streamObjects;
    let loaded = 0;

    // Stream data in chunks
    for await (const chunk of streamer(zoneId)) {
      loaded += chunk.length;
      res.write(`event: progress\ndata: ${JSON.stringify({ type, loaded, items: chunk })}\n\n`);
      flush();
    }

    // Send complete event
    res.write(`event: complete\ndata: ${JSON.stringify({ type, total: loaded })}\n\n`);
    flush();
    res.end();
  } catch (error) {
    logger.error(`Error streaming ${type} for zone ${zoneId}:`, error);
    res.write(`event: error\ndata: ${JSON.stringify({ type, message: getErrorMessage(error) })}\n\n`);
    res.end();
  }
});

// POST /api/builder/zones/:id/validate - Validate zone data
router.post('/zones/:id/validate', async (req: Request, res: Response) => {
  try {
    const zoneId = req.params.id;
    if (!zoneId || zoneId.trim() === '') {
      res.status(400).json({ error: 'Invalid zone ID' });
      return;
    }

    const { type, data } = req.body;

    // Quick validation for real-time checks
    if (type === 'quick') {
      const result = await quickValidate({
        type: data.type,
        zoneId,
        data: data.data,
      });
      res.json(result);
      return;
    }

    // Full room validation
    if (type === 'room' && data.room) {
      const result = await validateRoom(zoneId, data.room as Room);
      res.json(result);
      return;
    }

    // Full object validation
    if (type === 'object' && data.object) {
      const result = await validateObject(zoneId, data.object as ZoneObject);
      res.json(result);
      return;
    }

    res.status(400).json({ error: 'Invalid validation request. Provide type and data.' });
  } catch (error) {
    logger.error('Error validating zone data:', error);
    res.status(500).json({ error: 'Failed to validate', message: getErrorMessage(error) });
  }
});

// POST /api/builder/zones/:id/validate/exit - Quick validate an exit
router.post('/zones/:id/validate/exit', async (req: Request, res: Response) => {
  try {
    const zoneId = req.params.id;
    if (!zoneId || zoneId.trim() === '') {
      res.status(400).json({ error: 'Invalid zone ID' });
      return;
    }

    const { toRoom, keyVnum } = req.body;

    const result = await quickValidate({
      type: 'exit',
      zoneId,
      data: { toRoom, keyVnum },
    });

    res.json(result);
  } catch (error) {
    logger.error('Error validating exit:', error);
    res.status(500).json({ error: 'Failed to validate exit', message: getErrorMessage(error) });
  }
});

// POST /api/builder/zones/:id/validate/object-values - Quick validate object values
router.post('/zones/:id/validate/object-values', async (req: Request, res: Response) => {
  try {
    const zoneId = req.params.id;
    if (!zoneId || zoneId.trim() === '') {
      res.status(400).json({ error: 'Invalid zone ID' });
      return;
    }

    const { itemType, values } = req.body;

    const result = await quickValidate({
      type: 'object',
      zoneId,
      data: { itemType, values },
    });

    res.json(result);
  } catch (error) {
    logger.error('Error validating object values:', error);
    res.status(500).json({ error: 'Failed to validate object values', message: getErrorMessage(error) });
  }
});

// =============================================================================
// DOWNLOAD/EXPORT ZONE FILES
// =============================================================================

// GET /api/builder/zones/:id/download/:type - Download zone file(s)
// type = wld | mob | obj | zon | all (zip)
router.get('/zones/:id/download/:type', async (req: Request, res: Response) => {
  try {
    const zoneId = req.params.id;
    const downloadType = req.params.type as 'wld' | 'mob' | 'obj' | 'zon' | 'all';

    if (!zoneId || zoneId.trim() === '') {
      res.status(400).json({ error: 'Invalid zone ID' });
      return;
    }

    const validTypes = ['wld', 'mob', 'obj', 'zon', 'all'];
    if (!validTypes.includes(downloadType)) {
      res.status(400).json({ error: 'Invalid download type. Must be wld, mob, obj, zon, or all' });
      return;
    }

    // File type to extension mapping
    const fileExtensions: Record<string, string> = {
      wld: 'wld',
      mob: 'mob',
      obj: 'obj',
      zon: 'zon',
    };

    if (downloadType === 'all') {
      // Resolve all paths before opening the response stream.
      const zoneFiles = Object.values(fileExtensions).map((ext) => ({
        ext,
        filePath: resolveSafeZoneFilePath(AREAS_DIR, zoneId, ext),
      }));

      // Create zip archive with all zone files
      const archive = archiver('zip', { zlib: { level: 9 } });

      res.setHeader('Content-Type', 'application/zip');
      res.setHeader('Content-Disposition', `attachment; filename="${zoneId}.zip"`);

      archive.pipe(res);

      // Add each file type to the archive
      for (const { ext, filePath } of zoneFiles) {
        if (fs.existsSync(filePath)) {
          archive.file(filePath, { name: `${zoneId}.${ext}` });
        }
      }

      await archive.finalize();

      await logBuilderActivity(
        req.user?.accountName || 'unknown',
        'zone_download',
        zoneId,
        null,
        'zone',
        null,
        'all (zip)',
        req.ip || req.socket.remoteAddress || null
      );
    } else {
      // Download single file
      const ext = fileExtensions[downloadType];
      const filePath = resolveSafeZoneFilePath(AREAS_DIR, zoneId, ext);

      if (!fs.existsSync(filePath)) {
        res.status(404).json({ error: `File ${zoneId}.${ext} not found` });
        return;
      }

      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${zoneId}.${ext}"`);

      const fileStream = fs.createReadStream(filePath);
      fileStream.pipe(res);

      await logBuilderActivity(
        req.user?.accountName || 'unknown',
        'zone_download',
        zoneId,
        null,
        'zone',
        null,
        ext,
        req.ip || req.socket.remoteAddress || null
      );
    }
  } catch (error) {
    if (error instanceof UnsafeZonePathError) {
      res.status(400).json({ error: 'Invalid or unsafe zone path' });
      return;
    }
    logger.error('Error downloading zone file:', error);
    res.status(500).json({ error: 'Failed to download zone file', message: getErrorMessage(error) });
  }
});

// ========== Git Integration ==========

// GET /api/builder/zones/:id/git/status - Get git status for a zone
router.get('/zones/:id/git/status', async (req: Request, res: Response) => {
  try {
    const zoneId = req.params.id;
    const status = await getZoneGitStatus(zoneId);
    res.json(status);
  } catch (error) {
    logger.error('Error getting zone git status:', error);
    res.status(500).json({ error: 'Failed to get git status', message: getErrorMessage(error) });
  }
});

// POST /api/builder/zones/:id/git/commit - Commit zone files to git
router.post('/zones/:id/git/commit', requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const zoneId = req.params.id;
    const { message } = req.body;

    if (!message || typeof message !== 'string' || message.trim().length === 0) {
      res.status(400).json({ error: 'Commit message is required' });
      return;
    }

    const result = await commitZoneFiles(zoneId, message.trim());

    if (result.success) {
      // Log the action
      await logBuilderActivity(
        req.user?.accountName || 'unknown',
        'git_commit',
        zoneId,
        null,
        'zone',
        null,
        message.trim(),
        req.ip || req.socket.remoteAddress || null
      );
    }

    res.json(result);
  } catch (error) {
    logger.error('Error committing zone files:', error);
    res.status(500).json({ error: 'Failed to commit', message: getErrorMessage(error) });
  }
});

// ========== Builder Settings ==========

interface BuilderSetting extends RowDataPacket {
  id: number;
  account_name: string;
  setting_key: string;
  setting_value: string;
  created_at: Date;
  updated_at: Date;
}

// GET /api/builder/settings - Get builder settings for current user
router.get('/settings', requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const accountName = req.user?.accountName;
    if (!accountName) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }

    const [rows] = await pool.query<BuilderSetting[]>(
      'SELECT setting_key, setting_value FROM builder_settings WHERE account_name = ?',
      [accountName]
    );

    // Convert to object
    const settings: Record<string, string> = {};
    for (const row of rows) {
      settings[row.setting_key] = row.setting_value;
    }

    res.json({ settings });
  } catch (error) {
    // Table might not exist, return empty settings
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ER_NO_SUCH_TABLE') {
      res.json({ settings: {} });
      return;
    }
    logger.error('Error getting builder settings:', error);
    res.status(500).json({ error: 'Failed to get settings', message: getErrorMessage(error) });
  }
});

// PUT /api/builder/settings - Update builder settings for current user
router.put('/settings', requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const accountName = req.user?.accountName;
    if (!accountName) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }

    const { settings } = req.body;
    if (!settings || typeof settings !== 'object') {
      res.status(400).json({ error: 'Settings object is required' });
      return;
    }

    // Upsert each setting
    for (const [key, value] of Object.entries(settings)) {
      if (typeof value !== 'string') continue;

      await pool.query(
        `INSERT INTO builder_settings (account_name, setting_key, setting_value, updated_at)
         VALUES (?, ?, ?, NOW())
         ON DUPLICATE KEY UPDATE setting_value = ?, updated_at = NOW()`,
        [accountName, key, value, value]
      );
    }

    res.json({ success: true });
  } catch (error) {
    // Table might not exist
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ER_NO_SUCH_TABLE') {
      res.status(500).json({ error: 'Builder settings table not found. Please run migrations.' });
      return;
    }
    logger.error('Error updating builder settings:', error);
    res.status(500).json({ error: 'Failed to update settings', message: getErrorMessage(error) });
  }
});

// =============================================================================
// PHASE 7: ZONE INFO, PERMISSIONS, PROC REQUESTS, COMMENTS
// =============================================================================

// Helper: Check if user can access a zone at specified level
async function canAccessZone(
  req: Request,
  zoneId: string,
  level: 'view' | 'edit' | 'manage'
): Promise<boolean> {
  const accountName = req.user?.accountName;
  if (!accountName) return false;

  // Overlords bypass all checks
  if (req.user?.permissions?.role === 'overlord') return true;

  // Check global manage_zones permission
  if (req.user?.adminPermissions?.has('manage_zones')) return true;

  // Check zone-specific permission
  return zoneInfoService.canAccessZone(accountName, zoneId, level);
}

// Helper: Check if user can manage zone permissions
async function canManagePermissions(req: Request, zoneId: string): Promise<boolean> {
  const accountName = req.user?.accountName;
  if (!accountName) return false;

  // Overlords can manage any zone permissions
  if (req.user?.permissions?.role === 'overlord') return true;

  // Check manage_zone_permissions admin permission AND zone-level manage access
  if (req.user?.adminPermissions?.has('manage_zone_permissions')) {
    // Must also have manage access to the specific zone
    return zoneInfoService.canAccessZone(accountName, zoneId, 'manage');
  }

  return false;
}

// ========== Zone Access Check ==========

// GET /api/builder/zones/:id/access - Check user's access level for a zone
router.get('/zones/:id/access', async (req: Request, res: Response) => {
  try {
    const zoneId = req.params.id;
    const accountName = req.user?.accountName;

    if (!accountName) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }

    // Overlords have full access
    if (req.user?.permissions?.role === 'overlord') {
      res.json({ canView: true, canEdit: true, canManage: true, permissionLevel: 'manage' });
      return;
    }

    // Check global manage_zones permission
    if (req.user?.adminPermissions?.has('manage_zones')) {
      res.json({ canView: true, canEdit: true, canManage: true, permissionLevel: 'manage' });
      return;
    }

    // Check zone-specific permissions
    const canView = await zoneInfoService.canAccessZone(accountName, zoneId, 'view');
    const canEdit = await zoneInfoService.canAccessZone(accountName, zoneId, 'edit');
    const canManage = await zoneInfoService.canAccessZone(accountName, zoneId, 'manage');

    let permissionLevel: 'none' | 'view' | 'edit' | 'manage' = 'none';
    if (canManage) permissionLevel = 'manage';
    else if (canEdit) permissionLevel = 'edit';
    else if (canView) permissionLevel = 'view';

    res.json({ canView, canEdit, canManage, permissionLevel });
  } catch (error) {
    logger.error('Error checking zone access:', error);
    res.status(500).json({ error: 'Failed to check access', message: getErrorMessage(error) });
  }
});

// GET /api/builder/accessible-zones - Get list of zone IDs user can access
router.get('/accessible-zones', async (req: Request, res: Response) => {
  try {
    const accountName = req.user?.accountName;

    if (!accountName) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }

    // Overlords and users with manage_zones see all zones (return empty to indicate no filtering)
    if (req.user?.permissions?.role === 'overlord' || req.user?.adminPermissions?.has('manage_zones')) {
      res.json({ zoneIds: null }); // null means no filtering - all zones accessible
      return;
    }

    // Get zone IDs with at least view permission
    const zoneIds = await zoneInfoService.getAccessibleZoneIds(accountName);
    res.json({ zoneIds });
  } catch (error) {
    logger.error('Error getting accessible zones:', error);
    res.status(500).json({ error: 'Failed to get accessible zones', message: getErrorMessage(error) });
  }
});

// ========== Zone Info ==========

// GET /api/builder/zones/:id/info - Get zone info
router.get('/zones/:id/info', async (req: Request, res: Response) => {
  try {
    const zoneId = req.params.id;

    // Check view access
    if (!(await canAccessZone(req, zoneId, 'view'))) {
      res.status(403).json({ error: 'Access denied to this zone' });
      return;
    }

    const info = await zoneInfoService.getZoneInfo(zoneId);
    res.json({ info });
  } catch (error) {
    logger.error('Error getting zone info:', error);
    res.status(500).json({ error: 'Failed to get zone info', message: getErrorMessage(error) });
  }
});

// PUT /api/builder/zones/:id/info - Update zone info
router.put('/zones/:id/info', async (req: Request, res: Response) => {
  try {
    const zoneId = req.params.id;
    const accountName = req.user?.accountName;

    if (!accountName) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }

    // Check edit access
    if (!(await canAccessZone(req, zoneId, 'edit'))) {
      res.status(403).json({ error: 'Access denied to this zone' });
      return;
    }

    const { description, descriptionHtml } = req.body;

    const processedDescriptionHtml = validateOptionalHtml(descriptionHtml);
    if ('error' in processedDescriptionHtml) {
      res.status(400).json({ error: processedDescriptionHtml.error });
      return;
    }

    const info = await zoneInfoService.upsertZoneInfo(
      zoneId,
      { description, descriptionHtml: processedDescriptionHtml.contentHtml ?? undefined },
      accountName
    );

    // Log to activity log
    await logBuilderActivity(
      accountName,
      'zone_info_update',
      zoneId,
      null,
      'zone',
      null,
      'Updated zone description',
      req.ip || req.socket.remoteAddress || null
    );

    // Log to zone info history
    await zoneInfoService.recordHistory(zoneId, accountName, 'description', 'Description updated');

    res.json({ info });
  } catch (error) {
    logger.error('Error updating zone info:', error);
    res.status(500).json({ error: 'Failed to update zone info', message: getErrorMessage(error) });
  }
});

// GET /api/builder/zones/:id/info/history - Get zone info edit history
router.get('/zones/:id/info/history', async (req: Request, res: Response) => {
  try {
    const zoneId = req.params.id;

    // Check manage access (history is for managers only)
    if (!(await canAccessZone(req, zoneId, 'manage'))) {
      res.status(403).json({ error: 'Access denied - manage permission required' });
      return;
    }

    const limit = Math.min(parseInt(req.query.limit as string, 10) || 50, 100);
    const offset = parseInt(req.query.offset as string, 10) || 0;

    const result = await zoneInfoService.getZoneInfoHistory(zoneId, limit, offset);
    res.json(result);
  } catch (error) {
    logger.error('Error getting zone info history:', error);
    res.status(500).json({ error: 'Failed to get history', message: getErrorMessage(error) });
  }
});

// ========== Zone Permissions ==========

// GET /api/builder/zones/:id/permissions - Get zone permissions
router.get('/zones/:id/permissions', async (req: Request, res: Response) => {
  try {
    const zoneId = req.params.id;

    // Check view access (can see permissions if can view zone)
    if (!(await canAccessZone(req, zoneId, 'view'))) {
      res.status(403).json({ error: 'Access denied to this zone' });
      return;
    }

    const permissions = await zoneInfoService.getZonePermissions(zoneId);
    const info = await zoneInfoService.getZoneInfo(zoneId);

    res.json({
      permissions,
      ownerAccount: info?.ownerAccount ?? null,
    });
  } catch (error) {
    logger.error('Error getting zone permissions:', error);
    res.status(500).json({ error: 'Failed to get zone permissions', message: getErrorMessage(error) });
  }
});

// POST /api/builder/zones/:id/permissions - Grant permission
router.post('/zones/:id/permissions', async (req: Request, res: Response) => {
  try {
    const zoneId = req.params.id;
    const grantedBy = req.user?.accountName;

    if (!grantedBy) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }

    // Check if user can manage permissions
    if (!(await canManagePermissions(req, zoneId))) {
      res.status(403).json({ error: 'Not authorized to manage zone permissions' });
      return;
    }

    const { accountName, permissionLevel } = req.body;

    if (!accountName || typeof accountName !== 'string') {
      res.status(400).json({ error: 'Account name is required' });
      return;
    }

    const validLevels: ZonePermissionLevel[] = ['view', 'edit', 'manage'];
    if (!validLevels.includes(permissionLevel)) {
      res.status(400).json({ error: 'Invalid permission level. Must be view, edit, or manage' });
      return;
    }

    await zoneInfoService.grantZonePermission(zoneId, accountName, permissionLevel, grantedBy);

    // Log to activity log
    await logBuilderActivity(
      grantedBy,
      'zone_permission_grant',
      zoneId,
      null,
      'zone',
      null,
      `Granted ${permissionLevel} access to ${accountName}`,
      req.ip || req.socket.remoteAddress || null
    );

    // Log to zone info history
    await zoneInfoService.recordHistory(zoneId, grantedBy, 'permission_grant', `Granted ${permissionLevel} access to ${accountName}`);

    res.json({ success: true });
  } catch (error) {
    logger.error('Error granting zone permission:', error);
    res.status(500).json({ error: 'Failed to grant permission', message: getErrorMessage(error) });
  }
});

// DELETE /api/builder/zones/:id/permissions/:account - Revoke permission
router.delete('/zones/:id/permissions/:account', async (req: Request, res: Response) => {
  try {
    const zoneId = req.params.id;
    const targetAccount = req.params.account;
    const revokedBy = req.user?.accountName;

    if (!revokedBy) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }

    // Check if user can manage permissions
    if (!(await canManagePermissions(req, zoneId))) {
      res.status(403).json({ error: 'Not authorized to manage zone permissions' });
      return;
    }

    const revoked = await zoneInfoService.revokeZonePermission(zoneId, targetAccount);

    if (!revoked) {
      res.status(404).json({ error: 'Permission not found' });
      return;
    }

    // Log to activity log
    await logBuilderActivity(
      revokedBy,
      'zone_permission_revoke',
      zoneId,
      null,
      'zone',
      null,
      `Revoked access from ${targetAccount}`,
      req.ip || req.socket.remoteAddress || null
    );

    // Log to zone info history
    await zoneInfoService.recordHistory(zoneId, revokedBy, 'permission_revoke', `Revoked access from ${targetAccount}`);

    res.json({ success: true });
  } catch (error) {
    logger.error('Error revoking zone permission:', error);
    res.status(500).json({ error: 'Failed to revoke permission', message: getErrorMessage(error) });
  }
});

// ========== Account Search (for permission autocomplete) ==========

// GET /api/builder/accounts/search - Search accounts
// Empty query returns first N accounts (for combobox initial display)
router.get('/accounts/search', async (req: Request, res: Response) => {
  try {
    const query = (req.query.q as string) || '';
    const limit = Math.min(parseInt(req.query.limit as string, 10) || 20, 50);

    // Allow empty query to return first N accounts
    const accounts = await searchAccounts(query, limit);
    res.json({ accounts });
  } catch (error) {
    logger.error('Error searching accounts:', error);
    res.status(500).json({ error: 'Failed to search accounts', message: getErrorMessage(error) });
  }
});

// ========== Builder Notifications ==========

// GET /api/builder/notifications - Get user's notifications
router.get('/notifications', async (req: Request, res: Response) => {
  try {
    const accountName = req.user?.accountName;
    if (!accountName) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }

    const limit = Math.min(parseInt(req.query.limit as string, 10) || 50, 100);
    const offset = parseInt(req.query.offset as string, 10) || 0;
    const isRead = req.query.is_read === 'true' ? true : req.query.is_read === 'false' ? false : undefined;

    const result = await builderNotificationService.getNotifications(accountName, isRead, limit, offset);
    res.json(result);
  } catch (error) {
    logger.error('Error getting notifications:', error);
    res.status(500).json({ error: 'Failed to get notifications', message: getErrorMessage(error) });
  }
});

// GET /api/builder/notifications/unread-count - Get unread notification count
router.get('/notifications/unread-count', async (req: Request, res: Response) => {
  try {
    const accountName = req.user?.accountName;
    if (!accountName) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }

    const count = await builderNotificationService.getUnreadCount(accountName);
    res.json({ count });
  } catch (error) {
    logger.error('Error getting unread count:', error);
    res.status(500).json({ error: 'Failed to get unread count', message: getErrorMessage(error) });
  }
});

// PUT /api/builder/notifications/:id/read - Mark notification as read
router.put('/notifications/:id/read', async (req: Request, res: Response) => {
  try {
    const accountName = req.user?.accountName;
    if (!accountName) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }

    const notificationId = parseInt(req.params.id, 10);
    if (isNaN(notificationId)) {
      res.status(400).json({ error: 'Invalid notification ID' });
      return;
    }

    const success = await builderNotificationService.markAsRead(notificationId, accountName);
    if (!success) {
      res.status(404).json({ error: 'Notification not found' });
      return;
    }

    res.json({ success: true });
  } catch (error) {
    logger.error('Error marking notification as read:', error);
    res.status(500).json({ error: 'Failed to mark as read', message: getErrorMessage(error) });
  }
});

// PUT /api/builder/notifications/read-all - Mark all notifications as read
router.put('/notifications/read-all', async (req: Request, res: Response) => {
  try {
    const accountName = req.user?.accountName;
    if (!accountName) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }

    const count = await builderNotificationService.markAllAsRead(accountName);
    res.json({ success: true, markedCount: count });
  } catch (error) {
    logger.error('Error marking all as read:', error);
    res.status(500).json({ error: 'Failed to mark all as read', message: getErrorMessage(error) });
  }
});

// ========== Proc Requests ==========

// GET /api/builder/zones/:id/proc-requests - List proc requests
router.get('/zones/:id/proc-requests', async (req: Request, res: Response) => {
  try {
    const zoneId = req.params.id;

    // Check view access
    if (!(await canAccessZone(req, zoneId, 'view'))) {
      res.status(403).json({ error: 'Access denied to this zone' });
      return;
    }

    const status = req.query.status as ProcRequestStatus | undefined;
    const entityType = req.query.entity_type as 'mob' | 'object' | 'room' | undefined;
    const assignedTo = req.query.assigned_to as string | undefined;

    const procRequests = await procRequestService.getProcRequests(zoneId, {
      status,
      entityType,
      assignedTo,
    });

    res.json({ procRequests });
  } catch (error) {
    logger.error('Error getting proc requests:', error);
    res.status(500).json({ error: 'Failed to get proc requests', message: getErrorMessage(error) });
  }
});

// POST /api/builder/zones/:id/proc-requests - Create proc request
router.post('/zones/:id/proc-requests', async (req: Request, res: Response) => {
  try {
    const zoneId = req.params.id;
    const accountName = req.user?.accountName;

    if (!accountName) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }

    // Check edit access to create proc requests
    if (!(await canAccessZone(req, zoneId, 'edit'))) {
      res.status(403).json({ error: 'Access denied to this zone' });
      return;
    }

    const { entityType, vnum, title, description, descriptionHtml } = req.body;

    if (!['mob', 'object', 'room'].includes(entityType)) {
      res.status(400).json({ error: 'Invalid entity type' });
      return;
    }

    if (!title || typeof title !== 'string') {
      res.status(400).json({ error: 'Title is required' });
      return;
    }

    const processedDescriptionHtml = validateOptionalHtml(descriptionHtml);
    if ('error' in processedDescriptionHtml) {
      res.status(400).json({ error: processedDescriptionHtml.error });
      return;
    }

    const data: CreateProcRequest = {
      zoneId,
      entityType,
      vnum: parseInt(vnum, 10) || 0,
      title,
      description,
      descriptionHtml: processedDescriptionHtml.contentHtml ?? undefined,
    };

    // Get zone name for notification message
    const zoneName = await getZoneName(zoneId);

    const procRequest = await procRequestService.createProcRequest(data, accountName, zoneName);

    await logBuilderActivity(
      accountName,
      'proc_request_create',
      zoneId,
      zoneName,
      entityType,
      data.vnum,
      title,
      req.ip || req.socket.remoteAddress || null
    );

    res.status(201).json({ procRequest });
  } catch (error) {
    logger.error('Error creating proc request:', error);
    res.status(500).json({ error: 'Failed to create proc request', message: getErrorMessage(error) });
  }
});

// PUT /api/builder/zones/:id/proc-requests/:prId - Update proc request
router.put('/zones/:id/proc-requests/:prId', async (req: Request, res: Response) => {
  try {
    const zoneId = req.params.id;
    const prId = validateIdParam(req.params.prId);
    if (prId === null) {
      res.status(400).json({ error: 'Invalid proc request ID' });
      return;
    }
    const accountName = req.user?.accountName;

    if (!accountName) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }

    // Check edit access
    if (!(await canAccessZone(req, zoneId, 'edit'))) {
      res.status(403).json({ error: 'Access denied to this zone' });
      return;
    }

    let processedDescriptionHtml: string | undefined;
    if (req.body.descriptionHtml !== undefined) {
      const result = validateOptionalHtml(req.body.descriptionHtml);
      if ('error' in result) {
        res.status(400).json({ error: result.error });
        return;
      }
      processedDescriptionHtml = result.contentHtml ?? undefined;
    }

    const data: UpdateProcRequest = {};
    if (req.body.entityType) data.entityType = req.body.entityType;
    if (req.body.vnum !== undefined) data.vnum = parseInt(req.body.vnum, 10);
    if (req.body.title) data.title = req.body.title;
    if (req.body.description !== undefined) data.description = req.body.description;
    if (req.body.descriptionHtml !== undefined) data.descriptionHtml = processedDescriptionHtml;
    if (req.body.status) data.status = req.body.status;
    if (req.body.assignedTo !== undefined) data.assignedTo = req.body.assignedTo;

    // Get zone name for notification message
    const zoneName = await getZoneName(zoneId);

    const procRequest = await procRequestService.updateProcRequest(prId, data, accountName, zoneName);

    if (!procRequest) {
      res.status(404).json({ error: 'Proc request not found' });
      return;
    }

    await logBuilderActivity(
      accountName,
      'proc_request_update',
      zoneId,
      zoneName,
      procRequest.entityType,
      procRequest.vnum,
      procRequest.title,
      req.ip || req.socket.remoteAddress || null
    );

    res.json({ procRequest });
  } catch (error) {
    logger.error('Error updating proc request:', error);
    res.status(500).json({ error: 'Failed to update proc request', message: getErrorMessage(error) });
  }
});

// PUT /api/builder/zones/:id/proc-requests/:prId/status - Update status only
router.put('/zones/:id/proc-requests/:prId/status', async (req: Request, res: Response) => {
  try {
    const zoneId = req.params.id;
    const prId = validateIdParam(req.params.prId);
    if (prId === null) {
      res.status(400).json({ error: 'Invalid proc request ID' });
      return;
    }
    const accountName = req.user?.accountName;

    if (!accountName) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }

    // Check edit access
    if (!(await canAccessZone(req, zoneId, 'edit'))) {
      res.status(403).json({ error: 'Access denied to this zone' });
      return;
    }

    const { status, assignedTo } = req.body;

    const validStatuses: ProcRequestStatus[] = ['requested', 'assigned', 'in_progress', 'completed'];
    if (!validStatuses.includes(status)) {
      res.status(400).json({ error: 'Invalid status' });
      return;
    }

    // Get zone name for notification message
    const zoneName = await getZoneName(zoneId);

    const procRequest = await procRequestService.updateProcRequestStatus(prId, status, assignedTo, accountName, zoneName);

    if (!procRequest) {
      res.status(404).json({ error: 'Proc request not found' });
      return;
    }

    res.json({ procRequest });
  } catch (error) {
    logger.error('Error updating proc request status:', error);
    res.status(500).json({ error: 'Failed to update status', message: getErrorMessage(error) });
  }
});

// DELETE /api/builder/zones/:id/proc-requests/:prId - Delete proc request
router.delete('/zones/:id/proc-requests/:prId', async (req: Request, res: Response) => {
  try {
    const zoneId = req.params.id;
    const prId = validateIdParam(req.params.prId);
    if (prId === null) {
      res.status(400).json({ error: 'Invalid proc request ID' });
      return;
    }
    const accountName = req.user?.accountName;

    if (!accountName) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }

    // Check edit access
    if (!(await canAccessZone(req, zoneId, 'edit'))) {
      res.status(403).json({ error: 'Access denied to this zone' });
      return;
    }

    const deleted = await procRequestService.deleteProcRequest(prId);

    if (!deleted) {
      res.status(404).json({ error: 'Proc request not found' });
      return;
    }

    await logBuilderActivity(
      accountName,
      'proc_request_delete',
      zoneId,
      null,
      'zone',
      null,
      `Deleted proc request #${prId}`,
      req.ip || req.socket.remoteAddress || null
    );

    res.json({ success: true });
  } catch (error) {
    logger.error('Error deleting proc request:', error);
    res.status(500).json({ error: 'Failed to delete proc request', message: getErrorMessage(error) });
  }
});

// ========== Zone Comments ==========

// GET /api/builder/zones/:id/comments - List comments
router.get('/zones/:id/comments', async (req: Request, res: Response) => {
  try {
    const zoneId = req.params.id;

    // Check view access
    if (!(await canAccessZone(req, zoneId, 'view'))) {
      res.status(403).json({ error: 'Access denied to this zone' });
      return;
    }

    const procRequestId = req.query.proc_request_id
      ? parseInt(req.query.proc_request_id as string, 10)
      : undefined;

    const comments = await zoneCommentService.getComments(
      zoneId,
      procRequestId === undefined ? null : procRequestId
    );

    res.json({ comments });
  } catch (error) {
    logger.error('Error getting comments:', error);
    res.status(500).json({ error: 'Failed to get comments', message: getErrorMessage(error) });
  }
});

// POST /api/builder/zones/:id/comments - Add comment
router.post('/zones/:id/comments', async (req: Request, res: Response) => {
  try {
    const zoneId = req.params.id;
    const accountName = req.user?.accountName;

    if (!accountName) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }

    // Check edit access to comment
    if (!(await canAccessZone(req, zoneId, 'edit'))) {
      res.status(403).json({ error: 'Access denied to this zone' });
      return;
    }

    const { parentId, procRequestId, characterName, content, contentHtml } = req.body;

    if (!content || typeof content !== 'string') {
      res.status(400).json({ error: 'Content is required' });
      return;
    }

    const processedHtml = validateOptionalHtml(contentHtml);
    if ('error' in processedHtml) {
      res.status(400).json({ error: processedHtml.error });
      return;
    }

    const data: CreateZoneComment = {
      zoneId,
      parentId: parentId ?? null,
      procRequestId: procRequestId ?? null,
      characterName: characterName ?? null,
      content,
      contentHtml: processedHtml.contentHtml ?? undefined,
    };

    // Get zone name for notification message
    const zoneName = await getZoneName(zoneId);

    const comment = await zoneCommentService.createComment(data, accountName, zoneName);

    await logBuilderActivity(
      accountName,
      'comment_create',
      zoneId,
      zoneName,
      'zone',
      null,
      content.substring(0, 50) + (content.length > 50 ? '...' : ''),
      req.ip || req.socket.remoteAddress || null
    );

    res.status(201).json({ comment });
  } catch (error) {
    logger.error('Error creating comment:', error);
    res.status(500).json({ error: 'Failed to create comment', message: getErrorMessage(error) });
  }
});

// PUT /api/builder/zones/:id/comments/:commentId - Edit comment
router.put('/zones/:id/comments/:commentId', async (req: Request, res: Response) => {
  try {
    const zoneId = req.params.id;
    const commentId = validateIdParam(req.params.commentId);
    if (commentId === null) {
      res.status(400).json({ error: 'Invalid comment ID' });
      return;
    }
    const accountName = req.user?.accountName;

    if (!accountName) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }

    // Check view access (author check is done in service)
    if (!(await canAccessZone(req, zoneId, 'view'))) {
      res.status(403).json({ error: 'Access denied to this zone' });
      return;
    }

    const { content, contentHtml } = req.body;

    if (!content || typeof content !== 'string') {
      res.status(400).json({ error: 'Content is required' });
      return;
    }

    const processedHtml = validateOptionalHtml(contentHtml);
    if ('error' in processedHtml) {
      res.status(400).json({ error: processedHtml.error });
      return;
    }

    // Check if user is admin (can edit any comment)
    const isAdmin = req.user?.permissions?.role === 'overlord' ||
      req.user?.adminPermissions?.has('manage_zones');

    const comment = await zoneCommentService.updateComment(
      commentId,
      { content, contentHtml: processedHtml.contentHtml ?? undefined },
      accountName,
      isAdmin
    );

    if (!comment) {
      res.status(404).json({ error: 'Comment not found' });
      return;
    }

    res.json({ comment });
  } catch (error) {
    if (getErrorMessage(error) === 'Not authorized to edit this comment') {
      res.status(403).json({ error: getErrorMessage(error) });
      return;
    }
    logger.error('Error updating comment:', error);
    res.status(500).json({ error: 'Failed to update comment', message: getErrorMessage(error) });
  }
});

// DELETE /api/builder/zones/:id/comments/:commentId - Delete comment
router.delete('/zones/:id/comments/:commentId', async (req: Request, res: Response) => {
  try {
    const zoneId = req.params.id;
    const commentId = validateIdParam(req.params.commentId);
    if (commentId === null) {
      res.status(400).json({ error: 'Invalid comment ID' });
      return;
    }
    const accountName = req.user?.accountName;

    if (!accountName) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }

    // Check view access (author check is done in service)
    if (!(await canAccessZone(req, zoneId, 'view'))) {
      res.status(403).json({ error: 'Access denied to this zone' });
      return;
    }

    // Check if user is admin
    const isAdmin = req.user?.permissions?.role === 'overlord' ||
      req.user?.adminPermissions?.has('manage_zones');

    const deleted = await zoneCommentService.deleteComment(commentId, accountName, isAdmin);

    if (!deleted) {
      res.status(404).json({ error: 'Comment not found' });
      return;
    }

    await logBuilderActivity(
      accountName,
      'comment_delete',
      zoneId,
      null,
      'zone',
      null,
      `Deleted comment #${commentId}`,
      req.ip || req.socket.remoteAddress || null
    );

    res.json({ success: true });
  } catch (error) {
    if (getErrorMessage(error) === 'Not authorized to delete this comment') {
      res.status(403).json({ error: getErrorMessage(error) });
      return;
    }
    logger.error('Error deleting comment:', error);
    res.status(500).json({ error: 'Failed to delete comment', message: getErrorMessage(error) });
  }
});

export default router;
