import express from 'express';
import request from 'supertest';
import { beforeAll, beforeEach, describe, expect, it, jest } from '@jest/globals';

const saveSubscription = jest.fn<(...args: unknown[]) => Promise<number>>();
const removeSubscription = jest.fn<(...args: unknown[]) => Promise<boolean>>();
const getSubscriptions = jest.fn<(...args: unknown[]) => Promise<any[]>>();
const removeAllSubscriptions = jest.fn<(...args: unknown[]) => Promise<number>>();

jest.unstable_mockModule('../../middleware/auth.js', () => ({
  requireAuth: (req: any, res: any, next: any) => {
    if (req.headers['x-test-auth'] !== 'valid') {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }
    req.user = {
      accountName: 'Cwial',
      email: 'cwial@example.invalid',
      sessionId: 'push-session',
      permissions: {},
      adminPermissions: new Set(),
    };
    next();
  },
}));
jest.unstable_mockModule('../../services/pushNotificationService.js', () => ({
  default: {
    getVapidPublicKey: jest.fn(() => 'public-key'),
    isPushEnabled: jest.fn(() => true),
    saveSubscription,
    removeSubscription,
    getSubscriptions,
    removeAllSubscriptions,
  },
}));

describe('push notification authentication boundary', () => {
  let app: express.Express;

  beforeAll(async () => {
    const { default: pushRoutes } = await import('../push.js');
    app = express();
    app.use(express.json());
    app.use('/api/push', pushRoutes);
  });

  beforeEach(() => {
    jest.clearAllMocks();
    saveSubscription.mockResolvedValue(7);
    removeSubscription.mockResolvedValue(true);
    getSubscriptions.mockResolvedValue([]);
    removeAllSubscriptions.mockResolvedValue(1);
  });

  const subscription = {
    endpoint: 'https://push.example.invalid/subscription',
    keys: { p256dh: 'p256dh-key', auth: 'auth-key' },
  };

  it('requires the canonical auth middleware', async () => {
    const response = await request(app)
      .post('/api/push/subscribe')
      .send({ subscription });

    expect(response.status).toBe(401);
    expect(saveSubscription).not.toHaveBeenCalled();
  });

  it('uses the authenticated account principal for subscription writes', async () => {
    const response = await request(app)
      .post('/api/push/subscribe')
      .set('X-Test-Auth', 'valid')
      .set('User-Agent', 'push-test')
      .send({ subscription });

    expect(response.status).toBe(200);
    expect(saveSubscription).toHaveBeenCalledWith('Cwial', subscription, expect.any(String));
  });

  it('uses the authenticated principal for unsubscribe and remove-all operations', async () => {
    const unsubscribe = await request(app)
      .post('/api/push/unsubscribe')
      .set('X-Test-Auth', 'valid')
      .send({ endpoint: subscription.endpoint });
    const removeAll = await request(app)
      .delete('/api/push/subscriptions')
      .set('X-Test-Auth', 'valid')
      .send({});

    expect(unsubscribe.status).toBe(200);
    expect(removeSubscription).toHaveBeenCalledWith('Cwial', subscription.endpoint);
    expect(removeAll.status).toBe(200);
    expect(removeAllSubscriptions).toHaveBeenCalledWith('Cwial');
  });
});
