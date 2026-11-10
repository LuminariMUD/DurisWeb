import { builderZoneApi } from './zoneApi'
import { builderRoomApi } from './roomApi'
import { builderMobApi } from './mobApi'
import { builderObjectApi } from './objectApi'
import { builderResetFlagApi } from './resetFlagApi'
import { builderValidationApi } from './validationApi'
import { builderGitApi } from './gitApi'
import { builderSettingsApi } from './settingsApi'
import { builderAccessApi } from './accessApi'
import { builderCollaborationApi } from './collaborationApi'

/**
 * Zone Builder API endpoints
 * Uses zone ID (filename without extension) as unique identifier
 */
export const builderApi = {
  ...builderZoneApi,
  ...builderRoomApi,
  ...builderMobApi,
  ...builderObjectApi,
  ...builderResetFlagApi,
  ...builderValidationApi,
  ...builderGitApi,
  ...builderSettingsApi,
  ...builderAccessApi,
  ...builderCollaborationApi,
}
