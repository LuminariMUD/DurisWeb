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
const overlord = {
  accountName: 'Cwial',
  permissions: { role: 'overlord' },
  adminPermissions: new Set(['manage_zones']),
};
let testUser: object = overlord;

jest.unstable_mockModule('../../../middleware/auth.js', () => ({
  requireAuth: (req: any, _res: any, next: any) => {
    req.user = testUser;
    next();
  },
  requirePermission: () => (_req: any, _res: any, next: any) => next(),
}));
jest.unstable_mockModule('../../../db/connection.js', () => ({
  pool: { query: poolQuery },
}));
jest.unstable_mockModule('../../../utils/logger.js', () => ({
  default: { error: jest.fn(), info: jest.fn(), warn: jest.fn() },
  getErrorMessage: (error: unknown) => (error instanceof Error ? error.message : String(error)),
}));
jest.unstable_mockModule('../../../utils/contentParser.js', () => ({
  processContentForWrite: (content: string) => ({ content }),
}));
jest.unstable_mockModule('../../../utils/safeZonePath.js', () => ({
  UnsafeZonePathError: class UnsafeZonePathError extends Error {},
  resolveSafeZoneFilePath: jest.fn(),
}));
jest.unstable_mockModule('../../../services/zoneBuilderParser.js', () => ({
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
jest.unstable_mockModule('../../../services/zoneBuilderStreamer.js', () => ({
  countZoneItems: asyncMock(),
  streamRooms: async function* () {},
  streamMobs: async function* () {},
  streamObjects: async function* () {},
}));
jest.unstable_mockModule('../../../services/zoneBuilderWriter.js', () => ({
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
jest.unstable_mockModule('../../../services/mudFlagParser.js', () => ({
  MudFlagParser: class MudFlagParser {},
}));
jest.unstable_mockModule('../../../services/zoneBuilderValidator.js', () => ({
  validateRoom: asyncMock(),
  validateObject: asyncMock(),
  quickValidate: asyncMock(),
  clearValidationCache: jest.fn(),
}));
jest.unstable_mockModule('../../../services/gitService.js', () => ({
  getZoneGitStatus: asyncMock(),
  commitZoneFiles: asyncMock(),
}));
jest.unstable_mockModule('../../../services/zoneInfoService.js', () => ({
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
jest.unstable_mockModule('../../../services/procRequestService.js', () => ({
  default: procRequestService,
}));
jest.unstable_mockModule('../../../services/zoneCommentService.js', () => ({
  default: zoneCommentService,
}));
jest.unstable_mockModule('../../../services/builderNotificationService.js', () => ({
  default: builderNotificationService,
}));
jest.unstable_mockModule('../../../services/accountService.js', () => ({
  searchAccounts: asyncMock(),
}));

describe('builder child-resource ID validation', () => {
  let app: express.Express;

  beforeAll(async () => {
    const { builderRouter: builderRoutes } = await import('../routes.js');
    app = express();
    app.use(express.json());
    app.use('/api/builder', builderRoutes);
  });

  beforeEach(() => {
    jest.clearAllMocks();
    testUser = overlord;
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
      'zone-a',
      12,
      expect.objectContaining({ title: 'Updated title' }),
      'Cwial',
      'Zone A',
    );
  });

  it('scopes proc-request writes to the URL zone and logs nothing for a foreign ID', async () => {
    procRequestService.updateProcRequest.mockResolvedValueOnce(null);
    procRequestService.updateProcRequestStatus.mockResolvedValueOnce(null);
    procRequestService.deleteProcRequest.mockResolvedValueOnce(false);

    const update = await request(app)
      .put('/api/builder/zones/zone-a/proc-requests/12')
      .send({ title: 'Updated title' });
    const status = await request(app)
      .put('/api/builder/zones/zone-a/proc-requests/12/status')
      .send({ status: 'completed' });
    const deleted = await request(app).delete('/api/builder/zones/zone-a/proc-requests/12');

    expect([update.status, status.status, deleted.status]).toEqual([404, 404, 404]);
    expect(procRequestService.updateProcRequest.mock.calls[0].slice(0, 2)).toEqual(['zone-a', 12]);
    expect(procRequestService.updateProcRequestStatus.mock.calls[0].slice(0, 2)).toEqual([
      'zone-a',
      12,
    ]);
    expect(procRequestService.deleteProcRequest).toHaveBeenCalledWith('zone-a', 12);
    expect(poolQuery).not.toHaveBeenCalledWith(
      expect.stringContaining('builder_activity_log'),
      expect.anything(),
    );
  });

  it.each([7, true, {}, [], 'x'.repeat(51)])(
    'rejects malformed assignees before either mutation service: %p',
    async (assignedTo) => {
      const update = await request(app)
        .put('/api/builder/zones/zone-a/proc-requests/12')
        .send({ assignedTo });
      const status = await request(app)
        .put('/api/builder/zones/zone-a/proc-requests/12/status')
        .send({ status: 'assigned', assignedTo });

      expect([update.status, status.status]).toEqual([400, 400]);
      expect(procRequestService.updateProcRequest).not.toHaveBeenCalled();
      expect(procRequestService.updateProcRequestStatus).not.toHaveBeenCalled();
    },
  );

  it.each([null, 'Someone'])('preserves assignment and unassignment: %p', async (assignedTo) => {
    procRequestService.updateProcRequest.mockResolvedValueOnce({ id: 12, title: 'T' });
    procRequestService.updateProcRequestStatus.mockResolvedValueOnce({ id: 12 });
    const update = await request(app)
      .put('/api/builder/zones/zone-a/proc-requests/12')
      .send({ assignedTo });
    const status = await request(app)
      .put('/api/builder/zones/zone-a/proc-requests/12/status')
      .send({ status: 'assigned', assignedTo });
    expect([update.status, status.status]).toEqual([200, 200]);
    expect(procRequestService.updateProcRequest.mock.calls[0][2]).toEqual({ assignedTo });
    expect(procRequestService.updateProcRequestStatus.mock.calls[0][3]).toBe(assignedTo);
  });

  it('validates status and entity type on the general proc-request update', async () => {
    const badStatus = await request(app)
      .put('/api/builder/zones/zone-a/proc-requests/12')
      .send({ status: 'bogus' });
    const badType = await request(app)
      .put('/api/builder/zones/zone-a/proc-requests/12')
      .send({ entityType: 'zone' });

    expect([badStatus.status, badType.status]).toEqual([400, 400]);
    expect(procRequestService.updateProcRequest).not.toHaveBeenCalled();
  });

  it('scopes comment writes to the URL zone and logs nothing for a foreign ID', async () => {
    zoneCommentService.updateComment.mockResolvedValueOnce(null);

    const update = await request(app)
      .put('/api/builder/zones/zone-a/comments/9')
      .send({ content: 'Edited' });
    const deleted = await request(app).delete('/api/builder/zones/zone-a/comments/9');

    expect([update.status, deleted.status]).toEqual([404, 404]);
    expect(zoneCommentService.updateComment).toHaveBeenCalledWith(
      'zone-a',
      9,
      expect.objectContaining({ content: 'Edited' }),
      'Cwial',
      true,
    );
    expect(zoneCommentService.deleteComment).toHaveBeenCalledWith('zone-a', 9, 'Cwial', true);
    expect(poolQuery).not.toHaveBeenCalledWith(
      expect.stringContaining('builder_activity_log'),
      expect.anything(),
    );
  });

  it('grants comment moderation from zone-level manage, not from view access', async () => {
    testUser = { accountName: 'Builder', permissions: {}, adminPermissions: new Set() };
    canAccessZone.mockImplementation(async (...args) => args[2] !== 'manage');
    zoneCommentService.deleteComment.mockRejectedValueOnce(
      new Error('Not authorized to delete this comment'),
    );

    const denied = await request(app).delete('/api/builder/zones/zone-a/comments/9');

    expect(denied.status).toBe(403);
    expect(zoneCommentService.deleteComment).toHaveBeenCalledWith('zone-a', 9, 'Builder', false);

    canAccessZone.mockResolvedValue(true);
    zoneCommentService.deleteComment.mockResolvedValueOnce(true);
    const moderated = await request(app).delete('/api/builder/zones/zone-a/comments/9');

    expect(moderated.status).toBe(200);
    expect(zoneCommentService.deleteComment).toHaveBeenLastCalledWith('zone-a', 9, 'Builder', true);
  });

  it('rejects malformed or foreign comment references on create with 400', async () => {
    const malformed = await request(app)
      .post('/api/builder/zones/zone-a/comments')
      .send({ content: 'hi', parentId: '5abc' });
    expect(malformed.status).toBe(400);
    expect(zoneCommentService.createComment).not.toHaveBeenCalled();

    zoneCommentService.createComment.mockRejectedValueOnce(new Error('Proc request not found'));
    const foreign = await request(app)
      .post('/api/builder/zones/zone-a/comments')
      .send({ content: 'hi', procRequestId: 4 });

    expect(foreign.status).toBe(400);
    expect(zoneCommentService.createComment).toHaveBeenCalledWith(
      expect.objectContaining({ zoneId: 'zone-a', parentId: null, procRequestId: 4 }),
      'Cwial',
      'Zone A',
    );
  });

  it('returns 400 for a parent from a different discussion', async () => {
    zoneCommentService.createComment.mockRejectedValueOnce(
      new Error('Parent comment belongs to another discussion'),
    );
    const response = await request(app)
      .post('/api/builder/zones/zone-a/comments')
      .send({ content: 'reply', parentId: 9 });
    expect(response.status).toBe(400);
    expect(response.body.error).toBe('Parent comment belongs to another discussion');
  });
});
