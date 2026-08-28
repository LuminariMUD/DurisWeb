import { useAliases } from './useAliases'
import { useTriggers } from './useTriggers'
import { useGroups } from './useGroups'
import { useGroupActions } from './useGroupActions'
import { parseClientSettingsDocument } from '@/utils/clientSettingsImport'

export interface SettingsExport {
  version: number
  exportedAt: string
  aliases?: {
    version: number
    aliases: unknown[]
  }
  triggers?: {
    version: number
    triggers: unknown[]
  }
  groups?: {
    version: number
    groups: unknown[]
  }
  groupActions?: {
    version: number
    groupActions: unknown[]
  }
}

const SETTINGS_VERSION = 2

export function useSettings() {
  const { aliases, exportAliases, importAliases } = useAliases()
  const { triggers, exportTriggers, importTriggers } = useTriggers()
  const { groups, exportGroups, importGroupsWithMap } = useGroups()
  const { actions: groupActions, exportActions: exportGroupActions, importActions: importGroupActions } = useGroupActions()

  /**
   * Export all settings (aliases, triggers, group actions) as a single JSON string.
   */
  function exportAllSettings(): string {
    const aliasData = JSON.parse(exportAliases())
    const triggerData = JSON.parse(exportTriggers())
    const groupData = JSON.parse(exportGroups())
    const groupActionData = JSON.parse(exportGroupActions())

    const data: SettingsExport = {
      version: SETTINGS_VERSION,
      exportedAt: new Date().toISOString(),
      aliases: {
        version: aliasData.version,
        aliases: aliasData.aliases,
      },
      triggers: {
        version: triggerData.version,
        triggers: triggerData.triggers,
      },
      groups: {
        version: groupData.version,
        groups: groupData.groups,
      },
      groupActions: {
        version: groupActionData.version,
        groupActions: groupActionData.groupActions,
      },
    }

    return JSON.stringify(data, null, 2)
  }

  /**
   * Import settings from a combined JSON string.
   * Returns counts of imported items.
   */
  function importAllSettings(
    json: string,
    mode: 'replace' | 'merge' = 'merge'
  ): { aliases: number; triggers: number; groups: number; groupActions: number } {
    const data = parseClientSettingsDocument(json) as unknown as SettingsExport

    if (!data.version) {
      throw new Error('Invalid settings file format')
    }

    const result = {
      aliases: 0,
      triggers: 0,
      groups: 0,
      groupActions: 0,
    }

    const groupImport = data.groups?.groups && Array.isArray(data.groups.groups)
      ? importGroupsWithMap(
          JSON.stringify({ version: data.groups.version, groups: data.groups.groups }),
          mode,
          { preserveIds: mode === 'replace' || groups.value.length === 0 },
        )
      : { count: 0, idMap: {} }
    result.groups = groupImport.count

    const knownGroupIds = new Set(groups.value.map((group) => group.id))
    const remapGroupId = (record: unknown): unknown => {
      if (!record || typeof record !== 'object') return record
      const item = record as { groupId?: unknown }
      if (typeof item.groupId !== 'string') return { ...item, groupId: null }
      return {
        ...item,
        groupId: groupImport.idMap[item.groupId] ??
          (knownGroupIds.has(item.groupId) ? item.groupId : null),
      }
    }

    // Import aliases if present
    if (data.aliases?.aliases && Array.isArray(data.aliases.aliases)) {
      const aliasJson = JSON.stringify({
        version: data.aliases.version,
        aliases: data.aliases.aliases.map(remapGroupId),
      })
      result.aliases = importAliases(aliasJson, mode)
    }

    // Import triggers if present
    if (data.triggers?.triggers && Array.isArray(data.triggers.triggers)) {
      const triggerJson = JSON.stringify({
        version: data.triggers.version,
        triggers: data.triggers.triggers.map(remapGroupId),
      })
      result.triggers = importTriggers(triggerJson, mode)
    }

    // Import group actions if present
    if (data.groupActions?.groupActions && Array.isArray(data.groupActions.groupActions)) {
      const groupActionJson = JSON.stringify({
        version: data.groupActions.version,
        groupActions: data.groupActions.groupActions,
      })
      result.groupActions = importGroupActions(groupActionJson, mode)
    }

    return result
  }

  /**
   * Get counts of all settings.
   */
  function getSettingsCounts(): { aliases: number; triggers: number; groups: number; groupActions: number } {
    return {
      aliases: aliases.value.length,
      triggers: triggers.value.length,
      groups: groups.value.length,
      groupActions: groupActions.value.length,
    }
  }

  return {
    exportAllSettings,
    importAllSettings,
    getSettingsCounts,
  }
}
