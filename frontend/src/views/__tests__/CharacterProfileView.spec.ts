import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'

const route = { params: { characterName: 'Fixture' } }
const getCharacterStats = vi.fn()
const getPlayerStats = vi.fn()
const getCharacterPvPEvents = vi.fn()
const getCharacterPosts = vi.fn()

vi.mock('vue-router', () => ({ useRoute: () => route, useRouter: () => ({ push: vi.fn() }) }))
vi.mock('@/components/layout/BreadcrumbsNav.vue', () => ({ default: { template: '<nav />' } }))
vi.mock('@/features/frag/api', () => ({
  fragApi: { getCharacterStats: (name: string) => getCharacterStats(name) },
}))
vi.mock('@/features/pvp/api', () => ({
  pvpApi: { getPlayerStats: (name: string) => getPlayerStats(name) },
}))
vi.mock('@/features/profile/api', () => ({
  characterApi: {
    getCharacterPvPEvents: (name: string) => getCharacterPvPEvents(name),
    getCharacterPosts: (name: string) => getCharacterPosts(name),
  },
}))

import CharacterProfileView from '../CharacterProfileView.vue'

beforeEach(() => {
  vi.clearAllMocks()
  getCharacterStats.mockResolvedValue({
    rank: 3,
    char_name: 'Fixture',
    account_name: 'Secretaccount',
    total_frags: 7.25,
    racewar: 2,
    race: 'Orc',
    class: 'Cleric',
    level: 45,
  })
  getPlayerStats.mockResolvedValue({ kills: 4, deaths: 2, kdRatio: 2 })
  getCharacterPvPEvents.mockResolvedValue({
    events: [],
    pagination: { page: 1, limit: 20, total: 0, totalPages: 0 },
  })
})

describe('public character page', () => {
  it('renders only public character data, never the owning account', async () => {
    const view = mount(CharacterProfileView)
    await flushPromises()
    expect(getCharacterStats).toHaveBeenCalledWith('Fixture')
    expect(view.text()).toContain('Fixture')
    expect(view.text()).toContain('Level 45')
    expect(view.text()).toContain('7.25')
    expect(view.text()).toContain('#3')
    expect(view.text()).toContain('4k / 2d')
    expect(view.html()).not.toContain('Secretaccount')
  })

  it('shows not found for a retired or unknown character', async () => {
    getCharacterStats.mockRejectedValue({ response: { status: 404 } })
    const view = mount(CharacterProfileView)
    await flushPromises()
    expect(view.text()).toContain('Character not found')
    expect(getPlayerStats).not.toHaveBeenCalled()
  })

  it('still renders when the character has no published battles', async () => {
    getPlayerStats.mockRejectedValue({ response: { status: 404 } })
    const view = mount(CharacterProfileView)
    await flushPromises()
    expect(view.text()).toContain('Fixture')
    expect(view.text()).toContain('No PvP events recorded')
  })
})
