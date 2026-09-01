import express from 'express';
import request from 'supertest';
import { beforeAll, beforeEach, describe, expect, it, jest } from '@jest/globals';

const assignRole = jest.fn<(...args: unknown[]) => Promise<unknown>>();
const revokeRole = jest.fn<(...args: unknown[]) => Promise<unknown>>();
const grantPermission = jest.fn<(...args: unknown[]) => Promise<unknown>>();
const revokePermission = jest.fn<(...args: unknown[]) => Promise<unknown>>();
const createRole = jest.fn<(...args: unknown[]) => Promise<unknown>>();
const updateRole = jest.fn<(...args: unknown[]) => Promise<unknown>>();
const poolQuery = jest.fn<(...args: unknown[]) => Promise<unknown>>();

const asyncMock = () => jest.fn<(...args: unknown[]) => Promise<unknown>>();
const namedService = (names: string[]): Record<string, unknown> =>
  Object.fromEntries(names.map((name) => [name, asyncMock()]));

jest.unstable_mockModule('../../middleware/auth.js', () => ({
  requireAuth: (req: any, _res: any, next: any) => {
    req.user = {
      accountName: 'Operator',
      permissions: { role: 'overlord' },
      adminPermissions: new Set(['manage_front_page']),
    };
    next();
  },
  requireOverlord: (_req: any, _res: any, next: any) => next(),
  requirePermission: () => (_req: any, _res: any, next: any) => next(),
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
  testWebhook: asyncMock(),
  manualPostBattle: asyncMock(),
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
    assignRole.mockResolvedValue(undefined);
    revokeRole.mockResolvedValue(undefined);
    grantPermission.mockResolvedValue(undefined);
    revokePermission.mockResolvedValue(undefined);
    createRole.mockResolvedValue(7);
    updateRole.mockResolvedValue(undefined);
    poolQuery.mockResolvedValue([[]]);
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

  it('preserves bounded numeric role permission arrays', async () => {
    const response = await request(app)
      .post('/api/admin/roles')
      .send({ name: 'Editor', permissionIds: [1, 2] });

    expect(response.status).toBe(201);
    expect(createRole).toHaveBeenCalledWith('Editor', null, [1, 2], 'Operator');
  });
});
