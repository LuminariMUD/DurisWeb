import { ref, computed, watch, shallowReactive } from 'vue'
import { useMudStore } from '@/stores/mudStore'
import { expandGmcpVariables } from '@/utils/gmcpVariables'
import { useGroups } from './useGroups'
import type { Timer, TimerFormData, TimerStorage, TimerState, TimerScope } from '@/types/timer'
import { TIMER_CONSTRAINTS, formatInterval } from '@/types/timer'
import { createClientId } from '@/utils/clientId'
import { ClientSettingsStorageError, writeClientSettings } from '@/utils/clientSettingsStorage'
import { parseClientSettingsCollection } from '@/utils/clientSettingsImport'
import { normalizeTimerForm, normalizeTimerImport } from '@/utils/clientSettingsValidation'
import type { TriggerActionSound } from '@/types/trigger'
import { PREDEFINED_SOUNDS } from '@/types/trigger'

const STORAGE_VERSION = 2
const STORAGE_KEY_PREFIX = 'duris_timers_'

// Global state (shared across components)
const timers = ref<Timer[]>([])
const isLoaded = ref(false)
const echoTimers = ref(false)
const storageError = ref<string | null>(null)
let accountWatcherInitialized = false

// Runtime state for running timers (timerId -> state)
const timerStates = shallowReactive(new Map<string, TimerState>())

// Audio context for sounds (lazy-initialized)
let audioContext: AudioContext | null = null
const soundCache = new Map<string, AudioBuffer>()

// Reference to sendCommand function (set by MUD connection)
let sendCommandFn: ((command: string) => void) | null = null

// Reference to addLogEntry function (set by MUD connection)
let addLogEntryFn: ((category: string, text: string) => void) | null = null

export function useTimers() {
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
   * Load timers from localStorage for current account.
   */
  function loadTimers(): void {
    storageError.value = null
    if (!storageKey.value) {
      timers.value = []
      echoTimers.value = false
      isLoaded.value = false
      return
    }

    try {
      const stored = localStorage.getItem(storageKey.value)
      if (!stored) {
        timers.value = []
        echoTimers.value = false
        isLoaded.value = true
        return
      }

      const data: TimerStorage = JSON.parse(stored)

      // Version 1 -> 2: Add groupId field
      if (data.version < 2) {
        timers.value = (data.timers || []).map((timer: any) => {
          if (timer.groupId === undefined) {
            return { ...timer, groupId: null }
          }
          return timer
        })
      } else {
        timers.value = data.timers || []
      }
      echoTimers.value = data.echoTimers ?? false
      isLoaded.value = true
      storageError.value = null
      if (data.version < STORAGE_VERSION) {
        saveTimers()
      }
    } catch (error) {
      console.error('[Timers] Failed to load:', error)
      timers.value = []
      echoTimers.value = false
      isLoaded.value = true
      storageError.value = 'Saved timers could not be loaded. The stored data may be invalid.'
    }
  }

  /**
   * Save timers to localStorage.
   */
  function saveTimers(): boolean {
    if (!storageKey.value) {
      storageError.value = 'No active MUD account is available for timer settings.'
      return false
    }

    try {
      const data: TimerStorage = {
        version: STORAGE_VERSION,
        timers: timers.value,
        echoTimers: echoTimers.value,
      }
      writeClientSettings(storageKey.value, data)
      storageError.value = null
      return true
    } catch (error) {
      console.error('[Timers] Failed to save:', error)
      storageError.value =
        error instanceof ClientSettingsStorageError
          ? error.message
          : 'Client settings could not be saved.'
      return false
    }
  }

  function canMutate(): boolean {
    if (!storageKey.value) {
      storageError.value = 'No active MUD account is available for timer settings.'
      return false
    }
    if (!isLoaded.value) {
      storageError.value = 'Timer settings are still loading. Try again in a moment.'
      return false
    }
    return true
  }

  function commitTimers(nextTimers: Timer[]): boolean {
    if (!canMutate()) return false

    const previousTimers = timers.value
    timers.value = nextTimers
    if (saveTimers()) return true

    timers.value = previousTimers
    return false
  }

  /**
   * Set echo timers setting.
   */
  function setEchoTimers(value: boolean): boolean {
    if (!canMutate()) return false
    const previous = echoTimers.value
    echoTimers.value = value
    if (saveTimers()) return true
    echoTimers.value = previous
    return false
  }

  // =========================================================================
  // CRUD Operations
  // =========================================================================

  /**
   * Generate a unique ID for a new timer.
   */
  function generateId(): string {
    return createClientId(timers.value.map((timer) => timer.id))
  }

  /**
   * Add a new timer.
   */
  function addTimer(formData: TimerFormData): Timer | null {
    if (!canMutate()) return null
    const now = Date.now()

    try {
      const timer = normalizeTimerForm(formData, generateId(), now)
      if (!commitTimers([...timers.value, timer])) return null

      // If timer is enabled and we're in-game, start it
      if (timer.enabled && store.connectionState === 'in_game') {
        startTimer(timer.id)
      }

      return timer
    } catch (error) {
      console.error('[Timers] Invalid timer:', error)
      storageError.value = error instanceof Error ? error.message : 'Timer settings are invalid.'
      return null
    }
  }

  /**
   * Update an existing timer.
   */
  function updateTimer(id: string, formData: Partial<TimerFormData>): Timer | null {
    if (!canMutate()) return null
    const index = timers.value.findIndex((t) => t.id === id)
    if (index === -1) return null

    const timer = timers.value[index]
    if (!timer) return null

    let updated: Timer
    try {
      updated = normalizeTimerForm(
        { ...timer, ...formData, id: timer.id, createdAt: timer.createdAt },
        timer.id,
        Date.now(),
      )
    } catch (error) {
      console.error('[Timers] Invalid timer update:', error)
      storageError.value = error instanceof Error ? error.message : 'Timer settings are invalid.'
      return null
    }

    // Stop timer if running before update
    const wasRunning = timerStates.get(id)?.isRunning ?? false
    if (wasRunning) {
      stopTimer(id)
    }

    const nextTimers = [...timers.value]
    nextTimers[index] = updated
    if (!commitTimers(nextTimers)) {
      if (wasRunning && timer.enabled && store.connectionState === 'in_game') {
        startTimer(id)
      }
      return null
    }

    // Restart if was running and still enabled
    if (wasRunning && updated.enabled && store.connectionState === 'in_game') {
      startTimer(id)
    }

    return updated
  }

  /**
   * Delete a timer.
   */
  function deleteTimer(id: string): boolean {
    if (!canMutate()) return false
    const timer = timers.value.find((candidate) => candidate.id === id)
    if (!timer) return false
    const wasRunning = timerStates.get(id)?.isRunning ?? false
    // Stop timer if running
    stopTimer(id)

    const index = timers.value.findIndex((t) => t.id === id)
    if (index === -1) return false

    const committed = commitTimers(timers.value.filter((_, timerIndex) => timerIndex !== index))
    if (!committed && wasRunning && timer.enabled && store.connectionState === 'in_game') {
      startTimer(id)
    }
    return committed
  }

  /**
   * Toggle timer enabled state.
   */
  function toggleTimer(id: string): boolean {
    if (!canMutate()) return false
    const index = timers.value.findIndex((t) => t.id === id)
    if (index === -1) return false

    const timer = timers.value[index]
    if (!timer) return false

    const newEnabled = !timer.enabled

    const nextTimers = [...timers.value]
    nextTimers[index] = {
      ...timer,
      enabled: newEnabled,
      updatedAt: Date.now(),
    }
    if (!commitTimers(nextTimers)) return false

    // Start or stop based on new state
    if (newEnabled && store.connectionState === 'in_game') {
      startTimer(id)
    } else {
      stopTimer(id)
    }

    return true
  }

  /**
   * Set timer enabled state to a specific value.
   */
  function setTimerEnabled(id: string, enabled: boolean): boolean {
    if (!canMutate()) return false
    const index = timers.value.findIndex((t) => t.id === id)
    if (index === -1) return false

    const timer = timers.value[index]
    if (!timer) return false

    const nextTimers = [...timers.value]
    nextTimers[index] = {
      ...timer,
      enabled,
      updatedAt: Date.now(),
    }
    if (!commitTimers(nextTimers)) return false

    // Start or stop based on new state
    if (enabled && store.connectionState === 'in_game') {
      startTimer(id)
    } else {
      stopTimer(id)
    }

    return true
  }

  function setTimerGroup(id: string, groupId: string | null): boolean {
    if (!canMutate()) return false
    const index = timers.value.findIndex((t) => t.id === id)
    if (index === -1) return false

    const timer = timers.value[index]
    if (!timer) return false

    const nextTimers = [...timers.value]
    nextTimers[index] = {
      ...timer,
      groupId,
      updatedAt: Date.now(),
    }
    return commitTimers(nextTimers)
  }

  /**
   * Duplicate a timer.
   */
  function duplicateTimer(id: string): Timer | null {
    const original = timers.value.find((t) => t.id === id)
    if (!original) return null

    return addTimer({
      name: `${original.name} (copy)`,
      intervalMs: original.intervalMs,
      isOneShot: original.isOneShot,
      actions: JSON.parse(JSON.stringify(original.actions)),
      enabled: false, // Start disabled
      scope: original.scope,
      characterName: original.characterName,
      groupId: original.groupId,
      description: original.description,
    })
  }

  // =========================================================================
  // Timer Resolution
  // =========================================================================

  /**
   * Get effective timers for current context.
   * Character-specific timers with same name override global.
   */
  const effectiveTimers = computed((): Timer[] => {
    if (!isLoaded.value) return []

    const currentChar = characterName.value

    // Filter to enabled timers that apply to current context
    const applicable = timers.value.filter((timer) => {
      if (!timer.enabled) return false
      if (!isGroupEffectivelyEnabled(timer.groupId)) return false
      if (timer.scope === 'global') return true
      if (timer.scope === 'character' && timer.characterName === currentChar) return true
      return false
    })

    // Build map with character-specific taking precedence (by name)
    const timerMap = new Map<string, Timer>()

    // First add global timers
    for (const timer of applicable.filter((t) => t.scope === 'global')) {
      timerMap.set(timer.name, timer)
    }

    // Then override with character-specific
    for (const timer of applicable.filter((t) => t.scope === 'character')) {
      timerMap.set(timer.name, timer)
    }

    return Array.from(timerMap.values())
  })

  /**
   * Get all global timers.
   */
  const globalTimers = computed((): Timer[] => {
    return timers.value.filter((t) => t.scope === 'global')
  })

  /**
   * Get timers for a specific character.
   */
  function getCharacterTimers(charName: string): Timer[] {
    return timers.value.filter((t) => t.scope === 'character' && t.characterName === charName)
  }

  /**
   * Get timers for current character.
   */
  const currentCharacterTimers = computed((): Timer[] => {
    if (!characterName.value) return []
    return getCharacterTimers(characterName.value)
  })

  /**
   * Get running timers with their states.
   */
  const runningTimers = computed((): Array<{ timer: Timer; state: TimerState }> => {
    const result: Array<{ timer: Timer; state: TimerState }> = []
    for (const [timerId, state] of timerStates.entries()) {
      if (state.isRunning) {
        const timer = timers.value.find((t) => t.id === timerId)
        if (timer) {
          result.push({ timer, state })
        }
      }
    }
    return result
  })

  // =========================================================================
  // Timer Execution
  // =========================================================================

  /**
   * Execute a timer's actions.
   */
  async function executeTimerActions(timer: Timer): Promise<void> {
    if (echoTimers.value && addLogEntryFn) {
      addLogEntryFn('system', `[Timer] ${timer.name} fired (${formatInterval(timer.intervalMs)})`)
    }

    for (const action of timer.actions) {
      switch (action.type) {
        case 'command': {
          const commands = action.commands
            .split(';')
            .map((cmd) => expandGmcpVariables(cmd.trim()))
            .filter((cmd) => cmd.length > 0)

          for (const cmd of commands) {
            if (action.delay && action.delay > 0) {
              setTimeout(() => {
                if (sendCommandFn) {
                  sendCommandFn(cmd)
                }
              }, action.delay)
            } else {
              if (sendCommandFn) {
                sendCommandFn(cmd)
              }
            }
          }
          break
        }

        case 'sound':
          await playSound(action)
          break

        case 'echo':
          if (addLogEntryFn) {
            const echoText = expandGmcpVariables(action.text)
            addLogEntryFn('system', echoText)
          }
          break
      }
    }
  }

  /**
   * Start a timer.
   */
  function startTimer(id: string): boolean {
    const timer = timers.value.find((t) => t.id === id)
    if (!timer || !timer.enabled) return false

    // Don't start if already running
    const existingState = timerStates.get(id)
    if (existingState?.isRunning) return true

    const now = Date.now()
    const nextFireTime = now + timer.intervalMs

    if (timer.isOneShot) {
      // One-shot timer uses setTimeout
      const handle = setTimeout(() => {
        executeTimerActions(timer)
        // Disable after firing
        setTimerEnabled(id, false)
        timerStates.delete(id)
      }, timer.intervalMs)

      timerStates.set(id, {
        timerId: id,
        intervalHandle: handle as unknown as ReturnType<typeof setInterval>,
        nextFireTime,
        isRunning: true,
      })
    } else {
      // Repeating timer uses setInterval
      const handle = setInterval(() => {
        executeTimerActions(timer)
        // Update next fire time
        const state = timerStates.get(id)
        if (state) {
          state.nextFireTime = Date.now() + timer.intervalMs
        }
      }, timer.intervalMs)

      timerStates.set(id, {
        timerId: id,
        intervalHandle: handle,
        nextFireTime,
        isRunning: true,
      })
    }

    return true
  }

  /**
   * Stop a timer.
   */
  function stopTimer(id: string): boolean {
    const state = timerStates.get(id)
    if (!state) return false

    if (state.intervalHandle) {
      clearInterval(state.intervalHandle)
      clearTimeout(state.intervalHandle as unknown as ReturnType<typeof setTimeout>)
    }

    timerStates.delete(id)
    return true
  }

  /**
   * Start all effective timers.
   */
  function startAllTimers(): void {
    for (const timer of effectiveTimers.value) {
      startTimer(timer.id)
    }
  }

  /**
   * Stop all running timers.
   */
  function stopAllTimers(): void {
    for (const [id] of timerStates) {
      stopTimer(id)
    }
  }

  /**
   * Get timer state.
   */
  function getTimerState(id: string): TimerState | undefined {
    return timerStates.get(id)
  }

  /**
   * Set the sendCommand function reference.
   */
  function setSendCommand(fn: (command: string) => void): void {
    sendCommandFn = fn
  }

  /**
   * Set the addLogEntry function reference.
   */
  function setAddLogEntry(fn: (category: string, text: string) => void): void {
    addLogEntryFn = fn
  }

  // =========================================================================
  // Sound Playback
  // =========================================================================

  async function initAudioContext(): Promise<AudioContext> {
    if (!audioContext) {
      audioContext = new (
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
      )()
    }
    if (audioContext.state === 'suspended') {
      await audioContext.resume()
    }
    return audioContext
  }

  async function loadSound(url: string): Promise<AudioBuffer> {
    if (soundCache.has(url)) {
      return soundCache.get(url)!
    }

    const ctx = await initAudioContext()
    const response = await fetch(url)
    const arrayBuffer = await response.arrayBuffer()
    const audioBuffer = await ctx.decodeAudioData(arrayBuffer)
    soundCache.set(url, audioBuffer)
    return audioBuffer
  }

  async function playSound(action: TriggerActionSound): Promise<void> {
    try {
      const ctx = await initAudioContext()
      const url =
        action.sound === 'custom' && action.customUrl
          ? action.customUrl
          : PREDEFINED_SOUNDS[action.sound as keyof typeof PREDEFINED_SOUNDS]

      if (!url) return

      const buffer = await loadSound(url)
      const source = ctx.createBufferSource()
      source.buffer = buffer

      const gainNode = ctx.createGain()
      gainNode.gain.value = action.volume ?? 0.5

      source.connect(gainNode)
      gainNode.connect(ctx.destination)
      source.start()
    } catch (error) {
      console.error('[Timers] Failed to play sound:', error)
    }
  }

  // =========================================================================
  // Query Helpers
  // =========================================================================

  /**
   * Check if a timer name is already in use.
   */
  function isNameInUse(
    name: string,
    excludeId?: string,
    scope?: TimerScope,
    charName?: string | null,
  ): boolean {
    const normalizedName = name.trim().toLowerCase()

    return timers.value.some((timer) => {
      if (timer.id === excludeId) return false
      if (timer.name.toLowerCase() !== normalizedName) return false

      // If checking for a specific scope, only flag conflict in same scope
      if (scope === 'global' && timer.scope === 'global') return true
      if (scope === 'character' && timer.scope === 'character' && timer.characterName === charName)
        return true

      // If no scope specified, any match is a conflict
      if (scope === undefined) return true

      return false
    })
  }

  /**
   * Validate interval value.
   */
  function validateInterval(ms: number): { valid: boolean; error?: string } {
    if (ms < TIMER_CONSTRAINTS.MIN_INTERVAL_MS) {
      return {
        valid: false,
        error: `Minimum interval is ${formatInterval(TIMER_CONSTRAINTS.MIN_INTERVAL_MS)}`,
      }
    }
    if (ms > TIMER_CONSTRAINTS.MAX_INTERVAL_MS) {
      return {
        valid: false,
        error: `Maximum interval is ${formatInterval(TIMER_CONSTRAINTS.MAX_INTERVAL_MS)}`,
      }
    }
    return { valid: true }
  }

  /**
   * Export timers as JSON string.
   */
  function exportTimers(): string {
    return JSON.stringify(
      {
        version: STORAGE_VERSION,
        timers: timers.value,
        exportedAt: new Date().toISOString(),
      },
      null,
      2,
    )
  }

  /**
   * Import timers from JSON string.
   */
  function importTimers(json: string, mode: 'replace' | 'merge' = 'merge'): number {
    try {
      if (!canMutate()) {
        throw new ClientSettingsStorageError(
          storageError.value ?? 'Timer settings are not ready to import.',
        )
      }
      const imported = parseClientSettingsCollection(json, 'timers')
      const now = Date.now()
      const reservedIds = new Set(timers.value.map((timer) => timer.id))
      const nextId = () => {
        const id = createClientId(reservedIds)
        reservedIds.add(id)
        return id
      }
      const normalizedImported = imported.map((item, index) =>
        normalizeTimerImport(item, index, nextId(), now, mode === 'replace'),
      )

      // Stop all running timers before import
      const wasInGame = store.connectionState === 'in_game'
      stopAllTimers()

      if (mode === 'replace') {
        if (!commitTimers(normalizedImported)) {
          if (wasInGame) startAllTimers()
          throw new ClientSettingsStorageError(storageError.value ?? 'Timers could not be saved.')
        }
      } else {
        // Merge: add non-conflicting names
        const nextTimers = [...timers.value]
        let accepted = 0
        for (const timer of normalizedImported) {
          if (
            !nextTimers.some(
              (existing) =>
                existing.name.trim().toLowerCase() === timer.name.toLowerCase() &&
                existing.scope === timer.scope &&
                existing.characterName === timer.characterName,
            )
          ) {
            nextTimers.push(timer)
            accepted += 1
          }
        }
        if (!commitTimers(nextTimers)) {
          if (wasInGame) startAllTimers()
          throw new ClientSettingsStorageError(storageError.value ?? 'Timers could not be saved.')
        }
        if (wasInGame) {
          startAllTimers()
        }
        return accepted
      }

      // Restart timers if in-game
      if (wasInGame) {
        startAllTimers()
      }

      return normalizedImported.length
    } catch (error) {
      console.error('[Timers] Import failed:', error)
      throw error
    }
  }

  // =========================================================================
  // Initialization
  // =========================================================================

  // Watch for account changes and reload timers. The composable is used by
  // several components and message handlers, so only one watcher is allowed.
  if (!accountWatcherInitialized) {
    accountWatcherInitialized = true
    watch(
      accountName,
      (newAccount, oldAccount) => {
        if (newAccount !== oldAccount) {
          stopAllTimers()
          loadTimers()
        }
      },
      { immediate: true },
    )
  }

  // Watch for character changes - restart timers to pick up character-specific ones
  watch(characterName, () => {
    if (store.connectionState === 'in_game') {
      stopAllTimers()
      startAllTimers()
    }
  })

  // Watch for entering in_game state - auto-start enabled timers
  watch(
    () => store.connectionState,
    (newState, oldState) => {
      if (newState === 'in_game' && oldState !== 'in_game') {
        // small delay to ensure character/account state is ready
        setTimeout(() => startAllTimers(), 100)
      }
    },
  )

  return {
    // State
    timers,
    isLoaded,
    storageError,
    echoTimers,
    timerStates,

    // Settings
    setEchoTimers,

    // Computed
    effectiveTimers,
    globalTimers,
    currentCharacterTimers,
    runningTimers,

    // CRUD
    addTimer,
    updateTimer,
    deleteTimer,
    toggleTimer,
    setTimerEnabled,
    setTimerGroup,
    duplicateTimer,

    // Execution
    startTimer,
    stopTimer,
    startAllTimers,
    stopAllTimers,
    getTimerState,
    setSendCommand,
    setAddLogEntry,

    // Helpers
    getCharacterTimers,
    isNameInUse,
    validateInterval,
    exportTimers,
    importTimers,
    loadTimers,
  }
}
