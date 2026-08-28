import { beforeEach, describe, expect, it } from 'vitest'
import { useGroupActions } from '../useGroupActions'
import { useMobActions } from '../useMobActions'

const storage = new Map<string, string>()
Object.defineProperty(globalThis, 'localStorage', {
  configurable: true,
  value: {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, value),
    removeItem: (key: string) => storage.delete(key),
    clear: () => storage.clear(),
  },
})

describe('direct action definition validation', () => {
  const groupApi = useGroupActions()
  const mobApi = useMobActions()

  beforeEach(() => {
    groupApi.importActions(JSON.stringify({ groupActions: [] }), 'replace')
    mobApi.importActions(JSON.stringify({ mobActions: [] }), 'replace')
  })

  it('rejects malformed group action creation and update without mutation', () => {
    expect(groupApi.addAction(123 as unknown as string, 'look')).toBeNull()
    expect(groupApi.actions.value).toHaveLength(0)

    const created = groupApi.addAction('Assist', 'assist') as unknown as { id: string } | null
    expect(created).not.toBeNull()
    expect(groupApi.updateAction(created!.id, 'Assist', 123 as unknown as string)).toBe(false)
    expect(groupApi.actions.value[0]).toEqual(created)
  })

  it('rejects malformed mob action creation and update without mutation', () => {
    expect(mobApi.addAction('Kill', 123 as unknown as string)).toBeNull()
    expect(mobApi.actions.value).toHaveLength(0)

    const created = mobApi.addAction('Kill', 'kill') as unknown as { id: string } | null
    expect(created).not.toBeNull()
    expect(mobApi.updateAction(created!.id, 123 as unknown as string, 'kill')).toBe(false)
    expect(mobApi.actions.value[0]).toEqual(created)
  })
})
