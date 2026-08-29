import express from 'express';
import request from 'supertest';
import { beforeAll, beforeEach, describe, expect, it, jest } from '@jest/globals';

const getZoneByNumber = jest.fn<(...args: unknown[]) => Promise<unknown>>();

jest.unstable_mockModule('../../middleware/auth.js', () => ({
  requireAuth: (req: any, _res: any, next: any) => {
    req.user = {
      accountName: 'Cwial',
      permissions: { role: 'overlord' },
      adminPermissions: new Set(['manage_zones']),
    };
    next();
  },
  requirePermission: () => (_req: any, _res: any, next: any) => next(),
}));
jest.unstable_mockModule('../../services/zoneService.js', () => ({
  getZoneByNumber,
}));
jest.unstable_mockModule('../../db/connection.js', () => ({
  pool: { query: jest.fn() },
}));
jest.unstable_mockModule('../../utils/logger.js', () => ({
  default: { error: jest.fn(), info: jest.fn(), warn: jest.fn() },
  getErrorMessage: (error: unknown) => String(error),
}));

describe('zone resource ID validation', () => {
  let app: express.Express;

  beforeAll(async () => {
    const { default: zoneRoutes } = await import('../zones.js');
    app = express();
    app.use('/api/zones', zoneRoutes);
  });

  beforeEach(() => {
    jest.clearAllMocks();
    getZoneByNumber.mockResolvedValue(null);
  });

  it('rejects non-canonical zone IDs before the detail lookup', async () => {
    const response = await request(app).get('/api/zones/1e2');

    expect(response.status).toBe(400);
    expect(getZoneByNumber).not.toHaveBeenCalled();
  });

  it('preserves valid zone detail lookups', async () => {
    getZoneByNumber.mockResolvedValueOnce({ number: 100, name: 'Zone 100' });

    const response = await request(app).get('/api/zones/100');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ number: 100, name: 'Zone 100' });
    expect(getZoneByNumber).toHaveBeenCalledWith(100);
  });
});
