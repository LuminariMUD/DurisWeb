import { ref, computed, watch } from 'vue'
import { useMudStore } from '@/stores/mudStore'
import { expandGmcpVariables } from '@/utils/gmcpVariables'
import { expandScript } from '@/utils/scriptExpander'
import { useGroups } from './useGroups'
import { createClientId } from '@/utils/clientId'
import { ClientSettingsStorageError, writeClientSettings } from '@/utils/clientSettingsStorage'
import { parseClientSettingsCollection } from '@/utils/clientSettingsImport'
import type {
  Alias,
  AliasFormData,
  AliasStorage,
  AliasExpansionResult,
  AliasScope,
} from '@/types/alias'

const STORAGE_VERSION = 2
const STORAGE_KEY_PREFIX = 'duris_aliases_'

// Global state (shared across components)
const aliases = ref<Alias[]>([])
const isLoaded = ref(false)
const echoExpansion = ref(false)
const echoCommands = ref(true)
const storageError = ref<string | null>(null)
let accountWatcherInitialized = false

export function useAliases() {
  const store = useMudStore()
  const { isGroupEffectivelyEnabled } = useGroups()

  // Computed: current account name
  const accountName = computed(() => store.account)

  // Computed: current character name
  const characterName = computed(() => store.selectedCharacter)

  // Computed: storage key for current account
  const storageKey = computed(() => {
    if (!accountName.value) return null
    return `${STORAGE_KEY_PREFIX}${accountName.value.toLowerCase()}`
  })

  // =========================================================================
  // Storage Operations
  // =========================================================================

  /**
   * Load aliases from localStorage for current account.
   */
  function loadAliases(): void {
    storageError.value = null
    if (!storageKey.value) {
      aliases.value = []
      echoExpansion.value = false
      echoCommands.value = true
      isLoaded.value = false
      return
    }

    try {
      const stored = localStorage.getItem(storageKey.value)
      if (!stored) {
        aliases.value = []
        echoExpansion.value = false
        echoCommands.value = true
        isLoaded.value = true
        return
      }

      const data: AliasStorage = JSON.parse(stored)

      // Version 1 -> 2: Add groupId field
      if (data.version < 2) {
        aliases.value = (data.aliases || []).map((alias: any) => {
          if (alias.groupId === undefined) {
            return { ...alias, groupId: null }
          }
          return alias
        })
      } else {
        aliases.value = data.aliases || []
      }
      echoExpansion.value = data.echoExpansion ?? false
      echoCommands.value = data.echoCommands ?? true
      isLoaded.value = true
      storageError.value = null
      if (data.version < STORAGE_VERSION) {
        saveAliases()
      }
    } catch (error) {
      console.error('[Aliases] Failed to load:', error)
      aliases.value = []
      echoExpansion.value = false
      echoCommands.value = true
      isLoaded.value = true
      storageError.value = 'Saved aliases could not be loaded. The stored data may be invalid.'
    }
  }

  /**
   * Save aliases to localStorage.
   */
  function saveAliases(): boolean {
    if (!storageKey.value) {
      storageError.value = 'No active MUD account is available for alias settings.'
      return false
    }

    try {
      const data: AliasStorage = {
        version: STORAGE_VERSION,
        aliases: aliases.value,
        echoExpansion: echoExpansion.value,
        echoCommands: echoCommands.value,
      }
      writeClientSettings(storageKey.value, data)
      storageError.value = null
      return true
    } catch (error) {
      console.error('[Aliases] Failed to save:', error)
      storageError.value = error instanceof ClientSettingsStorageError
        ? error.message
        : 'Client settings could not be saved.'
      return false
    }
  }

  function canMutate(): boolean {
    if (!storageKey.value) {
      storageError.value = 'No active MUD account is available for alias settings.'
      return false
    }
    if (!isLoaded.value) {
      storageError.value = 'Alias settings are still loading. Try again in a moment.'
      return false
    }
    return true
  }

  function commitAliases(nextAliases: Alias[]): boolean {
    if (!canMutate()) return false

    const previousAliases = aliases.value
    aliases.value = nextAliases
    if (saveAliases()) return true

    aliases.value = previousAliases
    return false
  }

  /**
   * Set echo expansion setting.
   */
  function setEchoExpansion(value: boolean): boolean {
    if (!canMutate()) return false
    const previous = echoExpansion.value
    echoExpansion.value = value
    if (saveAliases()) return true
    echoExpansion.value = previous
    return false
  }

  /**
   * Set echo commands setting.
   */
  function setEchoCommands(value: boolean): boolean {
    if (!canMutate()) return false
    const previous = echoCommands.value
    echoCommands.value = value
    if (saveAliases()) return true
    echoCommands.value = previous
    return false
  }

  // =========================================================================
  // CRUD Operations
  // =========================================================================

  /**
   * Generate a unique ID for a new alias.
   */
  function generateId(): string {
    return createClientId(aliases.value.map((alias) => alias.id))
  }

  /**
   * Add a new alias.
   */
  function addAlias(formData: AliasFormData): Alias | null {
    if (!canMutate()) return null
    const now = Date.now()
    const alias: Alias = {
      id: generateId(),
      trigger: formData.trigger.trim().toLowerCase(),
      expansion: formData.expansion.trim(),
      enabled: formData.enabled,
      scope: formData.scope,
      characterName: formData.scope === 'character' ? formData.characterName : null,
      groupId: formData.groupId ?? null,
      description: formData.description?.trim() || undefined,
      createdAt: now,
      updatedAt: now,
    }

    return commitAliases([...aliases.value, alias]) ? alias : null
  }

  /**
   * Update an existing alias.
   */
  function updateAlias(id: string, formData: Partial<AliasFormData>): Alias | null {
    if (!canMutate()) return null
    const index = aliases.value.findIndex((a) => a.id === id)
    if (index === -1) return null

    const alias = aliases.value[index]
    if (!alias) return null

    const updated: Alias = {
      id: alias.id,
      trigger:
        formData.trigger !== undefined ? formData.trigger.trim().toLowerCase() : alias.trigger,
      expansion:
        formData.expansion !== undefined ? formData.expansion.trim() : alias.expansion,
      enabled: formData.enabled !== undefined ? formData.enabled : alias.enabled,
      scope: formData.scope !== undefined ? formData.scope : alias.scope,
      characterName:
        formData.scope === 'global'
          ? null
          : formData.scope === 'character' && formData.characterName !== undefined
            ? formData.characterName
            : alias.characterName,
      groupId: formData.groupId !== undefined ? formData.groupId : alias.groupId,
      description:
        formData.description !== undefined
          ? formData.description.trim() || undefined
          : alias.description,
      createdAt: alias.createdAt,
      updatedAt: Date.now(),
    }

    const nextAliases = [...aliases.value]
    nextAliases[index] = updated
    return commitAliases(nextAliases) ? updated : null
  }

  /**
   * Delete an alias.
   */
  function deleteAlias(id: string): boolean {
    if (!canMutate()) return false
    const index = aliases.value.findIndex((a) => a.id === id)
    if (index === -1) return false

    return commitAliases(aliases.value.filter((_, aliasIndex) => aliasIndex !== index))
  }

  /**
   * Toggle alias enabled state.
   */
  function toggleAlias(id: string): boolean {
    if (!canMutate()) return false
    const index = aliases.value.findIndex((a) => a.id === id)
    if (index === -1) return false

    const alias = aliases.value[index]
    if (!alias) return false

    // Replace the alias object to ensure reactivity triggers
    const nextAliases = [...aliases.value]
    nextAliases[index] = {
      ...alias,
      enabled: !alias.enabled,
      updatedAt: Date.now(),
    }
    return commitAliases(nextAliases)
  }

  /**
   * Set alias enabled state to a specific value.
   */
  function setAliasEnabled(id: string, enabled: boolean): boolean {
    if (!canMutate()) return false
    const index = aliases.value.findIndex((a) => a.id === id)
    if (index === -1) return false

    const alias = aliases.value[index]
    if (!alias) return false

    // Replace the alias object to ensure reactivity triggers
    const nextAliases = [...aliases.value]
    nextAliases[index] = {
      ...alias,
      enabled,
      updatedAt: Date.now(),
    }
    return commitAliases(nextAliases)
  }

  function setAliasGroup(id: string, groupId: string | null): boolean {
    if (!canMutate()) return false
    const index = aliases.value.findIndex(a => a.id === id)
    if (index === -1) return false

    const alias = aliases.value[index]
    if (!alias) return false

    const nextAliases = [...aliases.value]
    nextAliases[index] = {
      ...alias,
      groupId,
      updatedAt: Date.now(),
    }
    return commitAliases(nextAliases)
  }

  /**
   * Duplicate an alias.
   */
  function duplicateAlias(id: string): Alias | null {
    const original = aliases.value.find((a) => a.id === id)
    if (!original) return null

    return addAlias({
      trigger: `${original.trigger}_copy`,
      expansion: original.expansion,
      enabled: false,
      scope: original.scope,
      characterName: original.characterName,
      groupId: original.groupId,
      description: original.description ? `${original.description} (copy)` : undefined,
    })
  }

  // =========================================================================
  // Alias Resolution
  // =========================================================================

  /**
   * Get effective aliases for current context.
   * Character-specific aliases take precedence over global.
   */
  const effectiveAliases = computed((): Alias[] => {
    if (!isLoaded.value) return []

    const currentChar = characterName.value

    // Filter to enabled aliases that apply to current context
    const applicable = aliases.value.filter((alias) => {
      if (!alias.enabled) return false
      if (!isGroupEffectivelyEnabled(alias.groupId)) return false
      if (alias.scope === 'global') return true
      if (alias.scope === 'character' && alias.characterName === currentChar) return true
      return false
    })

    // Build map with character-specific taking precedence
    const aliasMap = new Map<string, Alias>()

    // First add global aliases
    for (const alias of applicable.filter((a) => a.scope === 'global')) {
      aliasMap.set(alias.trigger, alias)
    }

    // Then override with character-specific
    for (const alias of applicable.filter((a) => a.scope === 'character')) {
      aliasMap.set(alias.trigger, alias)
    }

    return Array.from(aliasMap.values())
  })

  /**
   * Expand parameters in an alias expansion string.
   *
   * Supported parameters:
   * - $1, $2, ... $9: Individual arguments
   * - $*: All remaining arguments
   * - $0: The original trigger
   */
  function expandParameters(expansion: string, trigger: string, args: string[]): string {
    let result = expansion

    // Replace $0 with trigger
    result = result.replace(/\$0/g, trigger)

    // Replace $* with all args
    result = result.replace(/\$\*/g, args.join(' '))

    // Replace $1-$9 with individual args
    for (let i = 1; i <= 9; i++) {
      const arg = args[i - 1] || ''
      result = result.replace(new RegExp(`\\$${i}`, 'g'), arg)
    }

    return result.trim()
  }

  /**
   * Split expansion into multiple commands (separated by semicolons).
   */
  function splitCommands(expansion: string): string[] {
    return expansion
      .split(';')
      .map((cmd) => cmd.trim())
      .filter((cmd) => cmd.length > 0)
  }

  /**
   * Attempt to expand a command using aliases.
   */
  function expandCommand(input: string): AliasExpansionResult {
    if (!input.trim()) {
      return { matched: false, commands: [input] }
    }

    const parts = input.trim().split(/\s+/)
    const firstPart = parts[0]
    if (!firstPart) {
      return { matched: false, commands: [input] }
    }

    const trigger = firstPart.toLowerCase()
    const args = parts.slice(1)

    // Find matching alias
    const alias = effectiveAliases.value.find((a) => a.trigger === trigger)

    if (!alias) {
      return { matched: false, commands: [input] }
    }

    // Expand parameters
    const expanded = expandParameters(alias.expansion, trigger, args)

    // Expand GMCP variables
    const withGmcp = expandGmcpVariables(expanded)

    // Expand script constructs ({if}, {repeat}, {set}, {math}, user variables)
    const withScript = expandScript(withGmcp)

    // Split into multiple commands if needed
    const commands = splitCommands(withScript)

    return {
      matched: true,
      commands,
      alias,
    }
  }

  // =========================================================================
  // Query Helpers
  // =========================================================================

  /**
   * Get all global aliases.
   */
  const globalAliases = computed((): Alias[] => {
    return aliases.value.filter((a) => a.scope === 'global')
  })

  /**
   * Get aliases for a specific character.
   */
  function getCharacterAliases(charName: string): Alias[] {
    return aliases.value.filter((a) => a.scope === 'character' && a.characterName === charName)
  }

  /**
   * Get aliases for current character.
   */
  const currentCharacterAliases = computed((): Alias[] => {
    if (!characterName.value) return []
    return getCharacterAliases(characterName.value)
  })

  /**
   * Check if a trigger is already in use.
   */
  function isTriggerInUse(
    trigger: string,
    excludeId?: string,
    scope?: AliasScope,
    charName?: string | null
  ): boolean {
    const normalizedTrigger = trigger.trim().toLowerCase()

    return aliases.value.some((alias) => {
      if (alias.id === excludeId) return false
      if (alias.trigger !== normalizedTrigger) return false

      // If checking for a specific scope, only flag conflict in same scope
      if (scope === 'global' && alias.scope === 'global') return true
      if (scope === 'character' && alias.scope === 'character' && alias.characterName === charName)
        return true

      // If no scope specified, any match is a conflict
      if (scope === undefined) return true

      return false
    })
  }

  /**
   * Export aliases as JSON string.
   */
  function exportAliases(): string {
    return JSON.stringify(
      {
        version: STORAGE_VERSION,
        aliases: aliases.value,
        exportedAt: new Date().toISOString(),
      },
      null,
      2
    )
  }

  /**
   * Import aliases from JSON string.
   */
  function importAliases(json: string, mode: 'replace' | 'merge' = 'merge'): number {
    try {
      if (!canMutate()) {
        throw new ClientSettingsStorageError(
          storageError.value ?? 'Alias settings are not ready to import.',
        )
      }
      const imported = parseClientSettingsCollection(json, 'aliases') as Alias[]
      const now = Date.now()
      const reservedIds = new Set(aliases.value.map((alias) => alias.id))
      const nextId = () => {
        const id = createClientId(reservedIds)
        reservedIds.add(id)
        return id
      }

      if (mode === 'replace') {
        const nextAliases = imported.map((a) => ({
          ...a,
          id: nextId(), // Generate new IDs to avoid conflicts
          trigger: a.trigger.trim().toLowerCase(),
          expansion: a.expansion.trim(),
          scope: a.scope === 'character' ? 'character' as const : 'global' as const,
          characterName: a.scope === 'character' ? a.characterName ?? null : null,
          groupId: a.groupId ?? null,
          enabled: a.enabled !== false,
          updatedAt: now,
        }))
        if (!commitAliases(nextAliases)) {
          throw new ClientSettingsStorageError(storageError.value ?? 'Aliases could not be saved.')
        }
      } else {
        // Merge: add non-conflicting triggers
        const nextAliases = [...aliases.value]
        let accepted = 0
        for (const alias of imported) {
          const normalizedTrigger = alias.trigger.trim().toLowerCase()
          const normalizedScope = alias.scope === 'character' ? 'character' as const : 'global' as const
          const normalizedCharacterName = normalizedScope === 'character' ? alias.characterName ?? null : null
          if (!nextAliases.some((existing) =>
            existing.trigger === normalizedTrigger &&
            existing.scope === normalizedScope &&
            existing.characterName === normalizedCharacterName
          )) {
            nextAliases.push({
              ...alias,
              id: nextId(),
              trigger: normalizedTrigger,
              expansion: alias.expansion.trim(),
              scope: normalizedScope,
              characterName: normalizedCharacterName,
              groupId: alias.groupId ?? null,
              enabled: alias.enabled !== false,
              createdAt: now,
              updatedAt: now,
            })
            accepted += 1
          }
        }
        if (!commitAliases(nextAliases)) {
          throw new ClientSettingsStorageError(storageError.value ?? 'Aliases could not be saved.')
        }
        return accepted
      }

      return imported.length
    } catch (error) {
      console.error('[Aliases] Import failed:', error)
      throw error
    }
  }

  // =========================================================================
  // Initialization
  // =========================================================================

  // Watch for account changes and reload aliases. The composable is used by
  // several components and message handlers, so only one watcher is allowed.
  if (!accountWatcherInitialized) {
    accountWatcherInitialized = true
    watch(
      accountName,
      (newAccount, oldAccount) => {
        if (newAccount !== oldAccount) {
          loadAliases()
        }
      },
      { immediate: true }
    )
  }

  return {
    // State
    aliases,
    isLoaded,
    storageError,
    echoExpansion,
    echoCommands,

    // Settings
    setEchoExpansion,
    setEchoCommands,

    // Computed
    effectiveAliases,
    globalAliases,
    currentCharacterAliases,

    // CRUD
    addAlias,
    updateAlias,
    deleteAlias,
    toggleAlias,
    setAliasEnabled,
    setAliasGroup,
    duplicateAlias,

    // Resolution
    expandCommand,

    // Helpers
    getCharacterAliases,
    isTriggerInUse,
    exportAliases,
    importAliases,
    loadAliases,
  }
}
