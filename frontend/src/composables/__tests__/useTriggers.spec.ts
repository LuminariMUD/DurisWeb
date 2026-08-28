import { beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import { createPinia, setActivePinia } from 'pinia'

vi.mock('@/composables/useGroups', () => ({
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
import { useTriggers } from '../useTriggers'
import type { TriggerFormData } from '@/types/trigger'

const triggerForm: TriggerFormData = {
  name: 'Low health',
  patterns: [{ value: 'You are hurt', isGmcp: false }],
  patternLogic: 'or',
  patternType: 'substring',
  caseSensitive: false,
  actions: [{ type: 'command', commands: 'flee' }],
  enabled: true,
  scope: 'global',
  characterName: null,
  groupId: null,
  priority: 0,
  stopProcessing: false,
}

async function selectAccount(account: string | null): Promise<void> {
  useMudStore().account = account
  await nextTick()
}

describe('useTriggers local persistence', () => {
  const store = useMudStore()
  const triggersApi = useTriggers()

  beforeEach(async () => {
    vi.restoreAllMocks()
    localStorage.clear()
    store.reset()
    await selectAccount(null)
  })

  it('creates and reloads a trigger for the active MUD account', async () => {
    await selectAccount('Cwial')

    const created = triggersApi.addTrigger(triggerForm)

    expect(created).not.toBeNull()
    expect(JSON.parse(localStorage.getItem('duris_triggers_cwial') || '{}').triggers).toHaveLength(1)

    await selectAccount(null)
    await selectAccount('Cwial')

    expect(triggersApi.triggers.value).toHaveLength(1)
    expect(triggersApi.triggers.value[0]?.name).toBe('Low health')
  })

  it('does not mutate unsaved state when no MUD account is active', async () => {
    await selectAccount(null)

    expect(triggersApi.addTrigger(triggerForm)).toBeNull()
    expect(triggersApi.triggers.value).toHaveLength(0)
    expect(triggersApi.storageError.value).toContain('No active MUD account')
  })

  it('isolates persisted triggers when switching accounts', async () => {
    await selectAccount('Cwial')
    expect(triggersApi.addTrigger(triggerForm)).not.toBeNull()

    await selectAccount('OtherAccount')
    expect(triggersApi.triggers.value).toHaveLength(0)
    expect(triggersApi.addTrigger({ ...triggerForm, name: 'Low mana' })).not.toBeNull()

    await selectAccount('Cwial')
    expect(triggersApi.triggers.value.map((trigger) => trigger.name)).toEqual(['Low health'])

    await selectAccount('OtherAccount')
    expect(triggersApi.triggers.value.map((trigger) => trigger.name)).toEqual(['Low mana'])
  })

  it('rolls back a trigger when browser storage rejects the write', async () => {
    await selectAccount('Cwial')
    vi.spyOn(localStorageMock, 'setItem').mockImplementation(() => {
      throw new Error('quota exceeded')
    })

    expect(triggersApi.addTrigger(triggerForm)).toBeNull()
    expect(triggersApi.triggers.value).toHaveLength(0)
    expect(triggersApi.storageError.value).toContain('could not be saved')
  })

  it('writes the version-4 group migration back as version 5', async () => {
    localStorage.setItem('duris_triggers_cwial', JSON.stringify({
      version: 4,
      triggers: [{ ...triggerForm, id: 'legacy', createdAt: 1, updatedAt: 1 }],
    }))

    await selectAccount('Cwial')

    const stored = JSON.parse(localStorage.getItem('duris_triggers_cwial') || '{}')
    expect(stored.version).toBe(5)
    expect(stored.triggers[0].groupId).toBeNull()
  })

  it('reports only accepted triggers when merging imports', async () => {
    await selectAccount('Cwial')
    triggersApi.addTrigger(triggerForm)

    const imported = {
      version: 5,
      triggers: [
        { ...triggerForm, id: 'one', createdAt: 1, updatedAt: 1 },
        { ...triggerForm, id: 'two', name: 'Low mana', createdAt: 1, updatedAt: 1 },
      ],
    }

    expect(triggersApi.importTriggers(JSON.stringify(imported), 'merge')).toBe(1)
    expect(triggersApi.triggers.value.map((trigger) => trigger.name)).toEqual(['Low health', 'Low mana'])
  })

  it('rejects unsafe custom sound URLs before mutation', async () => {
    await selectAccount('Cwial')
    const malformed = {
      version: 5,
      triggers: [{
        ...triggerForm,
        id: 'unsafe',
        actions: [{ type: 'sound', sound: 'custom', customUrl: 'javascript:alert(1)' }],
        createdAt: 1,
        updatedAt: 1,
      }],
    }

    expect(() => triggersApi.importTriggers(JSON.stringify(malformed), 'merge'))
      .toThrow(/Invalid trigger.*customUrl/i)
    expect(triggersApi.triggers.value).toHaveLength(0)
  })

  it('rejects invalid direct trigger creation and update without mutation', async () => {
    await selectAccount('Cwial')
    const unsafeForm = {
      ...triggerForm,
      actions: [{ type: 'sound', sound: 'custom', customUrl: 'javascript:alert(1)' }],
    } as unknown as TriggerFormData

    expect(triggersApi.addTrigger(unsafeForm)).toBeNull()
    expect(triggersApi.triggers.value).toHaveLength(0)
    expect(triggersApi.storageError.value).toMatch(/customUrl/i)

    const created = triggersApi.addTrigger(triggerForm)
    expect(created).not.toBeNull()
    const before = triggersApi.triggers.value[0]
    expect(triggersApi.updateTrigger(before!.id, {
      patternType: 'regex',
      patterns: [{ value: '[', isGmcp: false }],
    })).toBeNull()
    expect(triggersApi.triggers.value[0]).toEqual(before)
  })
})
