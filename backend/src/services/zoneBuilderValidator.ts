// Zone Builder Validation Service
// Validates cross-references between rooms, mobs, and objects

import { getZoneMapData, getObjectData } from './zoneBuilderParser.js';
import type { Room, RoomExit, ZoneObject, ZoneMapData } from '../types/builder.js';
import { getCache, setCache, deleteCache } from '../db/redis.js';

// Item types that have VNUM references in values[]
const ITEM_TYPE_CONTAINER = 15;
const ITEM_TYPE_DRINKCON = 17;
const ITEM_TYPE_KEY = 18;
const ITEM_TYPE_WARP_STONE = 25;
const ITEM_TYPE_PORTAL = 26;
const ITEM_TYPE_STORAGE = 35;

// Redis cache settings
const VALIDATION_CACHE_TTL = 10 * 60; // 10 minutes
const REDIS_KEY_PREFIX = 'builder:validation:';

// Validation error types
export interface ValidationError {
  field: string;
  message: string;
  value?: number | string;
  severity: 'error' | 'warning';
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  warnings: ValidationError[];
}

// Clear cache (call when zone data changes)
export async function clearValidationCache(zoneId?: string): Promise<void> {
  if (zoneId) {
    await deleteCache(`${REDIS_KEY_PREFIX}${zoneId}`);
  } else {
    await deleteCache(`${REDIS_KEY_PREFIX}*`);
  }
}

// Get zone data with caching
async function getCachedZoneData(zoneId: string): Promise<ZoneMapData | null> {
  const cacheKey = `${REDIS_KEY_PREFIX}${zoneId}`;

  // Check Redis cache first
  const cached = await getCache<ZoneMapData>(cacheKey);
  if (cached) {
    return cached;
  }

  const data = await getZoneMapData(zoneId);
  if (data) {
    await setCache(cacheKey, data, VALIDATION_CACHE_TTL);
  }
  return data;
}

// Check if a room VNUM exists in the zone
async function roomExists(zoneId: string, vnum: number): Promise<boolean> {
  const zoneData = await getCachedZoneData(zoneId);
  if (!zoneData) return false;
  return zoneData.rooms.some(r => r.vnum === vnum);
}

// Check if an object VNUM exists in the zone
async function objectExists(zoneId: string, vnum: number): Promise<boolean> {
  const zoneData = await getCachedZoneData(zoneId);
  if (!zoneData) return false;
  return zoneData.objects.some(o => o.vnum === vnum);
}

// Check if an object is of type KEY
async function isKeyObject(zoneId: string, vnum: number): Promise<boolean> {
  const obj = await getObjectData(zoneId, vnum);
  return obj !== null && obj.itemType === ITEM_TYPE_KEY;
}

// Get object type for display
async function getObjectType(zoneId: string, vnum: number): Promise<number | null> {
  const obj = await getObjectData(zoneId, vnum);
  return obj?.itemType ?? null;
}

/**
 * Validate a single room exit
 */
export async function validateRoomExit(
  zoneId: string,
  exit: RoomExit,
  direction: string
): Promise<ValidationError[]> {
  const errors: ValidationError[] = [];

  // Validate toRoom reference
  if (exit.toRoom >= 0) {
    const exists = await roomExists(zoneId, exit.toRoom);
    if (!exists) {
      // Check if it might be in another zone (cross-zone exits are valid but we warn)
      errors.push({
        field: `exits.${direction}.toRoom`,
        message: `Room #${exit.toRoom} not found in this zone. If this is a cross-zone exit, ensure the destination zone exists.`,
        value: exit.toRoom,
        severity: 'warning'
      });
    }
  }

  // Validate keyVnum reference
  if (exit.keyVnum > 0) {
    const exists = await objectExists(zoneId, exit.keyVnum);
    if (!exists) {
      errors.push({
        field: `exits.${direction}.keyVnum`,
        message: `Key object #${exit.keyVnum} not found in this zone`,
        value: exit.keyVnum,
        severity: 'warning'
      });
    } else {
      // Check if it's actually a key type
      const isKey = await isKeyObject(zoneId, exit.keyVnum);
      if (!isKey) {
        const objType = await getObjectType(zoneId, exit.keyVnum);
        errors.push({
          field: `exits.${direction}.keyVnum`,
          message: `Object #${exit.keyVnum} is not a KEY type (type ${objType}). Expected item type ${ITEM_TYPE_KEY}.`,
          value: exit.keyVnum,
          severity: 'error'
        });
      }
    }
  }

  return errors;
}

/**
 * Validate all exits in a room
 */
export async function validateRoomExits(zoneId: string, room: Room): Promise<ValidationResult> {
  const allErrors: ValidationError[] = [];

  for (const exit of room.exits) {
    const exitErrors = await validateRoomExit(zoneId, exit, exit.direction);
    allErrors.push(...exitErrors);
  }

  return {
    valid: !allErrors.some(e => e.severity === 'error'),
    errors: allErrors.filter(e => e.severity === 'error'),
    warnings: allErrors.filter(e => e.severity === 'warning')
  };
}

/**
 * Validate object values based on item type
 */
export async function validateObjectValues(zoneId: string, obj: ZoneObject): Promise<ValidationResult> {
  const errors: ValidationError[] = [];

  switch (obj.itemType) {
    // Container types - values[2] is key VNUM
    case ITEM_TYPE_CONTAINER:
    case ITEM_TYPE_STORAGE:
      if (obj.values[2] && obj.values[2] > 0) {
        const exists = await objectExists(zoneId, obj.values[2]);
        if (!exists) {
          errors.push({
            field: 'values[2]',
            message: `Container key object #${obj.values[2]} not found in this zone`,
            value: obj.values[2],
            severity: 'warning'
          });
        } else {
          const isKey = await isKeyObject(zoneId, obj.values[2]);
          if (!isKey) {
            const objType = await getObjectType(zoneId, obj.values[2]);
            errors.push({
              field: 'values[2]',
              message: `Container key #${obj.values[2]} is not a KEY type (type ${objType}). Expected item type ${ITEM_TYPE_KEY}.`,
              value: obj.values[2],
              severity: 'error'
            });
          }
        }
      }
      break;

    // Warp stone - values[0] is target zone, values[1] is target room
    case ITEM_TYPE_WARP_STONE:
      if (obj.values[1] && obj.values[1] > 0) {
        // Warp stones typically go to other zones, so just warn if room not found locally
        const exists = await roomExists(zoneId, obj.values[1]);
        if (!exists) {
          errors.push({
            field: 'values[1]',
            message: `Warp target room #${obj.values[1]} not found in this zone. Ensure the destination exists in zone ${obj.values[0]}.`,
            value: obj.values[1],
            severity: 'warning'
          });
        }
      }
      break;

    // Portal - values[0] is target room
    case ITEM_TYPE_PORTAL:
      if (obj.values[0] && obj.values[0] > 0) {
        const exists = await roomExists(zoneId, obj.values[0]);
        if (!exists) {
          errors.push({
            field: 'values[0]',
            message: `Portal target room #${obj.values[0]} not found in this zone. If this is a cross-zone portal, ensure the destination zone exists.`,
            value: obj.values[0],
            severity: 'warning'
          });
        }
      }
      break;

    // Drink container - values[2] might be a key (lockable containers)
    case ITEM_TYPE_DRINKCON:
      // values[2] is liquid type, not a key - no vnum validation needed
      break;
  }

  // Validate applies - location should be valid apply type
  if (obj.applies && obj.applies.length > 0) {
    for (let i = 0; i < obj.applies.length; i++) {
      const apply = obj.applies[i];
      if (apply.location < 0 || apply.location > 50) {
        errors.push({
          field: `applies[${i}].location`,
          message: `Invalid apply location ${apply.location}`,
          value: apply.location,
          severity: 'error'
        });
      }
    }
  }

  return {
    valid: !errors.some(e => e.severity === 'error'),
    errors: errors.filter(e => e.severity === 'error'),
    warnings: errors.filter(e => e.severity === 'warning')
  };
}

/**
 * Validate a complete room
 */
export async function validateRoom(zoneId: string, room: Room): Promise<ValidationResult> {
  const exitResult = await validateRoomExits(zoneId, room);

  const errors: ValidationError[] = [...exitResult.errors];
  const warnings: ValidationError[] = [...exitResult.warnings];

  // Basic room validation
  if (!room.name || room.name.trim() === '') {
    errors.push({
      field: 'name',
      message: 'Room name is required',
      severity: 'error'
    });
  }

  if (!room.description || room.description.trim() === '') {
    warnings.push({
      field: 'description',
      message: 'Room has no description',
      severity: 'warning'
    });
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings
  };
}

/**
 * Validate a complete object
 */
export async function validateObject(zoneId: string, obj: ZoneObject): Promise<ValidationResult> {
  const valueResult = await validateObjectValues(zoneId, obj);

  const errors: ValidationError[] = [...valueResult.errors];
  const warnings: ValidationError[] = [...valueResult.warnings];

  // Basic object validation
  if (!obj.keywords || obj.keywords.trim() === '') {
    errors.push({
      field: 'keywords',
      message: 'Object keywords are required',
      severity: 'error'
    });
  }

  if (!obj.shortDesc || obj.shortDesc.trim() === '') {
    errors.push({
      field: 'shortDesc',
      message: 'Object short description is required',
      severity: 'error'
    });
  }

  if (!obj.longDesc || obj.longDesc.trim() === '') {
    warnings.push({
      field: 'longDesc',
      message: 'Object has no long description (shown when on ground)',
      severity: 'warning'
    });
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings
  };
}

/**
 * Batch validate multiple items
 */
export interface BatchValidationResult {
  rooms: { [vnum: number]: ValidationResult };
  objects: { [vnum: number]: ValidationResult };
  summary: {
    totalErrors: number;
    totalWarnings: number;
    roomsWithErrors: number;
    objectsWithErrors: number;
  };
}

export async function validateZone(
  zoneId: string,
  rooms?: Room[],
  objects?: ZoneObject[]
): Promise<BatchValidationResult> {
  const result: BatchValidationResult = {
    rooms: {},
    objects: {},
    summary: {
      totalErrors: 0,
      totalWarnings: 0,
      roomsWithErrors: 0,
      objectsWithErrors: 0
    }
  };

  // Validate rooms
  if (rooms) {
    for (const room of rooms) {
      const roomResult = await validateRoom(zoneId, room);
      result.rooms[room.vnum] = roomResult;
      result.summary.totalErrors += roomResult.errors.length;
      result.summary.totalWarnings += roomResult.warnings.length;
      if (roomResult.errors.length > 0) {
        result.summary.roomsWithErrors++;
      }
    }
  }

  // Validate objects
  if (objects) {
    for (const obj of objects) {
      const objResult = await validateObject(zoneId, obj);
      result.objects[obj.vnum] = objResult;
      result.summary.totalErrors += objResult.errors.length;
      result.summary.totalWarnings += objResult.warnings.length;
      if (objResult.errors.length > 0) {
        result.summary.objectsWithErrors++;
      }
    }
  }

  // Clear cache after batch validation
  await clearValidationCache(zoneId);

  return result;
}

/**
 * Quick validation for a single exit (for real-time frontend validation)
 */
export interface QuickValidationRequest {
  type: 'exit' | 'object';
  zoneId: string;
  data: {
    // For exit validation
    toRoom?: number;
    keyVnum?: number;
    // For object validation
    itemType?: number;
    values?: number[];
  };
}

export interface QuickValidationResponse {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

export async function quickValidate(req: QuickValidationRequest): Promise<QuickValidationResponse> {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (req.type === 'exit') {
    // Validate toRoom
    if (req.data.toRoom !== undefined && req.data.toRoom >= 0) {
      const exists = await roomExists(req.zoneId, req.data.toRoom);
      if (!exists) {
        warnings.push(`Room #${req.data.toRoom} not found in this zone`);
      }
    }

    // Validate keyVnum
    if (req.data.keyVnum !== undefined && req.data.keyVnum > 0) {
      const exists = await objectExists(req.zoneId, req.data.keyVnum);
      if (!exists) {
        warnings.push(`Key object #${req.data.keyVnum} not found`);
      } else {
        const isKey = await isKeyObject(req.zoneId, req.data.keyVnum);
        if (!isKey) {
          errors.push(`Object #${req.data.keyVnum} is not a KEY type`);
        }
      }
    }
  } else if (req.type === 'object' && req.data.itemType !== undefined && req.data.values) {
    // Validate container key
    if ((req.data.itemType === ITEM_TYPE_CONTAINER || req.data.itemType === ITEM_TYPE_STORAGE) &&
        req.data.values[2] && req.data.values[2] > 0) {
      const exists = await objectExists(req.zoneId, req.data.values[2]);
      if (!exists) {
        warnings.push(`Container key #${req.data.values[2]} not found`);
      } else {
        const isKey = await isKeyObject(req.zoneId, req.data.values[2]);
        if (!isKey) {
          errors.push(`Object #${req.data.values[2]} is not a KEY type`);
        }
      }
    }

    // Validate portal/warp target
    if (req.data.itemType === ITEM_TYPE_PORTAL && req.data.values[0] && req.data.values[0] > 0) {
      const exists = await roomExists(req.zoneId, req.data.values[0]);
      if (!exists) {
        warnings.push(`Portal target room #${req.data.values[0]} not found in this zone`);
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings
  };
}
