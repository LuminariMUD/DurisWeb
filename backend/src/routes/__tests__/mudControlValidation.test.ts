import express from 'express';
import request from 'supertest';
import { beforeAll, beforeEach, describe, expect, it, jest } from '@jest/globals';

const startMud = jest.fn<(...args: unknown[]) => Promise<any>>();
const stopMud = jest.fn<(...args: unknown[]) => Promise<any>>();
const restartMud = jest.fn<(...args: unknown[]) => Promise<any>>();

jest.unstable_mockModule('../../middleware/auth.js', () => ({
  requireAuth: (req: any, _res: any, next: any) => {
    req.user = {
      accountName: 'Cwial',
      email: 'cwial@example.invalid',
      sessionId: 'mud-control-test-session',
      permissions: {},
      adminPermissions: new Set(),
    };
    next();
  },
  requirePermission: () => (_req: any, _res: any, next: any) => next(),
}));
jest.unstable_mockModule('../../services/mudControlService.js', () => ({
  getMudState: jest.fn(),
  startMud,
  stopMud,
  restartMud,
}));
jest.unstable_mockModule('../../utils/logger.js', () => ({
  default: { error: jest.fn(), info: jest.fn(), warn: jest.fn() },
}));

describe('MUD control write validation', () => {
  let app: express.Express;

  beforeAll(async () => {
    const { default: mudControlRoutes } = await import('../mudControl.js');
    app = express();
    app.set('trust proxy', 1);
    app.use(express.json());
    app.use('/api/mud', mudControlRoutes);
  });

  beforeEach(() => {
    jest.clearAllMocks();
    startMud.mockResolvedValue({ success: true, message: 'started', logId: 1 });
    stopMud.mockResolvedValue({ success: true, message: 'stopped', logId: 2 });
    restartMud.mockResolvedValue({ success: true, message: 'restarted', logId: 3 });
  });

  it('rejects an oversized stop reason before invoking control', async () => {
    const response = await request(app)
      .post('/api/mud/stop')
      .set('X-Forwarded-For', '10.0.2.10')
      .send({ reason: 'x'.repeat(1001) });

    expect(response.status).toBe(400);
    expect(stopMud).not.toHaveBeenCalled();
  });

  it('rejects non-string and unknown stop fields before invoking control', async () => {
    const response = await request(app)
      .post('/api/mud/stop')
      .set('X-Forwarded-For', '10.0.2.11')
      .send({ reason: 123, unexpected: 'nope' });

    expect(response.status).toBe(400);
    expect(stopMud).not.toHaveBeenCalled();
  });

  it('accepts a bounded reason and preserves the control call', async () => {
    const response = await request(app)
      .post('/api/mud/restart')
      .set('X-Forwarded-For', '10.0.2.12')
      .send({ reason: 'Apply local test restart' });

    expect(response.status).toBe(200);
    expect(restartMud).toHaveBeenCalledWith('Cwial', expect.any(String), 'Apply local test restart');
  });

  it('rate-limits repeated stop requests from one client', async () => {
    let lastResponse;
    for (let attempt = 0; attempt < 11; attempt += 1) {
      lastResponse = await request(app)
        .post('/api/mud/stop')
        .set('X-Forwarded-For', '10.0.2.13')
        .send({ reason: 'bounded test reason' });
    }

    expect(lastResponse!.status).toBe(429);
    expect(stopMud).toHaveBeenCalledTimes(10);
  });
});
