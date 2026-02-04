/**
 * Group System Types
 *
 * Hierarchical grouping for triggers, aliases, and timers.
 * Groups can be toggled to enable/disable all items within.
 */

/**
 * Represents a group that can contain triggers, aliases, or timers.
 * Supports 2 levels: group > subgroup.
 */
export interface Group {
  /** Unique identifier (UUID) */
  id: string

  /** Display name for this group */
  name: string

  /** Parent group ID (null = top-level group) */
  parentId: string | null

  /** Whether this group is enabled (overrides children when false) */
  enabled: boolean

  /** Sort order within same level */
  order: number

  /** Timestamp when group was created */
  createdAt: number

  /** Timestamp when group was last modified */
  updatedAt: number
}

/**
 * Form data for creating/editing a group.
 */
export interface GroupFormData {
  name: string
  parentId: string | null
  enabled: boolean
}

/**
 * Storage structure for groups (keyed by account name).
 */
export interface GroupStorage {
  version: number
  groups: Group[]
}
