import { ref, computed, watch } from 'vue'
import { useMudStore } from '@/stores/mudStore'
import { expandGmcpVariables } from '@/utils/gmcpVariables'
import { expandScript } from '@/utils/scriptExpander'
import { useGroups } from './useGroups'
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
    } catch (error) {
      console.error('[Aliases] Failed to load:', error)
      aliases.value = []
      echoExpansion.value = false
      echoCommands.value = true
      isLoaded.value = true
    }
  }

  /**
   * Save aliases to localStorage.
   */
  function saveAliases(): void {
    if (!storageKey.value) return

    try {
      const data: AliasStorage = {
        version: STORAGE_VERSION,
        aliases: aliases.value,
        echoExpansion: echoExpansion.value,
        echoCommands: echoCommands.value,
      }
      localStorage.setItem(storageKey.value, JSON.stringify(data))
    } catch (error) {
      console.error('[Aliases] Failed to save:', error)
    }
  }

  /**
   * Set echo expansion setting.
   */
  function setEchoExpansion(value: boolean): void {
    echoExpansion.value = value
    saveAliases()
  }

  /**
   * Set echo commands setting.
   */
  function setEchoCommands(value: boolean): void {
    echoCommands.value = value
    saveAliases()
  }

  // =========================================================================
  // CRUD Operations
  // =========================================================================

  /**
   * Generate a unique ID for a new alias.
   */
  function generateId(): string {
    return crypto.randomUUID()
  }

  /**
   * Add a new alias.
   */
  function addAlias(formData: AliasFormData): Alias {
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

    aliases.value.push(alias)
    saveAliases()
    return alias
  }

  /**
   * Update an existing alias.
   */
  function updateAlias(id: string, formData: Partial<AliasFormData>): Alias | null {
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

    aliases.value[index] = updated
    saveAliases()
    return updated
  }

  /**
   * Delete an alias.
   */
  function deleteAlias(id: string): boolean {
    const index = aliases.value.findIndex((a) => a.id === id)
    if (index === -1) return false

    aliases.value.splice(index, 1)
    saveAliases()
    return true
  }

  /**
   * Toggle alias enabled state.
   */
  function toggleAlias(id: string): boolean {
    const index = aliases.value.findIndex((a) => a.id === id)
    if (index === -1) return false

    const alias = aliases.value[index]
    if (!alias) return false

    // Replace the alias object to ensure reactivity triggers
    aliases.value[index] = {
      ...alias,
      enabled: !alias.enabled,
      updatedAt: Date.now(),
    }
    saveAliases()
    return true
  }

  /**
   * Set alias enabled state to a specific value.
   */
  function setAliasEnabled(id: string, enabled: boolean): boolean {
    const index = aliases.value.findIndex((a) => a.id === id)
    if (index === -1) return false

    const alias = aliases.value[index]
    if (!alias) return false

    // Replace the alias object to ensure reactivity triggers
    aliases.value[index] = {
      ...alias,
      enabled,
      updatedAt: Date.now(),
    }
    saveAliases()
    return true
  }

  function setAliasGroup(id: string, groupId: string | null): boolean {
    const index = aliases.value.findIndex(a => a.id === id)
    if (index === -1) return false

    const alias = aliases.value[index]
    if (!alias) return false

    aliases.value[index] = {
      ...alias,
      groupId,
      updatedAt: Date.now(),
    }
    saveAliases()
    return true
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
      const data = JSON.parse(json)
      if (!data.aliases || !Array.isArray(data.aliases)) {
        throw new Error('Invalid alias data format')
      }

      const imported = data.aliases as Alias[]
      const now = Date.now()

      if (mode === 'replace') {
        aliases.value = imported.map((a) => ({
          ...a,
          id: generateId(), // Generate new IDs to avoid conflicts
          updatedAt: now,
        }))
      } else {
        // Merge: add non-conflicting triggers
        for (const alias of imported) {
          if (!isTriggerInUse(alias.trigger, undefined, alias.scope, alias.characterName)) {
            aliases.value.push({
              ...alias,
              id: generateId(),
              createdAt: now,
              updatedAt: now,
            })
          }
        }
      }

      saveAliases()
      return imported.length
    } catch (error) {
      console.error('[Aliases] Import failed:', error)
      throw error
    }
  }

  // =========================================================================
  // Initialization
  // =========================================================================

  // Watch for account changes and reload aliases
  watch(
    accountName,
    (newAccount, oldAccount) => {
      if (newAccount !== oldAccount) {
        loadAliases()
      }
    },
    { immediate: true }
  )

  return {
    // State
    aliases,
    isLoaded,
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
