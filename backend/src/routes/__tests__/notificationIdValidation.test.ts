import express from 'express';
import request from 'supertest';
import { beforeAll, beforeEach, describe, expect, it, jest } from '@jest/globals';

const markAsRead = jest.fn<(...args: unknown[]) => Promise<void>>();
const markAllAsRead = jest.fn<(...args: unknown[]) => Promise<void>>();
const deleteNotification = jest.fn<(...args: unknown[]) => Promise<void>>();
const getNotifications = jest.fn<(...args: unknown[]) => Promise<unknown>>();
const getUnreadCount = jest.fn<(...args: unknown[]) => Promise<number>>();

jest.unstable_mockModule('../../middleware/auth.js', () => ({
  requireAuth: (req: any, _res: any, next: any) => {
    req.user = {
      accountName: 'Cwial',
      email: 'cwial@example.invalid',
      sessionId: 'notification-session',
      permissions: {},
      adminPermissions: new Set(),
    };
    next();
  },
}));
jest.unstable_mockModule('../../services/unifiedNotificationService.js', () => ({
  getNotifications,
  getUnreadCount,
  markAsRead,
  markAllAsRead,
  deleteNotification,
}));
jest.unstable_mockModule('../../utils/logger.js', () => ({
  getErrorMessage: (error: unknown) => String(error),
}));

describe('notification resource ID validation', () => {
  let app: express.Express;

  beforeAll(async () => {
    const { default: notificationRoutes } = await import('../notifications.js');
    app = express();
    app.use(express.json());
    app.use('/api/notifications', notificationRoutes);
  });

  beforeEach(() => {
    jest.clearAllMocks();
    getNotifications.mockResolvedValue({ notifications: [], total: 0 });
    getUnreadCount.mockResolvedValue(0);
    markAsRead.mockResolvedValue(undefined);
    markAllAsRead.mockResolvedValue(undefined);
    deleteNotification.mockResolvedValue(undefined);
  });

  it('rejects malformed IDs before direct read/delete service calls', async () => {
    const read = await request(app).post('/api/notifications/12abc/read');
    const deleted = await request(app).delete('/api/notifications/12abc');

    expect(read.status).toBe(400);
    expect(deleted.status).toBe(400);
    expect(markAsRead).not.toHaveBeenCalled();
    expect(deleteNotification).not.toHaveBeenCalled();
  });

  it('rejects malformed IDs on legacy notification routes', async () => {
    const read = await request(app).post('/api/notifications/forum/12abc/read');
    const deleted = await request(app).delete('/api/notifications/forum/12abc');

    expect(read.status).toBe(400);
    expect(deleted.status).toBe(400);
    expect(markAsRead).not.toHaveBeenCalled();
    expect(deleteNotification).not.toHaveBeenCalled();
  });

  it('passes the authenticated account principal on valid notification operations', async () => {
    const read = await request(app).post('/api/notifications/12/read');
    const deleted = await request(app).delete('/api/notifications/forum/13');

    expect(read.status).toBe(200);
    expect(markAsRead).toHaveBeenCalledWith(12, 'Cwial');
    expect(deleted.status).toBe(200);
    expect(deleteNotification).toHaveBeenCalledWith(13, 'Cwial');
  });
});
