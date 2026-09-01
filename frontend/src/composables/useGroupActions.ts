import { ref, watch } from 'vue'
import { createClientId } from '@/utils/clientId'
import { parseClientSettingsCollection } from '@/utils/clientSettingsImport'
import {
  normalizeGroupActionForm,
  normalizeGroupActionImport,
} from '@/utils/clientSettingsValidation'

export interface GroupAction {
  id: string
  label: string
  command: string
}

export interface GroupActionsExport {
  version: number
  groupActions: GroupAction[]
  exportedAt: string
}

const STORAGE_KEY = 'mud-group-actions'
const EXPORT_VERSION = 1

// Shared state across all components
const actions = ref<GroupAction[]>([])
const actionError = ref<string | null>(null)
let initialized = false

function loadActions() {
  if (initialized) return
  initialized = true

  const saved = localStorage.getItem(STORAGE_KEY)
  if (saved) {
    try {
      actions.value = JSON.parse(saved)
    } catch {
      actions.value = []
    }
  }
}

function saveActions() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(actions.value))
}

// Watch for changes and save
watch(actions, saveActions, { deep: true })

export function useGroupActions() {
  // Load on first use
  loadActions()

  function addAction(label: string, command: string): GroupAction | null {
    try {
      const action = normalizeGroupActionForm(
        label,
        command,
        createClientId(actions.value.map((item) => item.id)),
      )
      actions.value.push(action)
      actionError.value = null
      return action
    } catch (error) {
      console.error('[Group actions] Invalid action:', error)
      actionError.value = error instanceof Error ? error.message : 'Group action is invalid.'
      return null
    }
  }

  function updateAction(id: string, label: string, command: string): boolean {
    const index = actions.value.findIndex((a) => a.id === id)
    if (index === -1) return false

    try {
      const action = normalizeGroupActionForm(label, command, id)
      actions.value[index] = action
      actionError.value = null
      return true
    } catch (error) {
      console.error('[Group actions] Invalid action update:', error)
      actionError.value = error instanceof Error ? error.message : 'Group action is invalid.'
      return false
    }
  }

  function deleteAction(id: string) {
    const index = actions.value.findIndex((a) => a.id === id)
    if (index !== -1) {
      actions.value.splice(index, 1)
    }
  }

  function reorderActions(fromIndex: number, toIndex: number) {
    if (fromIndex === toIndex) return
    const removed = actions.value.splice(fromIndex, 1)
    if (removed[0]) {
      actions.value.splice(toIndex, 0, removed[0])
    }
  }

  function getTarget(member: {
    name: string
    isNpc: boolean
    targetNum: number | null
    targetKeyword: string | null
  }): string {
    if (member.isNpc && member.targetNum && member.targetKeyword) {
      return `${member.targetNum}.${member.targetKeyword}`
    }
    return member.name
  }

  function exportActions(): string {
    const data: GroupActionsExport = {
      version: EXPORT_VERSION,
      groupActions: actions.value,
      exportedAt: new Date().toISOString(),
    }
    return JSON.stringify(data, null, 2)
  }

  function importActions(json: string, mode: 'replace' | 'merge' = 'merge'): number {
    const imported = parseClientSettingsCollection(json, 'groupActions')
    const reservedIds = new Set(actions.value.map((action) => action.id))
    const nextId = () => {
      const id = createClientId(reservedIds)
      reservedIds.add(id)
      return id
    }
    const normalizedImported = imported.map((item, index) =>
      normalizeGroupActionImport(item, index, nextId()),
    )

    if (mode === 'replace') {
      actions.value = normalizedImported
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
    addAction,
    updateAction,
    deleteAction,
    reorderActions,
    getTarget,
    exportActions,
    importActions,
  }
}
