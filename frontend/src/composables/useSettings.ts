import { useAliases } from './useAliases'
import { useTriggers } from './useTriggers'
import { useGroupActions } from './useGroupActions'

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
  groupActions?: {
    version: number
    groupActions: unknown[]
  }
}

const SETTINGS_VERSION = 1

export function useSettings() {
  const { aliases, exportAliases, importAliases } = useAliases()
  const { triggers, exportTriggers, importTriggers } = useTriggers()
  const { actions: groupActions, exportActions: exportGroupActions, importActions: importGroupActions } = useGroupActions()

  /**
   * Export all settings (aliases, triggers, group actions) as a single JSON string.
   */
  function exportAllSettings(): string {
    const aliasData = JSON.parse(exportAliases())
    const triggerData = JSON.parse(exportTriggers())
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
  ): { aliases: number; triggers: number; groupActions: number } {
    const data = JSON.parse(json) as SettingsExport

    if (!data.version) {
      throw new Error('Invalid settings file format')
    }

    const result = {
      aliases: 0,
      triggers: 0,
      groupActions: 0,
    }

    // Import aliases if present
    if (data.aliases?.aliases && Array.isArray(data.aliases.aliases)) {
      const aliasJson = JSON.stringify({
        version: data.aliases.version,
        aliases: data.aliases.aliases,
      })
      result.aliases = importAliases(aliasJson, mode)
    }

    // Import triggers if present
    if (data.triggers?.triggers && Array.isArray(data.triggers.triggers)) {
      const triggerJson = JSON.stringify({
        version: data.triggers.version,
        triggers: data.triggers.triggers,
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
  function getSettingsCounts(): { aliases: number; triggers: number; groupActions: number } {
    return {
      aliases: aliases.value.length,
      triggers: triggers.value.length,
      groupActions: groupActions.value.length,
    }
  }

  return {
    exportAllSettings,
    importAllSettings,
    getSettingsCounts,
  }
}
