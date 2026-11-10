import { Router, type IRouter } from 'express';
import { adminCommunityRoutes } from './communityRoutes.js';
import { adminAnalyticsRoutes } from './analyticsRoutes.js';
import { adminLogRoutes } from './logRoutes.js';
import { adminConnectionRoutes } from './connectionRoutes.js';
import { adminMudRoutes } from './mudRoutes.js';
import { adminWipeRoutes } from './wipeRoutes.js';
import { adminHealthRoutes } from './healthRoutes.js';
import { adminAccessRoutes } from './accessRoutes.js';
import { adminBackupRoutes } from './backupRoutes.js';
import { adminSettingsRoutes } from './settingsRoutes.js';
import { adminDiscordRoutes } from './discordRoutes.js';
import { adminGodRoutes } from './godRoutes.js';
import { adminDupeRoutes } from './dupeRoutes.js';

/**
 * `/api/admin`: route groups in their former registration order. Each route carries its own
 * auth and permission middleware. Do not add router-level middleware or a catch-all here:
 * `/api/admin/users`, `/api/admin/git` and `/api/admin/analytics/web` pass through this
 * router before reaching their own mounts.
 */
export const adminRouter: IRouter = Router();

for (const group of [
  adminCommunityRoutes,
  adminAnalyticsRoutes,
  adminLogRoutes,
  adminConnectionRoutes,
  adminMudRoutes,
  adminWipeRoutes,
  adminHealthRoutes,
  adminAccessRoutes,
  adminBackupRoutes,
  adminSettingsRoutes,
  adminDiscordRoutes,
  adminGodRoutes,
  adminDupeRoutes,
]) {
  adminRouter.use(group);
}
