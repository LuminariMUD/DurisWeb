import { Router, Request, Response, type IRouter } from 'express';
import { getMobileData } from '../../services/zoneBuilderParser.js';
import {
  updateMobile,
  createMobile,
  deleteMobile,
  getNextVnum,
} from '../../services/zoneBuilderWriter.js';
import type { Mobile } from '../../types/builder.js';
import { logBuilderActivity } from './shared.js';
import { sendRouteError } from '../../utils/routeError.js';

export const builderMobRoutes: IRouter = Router();

// GET /api/builder/zones/:id/mobs/:vnum - Get single mobile
builderMobRoutes.get('/zones/:id/mobs/:vnum', async (req: Request, res: Response) => {
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
    sendRouteError(res, error, 'Failed to get mobile', 'Failed to get mobile');
  }
});

// PUT /api/builder/zones/:id/mobs/:vnum - Update mobile
builderMobRoutes.put('/zones/:id/mobs/:vnum', async (req: Request, res: Response) => {
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
      req.ip || req.socket.remoteAddress || null,
    );

    res.json({ success: true, mobile: mobileData });
  } catch (error) {
    sendRouteError(res, error, 'Failed to update mobile', 'Failed to update mobile');
  }
});

// POST /api/builder/zones/:id/mobs - Create new mobile
builderMobRoutes.post('/zones/:id/mobs', async (req: Request, res: Response) => {
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
      req.ip || req.socket.remoteAddress || null,
    );

    res.status(201).json({ success: true, mobile });
  } catch (error) {
    sendRouteError(res, error, 'Failed to create mobile', 'Failed to create mobile');
  }
});

// DELETE /api/builder/zones/:id/mobs/:vnum - Delete mobile
builderMobRoutes.delete('/zones/:id/mobs/:vnum', async (req: Request, res: Response) => {
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
      req.ip || req.socket.remoteAddress || null,
    );

    res.json({ success: true });
  } catch (error) {
    sendRouteError(res, error, 'Failed to delete mobile', 'Failed to delete mobile');
  }
});
