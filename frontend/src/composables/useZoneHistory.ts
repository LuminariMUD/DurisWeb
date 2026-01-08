import { ref, computed } from 'vue'
import type { Room, Mobile, ZoneObject } from '@/types'

export type HistoryEntityType = 'room' | 'mob' | 'object'
export type HistoryAction = 'modified' | 'created' | 'deleted'
export type HistoryEntityData = Room | Mobile | ZoneObject

export interface HistoryEntry {
  id: string
  type: HistoryEntityType
  vnum: number
  action: HistoryAction
  before: HistoryEntityData | null // null for create
  after: HistoryEntityData | null // null for delete
  timestamp: number
  description: string
}

const MAX_HISTORY_ENTRIES = 50

// Global history state (shared across zone editor session)
const history = ref<HistoryEntry[]>([])
const historyIndex = ref(-1) // Points to the current position in history

// Generate unique ID for history entries
function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
}

// Get entity name for description
function getEntityName(data: HistoryEntityData | null, type: HistoryEntityType): string {
  if (!data) return 'Unknown'
  if (type === 'room') return (data as Room).name || 'Unnamed Room'
  if (type === 'mob') return (data as Mobile).shortDesc || 'Unnamed Mob'
  if (type === 'object') return (data as ZoneObject).shortDesc || 'Unnamed Object'
  return 'Unknown'
}

// Create description for history entry
function createDescription(
  type: HistoryEntityType,
  action: HistoryAction,
  vnum: number,
  before: HistoryEntityData | null,
  after: HistoryEntityData | null
): string {
  const entityName = action === 'deleted' ? getEntityName(before, type) : getEntityName(after, type)
  const typeLabel = type.charAt(0).toUpperCase() + type.slice(1)

  switch (action) {
    case 'created':
      return `Created ${typeLabel} ${vnum}: ${entityName}`
    case 'deleted':
      return `Deleted ${typeLabel} ${vnum}: ${entityName}`
    case 'modified':
      return `Modified ${typeLabel} ${vnum}: ${entityName}`
    default:
      return `Changed ${typeLabel} ${vnum}`
  }
}

export function useZoneHistory() {
  // Computed properties
  const canUndo = computed(() => historyIndex.value >= 0)
  const canRedo = computed(() => historyIndex.value < history.value.length - 1)
  const currentEntry = computed(() =>
    historyIndex.value >= 0 ? history.value[historyIndex.value] : null
  )
  const historyCount = computed(() => history.value.length)
  const undoCount = computed(() => historyIndex.value + 1)
  const redoCount = computed(() => history.value.length - historyIndex.value - 1)

  /**
   * Push a new history entry
   * Call this BEFORE making changes, passing the before state
   * Then call updateLastEntry with the after state once change is complete
   */
  function pushHistory(
    type: HistoryEntityType,
    vnum: number,
    action: HistoryAction,
    before: HistoryEntityData | null,
    after: HistoryEntityData | null
  ): void {
    // Truncate any "future" history if we're not at the end
    if (historyIndex.value < history.value.length - 1) {
      history.value = history.value.slice(0, historyIndex.value + 1)
    }

    const entry: HistoryEntry = {
      id: generateId(),
      type,
      vnum,
      action,
      before: before ? JSON.parse(JSON.stringify(before)) : null, // Deep clone
      after: after ? JSON.parse(JSON.stringify(after)) : null, // Deep clone
      timestamp: Date.now(),
      description: createDescription(type, action, vnum, before, after),
    }

    history.value.push(entry)
    historyIndex.value = history.value.length - 1

    // Trim oldest entries if we exceed max
    while (history.value.length > MAX_HISTORY_ENTRIES) {
      history.value.shift()
      historyIndex.value--
    }
  }

  /**
   * Undo the current history entry
   * Returns the entry that was undone (so caller can apply the "before" state)
   */
  function undo(): HistoryEntry | null {
    if (!canUndo.value) return null

    const entry = history.value[historyIndex.value]
    if (!entry) return null
    historyIndex.value--
    return entry
  }

  /**
   * Redo the next history entry
   * Returns the entry that was redone (so caller can apply the "after" state)
   */
  function redo(): HistoryEntry | null {
    if (!canRedo.value) return null

    historyIndex.value++
    const entry = history.value[historyIndex.value]
    if (!entry) return null
    return entry
  }

  /**
   * Clear all history
   */
  function clearHistory(): void {
    history.value = []
    historyIndex.value = -1
  }

  /**
   * Get the state to apply for undo (the "before" state)
   */
  function getUndoState(): { entry: HistoryEntry; state: HistoryEntityData | null } | null {
    if (!canUndo.value) return null
    const entry = history.value[historyIndex.value]
    if (!entry) return null
    return { entry, state: entry.before }
  }

  /**
   * Get the state to apply for redo (the "after" state)
   */
  function getRedoState(): { entry: HistoryEntry; state: HistoryEntityData | null } | null {
    if (!canRedo.value) return null
    const nextIndex = historyIndex.value + 1
    const entry = history.value[nextIndex]
    if (!entry) return null
    return { entry, state: entry.after }
  }

  /**
   * Get description for the undo action
   */
  function getUndoDescription(): string {
    if (!canUndo.value) return ''
    const entry = history.value[historyIndex.value]
    if (!entry) return ''
    return `Undo: ${entry.description}`
  }

  /**
   * Get description for the redo action
   */
  function getRedoDescription(): string {
    if (!canRedo.value) return ''
    const entry = history.value[historyIndex.value + 1]
    if (!entry) return ''
    return entry.description
  }

  return {
    // State
    history,
    historyIndex,

    // Computed
    canUndo,
    canRedo,
    currentEntry,
    historyCount,
    undoCount,
    redoCount,

    // Actions
    pushHistory,
    undo,
    redo,
    clearHistory,

    // Helpers
    getUndoState,
    getRedoState,
    getUndoDescription,
    getRedoDescription,
  }
}
