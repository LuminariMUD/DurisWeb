import express from 'express';
import type { Request, Response, NextFunction } from 'express';
import request from 'supertest';
import mysql from 'mysql2/promise';
import type { RowDataPacket } from 'mysql2/promise';
import { loadWebBaselineBundle } from '../../db/webBaselineBundle.js';
import { getBackendConfiguration } from '../../config/environment.js';
import { BackupDeletionError } from '../../utils/backupDeletionError.js';
import { beforeAll, beforeEach, describe, expect, it, jest } from '@jest/globals';

const assignRole = jest.fn<(...args: unknown[]) => Promise<unknown>>();
const revokeRole = jest.fn<(...args: unknown[]) => Promise<unknown>>();
const grantPermission = jest.fn<(...args: unknown[]) => Promise<unknown>>();
const revokePermission = jest.fn<(...args: unknown[]) => Promise<unknown>>();
const createRole = jest.fn<(...args: unknown[]) => Promise<unknown>>();
const updateRole = jest.fn<(...args: unknown[]) => Promise<unknown>>();
const poolQuery = jest.fn<(...args: unknown[]) => Promise<unknown>>();
const getDeliveryStatus = jest.fn<() => Promise<unknown>>();
const retryDeliveries = jest.fn<() => Promise<boolean>>();
let authenticated = true;
let authorized = true;
const permissionChecks: string[] = [];

const asyncMock = () => jest.fn<(...args: unknown[]) => Promise<unknown>>();
const namedService = (names: string[]): Record<string, unknown> =>
  Object.fromEntries(names.map((name) => [name, asyncMock()]));

jest.unstable_mockModule('../../middleware/auth.js', () => ({
  requireAuth: (req: any, _res: any, next: any) => {
    if (!authenticated) return _res.status(401).json({ error: 'Not authenticated' });
    req.user = {
      accountName: 'Operator',
      permissions: { role: 'overlord' },
      adminPermissions: new Set(['manage_front_page']),
    };
    next();
  },
  requireOverlord: (_req: any, _res: any, next: any) => next(),
  requirePermission: (key: string) => (_req: Request, res: Response, next: NextFunction) => {
    permissionChecks.push(key);
    if (!authorized) return res.status(403).json({ error: 'Forbidden' });
    return next();
  },
}));
jest.unstable_mockModule('../../utils/logger.js', () => ({
  default: { error: jest.fn(), info: jest.fn(), warn: jest.fn() },
  getErrorMessage: (error: unknown) => String(error),
}));
jest.unstable_mockModule('../../services/unifiedNotificationService.js', () => ({
  createNotification: asyncMock(),
}));
jest.unstable_mockModule('../../services/forumSettingsService.js', () =>
  namedService([
    'getForumSettings',
    'updateForumSetting',
    'getCategoryPermissions',
    'updateCategoryPermissions',
    'getPermissionAuditLog',
  ]),
);
jest.unstable_mockModule('../../services/webSettingsService.js', () =>
  namedService([
    'getWebSettingsRaw',
    'updateWebSetting',
    'uploadSiteLogo',
    'deleteSiteLogo',
    'validateLogoFile',
    'uploadHeroImage',
    'deleteHeroImage',
    'validateHeroFile',
  ]),
);
jest.unstable_mockModule('../../services/categoryService.js', () =>
  namedService([
    'getAllCategoriesAdmin',
    'getCategoryByIdAdmin',
    'createCategory',
    'updateCategory',
    'archiveCategory',
    'restoreCategory',
    'deleteCategoryPermanent',
    'reorderCategories',
    'addPermission',
    'removePermission',
    'getCategoryPermissions',
    'getArchivedCategories',
  ]),
);
jest.unstable_mockModule('../../services/forumService.js', () =>
  namedService(['getDeletedThreads', 'getDeletedPosts']),
);
jest.unstable_mockModule('../../services/analyticsService.js', () =>
  namedService([
    'getOverviewStats',
    'getForumStats',
    'getPvPStats',
    'getPlayerStats',
    'getPlayerActivity',
    'getWhoList',
  ]),
);
jest.unstable_mockModule('../../services/serverMonitor.js', () => ({
  getServerHealth: asyncMock(),
}));
jest.unstable_mockModule('../../services/statisticsParser.js', () => ({
  getPeakPlayerCount: asyncMock(),
}));
jest.unstable_mockModule('../../services/processMonitor.js', () => ({
  getDmsProcessStats: asyncMock(),
}));
jest.unstable_mockModule('../../services/mudControlService.js', () => ({
  getMudState: asyncMock(),
}));
jest.unstable_mockModule('../../services/logService.js', () =>
  namedService(['listLogs', 'readLogPaginated', 'tailLog', 'getLogFilePath']),
);
jest.unstable_mockModule('../../db/connection.js', () => ({
  pool: { query: poolQuery, execute: poolQuery },
}));
jest.unstable_mockModule('../../services/mudAuctionClient.js', () =>
  namedService(['requestWhoList', 'isMudConnected', 'getMudBootTime']),
);
jest.unstable_mockModule('../../services/onlinePlayersService.js', () => ({
  getOnlinePlayers: asyncMock(),
}));
jest.unstable_mockModule('../../services/propertiesParser.js', () =>
  namedService([
    'getCategorizedProperties',
    'searchProperties',
    'updateProperty',
    'validatePropertyValue',
    'getPropertyHistory',
  ]),
);
jest.unstable_mockModule('../../services/backupService.js', () =>
  namedService([
    'createBackup',
    'getBackupList',
    'getBackupById',
    'getBackupFilePath',
    'deleteBackup',
    'deleteFailedBackups',
    'listBackupContents',
    'createRestore',
    'getRestoreById',
    'getRestoreList',
    'isMudRunning',
    'validateUploadedBackup',
    'createRestoreFromUpload',
    'deleteUploadedBackup',
  ]),
);
jest.unstable_mockModule('../../services/mudTimeService.js', () =>
  namedService(['getCurrentMudTime', 'formatMudTime', 'getMudTimeDescription']),
);
jest.unstable_mockModule('../../services/adminPermissionService.js', () => ({
  ...namedService([
    'getAllPermissions',
    'getAllRoles',
    'getRoleById',
    'deleteRole',
    'getAccountPermissions',
    'getUserPermissions',
  ]),
  createRole,
  updateRole,
  assignRole,
  revokeRole,
  grantPermission,
  revokePermission,
}));
jest.unstable_mockModule('../../services/accountService.js', () => ({
  searchAccounts: asyncMock(),
  accountExists: asyncMock(),
  updateAccountPassword: asyncMock(),
}));
jest.unstable_mockModule('bcrypt', () => ({
  default: { hash: asyncMock(), compare: asyncMock() },
}));
jest.unstable_mockModule('../../services/permissionService.js', () => ({
  getGodLevelFromCharacterLevel: jest.fn(),
}));
jest.unstable_mockModule('../../utils/incidentValidation.js', () => ({
  INCIDENT_UPDATE_FIELDS: [],
  validateCreateIncidentBody: jest.fn(),
  validateUpdateIncidentBody: jest.fn(),
}));
jest.unstable_mockModule('../../services/dupeDetectionService.js', () =>
  namedService([
    'getDupedItems',
    'getDupeDetails',
    'getDupeSummary',
    'deletePlayerItem',
    'deleteLockerItem',
    'deletePlayerItems',
    'deleteAllDupesForUid',
  ]),
);
jest.unstable_mockModule('../../services/discordService.js', () => ({
  testDiscordBot: asyncMock(),
}));
jest.unstable_mockModule('../../services/pvpDiscordDelivery.js', () => ({
  manualPostBattle: asyncMock(),
  getDiscordDeliveryStatus: getDeliveryStatus,
  retryFailedDiscordDeliveries: retryDeliveries,
}));

describe('admin account permission ID validation', () => {
  let app: express.Express;

  beforeAll(async () => {
    const { default: adminRoutes } = await import('../admin.js');
    app = express();
    app.use(express.json());
    app.use('/api/admin', adminRoutes);
  });

  beforeEach(() => {
    jest.clearAllMocks();
    authenticated = true;
    authorized = true;
    permissionChecks.length = 0;
    getDeliveryStatus.mockResolvedValue({ pending: 2, failed: 1 });
    retryDeliveries.mockResolvedValue(true);
    assignRole.mockResolvedValue(undefined);
    revokeRole.mockResolvedValue(undefined);
    grantPermission.mockResolvedValue(undefined);
    revokePermission.mockResolvedValue(undefined);
    createRole.mockResolvedValue(7);
    updateRole.mockResolvedValue(undefined);
    poolQuery.mockResolvedValue([[]]);
  });

  const baselinePorts = (process.env.TEST_BASELINE_DB_PORTS ?? '')
    .split(',')
    .filter(Boolean)
    .map(Number);
  if (
    baselinePorts.some(
      (port) =>
        !Number.isInteger(port) ||
        port < 1024 ||
        port > 65535 ||
        [3306, 3307, 13306].includes(port),
    )
  ) {
    throw new Error('TEST_BASELINE_DB_PORTS must select disposable loopback servers');
  }
  for (const port of baselinePorts) {
    it(`serves and updates only crash incidents on the canonical schema at port ${port}`, async () => {
      const connection = await mysql.createConnection({
        host: '127.0.0.1',
        port,
        user: 'root',
        dateStrings: true,
      });
      const database = `durisweb_admin_crash_baseline_${process.pid}`;
      let created = false;
      try {
        await connection.query(
          `CREATE DATABASE ${database} CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`,
        );
        created = true;
        await connection.changeUser({ database });
        const table = loadWebBaselineBundle().tables.find(
          ({ name }) => name === 'server_incidents',
        );
        if (!table) throw new Error('Missing canonical incident schema');
        await connection.query(table.sql);
        await connection.query(`INSERT INTO server_incidents (id, started_at, incident_type, title, analyzed) VALUES
          (1, '2026-10-16 10:00:00', 'crash', 'Synthetic crash', 0),
          (2, '2026-10-16 11:00:00', 'crash', 'Reviewed crash', 1),
          (3, '2026-10-16 12:00:00', 'maintenance', 'Maintenance', 0)`);
        poolQuery.mockImplementation(async (sql, values) => {
          if (typeof sql !== 'string' || (values !== undefined && !Array.isArray(values))) {
            throw new Error('Expected parameterized SQL');
          }
          return connection.query(sql, values);
        });
        const list = await request(app).get('/api/admin/crashes?analyzed=false');
        expect(list.status).toBe(200);
        expect(list.body.pagination.total).toBe(1);
        expect(list.body.crashes).toHaveLength(1);
        expect(list.body.crashes[0]).toMatchObject({
          id: 1,
          crash_timestamp: '2026-10-16T10:00:00Z',
        });
        const detail = await request(app).get('/api/admin/crashes/1');
        expect(detail.status).toBe(200);
        expect(detail.body.crash.crash_timestamp).toBe('2026-10-16T10:00:00Z');
        expect((await request(app).get('/api/admin/crashes/3')).status).toBe(404);
        expect(
          (
            await request(app)
              .patch('/api/admin/crashes/1')
              .send({ analyzed: true, notes: 'Reviewed synthetic crash' })
          ).status,
        ).toBe(200);
        await request(app)
          .patch('/api/admin/crashes/3')
          .send({ analyzed: true, notes: 'Must not change maintenance' });
        const [rows] = await connection.query<RowDataPacket[]>(
          'SELECT id, analyzed, notes FROM server_incidents WHERE id IN (1,3) ORDER BY id',
        );
        expect(rows).toEqual([
          { id: 1, analyzed: 1, notes: 'Reviewed synthetic crash' },
          { id: 3, analyzed: 0, notes: null },
        ]);
      } finally {
        if (created) await connection.query(`DROP DATABASE ${database}`);
        await connection.end();
      }
    }, 60000);
  }

  it('protects delivery status and retry with authentication and manage_front_page permission', async () => {
    authenticated = false;
    expect((await request(app).get('/api/admin/discord/delivery')).status).toBe(401);
    expect((await request(app).post('/api/admin/discord/delivery/retry')).status).toBe(401);
    authenticated = true;
    authorized = false;
    expect((await request(app).get('/api/admin/discord/delivery')).status).toBe(403);
    expect((await request(app).post('/api/admin/discord/delivery/retry')).status).toBe(403);
    expect(permissionChecks).toEqual(['manage_front_page', 'manage_front_page']);
    expect(getDeliveryStatus).not.toHaveBeenCalled();
    expect(retryDeliveries).not.toHaveBeenCalled();
  });

  it('returns uncached status and queues retries only through the explicit action', async () => {
    const status = await request(app).get('/api/admin/discord/delivery');
    expect(status.status).toBe(200);
    expect(status.headers['cache-control']).toBe('no-store');
    expect(status.body).toEqual({ pending: 2, failed: 1 });
    expect(retryDeliveries).not.toHaveBeenCalled();
    expect((await request(app).post('/api/admin/discord/delivery/retry')).body).toEqual({
      success: true,
    });
    expect(retryDeliveries).toHaveBeenCalledTimes(1);
    retryDeliveries.mockResolvedValue(false);
    expect((await request(app).post('/api/admin/discord/delivery/retry')).status).toBe(409);
  });

  it('reports unavailable state without exposing database errors as an empty healthy queue', async () => {
    getDeliveryStatus.mockRejectedValueOnce(new Error('private credentials'));
    const status = await request(app).get('/api/admin/discord/delivery');
    expect(status.status).toBe(503);
    expect(JSON.stringify(status.body)).not.toContain('private');
    retryDeliveries.mockRejectedValueOnce(new Error('private credentials'));
    const retry = await request(app).post('/api/admin/discord/delivery/retry');
    expect(retry.status).toBe(503);
    expect(JSON.stringify(retry.body)).not.toContain('private');
  });

  it('rejects malformed role and permission IDs before privileged mutations', async () => {
    const roleGrant = await request(app)
      .post('/api/admin/accounts/Target/roles')
      .send({ roleId: '12abc' });
    const roleRevoke = await request(app).delete('/api/admin/accounts/Target/roles/12abc');
    const permissionGrant = await request(app)
      .post('/api/admin/accounts/Target/permissions')
      .send({ permissionId: '12abc' });
    const permissionRevoke = await request(app).delete(
      '/api/admin/accounts/Target/permissions/12abc',
    );

    expect(roleGrant.status).toBe(400);
    expect(roleRevoke.status).toBe(400);
    expect(permissionGrant.status).toBe(400);
    expect(permissionRevoke.status).toBe(400);
    expect(assignRole).not.toHaveBeenCalled();
    expect(revokeRole).not.toHaveBeenCalled();
    expect(grantPermission).not.toHaveBeenCalled();
    expect(revokePermission).not.toHaveBeenCalled();
  });

  it('preserves numeric JSON role IDs for assignment', async () => {
    const response = await request(app)
      .post('/api/admin/accounts/Target/roles')
      .send({ roleId: 12 });

    expect(response.status).toBe(200);
    expect(assignRole).toHaveBeenCalledWith('Target', 12, 'Operator', expect.anything());
  });

  it('rejects malformed role permission arrays before role persistence', async () => {
    const create = await request(app)
      .post('/api/admin/roles')
      .send({ name: 'Editor', permissionIds: ['12abc'] });
    const update = await request(app)
      .put('/api/admin/roles/1')
      .send({ name: 'Editor', permissionIds: [12, '12abc'] });

    expect(create.status).toBe(400);
    expect(update.status).toBe(400);
    expect(createRole).not.toHaveBeenCalled();
    expect(updateRole).not.toHaveBeenCalled();
  });

  it.each(['/backup/1', '/backup/failed'])(
    'reports a retained archive failure safely for %s',
    async (route) => {
      const backups = await import('../../services/backupService.js');
      const remove =
        route === '/backup/failed'
          ? jest.mocked(backups.deleteFailedBackups)
          : jest.mocked(backups.deleteBackup);
      remove.mockRejectedValueOnce(new BackupDeletionError('file_removal_unconfirmed'));
      const response = await request(app).delete('/api/admin' + route);
      expect(response.status).toBe(503);
      expect(response.body).toMatchObject({ reason: 'file_removal_unconfirmed' });
      expect(response.body).not.toHaveProperty('success');
      expect(response.body).not.toHaveProperty('deletedCount');
      expect(JSON.stringify(response.body)).not.toContain('private-driver');
    },
  );

  it.each(['/backup/1', '/backup/failed'])(
    'does not expose unexpected deletion errors for %s',
    async (route) => {
      const backups = await import('../../services/backupService.js');
      const remove =
        route === '/backup/failed'
          ? jest.mocked(backups.deleteFailedBackups)
          : jest.mocked(backups.deleteBackup);
      remove.mockRejectedValueOnce(new Error('private-driver-password-path-sentinel'));
      const response = await request(app).delete('/api/admin' + route);
      expect(response.status).toBe(503);
      expect(response.body).toMatchObject({ reason: 'storage_unavailable' });
      expect(JSON.stringify(response.body)).not.toContain('private-driver');
      const { default: logger } = await import('../../utils/logger.js');
      expect(JSON.stringify(jest.mocked(logger.error).mock.calls)).not.toContain('private-driver');
    },
  );

  it.each(['archive_held', 'removal_in_progress', 'recovery_unverified'] as const)(
    'keeps a %s archive conflict truthful and reviewable',
    async (reason) => {
      const backups = await import('../../services/backupService.js');
      jest.mocked(backups.deleteBackup).mockRejectedValueOnce(new BackupDeletionError(reason));
      const response = await request(app).delete('/api/admin/backup/1');
      expect(response.status).toBe(409);
      expect(response.body).toMatchObject({ reason });
      expect(response.body).not.toHaveProperty('success');
      expect(response.body.reference).toMatch(/^[a-f0-9-]{36}$/);
    },
  );

  it('preserves bounded numeric role permission arrays', async () => {
    const response = await request(app)
      .post('/api/admin/roles')
      .send({ name: 'Editor', permissionIds: [1, 2] });

    expect(response.status).toBe(201);
    expect(createRole).toHaveBeenCalledWith('Editor', null, [1, 2], 'Operator');
  });

  it.each(['/backup/restore', '/backup/upload/restore'])(
    'refuses %s even with the old unsafe switch enabled before storage or restore services',
    async (route) => {
      const configuration = getBackendConfiguration();
      const prior = configuration.unsafeMutations.databaseRestore;
      configuration.unsafeMutations.databaseRestore = true;
      try {
        for (const restoreType of ['full', 'account', 'character']) {
          const response = await request(app)
            .post('/api/admin' + route)
            .send({
              backupId: 1,
              tempPath: '/private-archive-sentinel',
              restoreType,
              accounts: ['SyntheticSubject'],
              characters: [{ pid: 1, name: 'SyntheticCharacter' }],
            });
          expect(response.status).toBe(503);
          expect(response.body).toMatchObject({
            error: 'operation_gated',
            gate: 'databaseRestore',
          });
          expect(response.body).not.toHaveProperty('enableWith');
          expect(JSON.stringify(response.body)).not.toContain('private-archive-sentinel');
        }
        expect(permissionChecks).toEqual(Array(3).fill('manage_mud_backup'));
        expect(poolQuery).not.toHaveBeenCalled();
        const backups = await import('../../services/backupService.js');
        expect(backups.createRestore).not.toHaveBeenCalled();
        expect(backups.createRestoreFromUpload).not.toHaveBeenCalled();
        expect(backups.isMudRunning).not.toHaveBeenCalled();
      } finally {
        configuration.unsafeMutations.databaseRestore = prior;
      }
    },
  );

  it.each(['/backup/restore', '/backup/upload/restore'])(
    'retains authentication and backup permission checks for unavailable %s',
    async (route) => {
      authenticated = false;
      expect(
        (
          await request(app)
            .post('/api/admin' + route)
            .send({})
        ).status,
      ).toBe(401);
      expect(permissionChecks).toHaveLength(0);
      authenticated = true;
      authorized = false;
      expect(
        (
          await request(app)
            .post('/api/admin' + route)
            .send({})
        ).status,
      ).toBe(403);
      expect(permissionChecks).toEqual(['manage_mud_backup']);
      expect(poolQuery).not.toHaveBeenCalled();
    },
  );
});
