import { ref, watch, computed } from 'vue'
import { createClientId } from '@/utils/clientId'
import {
  parseClientSettingsCollection,
  parseClientSettingsDocument,
} from '@/utils/clientSettingsImport'
import { normalizeMobActionForm, normalizeMobActionImport } from '@/utils/clientSettingsValidation'

export interface MobAction {
  id: string
  label: string
  command: string
}

export interface MobActionsData {
  actions: MobAction[]
  button1ActionId: string | null
  button2ActionId: string | null
}

export interface MobActionsExport {
  version: number
  mobActions: MobAction[]
  button1ActionId: string | null
  button2ActionId: string | null
  exportedAt: string
}

const STORAGE_KEY = 'mud-mob-actions'
const EXPORT_VERSION = 2

// Shared state across all components
const actions = ref<MobAction[]>([])
const actionError = ref<string | null>(null)
const button1ActionId = ref<string | null>(null)
const button2ActionId = ref<string | null>(null)
let initialized = false

function loadActions() {
  if (initialized) return
  initialized = true

  const saved = localStorage.getItem(STORAGE_KEY)
  if (saved) {
    try {
      const data = JSON.parse(saved)
      // Handle both old format (array) and new format (object with button assignments)
      if (Array.isArray(data)) {
        // Old format - just actions array
        actions.value = data
      } else {
        // New format with button assignments
        actions.value = data.actions || []
        button1ActionId.value = data.button1ActionId || null
        button2ActionId.value = data.button2ActionId || null
      }
    } catch {
      actions.value = []
    }
  }
}

function saveActions() {
  const data: MobActionsData = {
    actions: actions.value,
    button1ActionId: button1ActionId.value,
    button2ActionId: button2ActionId.value,
  }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
}

// Watch for changes and save
watch([actions, button1ActionId, button2ActionId], saveActions, { deep: true })

export function useMobActions() {
  // Load on first use
  loadActions()

  function addAction(label: string, command: string): MobAction | null {
    try {
      const action = normalizeMobActionForm(
        label,
        command,
        createClientId(actions.value.map((item) => item.id)),
      )
      actions.value.push(action)
      actionError.value = null
      return action
    } catch (error) {
      console.error('[Mob actions] Invalid action:', error)
      actionError.value = error instanceof Error ? error.message : 'Mob action is invalid.'
      return null
    }
  }

  function updateAction(id: string, label: string, command: string): boolean {
    const index = actions.value.findIndex((a) => a.id === id)
    if (index === -1) return false

    try {
      const action = normalizeMobActionForm(label, command, id)
      actions.value[index] = action
      actionError.value = null
      return true
    } catch (error) {
      console.error('[Mob actions] Invalid action update:', error)
      actionError.value = error instanceof Error ? error.message : 'Mob action is invalid.'
      return false
    }
  }

  function deleteAction(id: string) {
    const index = actions.value.findIndex((a) => a.id === id)
    if (index !== -1) {
      actions.value.splice(index, 1)
      // Clear button assignments if this action was assigned
      if (button1ActionId.value === id) {
        button1ActionId.value = null
      }
      if (button2ActionId.value === id) {
        button2ActionId.value = null
      }
    }
  }

  // Get action assigned to a button
  const button1Action = computed(() => {
    if (!button1ActionId.value) return null
    return actions.value.find((a) => a.id === button1ActionId.value) || null
  })

  const button2Action = computed(() => {
    if (!button2ActionId.value) return null
    return actions.value.find((a) => a.id === button2ActionId.value) || null
  })

  function setButtonAction(button: 1 | 2, actionId: string | null) {
    if (button === 1) {
      button1ActionId.value = actionId
    } else {
      button2ActionId.value = actionId
    }
  }

  function reorderActions(fromIndex: number, toIndex: number) {
    if (fromIndex === toIndex) return
    const removed = actions.value.splice(fromIndex, 1)
    if (removed[0]) {
      actions.value.splice(toIndex, 0, removed[0])
    }
  }

  function exportActions(): string {
    const data: MobActionsExport = {
      version: EXPORT_VERSION,
      mobActions: actions.value,
      button1ActionId: button1ActionId.value,
      button2ActionId: button2ActionId.value,
      exportedAt: new Date().toISOString(),
    }
    return JSON.stringify(data, null, 2)
  }

  function importActions(json: string, mode: 'replace' | 'merge' = 'merge'): number {
    const data = parseClientSettingsDocument(json) as unknown as MobActionsExport
    const imported = parseClientSettingsCollection(json, 'mobActions')
    const reservedIds = new Set(actions.value.map((action) => action.id))
    const sourceIdMap = new Map<string, string>()
    const nextId = () => {
      const id = createClientId(reservedIds)
      reservedIds.add(id)
      return id
    }
    const normalizedImported = imported.map((item, index) => {
      const sourceId =
        item &&
        typeof item === 'object' &&
        !Array.isArray(item) &&
        typeof (item as Record<string, unknown>).id === 'string'
          ? ((item as Record<string, unknown>).id as string)
          : ''
      const id = nextId()
      if (sourceId) sourceIdMap.set(sourceId, id)
      return normalizeMobActionImport(item, index, id)
    })

    if (mode === 'replace') {
      actions.value = normalizedImported
      // Remap button assignments
      if (data.button1ActionId && sourceIdMap.has(data.button1ActionId)) {
        button1ActionId.value = sourceIdMap.get(data.button1ActionId)!
      }
      if (data.button2ActionId && sourceIdMap.has(data.button2ActionId)) {
        button2ActionId.value = sourceIdMap.get(data.button2ActionId)!
      }
      return normalizedImported.length
    } else {
      // Merge: skip duplicates by label
      let count = 0
      for (const action of normalizedImported) {
        const exists = actions.value.some(
          (a) => a.label.toLowerCase() === action.label.toLowerCase(),
        )
        if (!exists) {
          actions.value.push(action)
          count++
        }
      }
      return count
    }
  }

  return {
    actions,
    actionError,
    button1ActionId,
    button2ActionId,
    button1Action,
    button2Action,
    addAction,
    updateAction,
    deleteAction,
    setButtonAction,
    reorderActions,
    exportActions,
    importActions,
  }
}
