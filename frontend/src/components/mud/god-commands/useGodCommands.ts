/**
 * God Commands Composable
 * Main composable for the god command palette system
 */

import { ref, computed } from 'vue'
import { useQuery } from '@tanstack/vue-query'
import { useDebounceFn } from '@vueuse/core'
import { useMudStore } from '@/stores/mudStore'
import { useMudConnection } from '@/composables/useMudConnection'
import { wikiApi, apiClient } from '@/services/api'
import { GOD_COMMANDS, searchCommands } from './commands'
import { useWhoParser } from './useWhoParser'
import { useBuilderFlags } from './useBuilderFlags'
import { COMMAND_CATEGORIES } from './types'
import type {
  GodCommand,
  GodCommandExecution,
  RecentGodCommand,
  GodCommandCategory,
} from './types'

// LocalStorage key for recent commands
const STORAGE_KEY = 'duris-god-command-history'
const MAX_RECENT = 10

export function useGodCommands() {
  const store = useMudStore()
  const { sendGameCommand } = useMudConnection()
  const whoParser = useWhoParser()
  const builderFlags = useBuilderFlags()

  // =========== Player Level & Visibility ===========

  const playerLevel = computed(() => store.character?.level ?? 0)
  const isImmortal = computed(() => playerLevel.value >= 57)

  // Filter commands by player level
  const availableCommands = computed(() =>
    GOD_COMMANDS.filter(cmd => cmd.level <= playerLevel.value)
  )

  // Group commands by category
  const commandsByCategory = computed(() => {
    const groups: Record<GodCommandCategory, GodCommand[]> = {
      player: [],
      teleportation: [],
      loading: [],
      communication: [],
      information: [],
      zone: [],
      dangerous: [],
    }

    for (const cmd of availableCommands.value) {
      groups[cmd.category].push(cmd)
    }

    return groups
  })

  // Get category info with command counts
  const categoriesWithCounts = computed(() =>
    COMMAND_CATEGORIES.map(cat => ({
      ...cat,
      count: commandsByCategory.value[cat.id].length,
      commands: commandsByCategory.value[cat.id],
    })).filter(cat => cat.count > 0)
  )

  // =========== Search ===========

  const searchQuery = ref('')

  const searchResults = computed(() => {
    if (!searchQuery.value.trim()) {
      return null // Return null to show categories instead
    }
    return searchCommands(searchQuery.value, playerLevel.value)
  })

  // =========== Recent Commands ===========

  const recentCommands = ref<RecentGodCommand[]>(loadRecentCommands())

  function loadRecentCommands(): RecentGodCommand[] {
    try {
      const stored = localStorage.getItem(STORAGE_KEY)
      return stored ? JSON.parse(stored) : []
    } catch {
      return []
    }
  }

  function saveRecentCommands() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(recentCommands.value))
  }

  function addToHistory(command: string, commandName: string) {
    const entry: RecentGodCommand = {
      command,
      timestamp: Date.now(),
      commandName,
    }

    // Add to front, remove duplicates, limit to MAX_RECENT
    recentCommands.value = [
      entry,
      ...recentCommands.value.filter(r => r.command !== command),
    ].slice(0, MAX_RECENT)

    saveRecentCommands()
  }

  function clearHistory() {
    recentCommands.value = []
    localStorage.removeItem(STORAGE_KEY)
  }

  // =========== Current Execution ===========

  const execution = ref<GodCommandExecution | null>(null)
  const executionError = ref<string | null>(null)

  function selectCommand(command: GodCommand) {
    // Clear any previous error
    executionError.value = null

    // Initialize params with default values
    const params: Record<string, string | number | boolean> = {}
    for (const param of command.params) {
      if (param.defaultValue !== undefined) {
        params[param.name] = param.defaultValue
      }
    }

    execution.value = {
      command,
      params,
      preview: '',
      isValid: false,
    }

    updatePreview()
  }

  function updateParam(name: string, value: string | number | boolean) {
    if (!execution.value) return
    execution.value.params[name] = value
    updatePreview()
  }

  function updatePreview() {
    if (!execution.value) return

    const { command, params } = execution.value

    // Check if this is a setbit command and get selected property
    const isSetbitCommand = command.params.some(p => p.type === 'setbit-property')
    const selectedProperty = isSetbitCommand
      ? String(params[command.params.find(p => p.type === 'setbit-property')?.name ?? ''] ?? '')
      : ''

    // Build command string from template
    let preview = command.template
    for (const param of command.params) {
      const value = params[param.name]
      const strValue = value !== undefined && value !== '' ? String(value) : ''

      // Handle on-off type - only include if property needs it
      if (param.type === 'on-off') {
        // For setbit commands, only include on/off for bitfield properties
        if (isSetbitCommand && !builderFlags.propertyNeedsOnOff(selectedProperty)) {
          preview = preview.replace(`{${param.name}}`, '')
        } else {
          const onOff = value === true || value === 'true' || value === 'on' ? 'on' : 'off'
          preview = preview.replace(`{${param.name}}`, onOff)
        }
      } else {
        preview = preview.replace(`{${param.name}}`, strValue)
      }
    }

    // Clean up empty placeholders and extra spaces
    preview = preview.replace(/\{[^}]+\}/g, '').replace(/\s+/g, ' ').trim()

    execution.value.preview = preview

    // Check validity - all required params must have values
    execution.value.isValid = command.params
      .filter(p => p.required)
      .every(p => {
        const val = params[p.name]
        return val !== undefined && val !== ''
      })
  }

  function cancelExecution() {
    execution.value = null
  }

  function executeCommand(): boolean {
    if (!execution.value?.isValid) return false

    const { preview, command, params } = execution.value

    // Check if this is an API command
    if (command.type === 'api' && command.apiEndpoint) {
      executeApiCommand(command, params, preview)
      return true
    }

    // Echo command to activity log in bright yellow
    store.addLogEntry('system', `&+Y> ${preview}&n`)

    // Send to MUD
    const sent = sendGameCommand(preview)

    if (sent) {
      // Save to history
      addToHistory(preview, command.name)
    }

    // Clear execution state
    execution.value = null

    return sent
  }

  async function executeApiCommand(
    command: GodCommand,
    params: Record<string, string | number | boolean>,
    preview: string
  ) {
    // Clear previous error
    executionError.value = null

    // Echo command to activity log
    store.addLogEntry('system', `&+Y> ${preview}&n`)

    try {
      const response = await apiClient.post(command.apiEndpoint!, params)
      const data = response.data

      if (data.success) {
        store.addLogEntry('system', `&+G${data.message || 'Command executed successfully'}&n`)
        addToHistory(preview, command.name)
        // Only close on success
        execution.value = null
      } else {
        // Show error in modal, don't close
        executionError.value = data.error || 'Command failed'
        store.addLogEntry('system', `&+R${executionError.value}&n`)
      }
    } catch (error: unknown) {
      // Extract error message from axios error response
      let message = 'API request failed'
      if (error && typeof error === 'object' && 'response' in error) {
        const axiosError = error as { response?: { data?: { error?: string; errors?: Array<{ msg: string }> } } }
        if (axiosError.response?.data?.error) {
          message = axiosError.response.data.error
        } else if (axiosError.response?.data?.errors) {
          message = axiosError.response.data.errors.map(e => e.msg).join(', ')
        }
      } else if (error instanceof Error) {
        message = error.message
      }
      // Show error in modal, don't close
      executionError.value = message
      store.addLogEntry('system', `&+RError: ${message}&n`)
    }
  }

  function executeRecent(recent: RecentGodCommand): boolean {
    // Echo command to activity log in bright yellow
    store.addLogEntry('system', `&+Y> ${recent.command}&n`)

    const sent = sendGameCommand(recent.command)

    if (sent) {
      // Update history (moves to front)
      addToHistory(recent.command, recent.commandName)
    }

    return sent
  }

  // =========== Object/Mob Search ===========

  const objectSearchQuery = ref('')
  const mobSearchQuery = ref('')

  // Debounced search queries
  const debouncedObjectSearch = ref('')
  const debouncedMobSearch = ref('')

  // Explicit debounce waiting flags
  const isWaitingObjectDebounce = ref(false)
  const isWaitingMobDebounce = ref(false)

  // Track selected object/mob ANSI names (keyed by param name)
  const selectedObjectAnsi = ref<Record<string, string>>({})
  const selectedMobAnsi = ref<Record<string, string>>({})

  function setSelectedObjectName(paramName: string, nameAnsi: string) {
    selectedObjectAnsi.value[paramName] = nameAnsi
  }

  function setSelectedMobName(paramName: string, nameAnsi: string) {
    selectedMobAnsi.value[paramName] = nameAnsi
  }

  function getSelectedObjectAnsi(paramName: string): string | undefined {
    return selectedObjectAnsi.value[paramName]
  }

  function getSelectedMobAnsi(paramName: string): string | undefined {
    return selectedMobAnsi.value[paramName]
  }

  const updateObjectSearch = useDebounceFn((value: string) => {
    debouncedObjectSearch.value = value
    isWaitingObjectDebounce.value = false
  }, 300)

  const updateMobSearch = useDebounceFn((value: string) => {
    debouncedMobSearch.value = value
    isWaitingMobDebounce.value = false
  }, 300)

  // Functions to update search with proper loading state
  function setObjectSearchQuery(value: string) {
    objectSearchQuery.value = value
    if (value.length >= 2) {
      isWaitingObjectDebounce.value = true
    } else {
      isWaitingObjectDebounce.value = false
    }
    updateObjectSearch(value)
  }

  function setMobSearchQuery(value: string) {
    mobSearchQuery.value = value
    if (value.length >= 2) {
      isWaitingMobDebounce.value = true
    } else {
      isWaitingMobDebounce.value = false
    }
    updateMobSearch(value)
  }

  // Object search query
  const {
    data: objectResults,
    isLoading: isLoadingObjectsQuery,
  } = useQuery({
    queryKey: computed(() => ['god-objects', debouncedObjectSearch.value]),
    queryFn: () => wikiApi.getObjects({ search: debouncedObjectSearch.value }, 1, 15),
    enabled: computed(() => debouncedObjectSearch.value.length >= 2),
    staleTime: 60000,
  })

  // Mob search query
  const {
    data: mobResults,
    isLoading: isLoadingMobsQuery,
  } = useQuery({
    queryKey: computed(() => ['god-mobs', debouncedMobSearch.value]),
    queryFn: () => wikiApi.getMobs({ search: debouncedMobSearch.value }, 1, 15),
    enabled: computed(() => debouncedMobSearch.value.length >= 2),
    staleTime: 60000,
  })

  // Track if we're waiting for debounce OR the query is loading
  const isLoadingObjects = computed(() =>
    isLoadingObjectsQuery.value || isWaitingObjectDebounce.value
  )

  const isLoadingMobs = computed(() =>
    isLoadingMobsQuery.value || isWaitingMobDebounce.value
  )

  // =========== WHO List Integration ===========

  // Refresh WHO list when dialog opens
  function refreshWhoList() {
    whoParser.refresh()
  }

  // =========== Return Public API ===========

  return {
    // Level & visibility
    playerLevel,
    isImmortal,

    // Commands
    availableCommands,
    commandsByCategory,
    categoriesWithCounts,

    // Search
    searchQuery,
    searchResults,

    // Recent
    recentCommands,
    clearHistory,

    // Execution
    execution,
    executionError,
    selectCommand,
    updateParam,
    cancelExecution,
    executeCommand,
    executeRecent,

    // Object/mob search
    objectSearchQuery,
    mobSearchQuery,
    setObjectSearchQuery,
    setMobSearchQuery,
    objectResults,
    mobResults,
    isLoadingObjects,
    isLoadingMobs,
    setSelectedObjectName,
    setSelectedMobName,
    getSelectedObjectAnsi,
    getSelectedMobAnsi,

    // WHO list
    onlinePlayers: whoParser.playerNames,
    isLoadingPlayers: whoParser.isLoading,
    refreshWhoList,
  }
}

// Export type for use in components
export type UseGodCommandsReturn = ReturnType<typeof useGodCommands>
