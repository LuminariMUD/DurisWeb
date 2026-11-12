import { Router, Request, Response, type IRouter } from 'express';
import { getRoomData } from '../../services/zoneBuilderParser.js';
import {
  updateRoom,
  createRoom,
  deleteRoom,
  getNextVnum,
  cloneRoom,
} from '../../services/zoneBuilderWriter.js';
import { validateRoom, clearValidationCache } from '../../services/zoneBuilderValidator.js';
import type { Room } from '../../types/builder.js';
import { logBuilderActivity } from './shared.js';
import { sendRouteError } from '../../utils/routeError.js';

export const builderRoomRoutes: IRouter = Router();

// GET /api/builder/zones/:id/rooms/:vnum - Get single room (Tier 3)
builderRoomRoutes.get('/zones/:id/rooms/:vnum', async (req: Request, res: Response) => {
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
    sendRouteError(res, error, 'Failed to get room', 'Failed to get room');
  }
});

// PUT /api/builder/zones/:id/rooms/:vnum - Update room
builderRoomRoutes.put('/zones/:id/rooms/:vnum', async (req: Request, res: Response) => {
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
      req.ip || req.socket.remoteAddress || null,
    );

    // Return success with any warnings
    res.json({
      success: true,
      room: roomData,
      warnings: validation.warnings.length > 0 ? validation.warnings : undefined,
    });
  } catch (error) {
    sendRouteError(res, error, 'Failed to update room', 'Failed to update room');
  }
});

// POST /api/builder/zones/:id/rooms - Create new room
builderRoomRoutes.post('/zones/:id/rooms', async (req: Request, res: Response) => {
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
      req.ip || req.socket.remoteAddress || null,
    );

    res.status(201).json({ success: true, room });
  } catch (error) {
    sendRouteError(res, error, 'Failed to create room', 'Failed to create room');
  }
});

// DELETE /api/builder/zones/:id/rooms/:vnum - Delete room
builderRoomRoutes.delete('/zones/:id/rooms/:vnum', async (req: Request, res: Response) => {
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
      req.ip || req.socket.remoteAddress || null,
    );

    res.json({ success: true });
  } catch (error) {
    sendRouteError(res, error, 'Failed to delete room', 'Failed to delete room');
  }
});

// POST /api/builder/zones/:id/rooms/:vnum/clone - Clone a room (supports multiple copies)
builderRoomRoutes.post('/zones/:id/rooms/:vnum/clone', async (req: Request, res: Response) => {
  try {
    const zoneId = req.params.id;
    const sourceVnum = parseInt(req.params.vnum, 10);

    if (!zoneId || zoneId.trim() === '' || isNaN(sourceVnum)) {
      res.status(400).json({ error: 'Invalid zone ID or vnum' });
      return;
    }

    // targetVnum is optional - if not provided, auto-assigns next available
    const targetVnum =
      req.body.targetVnum !== undefined ? parseInt(req.body.targetVnum, 10) : undefined;

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

    const vnums = clonedRooms.map((r) => r.vnum);

    await logBuilderActivity(
      req.user?.accountName || 'unknown',
      'room_clone',
      zoneId,
      null,
      'room',
      vnums[0], // First cloned room's vnum
      clonedRooms[0].name,
      req.ip || req.socket.remoteAddress || null,
    );

    res.status(201).json({
      success: true,
      room: clonedRooms[clonedRooms.length - 1], // Return last cloned room
      vnum: clonedRooms[clonedRooms.length - 1].vnum,
      vnums, // Array of all created vnums
    });
  } catch (error) {
    sendRouteError(res, error, 'Failed to clone room', 'Failed to clone room');
  }
});
