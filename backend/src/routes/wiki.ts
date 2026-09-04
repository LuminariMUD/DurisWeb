import express, { Router, Request, Response, NextFunction } from 'express';
import rateLimit from 'express-rate-limit';
import { getErrorMessage } from '../utils/logger.js';
import * as wikiService from '../services/wikiService.js';
import { optionalAuth, requireAuth, requirePermission } from '../middleware/auth.js';
import type { WikiSourceIdentity } from '../services/wikiGeneration.js';

const router: Router = express.Router();

// =============================================================================
// Rate Limiting
// =============================================================================

// Map tiles - needs high limit due to chunk-based loading on zoom/pan
const mapTilesLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 300, // Allow many requests for smooth map experience (cached anyway)
  message: { error: 'Too many map requests, please slow down' },
  standardHeaders: true,
  legacyHeaders: false,
});

// Zone/Object lists - lighter, more lenient
const listLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 120,
  message: { error: 'Too many requests, please slow down' },
  standardHeaders: true,
  legacyHeaders: false,
});

// Detail pages - moderate
const detailLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 60,
  message: { error: 'Too many requests, please slow down' },
  standardHeaders: true,
  legacyHeaders: false,
});

// =============================================================================
// Access Control Middleware
// =============================================================================

// Check wiki access level - blocks unauthenticated users if set to 'registered'
async function checkWikiAccess(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const accessLevel = await wikiService.getWikiAccessLevel();

    if (accessLevel === 'registered' && !req.user) {
      res.status(401).json({ error: 'Wiki access requires login' });
      return;
    }

    next();
  } catch (error) {
    next(error);
  }
}

/** Send the stable object-reference failure response without exposing internal readiness details. */
function sendUnavailableWikiObjectReference(res: Response): void {
  res.status(503).json({
    code: 'WIKI_OBJECT_REFERENCE_UNAVAILABLE',
    error: 'Wiki object reference data is unavailable. An operator must publish it.',
  });
}

/** Return the validated published source identity or end the response with the stable 503. */
async function requireAvailableWikiObjectReference(
  res: Response,
): Promise<WikiSourceIdentity | null> {
  const reference = await wikiService.getWikiObjectReference();
  if (reference.issues.length === 0 && reference.sourceIdentity) {
    return reference.sourceIdentity;
  }

  sendUnavailableWikiObjectReference(res);
  return null;
}

// =============================================================================
// Public Routes (no auth needed, but respects access level setting)
// =============================================================================

// GET /api/wiki/access - Get wiki access level
router.get('/access', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const accessLevel = await wikiService.getWikiAccessLevel();
    res.json({ accessLevel });
  } catch (error) {
    next(error);
  }
});

// =============================================================================
// Wiki Routes (optional auth + access level check)
// =============================================================================

// Apply optional auth to all wiki routes so we can check user status
router.use(optionalAuth);

// GET /api/wiki/map/layers - Get available map layers
router.get(
  '/map/layers',
  checkWikiAccess,
  async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const layers = [
        { id: 0, name: 'Surface', description: 'The Surface Realm of Duris' },
        { id: -1, name: 'Underdark', description: 'The Twisting Tunnels of the Durian Underdark' },
        { id: -2, name: 'Alatorin', description: 'The Depths of Duris' },
      ];
      res.json(layers);
    } catch (error) {
      next(error);
    }
  },
);

// GET /api/wiki/map/continents - Get all continents
router.get(
  '/map/continents',
  checkWikiAccess,
  async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const continents = await wikiService.getContinents();
      res.json(continents);
    } catch (error) {
      next(error);
    }
  },
);

// GET /api/wiki/map/bounds - Get map bounds (optionally per layer)
router.get(
  '/map/bounds',
  checkWikiAccess,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { layer } = req.query;
      const layerNum = layer !== undefined ? Number(layer) : undefined;
      const bounds = await wikiService.getMapBounds(layerNum);
      res.json(bounds);
    } catch (error) {
      next(error);
    }
  },
);

// GET /api/wiki/map/image - Get full world map as PNG image
router.get(
  '/map/image',
  checkWikiAccess,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { layer } = req.query;
      const layerNum = layer !== undefined ? Number(layer) : 0;

      const pngBuffer = await wikiService.generateMapImage(layerNum);

      // Set appropriate headers for PNG image with long cache
      res.set({
        'Content-Type': 'image/png',
        'Content-Length': pngBuffer.length.toString(),
        'Cache-Control': 'public, max-age=604800', // 1 week
      });

      res.send(pngBuffer);
    } catch (error) {
      next(error);
    }
  },
);

// GET /api/wiki/map/tiles - Get map tiles for viewport
router.get(
  '/map/tiles',
  checkWikiAccess,
  mapTilesLimiter,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { minX, maxX, minY, maxY, layer } = req.query;

      // Validate required parameters
      if (minX === undefined || maxX === undefined || minY === undefined || maxY === undefined) {
        res.status(400).json({ error: 'Missing required parameters: minX, maxX, minY, maxY' });
        return;
      }

      const bounds: wikiService.MapBounds = {
        minX: Number(minX),
        maxX: Number(maxX),
        minY: Number(minY),
        maxY: Number(maxY),
      };

      // Validate numeric values
      if (isNaN(bounds.minX) || isNaN(bounds.maxX) || isNaN(bounds.minY) || isNaN(bounds.maxY)) {
        res.status(400).json({ error: 'Invalid bounds: all values must be numbers' });
        return;
      }

      // Layer: 0 = Surface, -1 = Underdark, -2 = Depths, 1 = Newbie
      const zLevel = layer !== undefined ? Number(layer) : 0;
      const tiles = await wikiService.getMapTiles(bounds, zLevel);
      res.json(tiles);
    } catch (error) {
      const errorMsg = getErrorMessage(error);
      if (errorMsg.includes('too large') || errorMsg.includes('Invalid bounds')) {
        res.status(400).json({ error: errorMsg });
        return;
      }
      next(error);
    }
  },
);

// GET /api/wiki/map/entrances - Get zone entrances for viewport
router.get(
  '/map/entrances',
  checkWikiAccess,
  mapTilesLimiter,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { minX, maxX, minY, maxY, layer } = req.query;

      // Validate required parameters
      if (minX === undefined || maxX === undefined || minY === undefined || maxY === undefined) {
        res.status(400).json({ error: 'Missing required parameters: minX, maxX, minY, maxY' });
        return;
      }

      const bounds: wikiService.MapBounds = {
        minX: Number(minX),
        maxX: Number(maxX),
        minY: Number(minY),
        maxY: Number(maxY),
      };

      // Validate numeric values
      if (isNaN(bounds.minX) || isNaN(bounds.maxX) || isNaN(bounds.minY) || isNaN(bounds.maxY)) {
        res.status(400).json({ error: 'Invalid bounds: all values must be numbers' });
        return;
      }

      // Layer: 0 = Surface, -1 = Underdark, -2 = Depths, 1 = Newbie
      const zLevel = layer !== undefined ? Number(layer) : 0;
      const entrances = await wikiService.getZoneEntrances(bounds, zLevel);
      res.json(entrances);
    } catch (error) {
      next(error);
    }
  },
);

// GET /api/wiki/map/realtime - Get real-time player/ship positions (requires permission)
router.get(
  '/map/realtime',
  requireAuth,
  requirePermission('view_wiki_realtime'),
  async (_req: Request, res: Response, next: NextFunction) => {
    try {
      // Check if realtime is enabled
      const enabled = await wikiService.getRealtimeEnabled();
      if (!enabled) {
        res.json({ enabled: false, players: [], ships: [] });
        return;
      }

      // TODO: Implement real-time player/ship positions
      // This would query the MUD's current state via a different mechanism
      res.json({ enabled: true, players: [], ships: [] });
    } catch (error) {
      next(error);
    }
  },
);

// =============================================================================
// Zone Routes
// =============================================================================

// GET /api/wiki/zones/search - Search zones for autocomplete with infinite scroll
router.get(
  '/zones/search',
  checkWikiAccess,
  listLimiter,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const query = String(req.query.q || '');
      const limit = Math.min(parseInt(String(req.query.limit || '20')), 50);
      const offset = Math.max(parseInt(String(req.query.offset || '0')), 0);
      const result = await wikiService.searchZones(query, limit, offset);
      res.json(result);
    } catch (error) {
      next(error);
    }
  },
);

// GET /api/wiki/zones - Get paginated zone list
router.get(
  '/zones',
  checkWikiAccess,
  listLimiter,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const {
        page = '1',
        limit = '20',
        sortBy = 'number',
        sortOrder = 'asc',
        search,
        alignmentMin,
        alignmentMax,
        difficultyMin,
        difficultyMax,
        epicTypes,
        minLevel,
        maxLevel,
      } = req.query;

      const filters: wikiService.WikiZoneFilters = {};

      if (search) {
        filters.search = String(search);
      }

      if (alignmentMin !== undefined) {
        filters.alignmentMin = Number(alignmentMin);
      }

      if (alignmentMax !== undefined) {
        filters.alignmentMax = Number(alignmentMax);
      }

      if (difficultyMin !== undefined) {
        filters.difficultyMin = Number(difficultyMin);
      }

      if (difficultyMax !== undefined) {
        filters.difficultyMax = Number(difficultyMax);
      }

      if (epicTypes) {
        const types = String(epicTypes)
          .split(',')
          .map(Number)
          .filter((n) => !isNaN(n));
        if (types.length > 0) {
          filters.epicTypes = types;
        }
      }

      if (minLevel !== undefined) {
        filters.minLevel = Number(minLevel);
      }

      if (maxLevel !== undefined) {
        filters.maxLevel = Number(maxLevel);
      }

      const pagination: wikiService.PaginationParams = {
        page: Number(page),
        limit: Math.min(Number(limit), 100), // Cap at 100
        sortBy: String(sortBy),
        sortOrder: sortOrder === 'desc' ? 'desc' : 'asc',
      };

      const result = await wikiService.getZones(filters, pagination);
      res.json(result);
    } catch (error) {
      next(error);
    }
  },
);

// GET /api/wiki/zones/:number - Get zone detail
router.get(
  '/zones/:number',
  checkWikiAccess,
  detailLimiter,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const zoneNumber = Number(req.params.number);

      if (isNaN(zoneNumber)) {
        res.status(400).json({ error: 'Invalid zone number' });
        return;
      }

      const zone = await wikiService.getZoneByNumber(zoneNumber);

      if (!zone) {
        res.status(404).json({ error: 'Zone not found' });
        return;
      }

      res.json(zone);
    } catch (error) {
      next(error);
    }
  },
);

// GET /api/wiki/zones/:number/map-data - Get zone map data for Cytoscape.js
router.get(
  '/zones/:number/map-data',
  checkWikiAccess,
  detailLimiter,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const zoneNumber = Number(req.params.number);

      if (isNaN(zoneNumber)) {
        res.status(400).json({ error: 'Invalid zone number' });
        return;
      }

      const mapData = await wikiService.getZoneMapData(zoneNumber);
      res.json(mapData);
    } catch (error) {
      next(error);
    }
  },
);

// =============================================================================
// Object Routes
// =============================================================================

// GET /api/wiki/objects/types - Get object type list (for filters)
router.get(
  '/objects/types',
  checkWikiAccess,
  async (_req: Request, res: Response, next: NextFunction) => {
    try {
      if (!(await requireAvailableWikiObjectReference(res))) return;
      const types = await wikiService.getObjectTypes();
      res.json(types);
    } catch (error) {
      next(error);
    }
  },
);

// GET /api/wiki/objects/slots - Get wear slot list (for filters)
router.get(
  '/objects/slots',
  checkWikiAccess,
  async (_req: Request, res: Response, next: NextFunction) => {
    try {
      if (!(await requireAvailableWikiObjectReference(res))) return;
      const slots = await wikiService.getWearSlotTypes();
      res.json(slots);
    } catch (error) {
      next(error);
    }
  },
);

// GET /api/wiki/objects/affects - Get affect type list (for filters)
router.get(
  '/objects/affects',
  checkWikiAccess,
  async (_req: Request, res: Response, next: NextFunction) => {
    try {
      if (!(await requireAvailableWikiObjectReference(res))) return;
      const affects = await wikiService.getAffectTypes();
      res.json(affects);
    } catch (error) {
      next(error);
    }
  },
);

// GET /api/wiki/objects/spell-effects - Get spell effect list (for filters)
router.get(
  '/objects/spell-effects',
  checkWikiAccess,
  async (_req: Request, res: Response, next: NextFunction) => {
    try {
      if (!(await requireAvailableWikiObjectReference(res))) return;
      const effects = await wikiService.getSpellEffectTypes();
      res.json(effects);
    } catch (error) {
      next(error);
    }
  },
);

// GET /api/wiki/objects/classes - Get class restriction list (for filters)
router.get(
  '/objects/classes',
  checkWikiAccess,
  async (_req: Request, res: Response, next: NextFunction) => {
    try {
      if (!(await requireAvailableWikiObjectReference(res))) return;
      const classes = await wikiService.getObjectClasses();
      res.json(classes);
    } catch (error) {
      next(error);
    }
  },
);

// GET /api/wiki/objects/races - Get race restriction list (for filters)
router.get(
  '/objects/races',
  checkWikiAccess,
  async (_req: Request, res: Response, next: NextFunction) => {
    try {
      if (!(await requireAvailableWikiObjectReference(res))) return;
      const races = await wikiService.getObjectRaces();
      res.json(races);
    } catch (error) {
      next(error);
    }
  },
);

// GET /api/wiki/objects - Get paginated object list
router.get(
  '/objects',
  checkWikiAccess,
  listLimiter,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!(await requireAvailableWikiObjectReference(res))) return;

      const {
        page = '1',
        limit = '20',
        sortBy = 'vnum',
        sortOrder = 'asc',
        search,
        type,
        slot,
        minLevel,
        maxLevel,
        affectType,
        excludeTypes,
        affects,
        spellEffects,
        zone,
        allowedClass,
        allowedRace,
      } = req.query;

      const filters: wikiService.WikiObjectFilters = {};

      if (search) {
        filters.search = String(search);
      }

      if (type !== undefined) {
        filters.type = Number(type);
      }

      if (slot !== undefined) {
        filters.slot = Number(slot);
      }

      if (minLevel !== undefined) {
        filters.minLevel = Number(minLevel);
      }

      if (maxLevel !== undefined) {
        filters.maxLevel = Number(maxLevel);
      }

      if (affectType !== undefined) {
        filters.affectType = Number(affectType);
      }

      // Exclude types - comma-separated list of type IDs (e.g., "12,0" to exclude Trash and Undefined)
      if (excludeTypes) {
        filters.excludeTypes = String(excludeTypes)
          .split(',')
          .map(Number)
          .filter((n) => !isNaN(n));
      }

      // Multiple affects filter - JSON array of {location, minModifier}
      // e.g., affects=[{"location":19,"minModifier":5},{"location":18,"minModifier":5}]
      if (affects) {
        try {
          filters.affects = JSON.parse(String(affects));
        } catch {
          // Invalid JSON, ignore
        }
      }

      // Multiple spell effects filter - comma-separated list of effect names
      // e.g., spellEffects=Detect Invisible,Sense Life
      if (spellEffects) {
        filters.spellEffects = String(spellEffects)
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean);
      }

      // Zone filter
      if (zone !== undefined) {
        filters.zone = Number(zone);
      }

      // Class restriction filter - find items usable by this class
      if (allowedClass !== undefined) {
        filters.allowedClass = Number(allowedClass);
      }

      // Race restriction filter - find items usable by this race
      if (allowedRace !== undefined) {
        filters.allowedRace = Number(allowedRace);
      }

      const pagination: wikiService.PaginationParams = {
        page: Number(page),
        limit: Math.min(Number(limit), 100), // Cap at 100
        sortBy: String(sortBy),
        sortOrder: sortOrder === 'desc' ? 'desc' : 'asc',
      };

      const result = await wikiService.getObjects(filters, pagination);
      res.json(result);
    } catch (error) {
      next(error);
    }
  },
);

// GET /api/wiki/objects/:vnum - Get object detail
router.get(
  '/objects/:vnum',
  checkWikiAccess,
  detailLimiter,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const vnum = Number(req.params.vnum);

      if (isNaN(vnum)) {
        res.status(400).json({ error: 'Invalid object vnum' });
        return;
      }

      const sourceIdentity = await requireAvailableWikiObjectReference(res);
      if (!sourceIdentity) return;

      const obj = await wikiService.getObjectByVnum(vnum, sourceIdentity);

      if (!obj) {
        res.status(404).json({ error: 'Object not found' });
        return;
      }

      res.json(obj);
    } catch (error) {
      if (error instanceof wikiService.WikiObjectReferenceUnavailableError) {
        sendUnavailableWikiObjectReference(res);
        return;
      }
      next(error);
    }
  },
);

// =============================================================================
// Mob Routes
// =============================================================================

// GET /api/wiki/mobs/classes - Get mob class list (for filters)
router.get(
  '/mobs/classes',
  checkWikiAccess,
  async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const classes = await wikiService.getMobClasses();
      res.json(classes);
    } catch (error) {
      next(error);
    }
  },
);

// GET /api/wiki/mobs/races - Get mob race list (for filters)
router.get(
  '/mobs/races',
  checkWikiAccess,
  async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const races = await wikiService.getMobRaces();
      res.json(races);
    } catch (error) {
      next(error);
    }
  },
);

// GET /api/wiki/mobs/flags - Get act flags list (for legend)
router.get(
  '/mobs/flags',
  checkWikiAccess,
  async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const flags = await wikiService.getActFlags();
      res.json(flags);
    } catch (error) {
      next(error);
    }
  },
);

// GET /api/wiki/mobs - Get paginated mob list
router.get(
  '/mobs',
  checkWikiAccess,
  listLimiter,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const {
        page = '1',
        limit = '20',
        sortBy = 'vnum',
        sortOrder = 'asc',
        search,
        minLevel,
        maxLevel,
        alignmentMin,
        alignmentMax,
        mobClass,
        race,
        flag,
        zone,
      } = req.query;

      const filters: wikiService.WikiMobFilters = {};

      if (search) {
        filters.search = String(search);
      }

      if (minLevel !== undefined) {
        filters.minLevel = Number(minLevel);
      }

      if (maxLevel !== undefined) {
        filters.maxLevel = Number(maxLevel);
      }

      if (alignmentMin !== undefined) {
        filters.alignmentMin = Number(alignmentMin);
      }

      if (alignmentMax !== undefined) {
        filters.alignmentMax = Number(alignmentMax);
      }

      if (mobClass !== undefined) {
        filters.mobClass = Number(mobClass);
      }

      // New filters
      if (race !== undefined) {
        filters.race = Number(race);
      }

      if (flag !== undefined) {
        filters.flag = Number(flag);
      }

      if (zone !== undefined) {
        filters.zone = Number(zone);
      }

      const pagination: wikiService.PaginationParams = {
        page: Number(page),
        limit: Math.min(Number(limit), 100), // Cap at 100
        sortBy: String(sortBy),
        sortOrder: sortOrder === 'desc' ? 'desc' : 'asc',
      };

      const result = await wikiService.getMobs(filters, pagination);
      res.json(result);
    } catch (error) {
      next(error);
    }
  },
);

// GET /api/wiki/mobs/:zoneNumber/:vnum - Get mob detail (unique by zone + vnum)
router.get(
  '/mobs/:zoneNumber/:vnum',
  checkWikiAccess,
  detailLimiter,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const zoneNumber = Number(req.params.zoneNumber);
      const vnum = Number(req.params.vnum);

      if (isNaN(zoneNumber) || isNaN(vnum)) {
        res.status(400).json({ error: 'Invalid zone number or mob vnum' });
        return;
      }

      const mob = await wikiService.getMobByZoneAndVnum(zoneNumber, vnum);

      if (!mob) {
        res.status(404).json({ error: 'Mob not found' });
        return;
      }

      res.json(mob);
    } catch (error) {
      next(error);
    }
  },
);

// =============================================================================
// Zone Spawns Route
// =============================================================================

// GET /api/wiki/zones/:number/spawns - Get mobs/objects that spawn in each room
router.get(
  '/zones/:number/spawns',
  checkWikiAccess,
  detailLimiter,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const zoneNumber = Number(req.params.number);

      if (isNaN(zoneNumber)) {
        res.status(400).json({ error: 'Invalid zone number' });
        return;
      }

      const spawns = await wikiService.getZoneSpawns(zoneNumber);
      res.json(spawns);
    } catch (error) {
      next(error);
    }
  },
);

// =============================================================================
// Admin Routes (for wiki settings)
// =============================================================================

// PUT /api/wiki/settings/access - Update wiki access level (admin only)
router.put(
  '/settings/access',
  requireAuth,
  requirePermission('manage_settings'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { accessLevel } = req.body;

      if (accessLevel !== 'public' && accessLevel !== 'registered') {
        res.status(400).json({ error: 'Invalid access level. Must be "public" or "registered"' });
        return;
      }

      await wikiService.setWikiAccessLevel(accessLevel);
      res.json({ success: true, accessLevel });
    } catch (error) {
      next(error);
    }
  },
);

export default router;
