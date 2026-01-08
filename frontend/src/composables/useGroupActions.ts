import { ref, watch } from 'vue'

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

  function addAction(label: string, command: string) {
    const id = crypto.randomUUID()
    actions.value.push({ id, label, command })
  }

  function updateAction(id: string, label: string, command: string) {
    const index = actions.value.findIndex(a => a.id === id)
    if (index !== -1) {
      actions.value[index] = { id, label, command }
    }
  }

  function deleteAction(id: string) {
    const index = actions.value.findIndex(a => a.id === id)
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

  function getTarget(member: { name: string; isNpc: boolean; targetNum: number | null; targetKeyword: string | null }): string {
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
    const data = JSON.parse(json) as GroupActionsExport

    if (!data.groupActions || !Array.isArray(data.groupActions)) {
      throw new Error('Invalid group actions data format')
    }

    const imported = data.groupActions

    if (mode === 'replace') {
      actions.value = imported.map(a => ({
        ...a,
        id: crypto.randomUUID(),
      }))
      return imported.length
    } else {
      // Merge: skip duplicates by label
      let count = 0
      for (const action of imported) {
        const exists = actions.value.some(a => a.label.toLowerCase() === action.label.toLowerCase())
        if (!exists) {
          actions.value.push({
            ...action,
            id: crypto.randomUUID(),
          })
          count++
        }
      }
      return count
    }
  }

  return {
    actions,
    addAction,
    updateAction,
    deleteAction,
    reorderActions,
    getTarget,
    exportActions,
    importActions,
  }
}
