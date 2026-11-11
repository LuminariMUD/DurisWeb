import { builderZoneApi } from './zoneApi.js'
import { builderRoomApi } from './roomApi.js'
import { builderMobApi } from './mobApi.js'
import { builderObjectApi } from './objectApi.js'
import { builderResetFlagApi } from './resetFlagApi.js'
import { builderValidationApi } from './validationApi.js'
import { builderGitApi } from './gitApi.js'
import { builderSettingsApi } from './settingsApi.js'
import { builderAccessApi } from './accessApi.js'
import { builderCollaborationApi } from './collaborationApi.js'

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
