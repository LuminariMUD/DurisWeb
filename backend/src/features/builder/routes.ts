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
import { requireZoneAccess } from './shared.js';

/** `/api/builder`: authentication, `manage_zones`, per-zone access, then the route groups. */
export const builderRouter: IRouter = Router();

// Apply auth middleware to all routes
builderRouter.use(requireAuth);
// For now, require manage_zones permission - can be changed to a specific builder permission later
builderRouter.use(requirePermission('manage_zones'));
// Per-zone access on every /zones/:id route, so relaxing the gate above cannot open every zone
builderRouter.use('/zones/:id', requireZoneAccess);

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
