import { Router, Request, Response, type IRouter } from 'express';
import logger from '../../utils/logger.js';
import {
  validateRoom,
  validateObject,
  quickValidate,
} from '../../services/zoneBuilderValidator.js';
import type { Room, ZoneObject } from '../../types/builder.js';
import { sendRouteError } from '../../utils/routeError.js';

export const builderValidationRoutes: IRouter = Router();

// POST /api/builder/zones/:id/validate - Validate zone data
builderValidationRoutes.post('/zones/:id/validate', async (req: Request, res: Response) => {
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
    sendRouteError(res, error, 'Failed to validate', 'Failed to validate');
  }
});

// POST /api/builder/zones/:id/validate/exit - Quick validate an exit
builderValidationRoutes.post('/zones/:id/validate/exit', async (req: Request, res: Response) => {
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
    sendRouteError(res, error, 'Failed to validate exit', 'Failed to validate exit');
  }
});

// POST /api/builder/zones/:id/validate/object-values - Quick validate object values
builderValidationRoutes.post(
  '/zones/:id/validate/object-values',
  async (req: Request, res: Response) => {
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
      sendRouteError(
        res,
        error,
        'Failed to validate object values',
        'Failed to validate object values',
      );
    }
  },
);
