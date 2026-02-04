/**
 * Alias System Types
 *
 * Client-side command shortcuts for the MUD client.
 * Aliases can be global (all characters) or character-specific.
 */

/**
 * Scope determines whether an alias applies globally (all characters)
 * or only to a specific character.
 */
export type AliasScope = 'global' | 'character'

/**
 * Represents a single alias definition.
 */
export interface Alias {
  /** Unique identifier (UUID) */
  id: string

  /** The trigger word/phrase (e.g., "kk") - stored lowercase */
  trigger: string

  /** The expansion template (e.g., "kill $1") */
  expansion: string

  /** Whether this alias is currently active */
  enabled: boolean

  /** Scope: global or character-specific */
  scope: AliasScope

  /** Character name if scope is 'character' (null for global) */
  characterName: string | null

  /** Group ID this alias belongs to (null = ungrouped) */
  groupId: string | null

  /** Optional description for user reference */
  description?: string

  /** Timestamp when alias was created */
  createdAt: number

  /** Timestamp when alias was last modified */
  updatedAt: number
}

/**
 * Form data for creating/editing an alias.
 */
export interface AliasFormData {
  trigger: string
  expansion: string
  enabled: boolean
  scope: AliasScope
  characterName: string | null
  groupId: string | null
  description?: string
}

/**
 * Storage structure for aliases (keyed by account name).
 */
export interface AliasStorage {
  version: number
  aliases: Alias[]
  /** If true, echo expanded commands to the activity log */
  echoExpansion?: boolean
  /** If true, echo all entered commands to the activity log */
  echoCommands?: boolean
}

/**
 * Result of alias expansion.
 */
export interface AliasExpansionResult {
  /** Whether an alias was matched */
  matched: boolean

  /** Array of commands to execute (may be multiple for chained commands) */
  commands: string[]

  /** The alias that was matched (if any) */
  alias?: Alias
}
