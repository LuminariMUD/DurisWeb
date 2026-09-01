import express from 'express';
import request from 'supertest';
import { beforeAll, beforeEach, describe, expect, it, jest } from '@jest/globals';

const requiredPermissions: string[] = [];
const setHookEnabled = jest.fn<(...args: unknown[]) => Promise<unknown>>();
const reconcileHook = jest.fn<(...args: unknown[]) => Promise<unknown>>();
const getHookStatuses = jest.fn<(...args: unknown[]) => Promise<unknown>>();
const getMudTransportStatus = jest.fn<(...args: unknown[]) => Promise<unknown>>();

class MockHookToggleError extends Error {
  constructor(
    message: string,
    readonly code: 'unknown_hook' | 'always_on',
  ) {
    super(message);
  }
}

const status = {
  hook: {
    id: 'auction_new',
    channel: 'bridge',
    direction: 'mud_to_web',
    alwaysOn: false,
    description: 'New auction events',
  },
  webEnabled: true,
  mudState: 'enabled',
  webProvenance: { actor: 'Operator', changedAt: '2026-09-01T10:00:00.000Z' },
  lastActivityAt: null,
  resource: null,
  effective: 'on',
  active: true,
  reason: 'Both ends are enabled.',
};

jest.unstable_mockModule('../../middleware/auth.js', () => ({
  requireAuth: (req: any, _res: any, next: any) => {
    req.user = { accountName: 'Operator' };
    next();
  },
  requirePermission: (permission: string) => {
    requiredPermissions.push(permission);
    return (_req: any, _res: any, next: any) => next();
  },
}));
jest.unstable_mockModule('../../hooks/hookSettingsService.js', () => ({
  getHookStatuses,
  setHookEnabled,
  HookToggleError: MockHookToggleError,
}));
jest.unstable_mockModule('../../hooks/registry.js', () => ({
  isHookId: (id: string) => id === 'auction_new' || id === 'terminal',
}));
jest.unstable_mockModule('../../hooks/mudHookStateClient.js', () => ({
  getMudReportReceivedAt: () => '2026-09-01T10:01:00.000Z',
}));
jest.unstable_mockModule('../../services/mudTransportStatus.js', () => ({
  getMudTransportStatus,
}));
jest.unstable_mockModule('../../services/hookReconcileService.js', () => ({
  reconcileHook,
}));
jest.unstable_mockModule('../../utils/logger.js', () => ({
  default: { error: jest.fn(), info: jest.fn(), warn: jest.fn() },
}));

describe('hook control route boundary', () => {
  let app: express.Express;

  beforeAll(async () => {
    const { default: hookRoutes } = await import('../hooks.js');
    app = express();
    app.use(express.json());
    app.use('/api/hooks', hookRoutes);
  });

  beforeEach(() => {
    jest.clearAllMocks();
    getHookStatuses.mockResolvedValue([status]);
    getMudTransportStatus.mockResolvedValue({
      scheme: 'wss',
      host: 'mud.example.invalid',
      port: '443',
      loopback: false,
      connected: true,
      authenticated: true,
      certificateExpiresAt: null,
      certificateStatus: 'unknown',
      secretRotatedAt: null,
      secretAgeDays: null,
      blocked: false,
      reason: null,
    });
    setHookEnabled.mockResolvedValue(status);
    reconcileHook.mockResolvedValue({ complete: true, warning: null, hook: status });
  });

  it('uses the MUD-properties permission for every hook endpoint', () => {
    expect(requiredPermissions).toEqual([
      'manage_mud_properties',
      'manage_mud_properties',
      'manage_mud_properties',
    ]);
  });

  it('returns sanitized status and transport metadata', async () => {
    const response = await request(app).get('/api/hooks');

    expect(response.status).toBe(200);
    expect(response.body.hooks[0]).toMatchObject({
      id: 'auction_new',
      provenance: {
        web: { actor: 'Operator' },
        mud: { source: 'authenticated_bridge' },
      },
    });
    expect(response.body.transport).toMatchObject({
      scheme: 'wss',
      host: 'mud.example.invalid',
      authenticated: true,
    });
    expect(response.body).not.toHaveProperty('secret');
    expect(response.body).not.toHaveProperty('url');
  });

  it.each([undefined, null, 1, 'true'])(
    'rejects a non-boolean reconcile value: %p',
    async (enabled) => {
      const response = await request(app)
        .post('/api/hooks/auction_new/reconcile')
        .send(enabled === undefined ? {} : { enabled });

      expect(response.status).toBe(400);
      expect(reconcileHook).not.toHaveBeenCalled();
    },
  );

  it('passes the authenticated actor to a valid reconcile request', async () => {
    const response = await request(app)
      .post('/api/hooks/auction_new/reconcile')
      .send({ enabled: false });

    expect(response.status).toBe(200);
    expect(reconcileHook).toHaveBeenCalledWith('auction_new', false, 'Operator');
  });

  it('maps immutable terminal reconciliation to a conflict', async () => {
    reconcileHook.mockRejectedValueOnce(
      new MockHookToggleError('Hook terminal is always on.', 'always_on'),
    );

    const response = await request(app)
      .post('/api/hooks/terminal/reconcile')
      .send({ enabled: false });

    expect(response.status).toBe(409);
    expect(response.body.error).toMatch(/always on/i);
  });
});
