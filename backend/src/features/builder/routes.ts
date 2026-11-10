import { Router, type IRouter } from 'express';
import { requireAuth, requirePermission } from '../../middleware/auth.js';
import { builderZoneRoutes } from './zoneRoutes.js';
import { builderRoomRoutes } from './roomRoutes.js';
import { builderMobRoutes } from './mobRoutes.js';
import { builderObjectRoutes } from './objectRoutes.js';
import { builderResetFlagRoutes } from './resetFlagRoutes.js';
import { builderStreamExportRoutes } from './streamExportRoutes.js';
import { builderValidationRoutes } from './validationRoutes.js';
import { builderGitRoutes } from './gitRoutes.js';
import { builderSettingsRoutes } from './settingsRoutes.js';
import { builderAccessRoutes } from './accessRoutes.js';
import { builderCollaborationRoutes } from './collaborationRoutes.js';

/** `/api/builder`: authentication and `manage_zones` first, then the route groups. */
export const builderRouter: IRouter = Router();

// Apply auth middleware to all routes
builderRouter.use(requireAuth);
// For now, require manage_zones permission - can be changed to a specific builder permission later
builderRouter.use(requirePermission('manage_zones'));

for (const group of [
  builderZoneRoutes,
  builderRoomRoutes,
  builderMobRoutes,
  builderObjectRoutes,
  builderResetFlagRoutes,
  builderStreamExportRoutes,
  builderValidationRoutes,
  builderGitRoutes,
  builderSettingsRoutes,
  builderAccessRoutes,
  builderCollaborationRoutes,
]) {
  builderRouter.use(group);
}
