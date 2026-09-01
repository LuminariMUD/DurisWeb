import type { Alias, AliasScope } from '@/types/alias'
import type { Group } from '@/types/group'
import type { Timer, TimerAction } from '@/types/timer'
import type {
  Trigger,
  TriggerAction,
  TriggerActionCommand,
  TriggerActionEcho,
  TriggerActionHighlight,
  TriggerActionSound,
  TriggerPattern,
  TriggerPatternLogic,
  TriggerPatternType,
  TriggerScope,
  TriggerSound,
  TriggerHighlightColor,
} from '@/types/trigger'

export const MAX_ALIAS_TRIGGER_LENGTH = 100
export const MAX_ALIAS_EXPANSION_LENGTH = 5_000
export const MAX_TRIGGER_NAME_LENGTH = 255
export const MAX_TRIGGER_PATTERN_LENGTH = 500
export const MAX_TRIGGER_PATTERNS = 50
export const MAX_TRIGGER_ACTIONS = 50
export const MAX_TRIGGER_COMMAND_LENGTH = 5_000
export const MAX_TRIGGER_ECHO_LENGTH = 5_000
export const MAX_TRIGGER_DESCRIPTION_LENGTH = 2_000
export const MAX_CUSTOM_SOUND_URL_LENGTH = 2_048
export const MAX_TRIGGER_DELAY_MS = 10 * 60 * 1_000
export const MAX_REGEX_LENGTH = 500

const ALIAS_SCOPES: readonly AliasScope[] = ['global', 'character']
const TRIGGER_SCOPES: readonly TriggerScope[] = ['global', 'character']
const PATTERN_LOGIC: readonly TriggerPatternLogic[] = ['or', 'and']
const PATTERN_TYPES: readonly TriggerPatternType[] = ['substring', 'regex']
const SOUNDS: readonly TriggerSound[] = ['beep', 'chime', 'alert', 'ding', 'bell', 'custom']
const HIGHLIGHT_COLORS: readonly TriggerHighlightColor[] = [
  'red',
  'orange',
  'yellow',
  'green',
  'blue',
  'purple',
  'pink',
  'cyan',
  'white',
]

function record(value: unknown, kind: string, index: number): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`Invalid ${kind} at index ${index}: expected an object`)
  }
  return value as Record<string, unknown>
}

function requiredString(
  value: unknown,
  kind: string,
  index: number,
  field: string,
  maxLength: number,
  allowEmpty = false,
): string {
  if (typeof value !== 'string') {
    throw new Error(`Invalid ${kind} at index ${index}: ${field} must be a string`)
  }

  const normalized = value.trim()
  if (!allowEmpty && normalized.length === 0) {
    throw new Error(`Invalid ${kind} at index ${index}: ${field} cannot be empty`)
  }

  if (normalized.length > maxLength) {
    throw new Error(`Invalid ${kind} at index ${index}: ${field} exceeds ${maxLength} characters`)
  }

  return normalized
}

function optionalString(
  value: unknown,
  kind: string,
  index: number,
  field: string,
  maxLength: number,
): string | null | undefined {
  if (value === undefined || value === null) return value
  return requiredString(value, kind, index, field, maxLength, true) || undefined
}

function booleanField(
  value: unknown,
  kind: string,
  index: number,
  field: string,
  defaultValue: boolean,
): boolean {
  if (value === undefined) return defaultValue
  if (typeof value !== 'boolean') {
    throw new Error(`Invalid ${kind} at index ${index}: ${field} must be a boolean`)
  }
  return value
}

function enumField<T extends string>(
  value: unknown,
  kind: string,
  index: number,
  field: string,
  allowed: readonly T[],
  defaultValue: T,
): T {
  if (value === undefined) return defaultValue
  if (typeof value !== 'string' || !allowed.includes(value as T)) {
    throw new Error(`Invalid ${kind} at index ${index}: ${field} is invalid`)
  }
  return value as T
}

function finiteNumberField(
  value: unknown,
  kind: string,
  index: number,
  field: string,
  min: number,
  max: number,
  defaultValue: number,
): number {
  if (value === undefined) return defaultValue
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) {
    throw new Error(`Invalid ${kind} at index ${index}: ${field} must be between ${min} and ${max}`)
  }
  return value
}

function integerField(
  value: unknown,
  kind: string,
  index: number,
  field: string,
  min: number,
  max: number,
  defaultValue: number,
): number {
  const normalized = finiteNumberField(value, kind, index, field, min, max, defaultValue)
  if (!Number.isInteger(normalized)) {
    throw new Error(`Invalid ${kind} at index ${index}: ${field} must be an integer`)
  }
  return normalized
}

function timestampField(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : fallback
}

function validateCustomSoundUrl(
  value: unknown,
  kind: string,
  index: number,
  actionIndex: number,
): string {
  const url = requiredString(
    value,
    kind,
    index,
    `action ${actionIndex} customUrl`,
    MAX_CUSTOM_SOUND_URL_LENGTH,
  )
  if (url.startsWith('/') && !url.startsWith('//')) return url

  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    throw new Error(
      `Invalid ${kind} at index ${index}: action ${actionIndex} customUrl must be an HTTPS or same-origin URL`,
    )
  }

  if (parsed.protocol !== 'https:') {
    throw new Error(
      `Invalid ${kind} at index ${index}: action ${actionIndex} customUrl must be an HTTPS or same-origin URL`,
    )
  }

  return parsed.toString()
}

function normalizeAction(
  value: unknown,
  kind: string,
  index: number,
  actionIndex: number,
): TriggerAction {
  const action = record(value, `${kind} action`, index)
  const type = action.type

  if (type === 'command') {
    const command: TriggerActionCommand = {
      type,
      commands: requiredString(
        action.commands,
        kind,
        index,
        `action ${actionIndex} commands`,
        MAX_TRIGGER_COMMAND_LENGTH,
      ),
      delay: integerField(
        action.delay,
        kind,
        index,
        `action ${actionIndex} delay`,
        0,
        MAX_TRIGGER_DELAY_MS,
        0,
      ),
    }
    return command.delay === 0 ? { type: command.type, commands: command.commands } : command
  }

  if (type === 'highlight') {
    const highlight: TriggerActionHighlight = {
      type,
      backgroundColor: enumField(
        action.backgroundColor,
        kind,
        index,
        `action ${actionIndex} backgroundColor`,
        HIGHLIGHT_COLORS,
        'white',
      ),
    }
    const textColor =
      action.textColor === undefined
        ? undefined
        : enumField(
            action.textColor,
            kind,
            index,
            `action ${actionIndex} textColor`,
            HIGHLIGHT_COLORS,
            'white',
          )
    return textColor ? { ...highlight, textColor } : highlight
  }

  if (type === 'sound') {
    const sound = enumField(
      action.sound,
      kind,
      index,
      `action ${actionIndex} sound`,
      SOUNDS,
      'beep',
    )
    const soundAction: TriggerActionSound = {
      type,
      sound,
      volume: finiteNumberField(
        action.volume,
        kind,
        index,
        `action ${actionIndex} volume`,
        0,
        1,
        0.5,
      ),
    }
    if (sound === 'custom') {
      soundAction.customUrl = validateCustomSoundUrl(action.customUrl, kind, index, actionIndex)
    }
    return soundAction
  }

  if (type === 'gag') {
    return { type }
  }

  if (type === 'echo') {
    const echo: TriggerActionEcho = {
      type,
      text: requiredString(
        action.text,
        kind,
        index,
        `action ${actionIndex} text`,
        MAX_TRIGGER_ECHO_LENGTH,
      ),
    }
    return echo
  }

  throw new Error(`Invalid ${kind} at index ${index}: action ${actionIndex} type is invalid`)
}

function normalizePatterns(value: unknown, kind: string, index: number): TriggerPattern[] {
  if (!Array.isArray(value)) {
    throw new Error(`Invalid ${kind} at index ${index}: patterns must be an array`)
  }
  if (value.length > MAX_TRIGGER_PATTERNS) {
    throw new Error(
      `Invalid ${kind} at index ${index}: patterns exceed ${MAX_TRIGGER_PATTERNS} items`,
    )
  }

  return value.map((entry, patternIndex) => {
    const pattern = record(entry, `${kind} pattern`, index)
    const patternValue = requiredString(
      pattern.value,
      kind,
      index,
      `pattern ${patternIndex} value`,
      MAX_TRIGGER_PATTERN_LENGTH,
    )
    if (pattern.isGmcp !== undefined && typeof pattern.isGmcp !== 'boolean') {
      throw new Error(
        `Invalid ${kind} at index ${index}: pattern ${patternIndex} isGmcp must be a boolean`,
      )
    }
    return { value: patternValue, isGmcp: pattern.isGmcp === true }
  })
}

function normalizeActions(value: unknown, kind: string, index: number): TriggerAction[] {
  if (!Array.isArray(value)) {
    throw new Error(`Invalid ${kind} at index ${index}: actions must be an array`)
  }
  if (value.length > MAX_TRIGGER_ACTIONS) {
    throw new Error(
      `Invalid ${kind} at index ${index}: actions exceed ${MAX_TRIGGER_ACTIONS} items`,
    )
  }
  return value.map((entry, actionIndex) => normalizeAction(entry, kind, index, actionIndex))
}

export function normalizeAliasImport(
  value: unknown,
  index: number,
  generatedId: string,
  now: number,
  preserveCreatedAt: boolean,
): Alias {
  const alias = record(value, 'alias', index)
  const scope = enumField(alias.scope, 'alias', index, 'scope', ALIAS_SCOPES, 'global')
  const characterName =
    optionalString(alias.characterName, 'alias', index, 'characterName', 100) ?? null
  const groupId = optionalString(alias.groupId, 'alias', index, 'groupId', 100) ?? null
  const description = optionalString(alias.description, 'alias', index, 'description', 2_000)

  return {
    id: generatedId,
    trigger: requiredString(
      alias.trigger,
      'alias',
      index,
      'trigger',
      MAX_ALIAS_TRIGGER_LENGTH,
    ).toLowerCase(),
    expansion: requiredString(
      alias.expansion,
      'alias',
      index,
      'expansion',
      MAX_ALIAS_EXPANSION_LENGTH,
    ),
    enabled: booleanField(alias.enabled, 'alias', index, 'enabled', true),
    scope,
    characterName: scope === 'character' ? characterName : null,
    groupId,
    ...(description ? { description } : {}),
    createdAt: preserveCreatedAt ? timestampField(alias.createdAt, now) : now,
    updatedAt: now,
  }
}

export function normalizeTriggerImport(
  value: unknown,
  index: number,
  generatedId: string,
  now: number,
  preserveCreatedAt: boolean,
): Trigger {
  const trigger = record(value, 'trigger', index)
  const scope = enumField(trigger.scope, 'trigger', index, 'scope', TRIGGER_SCOPES, 'global')
  const characterName =
    optionalString(trigger.characterName, 'trigger', index, 'characterName', 100) ?? null
  const groupId = optionalString(trigger.groupId, 'trigger', index, 'groupId', 100) ?? null
  const description = optionalString(
    trigger.description,
    'trigger',
    index,
    'description',
    MAX_TRIGGER_DESCRIPTION_LENGTH,
  )
  const patternType = enumField(
    trigger.patternType,
    'trigger',
    index,
    'patternType',
    PATTERN_TYPES,
    'substring',
  )
  const patterns = normalizePatterns(trigger.patterns, 'trigger', index)

  if (patternType === 'regex') {
    for (const [patternIndex, pattern] of patterns.entries()) {
      if (pattern.isGmcp) continue
      if (pattern.value.length > MAX_REGEX_LENGTH) {
        throw new Error(
          `Invalid trigger at index ${index}: pattern ${patternIndex} regex exceeds ${MAX_REGEX_LENGTH} characters`,
        )
      }
      try {
        new RegExp(pattern.value)
      } catch {
        throw new Error(
          `Invalid trigger at index ${index}: pattern ${patternIndex} regex is invalid`,
        )
      }
    }
  }

  return {
    id: generatedId,
    name: requiredString(trigger.name, 'trigger', index, 'name', MAX_TRIGGER_NAME_LENGTH),
    patterns,
    patternLogic: enumField(
      trigger.patternLogic,
      'trigger',
      index,
      'patternLogic',
      PATTERN_LOGIC,
      'or',
    ),
    patternType,
    caseSensitive: booleanField(trigger.caseSensitive, 'trigger', index, 'caseSensitive', false),
    actions: normalizeActions(trigger.actions, 'trigger', index),
    enabled: booleanField(trigger.enabled, 'trigger', index, 'enabled', true),
    scope,
    characterName: scope === 'character' ? characterName : null,
    groupId,
    ...(description ? { description } : {}),
    priority: integerField(trigger.priority, 'trigger', index, 'priority', -1_000, 1_000, 0),
    stopProcessing: booleanField(trigger.stopProcessing, 'trigger', index, 'stopProcessing', false),
    createdAt: preserveCreatedAt ? timestampField(trigger.createdAt, now) : now,
    updatedAt: now,
  }
}

export function normalizeGroupImport(
  value: unknown,
  index: number,
  generatedId: string,
  now: number,
  preserveCreatedAt: boolean,
): Group {
  const group = record(value, 'group', index)
  const parentId = optionalString(group.parentId, 'group', index, 'parentId', 100) ?? null

  return {
    id: generatedId,
    name: requiredString(group.name, 'group', index, 'name', 255),
    parentId,
    enabled: booleanField(group.enabled, 'group', index, 'enabled', true),
    order: integerField(group.order, 'group', index, 'order', -100_000, 100_000, 0),
    createdAt: preserveCreatedAt ? timestampField(group.createdAt, now) : now,
    updatedAt: now,
  }
}

export function normalizeAliasForm(value: unknown, generatedId: string, now: number): Alias {
  return normalizeAliasImport(value, 0, generatedId, now, true)
}

export function normalizeTriggerForm(value: unknown, generatedId: string, now: number): Trigger {
  return normalizeTriggerImport(value, 0, generatedId, now, true)
}

export function normalizeGroupForm(value: unknown, generatedId: string, now: number): Group {
  return normalizeGroupImport(value, 0, generatedId, now, true)
}

export function normalizeTimerForm(value: unknown, generatedId: string, now: number): Timer {
  return normalizeTimerImport(value, 0, generatedId, now, true)
}

export function normalizeGroupActionForm(
  label: unknown,
  command: unknown,
  generatedId: string,
): { id: string; label: string; command: string } {
  return normalizeGroupActionImport({ label, command }, 0, generatedId)
}

export function normalizeMobActionForm(
  label: unknown,
  command: unknown,
  generatedId: string,
): { id: string; label: string; command: string } {
  return normalizeMobActionImport({ label, command }, 0, generatedId)
}

function normalizeSimpleAction(
  value: unknown,
  kind: 'group action' | 'mob action',
  index: number,
  generatedId: string,
): { id: string; label: string; command: string } {
  const action = record(value, kind, index)
  return {
    id: generatedId,
    label: requiredString(action.label, kind, index, 'label', 255),
    command: requiredString(action.command, kind, index, 'command', MAX_TRIGGER_COMMAND_LENGTH),
  }
}

export function normalizeGroupActionImport(
  value: unknown,
  index: number,
  generatedId: string,
): { id: string; label: string; command: string } {
  return normalizeSimpleAction(value, 'group action', index, generatedId)
}

export function normalizeMobActionImport(
  value: unknown,
  index: number,
  generatedId: string,
): { id: string; label: string; command: string } {
  return normalizeSimpleAction(value, 'mob action', index, generatedId)
}

function normalizeTimerActions(value: unknown, index: number): TimerAction[] {
  const actions = normalizeActions(value, 'timer', index)
  return actions.map((action, actionIndex) => {
    if (action.type === 'highlight' || action.type === 'gag') {
      throw new Error(
        `Invalid timer at index ${index}: action ${actionIndex} type is not permitted`,
      )
    }
    return action as TimerAction
  })
}

export function normalizeTimerImport(
  value: unknown,
  index: number,
  generatedId: string,
  now: number,
  preserveCreatedAt: boolean,
): Timer {
  const timer = record(value, 'timer', index)
  if (timer.intervalMs === undefined) {
    throw new Error(`Invalid timer at index ${index}: intervalMs is required`)
  }
  const scope = enumField(timer.scope, 'timer', index, 'scope', TRIGGER_SCOPES, 'global')
  const characterName =
    optionalString(timer.characterName, 'timer', index, 'characterName', 100) ?? null
  const groupId = optionalString(timer.groupId, 'timer', index, 'groupId', 100) ?? null
  const description = optionalString(
    timer.description,
    'timer',
    index,
    'description',
    MAX_TRIGGER_DESCRIPTION_LENGTH,
  )

  return {
    id: generatedId,
    name: requiredString(timer.name, 'timer', index, 'name', MAX_TRIGGER_NAME_LENGTH),
    intervalMs: integerField(
      timer.intervalMs,
      'timer',
      index,
      'intervalMs',
      1_000,
      24 * 60 * 60 * 1_000,
      1_000,
    ),
    isOneShot: booleanField(timer.isOneShot, 'timer', index, 'isOneShot', false),
    actions: normalizeTimerActions(timer.actions, index),
    enabled: booleanField(timer.enabled, 'timer', index, 'enabled', true),
    scope,
    characterName: scope === 'character' ? characterName : null,
    groupId,
    ...(description ? { description } : {}),
    createdAt: preserveCreatedAt ? timestampField(timer.createdAt, now) : now,
    updatedAt: now,
  }
}
