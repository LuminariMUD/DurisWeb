/**
 * Trigger System Types
 *
 * Client-side pattern matching for incoming MUD text.
 * Triggers can be global (all characters) or character-specific.
 */

/**
 * Scope determines whether a trigger applies globally (all characters)
 * or only to a specific character.
 */
export type TriggerScope = 'global' | 'character'

/**
 * Pattern matching type - substring (simple contains) or regex
 */
export type TriggerPatternType = 'substring' | 'regex'

/**
 * Pattern logic - how multiple patterns are combined
 * 'or' = any pattern match triggers (default)
 * 'and' = all patterns must match
 */
export type TriggerPatternLogic = 'or' | 'and'

/**
 * Predefined highlight colors
 */
export type TriggerHighlightColor =
  | 'red'
  | 'orange'
  | 'yellow'
  | 'green'
  | 'blue'
  | 'purple'
  | 'pink'
  | 'cyan'
  | 'white'

/**
 * Predefined sounds
 */
export type TriggerSound = 'beep' | 'chime' | 'alert' | 'ding' | 'bell' | 'custom'

/**
 * Action: Send command(s) to the MUD
 */
export interface TriggerActionCommand {
  type: 'command'
  /** Commands to execute (semicolon-separated supported) */
  commands: string
  /** Delay in milliseconds before sending (default: 0) */
  delay?: number
}

/**
 * Action: Highlight the matching line
 */
export interface TriggerActionHighlight {
  type: 'highlight'
  /** Background color */
  backgroundColor: TriggerHighlightColor
  /** Text color (optional, defaults based on background) */
  textColor?: TriggerHighlightColor
}

/**
 * Action: Play a sound
 */
export interface TriggerActionSound {
  type: 'sound'
  /** Predefined sound name or 'custom' */
  sound: TriggerSound
  /** Custom sound URL (if sound is 'custom') */
  customUrl?: string
  /** Volume 0-1 (default: 0.5) */
  volume?: number
}

/**
 * Action: Gag (hide) the line from activity log
 */
export interface TriggerActionGag {
  type: 'gag'
}

/**
 * Action: Echo text to the activity log (supports ANSI colors)
 */
export interface TriggerActionEcho {
  type: 'echo'
  /** Text to display (supports ANSI color codes and $0-$9 capture groups) */
  text: string
}

/**
 * Union of all trigger actions
 */
export type TriggerAction =
  | TriggerActionCommand
  | TriggerActionHighlight
  | TriggerActionSound
  | TriggerActionGag
  | TriggerActionEcho

/**
 * A single pattern entry - can be text match or GMCP condition
 */
export interface TriggerPattern {
  /** The pattern string (text to match or GMCP condition) */
  value: string
  /** If true, pattern is a GMCP condition (e.g., "%hppct% < 50"), otherwise text match */
  isGmcp: boolean
}

/**
 * Represents a single trigger definition.
 */
export interface Trigger {
  /** Unique identifier (UUID) */
  id: string

  /** Display name for this trigger */
  name: string

  /** Patterns to match. Can be text or GMCP conditions. */
  patterns: TriggerPattern[]

  /** Pattern logic: how multiple patterns are combined ('or' = any, 'and' = all) */
  patternLogic: TriggerPatternLogic

  /** Pattern type: substring (simple) or regex - applies to text patterns only */
  patternType: TriggerPatternType

  /** Case-sensitive matching (default: false) - applies to text patterns only */
  caseSensitive: boolean

  /** Actions to perform when pattern matches */
  actions: TriggerAction[]

  /** Whether this trigger is currently active */
  enabled: boolean

  /** Scope: global or character-specific */
  scope: TriggerScope

  /** Character name if scope is 'character' (null for global) */
  characterName: string | null

  /** Group ID this trigger belongs to (null = ungrouped) */
  groupId: string | null

  /** Optional description for user reference */
  description?: string

  /** Priority for ordering (higher = processed first) */
  priority: number

  /** Stop processing further triggers if this one matches */
  stopProcessing: boolean

  /** Timestamp when trigger was created */
  createdAt: number

  /** Timestamp when trigger was last modified */
  updatedAt: number
}

/**
 * Form data for creating/editing a trigger.
 */
export interface TriggerFormData {
  name: string
  patterns: TriggerPattern[]
  patternLogic: TriggerPatternLogic
  patternType: TriggerPatternType
  caseSensitive: boolean
  actions: TriggerAction[]
  enabled: boolean
  scope: TriggerScope
  characterName: string | null
  groupId: string | null
  description?: string
  priority: number
  stopProcessing: boolean
}

/**
 * Storage structure for triggers (keyed by account name).
 */
export interface TriggerStorage {
  version: number
  triggers: Trigger[]
  /** If true, echo trigger matches to the activity log */
  echoTriggers?: boolean
  /** Master mute for all trigger sounds */
  muteSounds?: boolean
}

/**
 * Result of processing a line through triggers
 */
export interface TriggerProcessResult {
  /** Original text */
  originalText: string

  /** Whether the line should be gagged (hidden) */
  gagged: boolean

  /** Highlight class to apply (if any) */
  highlightClass?: string

  /** Commands to send (accumulated from all matching triggers) */
  commandsToSend: Array<{ command: string; delay: number }>

  /** Sounds to play (accumulated from all matching triggers) */
  soundsToPlay: TriggerActionSound[]

  /** Echo texts to display in activity log (supports ANSI) */
  echoTexts: string[]

  /** Triggers that matched */
  matchedTriggers: Trigger[]
}

/**
 * Highlight color to CSS class mapping
 */
export const HIGHLIGHT_COLORS: Record<TriggerHighlightColor, { bg: string; text: string }> = {
  red: { bg: 'bg-red-900/60', text: 'text-red-100' },
  orange: { bg: 'bg-orange-900/60', text: 'text-orange-100' },
  yellow: { bg: 'bg-yellow-900/60', text: 'text-yellow-100' },
  green: { bg: 'bg-green-900/60', text: 'text-green-100' },
  blue: { bg: 'bg-blue-900/60', text: 'text-blue-100' },
  purple: { bg: 'bg-purple-900/60', text: 'text-purple-100' },
  pink: { bg: 'bg-pink-900/60', text: 'text-pink-100' },
  cyan: { bg: 'bg-cyan-900/60', text: 'text-cyan-100' },
  white: { bg: 'bg-gray-700/60', text: 'text-white' },
}

/**
 * Predefined sound URLs (relative to public directory)
 */
export const PREDEFINED_SOUNDS: Record<Exclude<TriggerSound, 'custom'>, string> = {
  beep: '/sounds/beep.mp3',
  chime: '/sounds/chime.mp3',
  alert: '/sounds/alert.mp3',
  ding: '/sounds/ding.mp3',
  bell: '/sounds/bell.mp3',
}
