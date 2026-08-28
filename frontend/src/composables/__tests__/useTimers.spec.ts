import { beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import { createPinia, setActivePinia } from 'pinia'

vi.mock('../useGroups', () => ({
  useGroups: () => ({
    isGroupEffectivelyEnabled: () => true,
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
import { useTimers } from '../useTimers'

const timerForm = {
  name: 'Heartbeat',
  intervalMs: 60_000,
  isOneShot: false,
  actions: [{ type: 'command' as const, commands: 'look' }],
  enabled: false,
  scope: 'global' as const,
  characterName: null,
  groupId: null,
}

async function selectAccount(account: string | null): Promise<void> {
  useMudStore().account = account
  await nextTick()
}

describe('useTimers local persistence', () => {
  const store = useMudStore()
  const timersApi = useTimers()

  beforeEach(async () => {
    vi.restoreAllMocks()
    localStorageMock.clear()
    store.reset()
    await selectAccount(null)
  })

  it('creates and reloads a timer for the active MUD account', async () => {
    await selectAccount('Cwial')

    expect(timersApi.addTimer(timerForm)).not.toBeNull()
    expect(JSON.parse(localStorage.getItem('duris_timers_cwial') || '{}').timers).toHaveLength(1)

    await selectAccount(null)
    await selectAccount('Cwial')

    expect(timersApi.timers.value).toHaveLength(1)
    expect(timersApi.timers.value[0]?.name).toBe('Heartbeat')
  })

  it('does not mutate when no MUD account is active', async () => {
    await selectAccount(null)

    expect(timersApi.addTimer(timerForm)).toBeNull()
    expect(timersApi.timers.value).toHaveLength(0)
    expect(timersApi.storageError.value).toContain('No active MUD account')
  })

  it('isolates persisted timers when switching accounts', async () => {
    await selectAccount('Cwial')
    expect(timersApi.addTimer(timerForm)).not.toBeNull()

    await selectAccount('OtherAccount')
    expect(timersApi.timers.value).toHaveLength(0)
    expect(timersApi.addTimer({ ...timerForm, name: 'Heartbeat 2' })).not.toBeNull()

    await selectAccount('Cwial')
    expect(timersApi.timers.value.map((timer) => timer.name)).toEqual(['Heartbeat'])

    await selectAccount('OtherAccount')
    expect(timersApi.timers.value.map((timer) => timer.name)).toEqual(['Heartbeat 2'])
  })

  it('rolls back a timer when browser storage rejects the write', async () => {
    await selectAccount('Cwial')
    vi.spyOn(localStorageMock, 'setItem').mockImplementation(() => {
      throw new Error('quota exceeded')
    })

    expect(timersApi.addTimer(timerForm)).toBeNull()
    expect(timersApi.timers.value).toHaveLength(0)
    expect(timersApi.storageError.value).toContain('could not be saved')
  })
})
