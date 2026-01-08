/**
 * Timer System Types
 *
 * Timer-based triggers that execute actions at specified intervals.
 * Timers can be global (all characters) or character-specific.
 */

import type { TriggerActionCommand, TriggerActionSound, TriggerActionEcho } from './trigger'

/**
 * Scope determines whether a timer applies globally (all characters)
 * or only to a specific character.
 */
export type TimerScope = 'global' | 'character'

/**
 * Timer actions - subset of trigger actions that make sense for timers
 * (no highlight or gag since there's no text to match)
 */
export type TimerAction = TriggerActionCommand | TriggerActionSound | TriggerActionEcho

/**
 * Represents a single timer definition.
 */
export interface Timer {
  /** Unique identifier (UUID) */
  id: string

  /** Display name for this timer */
  name: string

  /** Interval in milliseconds */
  intervalMs: number

  /** If true, timer disables itself after first execution */
  isOneShot: boolean

  /** Actions to perform when timer fires */
  actions: TimerAction[]

  /** Whether this timer is currently active */
  enabled: boolean

  /** Scope: global or character-specific */
  scope: TimerScope

  /** Character name if scope is 'character' (null for global) */
  characterName: string | null

  /** Optional description for user reference */
  description?: string

  /** Timestamp when timer was created */
  createdAt: number

  /** Timestamp when timer was last modified */
  updatedAt: number
}

/**
 * Form data for creating/editing a timer.
 */
export interface TimerFormData {
  name: string
  intervalMs: number
  isOneShot: boolean
  actions: TimerAction[]
  enabled: boolean
  scope: TimerScope
  characterName: string | null
  description?: string
}

/**
 * Storage structure for timers (keyed by account name).
 */
export interface TimerStorage {
  version: number
  timers: Timer[]
  /** If true, echo timer executions to the activity log */
  echoTimers?: boolean
}

/**
 * Runtime state for a running timer
 */
export interface TimerState {
  /** Timer ID this state belongs to */
  timerId: string

  /** setInterval/setTimeout handle for cancellation */
  intervalHandle: ReturnType<typeof setInterval> | null

  /** Timestamp of next scheduled execution */
  nextFireTime: number

  /** Whether timer is currently running */
  isRunning: boolean
}

/**
 * Format interval in milliseconds to human-readable string
 * e.g., 90000 -> "1m 30s", 3600000 -> "1h"
 */
export function formatInterval(ms: number): string {
  const hours = Math.floor(ms / 3600000)
  const minutes = Math.floor((ms % 3600000) / 60000)
  const seconds = Math.floor((ms % 60000) / 1000)

  const parts: string[] = []
  if (hours) parts.push(`${hours}h`)
  if (minutes) parts.push(`${minutes}m`)
  if (seconds) parts.push(`${seconds}s`)
  return parts.join(' ') || '0s'
}

/**
 * Parse interval string to milliseconds
 * Supports: "30" (seconds), "2m", "1h30m", "90s", "1h 30m 15s"
 */
export function parseInterval(input: string): number | null {
  const trimmed = input.trim().toLowerCase()
  if (!trimmed) return null

  // If just a number, treat as seconds
  if (/^\d+$/.test(trimmed)) {
    return parseInt(trimmed, 10) * 1000
  }

  // Parse components like "1h30m15s" or "1h 30m 15s"
  let totalMs = 0
  const pattern = /(\d+)\s*(h|m|s)/g
  const matches = trimmed.matchAll(pattern)
  let hasMatch = false

  for (const match of matches) {
    hasMatch = true
    const value = parseInt(match[1] ?? '0', 10)
    const unit = match[2] ?? ''

    switch (unit) {
      case 'h':
        totalMs += value * 3600000
        break
      case 'm':
        totalMs += value * 60000
        break
      case 's':
        totalMs += value * 1000
        break
    }
  }

  return hasMatch ? totalMs : null
}

/**
 * Timer interval constraints
 */
export const TIMER_CONSTRAINTS = {
  /** Minimum interval: 1 second */
  MIN_INTERVAL_MS: 1000,
  /** Maximum interval: 24 hours */
  MAX_INTERVAL_MS: 24 * 60 * 60 * 1000,
}
