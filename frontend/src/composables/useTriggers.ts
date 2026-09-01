import { ref, computed, watch } from 'vue'
import { useMudStore } from '@/stores/mudStore'
import { useGroups } from './useGroups'
import { stripAnsiCodes } from '@/utils/ansiParser'
import { expandGmcpVariables, evaluateCondition } from '@/utils/gmcpVariables'
import { expandScript } from '@/utils/scriptExpander'
import type {
  Trigger,
  TriggerPattern,
  TriggerFormData,
  TriggerStorage,
  TriggerProcessResult,
  TriggerScope,
  TriggerPatternLogic,
  TriggerActionSound,
} from '@/types/trigger'
import { HIGHLIGHT_COLORS, PREDEFINED_SOUNDS } from '@/types/trigger'
import { createClientId } from '@/utils/clientId'
import { ClientSettingsStorageError, writeClientSettings } from '@/utils/clientSettingsStorage'
import { parseClientSettingsCollection } from '@/utils/clientSettingsImport'
import { normalizeTriggerForm, normalizeTriggerImport } from '@/utils/clientSettingsValidation'

const STORAGE_VERSION = 5
const STORAGE_KEY_PREFIX = 'duris_triggers_'

// Global state (shared across components)
const triggers = ref<Trigger[]>([])
const isLoaded = ref(false)
const echoTriggers = ref(false)
const muteSounds = ref(false)
const storageError = ref<string | null>(null)
let accountWatcherInitialized = false

// Audio context for sounds (lazy-initialized)
let audioContext: AudioContext | null = null
const soundCache = new Map<string, AudioBuffer>()

// Track GMCP condition states for edge detection (triggerId -> patternValue -> lastState)
const gmcpConditionStates = new Map<string, Map<string, boolean>>()

export function useTriggers() {
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
   * Load triggers from localStorage for current account.
   */
  function loadTriggers(): void {
    storageError.value = null
    if (!storageKey.value) {
      triggers.value = []
      echoTriggers.value = false
      muteSounds.value = false
      isLoaded.value = false
      return
    }

    try {
      const stored = localStorage.getItem(storageKey.value)
      if (!stored) {
        triggers.value = []
        echoTriggers.value = false
        muteSounds.value = false
        isLoaded.value = true
        return
      }

      const data: TriggerStorage = JSON.parse(stored)

      // Handle version migrations

      let migratedTriggers: any[] = data.triggers || []

      // Version 1 -> 2: Convert pattern (string) to patterns (string[])
      if (data.version < 2) {
        migratedTriggers = migratedTriggers.map((trigger) => {
          if ('pattern' in trigger && typeof trigger.pattern === 'string') {
            const { pattern, ...rest } = trigger
            return {
              ...rest,
              patterns: [pattern],
            }
          }
          if (!trigger.patterns) {
            return { ...trigger, patterns: [''] }
          }
          return trigger
        })
      }

      // Version 2 -> 3: Convert patterns string[] to TriggerPattern[], handle condition field
      if (data.version < 3) {
        migratedTriggers = migratedTriggers.map((trigger) => {
          // Check if patterns are already in new format
          const firstPattern = trigger.patterns?.[0]
          if (firstPattern && typeof firstPattern === 'object' && 'value' in firstPattern) {
            // Already migrated - remove old condition field if present
            const { condition: _condition, ...rest } = trigger
            return rest
          }

          // Convert string[] to TriggerPattern[]
          const newPatterns: TriggerPattern[] = (trigger.patterns || []).map((p: string) => ({
            value: p,
            isGmcp: false,
          }))

          // If there was a condition field, add it as a GMCP pattern
          if (trigger.condition && trigger.condition.trim()) {
            newPatterns.push({
              value: trigger.condition.trim(),
              isGmcp: true,
            })
          }

          const { condition: _cond, patterns: _patterns, ...rest } = trigger
          return {
            ...rest,
            patterns: newPatterns,
          }
        })
      }

      // Version 3 -> 4: Add patternLogic field (default to 'or' for backward compatibility)
      if (data.version < 4) {
        migratedTriggers = migratedTriggers.map((trigger) => {
          if (!trigger.patternLogic) {
            return { ...trigger, patternLogic: 'or' as TriggerPatternLogic }
          }
          return trigger
        })
      }

      // Version 4 -> 5: Add groupId field
      if (data.version < 5) {
        migratedTriggers = migratedTriggers.map((trigger) => {
          if (trigger.groupId === undefined) {
            return { ...trigger, groupId: null }
          }
          return trigger
        })
      }

      triggers.value = migratedTriggers as Trigger[]
      echoTriggers.value = data.echoTriggers ?? false
      muteSounds.value = data.muteSounds ?? false
      isLoaded.value = true
      storageError.value = null

      // Save if migrated to persist changes
      if (data.version < STORAGE_VERSION) {
        saveTriggers()
      }
    } catch (error) {
      console.error('[Triggers] Failed to load:', error)
      triggers.value = []
      echoTriggers.value = false
      muteSounds.value = false
      isLoaded.value = true
      storageError.value = 'Saved triggers could not be loaded. The stored data may be invalid.'
    }
  }

  /**
   * Save triggers to localStorage.
   */
  function saveTriggers(): boolean {
    if (!storageKey.value) {
      storageError.value = 'No active MUD account is available for trigger settings.'
      return false
    }

    try {
      const data: TriggerStorage = {
        version: STORAGE_VERSION,
        triggers: triggers.value,
        echoTriggers: echoTriggers.value,
        muteSounds: muteSounds.value,
      }
      writeClientSettings(storageKey.value, data)
      storageError.value = null
      return true
    } catch (error) {
      console.error('[Triggers] Failed to save:', error)
      storageError.value =
        error instanceof ClientSettingsStorageError
          ? error.message
          : 'Client settings could not be saved.'
      return false
    }
  }

  function canMutate(): boolean {
    if (!storageKey.value) {
      storageError.value = 'No active MUD account is available for trigger settings.'
      return false
    }
    if (!isLoaded.value) {
      storageError.value = 'Trigger settings are still loading. Try again in a moment.'
      return false
    }
    return true
  }

  function commitTriggers(nextTriggers: Trigger[]): boolean {
    if (!canMutate()) return false

    const previousTriggers = triggers.value
    triggers.value = nextTriggers
    if (saveTriggers()) return true

    triggers.value = previousTriggers
    return false
  }

  /**
   * Set echo triggers setting.
   */
  function setEchoTriggers(value: boolean): boolean {
    if (!canMutate()) return false
    const previous = echoTriggers.value
    echoTriggers.value = value
    if (saveTriggers()) return true
    echoTriggers.value = previous
    return false
  }

  /**
   * Set mute sounds setting.
   */
  function setMuteSounds(value: boolean): boolean {
    if (!canMutate()) return false
    const previous = muteSounds.value
    muteSounds.value = value
    if (saveTriggers()) return true
    muteSounds.value = previous
    return false
  }

  // =========================================================================
  // CRUD Operations
  // =========================================================================

  /**
   * Generate a unique ID for a new trigger.
   */
  function generateId(): string {
    return createClientId(triggers.value.map((trigger) => trigger.id))
  }

  /**
   * Add a new trigger.
   */
  function addTrigger(formData: TriggerFormData): Trigger | null {
    if (!canMutate()) return null
    const now = Date.now()

    try {
      const trigger = normalizeTriggerForm(formData, generateId(), now)
      return commitTriggers([...triggers.value, trigger]) ? trigger : null
    } catch (error) {
      console.error('[Triggers] Invalid trigger:', error)
      storageError.value = error instanceof Error ? error.message : 'Trigger settings are invalid.'
      return null
    }
  }

  /**
   * Update an existing trigger.
   */
  function updateTrigger(id: string, formData: Partial<TriggerFormData>): Trigger | null {
    if (!canMutate()) return null
    const index = triggers.value.findIndex((t) => t.id === id)
    if (index === -1) return null

    const trigger = triggers.value[index]
    if (!trigger) return null

    try {
      const updated = normalizeTriggerForm(
        { ...trigger, ...formData, createdAt: trigger.createdAt },
        trigger.id,
        Date.now(),
      )
      const nextTriggers = [...triggers.value]
      nextTriggers[index] = updated
      return commitTriggers(nextTriggers) ? updated : null
    } catch (error) {
      console.error('[Triggers] Invalid trigger update:', error)
      storageError.value = error instanceof Error ? error.message : 'Trigger settings are invalid.'
      return null
    }
  }

  /**
   * Delete a trigger.
   */
  function deleteTrigger(id: string): boolean {
    if (!canMutate()) return false
    const index = triggers.value.findIndex((t) => t.id === id)
    if (index === -1) return false

    return commitTriggers(triggers.value.filter((_, triggerIndex) => triggerIndex !== index))
  }

  /**
   * Toggle trigger enabled state.
   */
  function toggleTrigger(id: string): boolean {
    if (!canMutate()) return false
    const index = triggers.value.findIndex((t) => t.id === id)
    if (index === -1) return false

    const trigger = triggers.value[index]
    if (!trigger) return false

    const nextTriggers = [...triggers.value]
    nextTriggers[index] = {
      ...trigger,
      enabled: !trigger.enabled,
      updatedAt: Date.now(),
    }
    return commitTriggers(nextTriggers)
  }

  /**
   * Set trigger enabled state to a specific value.
   */
  function setTriggerEnabled(id: string, enabled: boolean): boolean {
    if (!canMutate()) return false
    const index = triggers.value.findIndex((t) => t.id === id)
    if (index === -1) return false

    const trigger = triggers.value[index]
    if (!trigger) return false

    const nextTriggers = [...triggers.value]
    nextTriggers[index] = {
      ...trigger,
      enabled,
      updatedAt: Date.now(),
    }
    return commitTriggers(nextTriggers)
  }

  function setTriggerGroup(id: string, groupId: string | null): boolean {
    if (!canMutate()) return false
    const index = triggers.value.findIndex((t) => t.id === id)
    if (index === -1) return false

    const trigger = triggers.value[index]
    if (!trigger) return false

    const nextTriggers = [...triggers.value]
    nextTriggers[index] = {
      ...trigger,
      groupId,
      updatedAt: Date.now(),
    }
    return commitTriggers(nextTriggers)
  }

  /**
   * Duplicate a trigger.
   */
  function duplicateTrigger(id: string): Trigger | null {
    const original = triggers.value.find((t) => t.id === id)
    if (!original) return null

    return addTrigger({
      name: `${original.name} (copy)`,
      patterns: original.patterns.map((p) => ({ value: p.value, isGmcp: p.isGmcp })),
      patternLogic: original.patternLogic || 'or',
      patternType: original.patternType,
      caseSensitive: original.caseSensitive,
      actions: JSON.parse(JSON.stringify(original.actions)),
      enabled: false,
      scope: original.scope,
      characterName: original.characterName,
      description: original.description,
      priority: original.priority,
      stopProcessing: original.stopProcessing,
      groupId: original.groupId,
    })
  }

  // =========================================================================
  // Trigger Resolution
  // =========================================================================

  /**
   * Get effective triggers for current context, sorted by priority.
   * Character-specific triggers with same name override global.
   */
  const effectiveTriggers = computed((): Trigger[] => {
    if (!isLoaded.value) return []

    const currentChar = characterName.value

    // Filter to enabled triggers that apply to current context
    const applicable = triggers.value.filter((trigger) => {
      if (!trigger.enabled) return false
      if (!isGroupEffectivelyEnabled(trigger.groupId)) return false
      if (trigger.scope === 'global') return true
      if (trigger.scope === 'character' && trigger.characterName === currentChar) return true
      return false
    })

    // Build map with character-specific taking precedence (by name)
    const triggerMap = new Map<string, Trigger>()

    // First add global triggers
    for (const trigger of applicable.filter((t) => t.scope === 'global')) {
      triggerMap.set(trigger.name, trigger)
    }

    // Then override with character-specific
    for (const trigger of applicable.filter((t) => t.scope === 'character')) {
      triggerMap.set(trigger.name, trigger)
    }

    // Sort by priority (descending - higher priority first)
    return Array.from(triggerMap.values()).sort((a, b) => b.priority - a.priority)
  })

  /**
   * Test if a pattern matches the text
   */
  function matchPattern(
    text: string,
    pattern: string,
    patternType: 'substring' | 'regex',
    caseSensitive: boolean,
  ): RegExpMatchArray | null {
    if (!pattern || !text) return null

    if (patternType === 'substring') {
      const searchText = caseSensitive ? text : text.toLowerCase()
      const searchPattern = caseSensitive ? pattern : pattern.toLowerCase()
      if (searchText.includes(searchPattern)) {
        // Return a fake match array for consistency
        return [searchPattern] as RegExpMatchArray
      }
      return null
    } else {
      try {
        const flags = caseSensitive ? '' : 'i'
        const regex = new RegExp(pattern, flags)
        return text.match(regex)
      } catch {
        // Invalid regex
        return null
      }
    }
  }

  /**
   * Expand capture groups in command string
   * $0 = full match, $1-$9 = capture groups, $* = all captures joined
   */
  function expandCaptures(command: string, match: RegExpMatchArray | null): string {
    if (!match) return command

    let result = command

    // $0 = full match
    result = result.replace(/\$0/g, match[0] || '')

    // $* = all captures joined with space
    const captures = match.slice(1).filter(Boolean)
    result = result.replace(/\$\*/g, captures.join(' '))

    // $1-$9 = individual captures
    for (let i = 1; i <= 9; i++) {
      result = result.replace(new RegExp(`\\$${i}`, 'g'), match[i] || '')
    }

    return result.trim()
  }

  /**
   * Process a line of text through all effective triggers.
   * Returns processing result with gag status, highlights, commands, sounds.
   */
  function processLine(text: string): TriggerProcessResult {
    const result: TriggerProcessResult = {
      originalText: text,
      gagged: false,
      commandsToSend: [],
      soundsToPlay: [],
      echoTexts: [],
      matchedTriggers: [],
    }

    // Strip ANSI codes for pattern matching
    const plainText = stripAnsiCodes(text)

    for (const trigger of effectiveTriggers.value) {
      // Separate text patterns from GMCP patterns
      const textPatterns = trigger.patterns.filter((p) => p && p.value && !p.isGmcp)
      const gmcpPatterns = trigger.patterns.filter((p) => p && p.value && p.isGmcp)

      let match: RegExpMatchArray | null = null
      let triggerMatched = false

      // Check if this is a GMCP-only trigger (no text patterns)
      const isGmcpOnly = textPatterns.length === 0 && gmcpPatterns.length > 0

      if (isGmcpOnly) {
        // GMCP-only trigger: ALL conditions must be true (AND logic)
        // Fire only when combined result transitions from false to true (edge detection)
        const allConditionsTrue = gmcpPatterns.every((p) => evaluateCondition(p.value))

        // Get previous combined state
        if (!gmcpConditionStates.has(trigger.id)) {
          gmcpConditionStates.set(trigger.id, new Map())
        }
        const triggerStates = gmcpConditionStates.get(trigger.id)!
        const previousCombinedState = triggerStates.get('__combined__') ?? false

        // Update combined state
        triggerStates.set('__combined__', allConditionsTrue)

        // Fire only on rising edge (false -> true)
        if (allConditionsTrue && !previousCombinedState) {
          triggerMatched = true
        }
      } else {
        // Mixed trigger or text-only
        const useAndLogic = trigger.patternLogic === 'and'

        if (useAndLogic && textPatterns.length > 0) {
          // AND logic: all text patterns must match
          let allTextMatched = true
          for (const pattern of textPatterns) {
            const patternMatch = matchPattern(
              plainText,
              pattern.value,
              trigger.patternType,
              trigger.caseSensitive,
            )
            if (patternMatch) {
              // keep last match for capture groups
              match = patternMatch
            } else {
              allTextMatched = false
              break
            }
          }
          if (allTextMatched) {
            // All text patterns matched, check GMCP conditions
            if (gmcpPatterns.length > 0) {
              const gmcpPasses = gmcpPatterns.every((gp) => evaluateCondition(gp.value))
              if (gmcpPasses) {
                triggerMatched = true
              }
            } else {
              triggerMatched = true
            }
          }
        } else {
          // OR logic: any text pattern match triggers
          for (const pattern of textPatterns) {
            match = matchPattern(
              plainText,
              pattern.value,
              trigger.patternType,
              trigger.caseSensitive,
            )
            if (match) {
              // Text matched, now check if GMCP conditions pass (AND logic with text)
              if (gmcpPatterns.length > 0) {
                // All GMCP conditions must pass
                const gmcpPasses = gmcpPatterns.every((gp) => evaluateCondition(gp.value))
                if (gmcpPasses) {
                  triggerMatched = true
                  break
                }
              } else {
                // No GMCP conditions, text match is enough
                triggerMatched = true
                break
              }
            }
          }
        }
      }

      if (triggerMatched) {
        result.matchedTriggers.push(trigger)

        // Process each action
        for (const action of trigger.actions) {
          switch (action.type) {
            case 'gag':
              result.gagged = true
              break

            case 'highlight':
              // Only apply first highlight (highest priority trigger)
              if (!result.highlightClass) {
                const colors = HIGHLIGHT_COLORS[action.backgroundColor]
                result.highlightClass = `${colors.bg} ${action.textColor ? HIGHLIGHT_COLORS[action.textColor].text : colors.text}`
              }
              break

            case 'command': {
              // expand captures, gmcp vars, then script constructs
              let commandStr = action.commands
              commandStr = expandCaptures(commandStr, match)
              commandStr = expandGmcpVariables(commandStr)
              commandStr = expandScript(commandStr)
              // split into commands after full expansion
              const commands = commandStr
                .split(';')
                .map((cmd) => cmd.trim())
                .filter((cmd) => cmd.length > 0)
              for (const cmd of commands) {
                result.commandsToSend.push({
                  command: cmd,
                  delay: action.delay ?? 0,
                })
              }
              break
            }

            case 'sound':
              result.soundsToPlay.push(action)
              break

            case 'echo': {
              // Expand capture groups, GMCP variables, and script constructs in echo text
              let echoText = expandCaptures(action.text, match)
              echoText = expandGmcpVariables(echoText)
              echoText = expandScript(echoText)
              if (echoText) {
                result.echoTexts.push(echoText)
              }
              break
            }
          }
        }

        // Stop processing if this trigger says so
        if (trigger.stopProcessing) {
          break
        }
      }
    }

    return result
  }

  /**
   * Evaluate GMCP-only triggers when vitals/state changes.
   * Called when Char.Vitals is received to check triggers that depend on GMCP state.
   * Returns commands and sounds to execute.
   */
  function evaluateGmcpTriggers(): {
    commandsToSend: { command: string; delay: number }[]
    soundsToPlay: TriggerActionSound[]
    echoTexts: string[]
  } {
    const result: {
      commandsToSend: { command: string; delay: number }[]
      soundsToPlay: TriggerActionSound[]
      echoTexts: string[]
    } = {
      commandsToSend: [],
      soundsToPlay: [],
      echoTexts: [],
    }

    for (const trigger of effectiveTriggers.value) {
      const textPatterns = trigger.patterns.filter((p) => p && p.value && !p.isGmcp)
      const gmcpPatterns = trigger.patterns.filter((p) => p && p.value && p.isGmcp)

      // Only process GMCP-only triggers here
      const isGmcpOnly = textPatterns.length === 0 && gmcpPatterns.length > 0
      if (!isGmcpOnly) continue

      // Evaluate all GMCP conditions (AND logic)
      const allConditionsTrue = gmcpPatterns.every((p) => evaluateCondition(p.value))

      // Get previous combined state
      if (!gmcpConditionStates.has(trigger.id)) {
        gmcpConditionStates.set(trigger.id, new Map())
      }
      const triggerStates = gmcpConditionStates.get(trigger.id)!
      const previousCombinedState = triggerStates.get('__combined__') ?? false

      // Update combined state
      triggerStates.set('__combined__', allConditionsTrue)

      // Fire only on rising edge (false -> true)
      if (allConditionsTrue && !previousCombinedState) {
        // Process actions
        for (const action of trigger.actions) {
          switch (action.type) {
            case 'command': {
              let commandStr = action.commands
              commandStr = expandGmcpVariables(commandStr)
              commandStr = expandScript(commandStr)
              const commands = commandStr
                .split(';')
                .map((cmd) => cmd.trim())
                .filter((cmd) => cmd.length > 0)
              for (const cmd of commands) {
                result.commandsToSend.push({
                  command: cmd,
                  delay: action.delay ?? 0,
                })
              }
              break
            }

            case 'sound':
              result.soundsToPlay.push(action)
              break

            case 'echo': {
              let echoText = expandGmcpVariables(action.text)
              echoText = expandScript(echoText)
              if (echoText) {
                result.echoTexts.push(echoText)
              }
              break
            }

            // gag and highlight don't apply to GMCP-only triggers (no line to modify)
          }
        }

        // Stop processing if this trigger says so
        if (trigger.stopProcessing) {
          break
        }
      }
    }

    return result
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
    if (muteSounds.value) return

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
      console.error('[Triggers] Failed to play sound:', error)
    }
  }

  async function playSounds(sounds: TriggerActionSound[]): Promise<void> {
    for (const sound of sounds) {
      await playSound(sound)
    }
  }

  // =========================================================================
  // Query Helpers
  // =========================================================================

  /**
   * Get all global triggers.
   */
  const globalTriggers = computed((): Trigger[] => {
    return triggers.value.filter((t) => t.scope === 'global')
  })

  /**
   * Get triggers for a specific character.
   */
  function getCharacterTriggers(charName: string): Trigger[] {
    return triggers.value.filter((t) => t.scope === 'character' && t.characterName === charName)
  }

  /**
   * Get triggers for current character.
   */
  const currentCharacterTriggers = computed((): Trigger[] => {
    if (!characterName.value) return []
    return getCharacterTriggers(characterName.value)
  })

  /**
   * Check if a trigger name is already in use.
   */
  function isNameInUse(
    name: string,
    excludeId?: string,
    scope?: TriggerScope,
    charName?: string | null,
  ): boolean {
    const normalizedName = name.trim().toLowerCase()

    return triggers.value.some((trigger) => {
      if (trigger.id === excludeId) return false
      if (trigger.name.toLowerCase() !== normalizedName) return false

      // If checking for a specific scope, only flag conflict in same scope
      if (scope === 'global' && trigger.scope === 'global') return true
      if (
        scope === 'character' &&
        trigger.scope === 'character' &&
        trigger.characterName === charName
      )
        return true

      // If no scope specified, any match is a conflict
      if (scope === undefined) return true

      return false
    })
  }

  /**
   * Validate a pattern.
   */
  function validatePattern(
    pattern: string,
    patternType: 'substring' | 'regex',
  ): { valid: boolean; error?: string } {
    if (!pattern.trim()) {
      return { valid: false, error: 'Pattern cannot be empty' }
    }

    if (patternType === 'regex') {
      try {
        new RegExp(pattern)
        return { valid: true }
      } catch (e) {
        return { valid: false, error: `Invalid regex: ${(e as Error).message}` }
      }
    }

    return { valid: true }
  }

  /**
   * Export triggers as JSON string.
   */
  function exportTriggers(): string {
    return JSON.stringify(
      {
        version: STORAGE_VERSION,
        triggers: triggers.value,
        exportedAt: new Date().toISOString(),
      },
      null,
      2,
    )
  }

  /**
   * Import triggers from JSON string.
   */
  function importTriggers(json: string, mode: 'replace' | 'merge' = 'merge'): number {
    try {
      if (!canMutate()) {
        throw new ClientSettingsStorageError(
          storageError.value ?? 'Trigger settings are not ready to import.',
        )
      }
      const imported = parseClientSettingsCollection(json, 'triggers')
      const now = Date.now()
      const reservedIds = new Set(triggers.value.map((trigger) => trigger.id))
      const nextId = () => {
        const id = createClientId(reservedIds)
        reservedIds.add(id)
        return id
      }
      const normalizedImported = imported.map((item, index) =>
        normalizeTriggerImport(item, index, nextId(), now, mode === 'replace'),
      )

      if (mode === 'replace') {
        if (!commitTriggers(normalizedImported)) {
          throw new ClientSettingsStorageError(storageError.value ?? 'Triggers could not be saved.')
        }
      } else {
        // Merge: add non-conflicting names
        const nextTriggers = [...triggers.value]
        let accepted = 0
        for (const trigger of normalizedImported) {
          if (
            !nextTriggers.some(
              (existing) =>
                existing.name.trim().toLowerCase() === trigger.name.toLowerCase() &&
                existing.scope === trigger.scope &&
                existing.characterName === trigger.characterName,
            )
          ) {
            nextTriggers.push(trigger)
            accepted += 1
          }
        }
        if (!commitTriggers(nextTriggers)) {
          throw new ClientSettingsStorageError(storageError.value ?? 'Triggers could not be saved.')
        }
        return accepted
      }

      return normalizedImported.length
    } catch (error) {
      console.error('[Triggers] Import failed:', error)
      throw error
    }
  }

  // =========================================================================
  // Initialization
  // =========================================================================

  // Watch for account changes and reload triggers. The composable is used by
  // several components and message handlers, so only one watcher is allowed.
  if (!accountWatcherInitialized) {
    accountWatcherInitialized = true
    watch(
      accountName,
      (newAccount, oldAccount) => {
        if (newAccount !== oldAccount) {
          loadTriggers()
        }
      },
      { immediate: true },
    )
  }

  return {
    // State
    triggers,
    isLoaded,
    storageError,
    echoTriggers,
    muteSounds,

    // Settings
    setEchoTriggers,
    setMuteSounds,

    // Computed
    effectiveTriggers,
    globalTriggers,
    currentCharacterTriggers,

    // CRUD
    addTrigger,
    updateTrigger,
    deleteTrigger,
    toggleTrigger,
    setTriggerEnabled,
    setTriggerGroup,
    duplicateTrigger,

    // Processing
    processLine,
    evaluateGmcpTriggers,
    playSounds,

    // Helpers
    getCharacterTriggers,
    isNameInUse,
    validatePattern,
    exportTriggers,
    importTriggers,
    loadTriggers,
  }
}
