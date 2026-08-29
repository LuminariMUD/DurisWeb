import express from 'express';
import request from 'supertest';
import { beforeAll, beforeEach, describe, expect, it, jest } from '@jest/globals';

const updateZone = jest.fn<(...args: unknown[]) => Promise<any>>();
const bulkUpdateZones = jest.fn<(...args: unknown[]) => Promise<number>>();
const logQuery = jest.fn<(...args: unknown[]) => Promise<unknown>>();

jest.unstable_mockModule('../../middleware/auth.js', () => ({
  requireAuth: (req: any, _res: any, next: any) => {
    req.user = {
      accountName: 'Cwial',
      email: 'cwial@example.invalid',
      sessionId: 'zone-test-session',
      permissions: {},
      adminPermissions: new Set(),
    };
    next();
  },
  requirePermission: () => (_req: any, _res: any, next: any) => next(),
}));
jest.unstable_mockModule('../../services/zoneService.js', () => ({
  getZones: jest.fn(),
  getZoneStats: jest.fn(),
  getZoneByNumber: jest.fn(),
  updateZone,
  bulkUpdateZones,
}));
jest.unstable_mockModule('../../db/connection.js', () => ({
  pool: { query: logQuery },
}));
jest.unstable_mockModule('../../utils/logger.js', () => ({
  default: { error: jest.fn(), info: jest.fn(), warn: jest.fn() },
}));

describe('zone mutation validation', () => {
  let app: express.Express;

  beforeAll(async () => {
    const { default: zoneRoutes } = await import('../zones.js');
    app = express();
    app.set('trust proxy', 1);
    app.use(express.json());
    app.use('/api/zones', zoneRoutes);
  });

  beforeEach(() => {
    jest.clearAllMocks();
    updateZone.mockResolvedValue({ number: 12, name: 'Test Zone' });
    bulkUpdateZones.mockResolvedValue(2);
    logQuery.mockResolvedValue([{ insertId: 1 }]);
  });

  it('rejects a non-canonical zone number before persistence', async () => {
    const response = await request(app)
      .put('/api/zones/12abc')
      .set('X-Forwarded-For', '10.0.3.10')
      .send({ alignment: 2 });

    expect(response.status).toBe(400);
    expect(updateZone).not.toHaveBeenCalled();
  });

  it('rejects string booleans and unknown update fields', async () => {
    const response = await request(app)
      .put('/api/zones/12')
      .set('X-Forwarded-For', '10.0.3.11')
      .send({ taskZone: 'false', unexpected: 1 });

    expect(response.status).toBe(400);
    expect(updateZone).not.toHaveBeenCalled();
  });

  it('accepts strict bounded single-zone updates', async () => {
    const response = await request(app)
      .put('/api/zones/12')
      .set('X-Forwarded-For', '10.0.3.12')
      .send({ alignment: 2, taskZone: false, difficulty: 4 });

    expect(response.status).toBe(200);
    expect(updateZone).toHaveBeenCalledWith(
      12,
      { alignment: 2, taskZone: false, difficulty: 4 },
      'Cwial',
    );
  });

  it('rejects partially invalid bulk zone IDs before persistence', async () => {
    const response = await request(app)
      .patch('/api/zones/bulk')
      .set('X-Forwarded-For', '10.0.3.13')
      .send({ zoneNumbers: [12, 'bad'], data: { questZone: false } });

    expect(response.status).toBe(400);
    expect(bulkUpdateZones).not.toHaveBeenCalled();
  });

  it('rate-limits repeated zone mutations from one client', async () => {
    let lastResponse;
    for (let attempt = 0; attempt < 31; attempt += 1) {
      lastResponse = await request(app)
        .put('/api/zones/12')
        .set('X-Forwarded-For', '10.0.3.14')
        .send({ alignment: 2 });
    }

    expect(lastResponse!.status).toBe(429);
    expect(updateZone).toHaveBeenCalledTimes(30);
  });
});
