import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { reactive } from 'vue'
import { Tabs } from '@/components/ui/tabs'
import PaginationWithEllipsis from '@/components/forum/PaginationWithEllipsis.vue'
import type { characterApi } from '@/features/profile/api'

const route = reactive({ params: { characterName: 'Fixture' } })
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
    getCharacterPvPEvents: (...args: Parameters<typeof characterApi.getCharacterPvPEvents>) =>
      getCharacterPvPEvents(...args),
    getCharacterPosts: (...args: Parameters<typeof characterApi.getCharacterPosts>) =>
      getCharacterPosts(...args),
  },
}))

import CharacterProfileView from '../CharacterProfileView.vue'
const views: Array<ReturnType<typeof mount>> = []
const summaryFor = (name: string, racewar = 2) => ({
  rank: 3,
  char_name: name,
  account_name: 'Secretaccount',
  total_frags: 7.25,
  racewar,
  race: 'Orc',
  class: 'Cleric',
  level: 45,
})
function createView() {
  const view = mount(CharacterProfileView)
  views.push(view)
  return view
}
function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((done) => {
    resolve = done
  })
  return { promise, resolve }
}
const pagination = (page: number) => ({ page, limit: 20, total: 60, totalPages: 3 })
const eventsFor = (page: number) => ({
  events: [
    {
      eventId: page,
      role: 'KILLER',
      location: `Battle page ${page}`,
      description: 'Fixture',
      date: '2020-01-01T00:00:00Z',
    },
  ],
  pagination: pagination(page),
})
const postsFor = (page: number) => ({
  posts: [
    {
      id: page,
      threadId: page,
      threadTitle: `Posts page ${page}`,
      categoryName: 'Public',
      content: 'Fixture post',
      createdAt: '2020-01-01T00:00:00Z',
    },
  ],
  pagination: pagination(page),
})

beforeEach(() => {
  vi.clearAllMocks()
  route.params.characterName = 'Fixture'
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
  getCharacterPosts.mockResolvedValue({ posts: [], pagination: pagination(1) })
})
afterEach(() => {
  while (views.length) views.pop()?.unmount()
})

describe('public character page', () => {
  it('renders only public character data, never the owning account', async () => {
    const view = createView()
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
    getCharacterStats.mockRejectedValue({ isAxiosError: true, response: { status: 404 } })
    const view = createView()
    await flushPromises()
    expect(view.text()).toContain('Character not found')
    expect(getPlayerStats).not.toHaveBeenCalled()
  })

  it('still renders when the character has no published battles', async () => {
    getPlayerStats.mockRejectedValue({ response: { status: 404 } })
    const view = createView()
    await flushPromises()
    expect(view.text()).toContain('Fixture')
    expect(view.text()).toContain('No PvP events recorded')
  })

  it('ignores a summary that returns after navigation to another character', async () => {
    const old = deferred<ReturnType<typeof summaryFor>>()
    getCharacterStats.mockImplementation((name: string) =>
      name === 'Fixture' ? old.promise : Promise.resolve(summaryFor(name)),
    )
    const view = createView()
    route.params.characterName = 'Second'
    await flushPromises()
    old.resolve(summaryFor('Fixture'))
    await flushPromises()
    expect(view.text()).toContain('Second')
    expect(getPlayerStats).toHaveBeenCalledTimes(1)
    expect(getPlayerStats).toHaveBeenCalledWith('Second')
  })

  it('ignores old PvP stats that finish after navigation', async () => {
    const old = deferred<{ kills: number; deaths: number; kdRatio: number }>()
    getCharacterStats.mockImplementation((name: string) => Promise.resolve(summaryFor(name)))
    getPlayerStats.mockImplementation((name: string) =>
      name === 'Fixture' ? old.promise : Promise.resolve({ kills: 4, deaths: 2, kdRatio: 2 }),
    )
    const view = createView()
    await flushPromises()
    route.params.characterName = 'Second'
    await flushPromises()
    old.resolve({ kills: 999, deaths: 1, kdRatio: 999 })
    await flushPromises()
    expect(view.text()).toContain('Second')
    expect(view.text()).not.toContain('999k')
  })

  it('keeps the newest PvP page when older pagination finishes late', async () => {
    const old = deferred<ReturnType<typeof eventsFor>>()
    getCharacterPvPEvents.mockImplementation((_name: string, page: number) =>
      page === 2 ? old.promise : Promise.resolve(eventsFor(page)),
    )
    const view = createView()
    await flushPromises()
    const pages = view.findComponent(PaginationWithEllipsis)
    pages.vm.$emit('pageChange', 2)
    pages.vm.$emit('pageChange', 3)
    await flushPromises()
    old.resolve(eventsFor(2))
    await flushPromises()
    expect(view.text()).toContain('Battle page 3')
    expect(view.text()).not.toContain('Battle page 2')
  })

  it('keeps the newest forum page when older pagination finishes late', async () => {
    const old = deferred<ReturnType<typeof postsFor>>()
    getCharacterPosts.mockImplementation((_name: string, page: number) =>
      page === 2 ? old.promise : Promise.resolve(postsFor(page)),
    )
    const view = createView()
    await flushPromises()
    view.findComponent(Tabs).vm.$emit('update:modelValue', 'posts')
    await flushPromises()
    const pages = view.findComponent(PaginationWithEllipsis)
    pages.vm.$emit('pageChange', 2)
    pages.vm.$emit('pageChange', 3)
    await flushPromises()
    old.resolve(postsFor(2))
    await flushPromises()
    expect(view.text()).toContain('Posts page 3')
    expect(view.text()).not.toContain('Posts page 2')
  })

  it('identifies the Undead faction without calling it neutral alignment', async () => {
    getCharacterStats.mockResolvedValue(summaryFor('Fixture', 3))
    const view = createView()
    await flushPromises()
    expect(view.text()).toContain('Undead')
  })
})
