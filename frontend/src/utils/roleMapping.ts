/**
 * Role Mapping Utility
 * Maps MUD immortal levels to human-readable role titles
 */

export interface RoleOption {
  value: number
  label: string
}

// MUD Immortal Levels (from config.h lines 105-114)
export const ROLE_LEVELS = {
  AVATAR: 57,
  IMMORTAL: 58,
  LESSER_GOD: 59,
  GREATER_GOD: 60,
  FORGER: 61,
  OVERLORD: 62,
} as const

export const ROLE_TITLES: Record<number, string> = {
  57: 'Avatar',
  58: 'Immortal',
  59: 'Lesser God',
  60: 'Greater God',
  61: 'Forger',
  62: 'Overlord',
}

// Dropdown options for permission level selectors (sorted descending - highest first)
export const ROLE_OPTIONS: RoleOption[] = [
  { value: 62, label: 'Overlord (62)' },
  { value: 61, label: 'Forger (61)' },
  { value: 60, label: 'Greater God (60)' },
  { value: 59, label: 'Lesser God (59)' },
  { value: 58, label: 'Immortal (58)' },
  { value: 57, label: 'Avatar (57)' },
]

/**
 * Get role title from numeric level
 * @param level - Numeric immortal level (57-62)
 * @returns Role title string
 */
export function getRoleTitle(level: number): string {
  return ROLE_TITLES[level] || `Level ${level}`
}

/**
 * Get role label with level (for display)
 * @param level - Numeric immortal level (57-62)
 * @returns Formatted label like "Lesser God (59)"
 */
export function getRoleLabel(level: number): string {
  const title = getRoleTitle(level)
  return `${title} (${level})`
}

/**
 * Get numeric level from role title
 * @param roleTitle - Role title string
 * @returns Numeric level or null if not found
 */
export function getLevelFromRole(roleTitle: string): number | null {
  const entry = Object.entries(ROLE_TITLES).find(([_, title]) => title === roleTitle)
  return entry ? Number(entry[0]) : null
}

/**
 * Check if level is a valid immortal level
 * @param level - Numeric level to check
 * @returns True if level is 57-62
 */
export function isImmortalLevel(level: number): boolean {
  return level >= 57 && level <= 62
}
