import { ref, computed, watch } from 'vue'
import { useMudStore } from '@/stores/mudStore'
import type { Group, GroupFormData, GroupStorage } from '@/types/group'
import { createClientId } from '@/utils/clientId'
import { useTriggers } from './useTriggers'
import { useAliases } from './useAliases'
import { useTimers } from './useTimers'

const STORAGE_VERSION = 1
const STORAGE_KEY_PREFIX = 'duris_groups_'

// global state (shared across components)
const groups = ref<Group[]>([])
const isLoaded = ref(false)

export function useGroups() {
  const store = useMudStore()

  const accountName = computed(() => store.account)

  const storageKey = computed(() => {
    if (!accountName.value) return null
    return `${STORAGE_KEY_PREFIX}${accountName.value.toLowerCase()}`
  })

  // =========================================================================
  // Storage Operations
  // =========================================================================

  function loadGroups(): void {
    if (!storageKey.value) {
      groups.value = []
      isLoaded.value = false
      return
    }

    try {
      const stored = localStorage.getItem(storageKey.value)
      if (!stored) {
        groups.value = []
        isLoaded.value = true
        return
      }

      const data: GroupStorage = JSON.parse(stored)
      groups.value = data.groups || []
      isLoaded.value = true
    } catch (error) {
      console.error('[Groups] Failed to load:', error)
      groups.value = []
      isLoaded.value = true
    }
  }

  function saveGroups(): void {
    if (!storageKey.value) return

    try {
      const data: GroupStorage = {
        version: STORAGE_VERSION,
        groups: groups.value,
      }
      localStorage.setItem(storageKey.value, JSON.stringify(data))
    } catch (error) {
      console.error('[Groups] Failed to save:', error)
    }
  }

  // =========================================================================
  // CRUD Operations
  // =========================================================================

  function generateId(): string {
    return createClientId(groups.value.map((group) => group.id))
  }

  function addGroup(formData: GroupFormData): Group {
    // enforce 2 level max - if parent has a parent, reject
    if (formData.parentId) {
      const parent = groups.value.find(g => g.id === formData.parentId)
      if (parent?.parentId) {
        throw new Error('Cannot create subgroup of a subgroup (2 levels max)')
      }
    }

    const now = Date.now()
    const siblings = groups.value.filter(g => g.parentId === formData.parentId)
    const maxOrder = siblings.length > 0 ? Math.max(...siblings.map(g => g.order)) : -1

    const group: Group = {
      id: generateId(),
      name: formData.name.trim(),
      parentId: formData.parentId,
      enabled: formData.enabled,
      order: maxOrder + 1,
      createdAt: now,
      updatedAt: now,
    }

    groups.value.push(group)
    saveGroups()
    return group
  }

  function updateGroup(id: string, formData: Partial<GroupFormData>): Group | null {
    const index = groups.value.findIndex(g => g.id === id)
    if (index === -1) return null

    const group = groups.value[index]
    if (!group) return null

    const updated: Group = {
      ...group,
      name: formData.name !== undefined ? formData.name.trim() : group.name,
      parentId: formData.parentId !== undefined ? formData.parentId : group.parentId,
      enabled: formData.enabled !== undefined ? formData.enabled : group.enabled,
      updatedAt: Date.now(),
    }

    groups.value[index] = updated
    saveGroups()
    return updated
  }

  function deleteGroup(id: string): boolean {
    // get all group ids to delete (this group + subgroups)
    const idsToDelete = [id, ...groups.value.filter(g => g.parentId === id).map(g => g.id)]

    // clear groupId from items - import inside function to avoid circular deps
    const { triggers, setTriggerGroup } = useTriggers()
    const { aliases, setAliasGroup } = useAliases()
    const { timers, setTimerGroup } = useTimers()

    for (const gid of idsToDelete) {
      triggers.value.filter(t => t.groupId === gid).forEach(t => setTriggerGroup(t.id, null))
      aliases.value.filter(a => a.groupId === gid).forEach(a => setAliasGroup(a.id, null))
      timers.value.filter(t => t.groupId === gid).forEach(t => setTimerGroup(t.id, null))
    }

    // delete subgroups
    groups.value = groups.value.filter(g => g.parentId !== id)

    // delete group
    const index = groups.value.findIndex(g => g.id === id)
    if (index === -1) return false

    groups.value.splice(index, 1)
    saveGroups()
    return true
  }

  function toggleGroup(id: string): boolean {
    const index = groups.value.findIndex(g => g.id === id)
    if (index === -1) return false

    const group = groups.value[index]
    if (!group) return false

    groups.value[index] = {
      ...group,
      enabled: !group.enabled,
      updatedAt: Date.now(),
    }
    saveGroups()
    return true
  }

  function setGroupEnabled(id: string, enabled: boolean): boolean {
    const index = groups.value.findIndex(g => g.id === id)
    if (index === -1) return false

    const group = groups.value[index]
    if (!group) return false

    groups.value[index] = {
      ...group,
      enabled,
      updatedAt: Date.now(),
    }
    saveGroups()
    return true
  }

  // =========================================================================
  // Query Helpers
  // =========================================================================

  function getGroup(id: string): Group | undefined {
    return groups.value.find(g => g.id === id)
  }

  function getChildGroups(parentId: string | null): Group[] {
    return groups.value
      .filter(g => g.parentId === parentId)
      .sort((a, b) => a.order - b.order)
  }

  const rootGroups = computed((): Group[] => {
    return getChildGroups(null)
  })

  /**
   * Check if a group is effectively enabled.
   * A group is effectively enabled if:
   * 1. Its own enabled is true, AND
   * 2. Its parent (if any) is enabled
   */
  function isGroupEffectivelyEnabled(id: string | null): boolean {
    if (!id) return true // ungrouped items are always enabled

    const group = groups.value.find(g => g.id === id)
    if (!group) return true // unknown group = treat as ungrouped

    if (!group.enabled) return false

    // check parent
    if (group.parentId) {
      const parent = groups.value.find(g => g.id === group.parentId)
      if (parent && !parent.enabled) return false
    }

    return true
  }

  function getGroupPath(id: string): string {
    const group = groups.value.find(g => g.id === id)
    if (!group) return ''

    if (group.parentId) {
      const parent = groups.value.find(g => g.id === group.parentId)
      if (parent) {
        return `${parent.name} > ${group.name}`
      }
    }

    return group.name
  }

  function moveGroup(id: string, newParentId: string | null): boolean {
    // enforce 2 level max
    if (newParentId) {
      const newParent = groups.value.find(g => g.id === newParentId)
      if (newParent?.parentId) {
        return false // can't make subgroup of subgroup
      }
    }

    const index = groups.value.findIndex(g => g.id === id)
    if (index === -1) return false

    const group = groups.value[index]
    if (!group) return false

    // if moving a parent group to become a subgroup, check if it has children
    if (newParentId && !group.parentId) {
      const hasChildren = groups.value.some(g => g.parentId === id)
      if (hasChildren) return false // can't move parent that has children
    }

    const siblings = groups.value.filter(g => g.parentId === newParentId && g.id !== id)
    const maxOrder = siblings.length > 0 ? Math.max(...siblings.map(g => g.order)) : -1

    groups.value[index] = {
      ...group,
      parentId: newParentId,
      order: maxOrder + 1,
      updatedAt: Date.now(),
    }
    saveGroups()
    return true
  }

  function reorderGroup(id: string, newOrder: number): boolean {
    const index = groups.value.findIndex(g => g.id === id)
    if (index === -1) return false

    const group = groups.value[index]
    if (!group) return false

    groups.value[index] = {
      ...group,
      order: newOrder,
      updatedAt: Date.now(),
    }
    saveGroups()
    return true
  }

  function isNameInUse(name: string, parentId: string | null, excludeId?: string): boolean {
    const normalizedName = name.trim().toLowerCase()
    return groups.value.some(g => {
      if (g.id === excludeId) return false
      if (g.parentId !== parentId) return false
      return g.name.toLowerCase() === normalizedName
    })
  }

  // =========================================================================
  // Export/Import
  // =========================================================================

  function exportGroups(): string {
    return JSON.stringify({
      version: STORAGE_VERSION,
      groups: groups.value,
      exportedAt: new Date().toISOString(),
    }, null, 2)
  }

  function importGroups(json: string, mode: 'replace' | 'merge' = 'merge'): number {
    try {
      const data = JSON.parse(json)
      if (!data.groups || !Array.isArray(data.groups)) {
        throw new Error('Invalid group data format')
      }

      const imported = data.groups as Group[]
      const now = Date.now()

      if (mode === 'replace') {
        groups.value = imported.map(g => ({
          ...g,
          id: generateId(),
          updatedAt: now,
        }))
      } else {
        for (const group of imported) {
          if (!isNameInUse(group.name, group.parentId)) {
            groups.value.push({
              ...group,
              id: generateId(),
              createdAt: now,
              updatedAt: now,
            })
          }
        }
      }

      saveGroups()
      return imported.length
    } catch (error) {
      console.error('[Groups] Import failed:', error)
      throw error
    }
  }

  // =========================================================================
  // Initialization
  // =========================================================================

  watch(
    accountName,
    (newAccount, oldAccount) => {
      if (newAccount !== oldAccount) {
        loadGroups()
      }
    },
    { immediate: true }
  )

  return {
    // State
    groups,
    isLoaded,

    // CRUD
    addGroup,
    updateGroup,
    deleteGroup,
    toggleGroup,
    setGroupEnabled,

    // Queries
    getGroup,
    getChildGroups,
    rootGroups,
    isGroupEffectivelyEnabled,
    getGroupPath,
    moveGroup,
    reorderGroup,
    isNameInUse,

    // Export/Import
    exportGroups,
    importGroups,
    loadGroups,
  }
}
