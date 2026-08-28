import { ref, computed, watch } from 'vue'
import { useMudStore } from '@/stores/mudStore'
import type { Group, GroupFormData, GroupStorage } from '@/types/group'
import { createClientId } from '@/utils/clientId'
import { ClientSettingsStorageError, writeClientSettings } from '@/utils/clientSettingsStorage'
import { parseClientSettingsCollection } from '@/utils/clientSettingsImport'
import { normalizeGroupForm, normalizeGroupImport } from '@/utils/clientSettingsValidation'
import { useTriggers } from './useTriggers'
import { useAliases } from './useAliases'
import { useTimers } from './useTimers'

const STORAGE_VERSION = 1
const STORAGE_KEY_PREFIX = 'duris_groups_'

// global state (shared across components)
const groups = ref<Group[]>([])
const isLoaded = ref(false)
const storageError = ref<string | null>(null)
let accountWatcherInitialized = false

export interface GroupImportOptions {
  preserveIds?: boolean
}

export interface GroupImportResult {
  count: number
  idMap: Record<string, string>
}

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
    storageError.value = null
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
      storageError.value = null
    } catch (error) {
      console.error('[Groups] Failed to load:', error)
      groups.value = []
      isLoaded.value = true
      storageError.value = 'Saved groups could not be loaded. The stored data may be invalid.'
    }
  }

  function saveGroups(): boolean {
    if (!storageKey.value) {
      storageError.value = 'No active MUD account is available for group settings.'
      return false
    }

    try {
      const data: GroupStorage = {
        version: STORAGE_VERSION,
        groups: groups.value,
      }
      writeClientSettings(storageKey.value, data)
      storageError.value = null
      return true
    } catch (error) {
      console.error('[Groups] Failed to save:', error)
      storageError.value = error instanceof ClientSettingsStorageError
        ? error.message
        : 'Client settings could not be saved.'
      return false
    }
  }

  function canMutate(): boolean {
    if (!storageKey.value) {
      storageError.value = 'No active MUD account is available for group settings.'
      return false
    }
    if (!isLoaded.value) {
      storageError.value = 'Group settings are still loading. Try again in a moment.'
      return false
    }
    return true
  }

  function commitGroups(nextGroups: Group[]): boolean {
    if (!canMutate()) return false

    const previousGroups = groups.value
    groups.value = nextGroups
    if (saveGroups()) return true

    groups.value = previousGroups
    return false
  }

  // =========================================================================
  // CRUD Operations
  // =========================================================================

  function generateId(): string {
    return createClientId(groups.value.map((group) => group.id))
  }

  function addGroup(formData: GroupFormData): Group | null {
    if (!canMutate()) return null
    const now = Date.now()

    try {
      const id = generateId()
      const validated = normalizeGroupForm({ ...formData, order: 0 }, id, now)
      // enforce 2 level max - if parent has a parent, reject
      if (validated.parentId) {
        const parent = groups.value.find(g => g.id === validated.parentId)
        if (parent?.parentId) {
          throw new Error('Cannot create subgroup of a subgroup (2 levels max)')
        }
      }

      const siblings = groups.value.filter(g => g.parentId === validated.parentId)
      const maxOrder = siblings.length > 0 ? Math.max(...siblings.map(g => g.order)) : -1
      const group = normalizeGroupForm({ ...validated, order: maxOrder + 1 }, id, now)
      return commitGroups([...groups.value, group]) ? group : null
    } catch (error) {
      console.error('[Groups] Invalid group:', error)
      storageError.value = error instanceof Error ? error.message : 'Group settings are invalid.'
      return null
    }
  }

  function updateGroup(id: string, formData: Partial<GroupFormData>): Group | null {
    if (!canMutate()) return null
    const index = groups.value.findIndex(g => g.id === id)
    if (index === -1) return null

    const group = groups.value[index]
    if (!group) return null

    try {
      const updated = normalizeGroupForm(
        { ...group, ...formData, id: group.id, order: group.order, createdAt: group.createdAt },
        group.id,
        Date.now(),
      )
      if (updated.parentId === id) {
        throw new Error('A group cannot be its own parent')
      }
      if (updated.parentId) {
        const parent = groups.value.find(g => g.id === updated.parentId)
        if (parent?.parentId) {
          throw new Error('Cannot create subgroup of a subgroup (2 levels max)')
        }
      }

      const nextGroups = [...groups.value]
      nextGroups[index] = updated
      return commitGroups(nextGroups) ? updated : null
    } catch (error) {
      console.error('[Groups] Invalid group update:', error)
      storageError.value = error instanceof Error ? error.message : 'Group settings are invalid.'
      return null
    }
  }

  function deleteGroup(id: string): boolean {
    if (!canMutate()) return false
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
    const nextGroups = groups.value.filter(g => g.parentId !== id && g.id !== id)
    const index = groups.value.findIndex(g => g.id === id)
    if (index === -1) return false

    return commitGroups(nextGroups)
  }

  function toggleGroup(id: string): boolean {
    if (!canMutate()) return false
    const index = groups.value.findIndex(g => g.id === id)
    if (index === -1) return false

    const group = groups.value[index]
    if (!group) return false

    const nextGroups = [...groups.value]
    nextGroups[index] = {
      ...group,
      enabled: !group.enabled,
      updatedAt: Date.now(),
    }
    return commitGroups(nextGroups)
  }

  function setGroupEnabled(id: string, enabled: boolean): boolean {
    if (!canMutate()) return false
    const index = groups.value.findIndex(g => g.id === id)
    if (index === -1) return false

    const group = groups.value[index]
    if (!group) return false

    const nextGroups = [...groups.value]
    nextGroups[index] = {
      ...group,
      enabled,
      updatedAt: Date.now(),
    }
    return commitGroups(nextGroups)
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
    if (!canMutate()) return false
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

    const nextGroups = [...groups.value]
    nextGroups[index] = {
      ...group,
      parentId: newParentId,
      order: maxOrder + 1,
      updatedAt: Date.now(),
    }
    return commitGroups(nextGroups)
  }

  function reorderGroup(id: string, newOrder: number): boolean {
    if (!canMutate()) return false
    const index = groups.value.findIndex(g => g.id === id)
    if (index === -1) return false

    const group = groups.value[index]
    if (!group) return false

    const nextGroups = [...groups.value]
    nextGroups[index] = {
      ...group,
      order: newOrder,
      updatedAt: Date.now(),
    }
    return commitGroups(nextGroups)
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

  function importGroupsWithMap(
    json: string,
    mode: 'replace' | 'merge' = 'merge',
    options: GroupImportOptions = {},
  ): GroupImportResult {
    try {
      if (!canMutate()) {
        throw new ClientSettingsStorageError(
          storageError.value ?? 'Group settings are not ready to import.',
        )
      }
      const imported = parseClientSettingsCollection(json, 'groups')
      const now = Date.now()
      const normalizedImported = imported.map((item, index) => {
        const sourceId = item && typeof item === 'object' && !Array.isArray(item) && typeof (item as Record<string, unknown>).id === 'string'
          ? (item as Record<string, unknown>).id as string
          : ''
        return normalizeGroupImport(item, index, sourceId, now, mode === 'replace')
      })
      const reservedIds = new Set(
        mode === 'replace' ? [] : groups.value.map((group) => group.id),
      )
      const idMap = new Map<string, string>()
      const nextId = (sourceId: string) => {
        if (options.preserveIds && sourceId && !reservedIds.has(sourceId)) {
          reservedIds.add(sourceId)
          idMap.set(sourceId, sourceId)
          return sourceId
        }

        const id = createClientId(reservedIds)
        reservedIds.add(id)
        if (sourceId) idMap.set(sourceId, id)
        return id
      }

      if (mode === 'replace') {
        normalizedImported.forEach((group) => nextId(group.id))
        const nextGroups = normalizedImported.map(g => ({
          ...g,
          id: idMap.get(g.id) ?? nextId(g.id),
          parentId: g.parentId ? idMap.get(g.parentId) ?? null : null,
          updatedAt: now,
        }))
        if (!commitGroups(nextGroups)) {
          throw new ClientSettingsStorageError(storageError.value ?? 'Groups could not be saved.')
        }
        return { count: normalizedImported.length, idMap: Object.fromEntries(idMap) }
      } else {
        const nextGroups = [...groups.value]
        let accepted = 0
        for (const group of normalizedImported) {
          const parentId = group.parentId ? idMap.get(group.parentId) ?? group.parentId : null
          const existing = nextGroups.find((candidate) =>
            candidate.name.trim().toLowerCase() === group.name.trim().toLowerCase() &&
            candidate.parentId === parentId
          )
          if (existing) {
            idMap.set(group.id, existing.id)
            continue
          }

          const id = nextId(group.id)
          if (!nextGroups.some((existing) =>
            existing.name.trim().toLowerCase() === group.name.trim().toLowerCase() &&
            existing.parentId === parentId
          )) {
            nextGroups.push({
              ...group,
              id,
              parentId,
              createdAt: now,
              updatedAt: now,
            })
            accepted += 1
          }
        }
        if (!commitGroups(nextGroups)) {
          throw new ClientSettingsStorageError(storageError.value ?? 'Groups could not be saved.')
        }
        return { count: accepted, idMap: Object.fromEntries(idMap) }
      }
    } catch (error) {
      console.error('[Groups] Import failed:', error)
      throw error
    }
  }

  function importGroups(
    json: string,
    mode: 'replace' | 'merge' = 'merge',
    options: GroupImportOptions = {},
  ): number {
    return importGroupsWithMap(json, mode, options).count
  }

  // =========================================================================
  // Initialization
  // =========================================================================

  if (!accountWatcherInitialized) {
    accountWatcherInitialized = true
    watch(
      accountName,
      (newAccount, oldAccount) => {
        if (newAccount !== oldAccount) {
          loadGroups()
        }
      },
      { immediate: true }
    )
  }

  return {
    // State
    groups,
    isLoaded,
    storageError,

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
    importGroupsWithMap,
    loadGroups,
  }
}
