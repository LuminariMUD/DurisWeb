import express from 'express';
import request from 'supertest';
import { beforeAll, beforeEach, describe, expect, it, jest } from '@jest/globals';

const poolQuery = jest.fn<(...args: unknown[]) => Promise<unknown>>();
const getZoneName = jest.fn<(...args: unknown[]) => Promise<string>>();

const procRequestService = {
  getProcRequests: jest.fn<(...args: unknown[]) => Promise<unknown>>(),
  createProcRequest: jest.fn<(...args: unknown[]) => Promise<unknown>>(),
  updateProcRequest: jest.fn<(...args: unknown[]) => Promise<unknown>>(),
  updateProcRequestStatus: jest.fn<(...args: unknown[]) => Promise<unknown>>(),
  deleteProcRequest: jest.fn<(...args: unknown[]) => Promise<unknown>>(),
};
const zoneCommentService = {
  getComments: jest.fn<(...args: unknown[]) => Promise<unknown>>(),
  createComment: jest.fn<(...args: unknown[]) => Promise<unknown>>(),
  updateComment: jest.fn<(...args: unknown[]) => Promise<unknown>>(),
  deleteComment: jest.fn<(...args: unknown[]) => Promise<unknown>>(),
};
const builderNotificationService = {
  getNotifications: jest.fn<(...args: unknown[]) => Promise<unknown>>(),
  getUnreadCount: jest.fn<(...args: unknown[]) => Promise<unknown>>(),
  markAsRead: jest.fn<(...args: unknown[]) => Promise<unknown>>(),
  markAllAsRead: jest.fn<(...args: unknown[]) => Promise<unknown>>(),
};

const asyncMock = () => jest.fn<(...args: unknown[]) => Promise<unknown>>();
const canAccessZone = jest.fn<(...args: unknown[]) => Promise<boolean>>();

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
jest.unstable_mockModule('../../db/connection.js', () => ({
  pool: { query: poolQuery },
}));
jest.unstable_mockModule('../../utils/logger.js', () => ({
  default: { error: jest.fn(), info: jest.fn(), warn: jest.fn() },
  getErrorMessage: (error: unknown) => String(error),
}));
jest.unstable_mockModule('../../utils/contentParser.js', () => ({
  processContentForWrite: (content: string) => ({ content }),
}));
jest.unstable_mockModule('../../utils/safeZonePath.js', () => ({
  UnsafeZonePathError: class UnsafeZonePathError extends Error {},
  resolveSafeZoneFilePath: jest.fn(),
}));
jest.unstable_mockModule('../../services/zoneBuilderParser.js', () => ({
  listZones: asyncMock(),
  getZoneMapData: asyncMock(),
  getRoomData: asyncMock(),
  getMobileData: asyncMock(),
  getObjectData: asyncMock(),
  parseZonFile: asyncMock(),
  getZonePositions: asyncMock(),
  saveZonePositions: asyncMock(),
  globalSearch: asyncMock(),
  getZoneName,
}));
jest.unstable_mockModule('../../services/zoneBuilderStreamer.js', () => ({
  countZoneItems: asyncMock(),
  streamRooms: async function* () {},
  streamMobs: async function* () {},
  streamObjects: async function* () {},
}));
jest.unstable_mockModule('../../services/zoneBuilderWriter.js', () => ({
  updateRoom: asyncMock(),
  createRoom: asyncMock(),
  deleteRoom: asyncMock(),
  updateMobile: asyncMock(),
  createMobile: asyncMock(),
  deleteMobile: asyncMock(),
  updateObject: asyncMock(),
  createObject: asyncMock(),
  deleteObject: asyncMock(),
  getNextVnum: asyncMock(),
  createZone: asyncMock(),
  deleteZone: asyncMock(),
  cloneZone: asyncMock(),
  cloneRoom: asyncMock(),
  writeZoneResets: asyncMock(),
}));
jest.unstable_mockModule('../../services/mudFlagParser.js', () => ({
  MudFlagParser: class MudFlagParser {},
}));
jest.unstable_mockModule('../../services/zoneBuilderValidator.js', () => ({
  validateRoom: asyncMock(),
  validateObject: asyncMock(),
  quickValidate: asyncMock(),
  clearValidationCache: jest.fn(),
}));
jest.unstable_mockModule('../../services/gitService.js', () => ({
  getZoneGitStatus: asyncMock(),
  commitZoneFiles: asyncMock(),
}));
jest.unstable_mockModule('../../services/zoneInfoService.js', () => ({
  default: {
    getAccessibleZoneIds: asyncMock(),
    canAccessZone,
    getZoneInfo: asyncMock(),
    upsertZoneInfo: asyncMock(),
    recordHistory: asyncMock(),
    getZonePermissions: asyncMock(),
    grantZonePermission: asyncMock(),
    revokeZonePermission: asyncMock(),
    getZoneInfoHistory: asyncMock(),
  },
}));
jest.unstable_mockModule('../../services/procRequestService.js', () => ({
  default: procRequestService,
}));
jest.unstable_mockModule('../../services/zoneCommentService.js', () => ({
  default: zoneCommentService,
}));
jest.unstable_mockModule('../../services/builderNotificationService.js', () => ({
  default: builderNotificationService,
}));
jest.unstable_mockModule('../../services/accountService.js', () => ({
  searchAccounts: asyncMock(),
}));

describe('builder child-resource ID validation', () => {
  let app: express.Express;

  beforeAll(async () => {
    const { default: builderRoutes } = await import('../builder.js');
    app = express();
    app.use(express.json());
    app.use('/api/builder', builderRoutes);
  });

  beforeEach(() => {
    jest.clearAllMocks();
    poolQuery.mockResolvedValue([[]]);
    getZoneName.mockResolvedValue('Zone A');
    procRequestService.updateProcRequest.mockResolvedValue(undefined);
    procRequestService.updateProcRequestStatus.mockResolvedValue(undefined);
    procRequestService.deleteProcRequest.mockResolvedValue(false);
    zoneCommentService.updateComment.mockResolvedValue(undefined);
    zoneCommentService.deleteComment.mockResolvedValue(false);
    builderNotificationService.markAsRead.mockResolvedValue(false);
  });

  it('rejects malformed proc-request IDs before update, status, or delete services', async () => {
    const update = await request(app)
      .put('/api/builder/zones/zone-a/proc-requests/12abc')
      .send({ title: 'Updated title' });
    const status = await request(app)
      .put('/api/builder/zones/zone-a/proc-requests/12abc/status')
      .send({ status: 'requested' });
    const deleted = await request(app).delete('/api/builder/zones/zone-a/proc-requests/12abc');

    expect(update.status).toBe(400);
    expect(status.status).toBe(400);
    expect(deleted.status).toBe(400);
    expect(procRequestService.updateProcRequest).not.toHaveBeenCalled();
    expect(procRequestService.updateProcRequestStatus).not.toHaveBeenCalled();
    expect(procRequestService.deleteProcRequest).not.toHaveBeenCalled();
  });

  it('rejects malformed comment IDs before update or delete services', async () => {
    const update = await request(app)
      .put('/api/builder/zones/zone-a/comments/12abc')
      .send({ content: 'Updated comment' });
    const deleted = await request(app).delete('/api/builder/zones/zone-a/comments/12abc');

    expect(update.status).toBe(400);
    expect(deleted.status).toBe(400);
    expect(zoneCommentService.updateComment).not.toHaveBeenCalled();
    expect(zoneCommentService.deleteComment).not.toHaveBeenCalled();
  });

  it('rejects malformed notification IDs before the builder notification service', async () => {
    const response = await request(app).put('/api/builder/notifications/12abc/read');

    expect(response.status).toBe(400);
    expect(builderNotificationService.markAsRead).not.toHaveBeenCalled();
  });

  it('preserves valid proc-request ID behavior', async () => {
    procRequestService.updateProcRequest.mockResolvedValueOnce({
      id: 12,
      entityType: 'room',
      vnum: 100,
      title: 'Updated title',
    });

    const response = await request(app)
      .put('/api/builder/zones/zone-a/proc-requests/12')
      .send({ title: 'Updated title' });

    expect(response.status).toBe(200);
    expect(procRequestService.updateProcRequest).toHaveBeenCalledWith(
      12,
      expect.objectContaining({ title: 'Updated title' }),
      'Cwial',
      'Zone A',
    );
  });
});
