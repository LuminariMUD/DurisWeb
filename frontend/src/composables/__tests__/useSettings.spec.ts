import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  aliases: { value: [{ id: 'alias-1', groupId: 'group-1' }] },
  triggers: { value: [{ id: 'trigger-1', groupId: 'group-1' }] },
  groups: { value: [{ id: 'group-1', name: 'Combat' }] },
  groupActions: { value: [{ id: 'action-1' }] },
  exportAliases: vi.fn(() => JSON.stringify({ version: 2, aliases: [{ id: 'alias-1', groupId: 'group-1' }] })),
  exportTriggers: vi.fn(() => JSON.stringify({ version: 5, triggers: [{ id: 'trigger-1', groupId: 'group-1' }] })),
  exportGroups: vi.fn(() => JSON.stringify({ version: 1, groups: [{ id: 'group-1', name: 'Combat' }] })),
  exportGroupActions: vi.fn(() => JSON.stringify({ version: 1, groupActions: [{ id: 'action-1' }] })),
  importAliases: vi.fn(() => 1),
  importTriggers: vi.fn(() => 1),
  importGroupsWithMap: vi.fn(() => ({ count: 1, idMap: { 'group-1': 'group-2' } })),
  importGroupActions: vi.fn(() => 1),
}))

vi.mock('@/composables/useAliases', () => ({
  useAliases: () => ({
    aliases: mocks.aliases,
    exportAliases: mocks.exportAliases,
    importAliases: mocks.importAliases,
  }),
}))
vi.mock('@/composables/useTriggers', () => ({
  useTriggers: () => ({
    triggers: mocks.triggers,
    exportTriggers: mocks.exportTriggers,
    importTriggers: mocks.importTriggers,
  }),
}))
vi.mock('@/composables/useGroups', () => ({
  useGroups: () => ({
    groups: mocks.groups,
    exportGroups: mocks.exportGroups,
    importGroupsWithMap: mocks.importGroupsWithMap,
  }),
}))
vi.mock('@/composables/useGroupActions', () => ({
  useGroupActions: () => ({
    actions: mocks.groupActions,
    exportActions: mocks.exportGroupActions,
    importActions: mocks.importGroupActions,
  }),
}))

import { useSettings } from '../useSettings'

describe('useSettings grouped export/import', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('includes group definitions in the combined export', () => {
    const settings = useSettings()
    const data = JSON.parse(settings.exportAllSettings())

    expect(data.version).toBe(2)
    expect(data.groups.groups).toEqual([{ id: 'group-1', name: 'Combat' }])
  })

  it('remaps alias and trigger group references during import', () => {
    const settings = useSettings()
    const result = settings.importAllSettings(JSON.stringify({
      version: 1,
      groups: { version: 1, groups: [{ id: 'group-1', name: 'Combat' }] },
      aliases: { version: 2, aliases: [{ id: 'alias-1', groupId: 'group-1' }] },
      triggers: { version: 5, triggers: [{ id: 'trigger-1', groupId: 'group-1' }] },
    }), 'merge')

    expect(result).toEqual({ aliases: 1, triggers: 1, groups: 1, groupActions: 0 })

    const aliasArg = (mocks.importAliases.mock.calls[0] as unknown[] | undefined)?.[0]
    const triggerArg = (mocks.importTriggers.mock.calls[0] as unknown[] | undefined)?.[0]
    const aliasPayload = JSON.parse(String(aliasArg))
    const triggerPayload = JSON.parse(String(triggerArg))
    expect(aliasPayload.aliases[0].groupId).toBe('group-2')
    expect(triggerPayload.triggers[0].groupId).toBe('group-2')
  })

  it('rejects an oversized combined import document before parsing', () => {
    const settings = useSettings()
    expect(() => settings.importAllSettings('x'.repeat(1_000_001), 'merge'))
      .toThrow(/maximum|large|size/i)
  })
})
