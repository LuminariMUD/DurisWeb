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
import { useAliases } from '../useAliases'
import type { AliasFormData } from '@/types/alias'

const aliasForm: AliasFormData = {
  trigger: 'kk',
  expansion: 'kill $1',
  enabled: true,
  scope: 'global',
  characterName: null,
  groupId: null,
}

async function selectAccount(account: string | null): Promise<void> {
  useMudStore().account = account
  await nextTick()
}

describe('useAliases local persistence', () => {
  const store = useMudStore()
  const aliasesApi = useAliases()

  beforeEach(async () => {
    vi.restoreAllMocks()
    localStorage.clear()
    store.reset()
    await selectAccount(null)
  })

  it('creates and reloads an alias for the active MUD account', async () => {
    await selectAccount('Cwial')

    const created = aliasesApi.addAlias(aliasForm)

    expect(created).not.toBeNull()
    expect(JSON.parse(localStorage.getItem('duris_aliases_cwial') || '{}').aliases).toHaveLength(1)

    await selectAccount(null)
    await selectAccount('Cwial')

    expect(aliasesApi.aliases.value).toHaveLength(1)
    expect(aliasesApi.aliases.value[0]?.trigger).toBe('kk')
  })

  it('does not mutate unsaved state when no MUD account is active', async () => {
    await selectAccount(null)

    expect(aliasesApi.addAlias(aliasForm)).toBeNull()
    expect(aliasesApi.aliases.value).toHaveLength(0)
    expect(aliasesApi.storageError.value).toContain('No active MUD account')
  })

  it('isolates persisted aliases when switching accounts', async () => {
    await selectAccount('Cwial')
    expect(aliasesApi.addAlias(aliasForm)).not.toBeNull()

    await selectAccount('OtherAccount')
    expect(aliasesApi.aliases.value).toHaveLength(0)
    expect(aliasesApi.addAlias({ ...aliasForm, trigger: 'heal' })).not.toBeNull()

    await selectAccount('Cwial')
    expect(aliasesApi.aliases.value.map((alias) => alias.trigger)).toEqual(['kk'])

    await selectAccount('OtherAccount')
    expect(aliasesApi.aliases.value.map((alias) => alias.trigger)).toEqual(['heal'])
  })

  it('rolls back an alias when browser storage rejects the write', async () => {
    await selectAccount('Cwial')
    vi.spyOn(localStorageMock, 'setItem').mockImplementation(() => {
      throw new Error('quota exceeded')
    })

    expect(aliasesApi.addAlias(aliasForm)).toBeNull()
    expect(aliasesApi.aliases.value).toHaveLength(0)
    expect(aliasesApi.storageError.value).toContain('could not be saved')
  })

  it('writes the version-1 group migration back as version 2', async () => {
    localStorage.setItem('duris_aliases_cwial', JSON.stringify({
      version: 1,
      aliases: [{ ...aliasForm, id: 'legacy', createdAt: 1, updatedAt: 1 }],
    }))

    await selectAccount('Cwial')

    const stored = JSON.parse(localStorage.getItem('duris_aliases_cwial') || '{}')
    expect(stored.version).toBe(2)
    expect(stored.aliases[0].groupId).toBeNull()
  })

  it('reports only accepted aliases when merging imports', async () => {
    await selectAccount('Cwial')
    aliasesApi.addAlias(aliasForm)

    const imported = {
      version: 2,
      aliases: [
        { ...aliasForm, id: 'one', createdAt: 1, updatedAt: 1 },
        { ...aliasForm, id: 'two', trigger: 'heal', createdAt: 1, updatedAt: 1 },
      ],
    }

    expect(aliasesApi.importAliases(JSON.stringify(imported), 'merge')).toBe(1)
    expect(aliasesApi.aliases.value.map((alias) => alias.trigger)).toEqual(['kk', 'heal'])
  })

  it('rejects an oversized import document before parsing items', async () => {
    await selectAccount('Cwial')
    expect(() => aliasesApi.importAliases('x'.repeat(1_000_001), 'merge'))
      .toThrow(/maximum|large|size/i)
  })

  it('rejects an import with too many items before mutation', async () => {
    await selectAccount('Cwial')
    const items = Array.from({ length: 1_001 }, (_, index) => ({
      ...aliasForm,
      id: `alias-${index}`,
      trigger: `trigger-${index}`,
      createdAt: 1,
      updatedAt: 1,
    }))

    expect(() => aliasesApi.importAliases(JSON.stringify({ aliases: items }), 'merge'))
      .toThrow(/more than 1000/i)
    expect(aliasesApi.aliases.value).toHaveLength(0)
  })

  it('rejects malformed alias records before mutation', async () => {
    await selectAccount('Cwial')
    const malformed = {
      version: 2,
      aliases: [{ ...aliasForm, id: 'bad', expansion: 123, createdAt: 1, updatedAt: 1 }],
    }

    expect(() => aliasesApi.importAliases(JSON.stringify(malformed), 'merge'))
      .toThrow(/Invalid alias.*expansion/i)
    expect(aliasesApi.aliases.value).toHaveLength(0)
  })

  it('rejects malformed direct alias creation and update without mutation', async () => {
    await selectAccount('Cwial')

    expect(aliasesApi.addAlias({
      ...aliasForm,
      expansion: 123 as unknown as string,
    })).toBeNull()
    expect(aliasesApi.aliases.value).toHaveLength(0)
    expect(aliasesApi.storageError.value).toMatch(/expansion must be a string/i)

    const created = aliasesApi.addAlias(aliasForm)
    expect(created).not.toBeNull()
    const before = aliasesApi.aliases.value[0]
    expect(aliasesApi.updateAlias(before!.id, {
      trigger: 123 as unknown as string,
    })).toBeNull()
    expect(aliasesApi.aliases.value[0]).toEqual(before)
  })
})
