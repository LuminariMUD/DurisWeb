import { beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import { createPinia, setActivePinia } from 'pinia'

vi.mock('../useTriggers', () => ({
  useTriggers: () => ({
    triggers: { value: [] },
    setTriggerGroup: vi.fn(() => true),
  }),
}))
vi.mock('../useAliases', () => ({
  useAliases: () => ({
    aliases: { value: [] },
    setAliasGroup: vi.fn(() => true),
  }),
}))
vi.mock('../useTimers', () => ({
  useTimers: () => ({
    timers: { value: [] },
    setTimerGroup: vi.fn(() => true),
  }),
}))

const storageData = new Map<string, string>()
const localStorageMock = {
  getItem: (key: string) => storageData.get(key) ?? null,
  setItem: (key: string, value: string) => storageData.set(key, value),
  removeItem: (key: string) => storageData.delete(key),
  clear: () => storageData.clear(),
  key: (index: number) => Array.from(storageData.keys())[index] ?? null,
  get length() {
    return storageData.size
  },
}

Object.defineProperty(globalThis, 'localStorage', {
  configurable: true,
  value: localStorageMock,
})

setActivePinia(createPinia())

import { useMudStore } from '@/stores/mudStore'
import { useGroups } from '../useGroups'

const groupForm = {
  name: 'Combat',
  parentId: null,
  enabled: true,
}

async function selectAccount(account: string | null): Promise<void> {
  useMudStore().account = account
  await nextTick()
}

describe('useGroups local persistence', () => {
  const store = useMudStore()
  const groupsApi = useGroups()

  beforeEach(async () => {
    vi.restoreAllMocks()
    localStorageMock.clear()
    store.reset()
    await selectAccount(null)
  })

  it('creates and reloads a group for the active MUD account', async () => {
    await selectAccount('Cwial')

    expect(groupsApi.addGroup(groupForm)).not.toBeNull()
    expect(JSON.parse(localStorage.getItem('duris_groups_cwial') || '{}').groups).toHaveLength(1)

    await selectAccount(null)
    await selectAccount('Cwial')

    expect(groupsApi.groups.value).toHaveLength(1)
    expect(groupsApi.groups.value[0]?.name).toBe('Combat')
  })

  it('does not mutate when no MUD account is active', async () => {
    await selectAccount(null)

    expect(groupsApi.addGroup(groupForm)).toBeNull()
    expect(groupsApi.groups.value).toHaveLength(0)
    expect(groupsApi.storageError.value).toContain('No active MUD account')
  })

  it('isolates persisted groups when switching accounts', async () => {
    await selectAccount('Cwial')
    expect(groupsApi.addGroup(groupForm)).not.toBeNull()

    await selectAccount('OtherAccount')
    expect(groupsApi.groups.value).toHaveLength(0)
    expect(groupsApi.addGroup({ ...groupForm, name: 'Exploration' })).not.toBeNull()

    await selectAccount('Cwial')
    expect(groupsApi.groups.value.map((group) => group.name)).toEqual(['Combat'])

    await selectAccount('OtherAccount')
    expect(groupsApi.groups.value.map((group) => group.name)).toEqual(['Exploration'])
  })

  it('rolls back a group when browser storage rejects the write', async () => {
    await selectAccount('Cwial')
    vi.spyOn(localStorageMock, 'setItem').mockImplementation(() => {
      throw new Error('quota exceeded')
    })

    expect(groupsApi.addGroup(groupForm)).toBeNull()
    expect(groupsApi.groups.value).toHaveLength(0)
    expect(groupsApi.storageError.value).toContain('could not be saved')
  })
})
