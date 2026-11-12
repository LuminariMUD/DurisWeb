import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { reactive } from 'vue'
import type { Router } from 'vue-router'
import PaginationWithEllipsis from '@/components/forum/PaginationWithEllipsis.vue'
import { Skeleton } from '@/components/ui/skeleton'

const push = vi.fn<Router['push']>()
const route = reactive({ params: { guildName: 'guild-a' } })
const guildApi = vi.hoisted(() => ({
  getGuildProfile: vi.fn<typeof import('@/features/profile/api').guildApi.getGuildProfile>(),
  getGuildForumActivity:
    vi.fn<typeof import('@/features/profile/api').guildApi.getGuildForumActivity>(),
}))
vi.mock('vue-router', () => ({ useRoute: () => route, useRouter: () => ({ push }) }))
vi.mock('@/components/layout/BreadcrumbsNav.vue', () => ({ default: { template: '<nav />' } }))
vi.mock('@/features/profile/api', () => ({ guildApi }))
import GuildProfileView from '../GuildProfileView.vue'

function profile(name = 'Guild A') {
  return {
    id: 'fixture',
    name,
    racewar: 1,
    frags: 0,
    stats: { totalMembers: 0, forumPosts: 1, forumThreads: 1, pvpKills: 0, pvpDeaths: 0 },
    members: [],
  }
}
function activity(title = 'Fixture thread', page = 1) {
  return {
    posts: [
      {
        id: page,
        threadId: 42,
        threadTitle: title,
        characterName: 'Hero',
        categoryName: 'General',
        content: 'Hello',
        createdAt: '2026-01-01T00:00:00Z',
      },
    ],
    pagination: { page, limit: 20, total: 60, totalPages: 3 },
  }
}
function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (error: unknown) => void
  const promise = new Promise<T>((accept, fail) => {
    resolve = accept
    reject = fail
  })
  return { promise, resolve, reject }
}
let view: VueWrapper | undefined
async function render() {
  view = mount(GuildProfileView)
  await flushPromises()
  return view
}
async function tab(text: string) {
  const button = view!.findAll('button').find((button) => button.text() === text)!
  await button.trigger('mousedown', { button: 0 })
  await flushPromises()
}
beforeEach(() => {
  route.params.guildName = 'guild-a'
  push.mockReset().mockResolvedValue(undefined)
  guildApi.getGuildProfile
    .mockReset()
    .mockImplementation(async (slug) => profile(slug === 'guild-a' ? 'Guild A' : 'Guild B'))
  guildApi.getGuildForumActivity
    .mockReset()
    .mockImplementation(async (_name, page = 1) => activity('Page ' + page + ' thread', page))
})
afterEach(() => {
  view?.unmount()
  view = undefined
})

describe('guild profile and forum activity ownership', () => {
  it('opens the activity card through the registered forum-thread route', async () => {
    await render()
    await tab('Forum Activity')
    const title = view!.findAll('*').filter((node) => node.text() === 'Page 1 thread')
    await title.at(-1)!.trigger('click')
    expect(push).toHaveBeenCalledWith({ name: 'forum-thread', params: { threadId: '42' } })
  })
  it.each(['success', 'failure'] as const)(
    'ignores a late old profile %s after navigation',
    async (result) => {
      const old = deferred<ReturnType<typeof profile>>()
      guildApi.getGuildProfile.mockImplementationOnce(() => old.promise)
      await render()
      route.params.guildName = 'guild-b'
      await flushPromises()
      expect(view!.text()).toContain('Guild B')
      if (result === 'success') old.resolve(profile('Old Guild A'))
      else old.reject(new Error('Old failure'))
      await flushPromises()
      expect(view!.text()).toContain('Guild B')
      expect(view!.text()).not.toContain('Old Guild A')
      expect(view!.text()).not.toContain('Failed to load guild profile')
    },
  )
  it('does not repopulate the new guild with an old activity response', async () => {
    const old = deferred<ReturnType<typeof activity>>()
    guildApi.getGuildForumActivity.mockImplementationOnce(() => old.promise)
    await render()
    await tab('Forum Activity')
    route.params.guildName = 'guild-b'
    await flushPromises()
    await tab('Forum Activity')
    expect(guildApi.getGuildForumActivity).toHaveBeenLastCalledWith('Guild B', 1, 20)
    expect(view!.text()).toContain('Page 1 thread')
    old.resolve(activity('Old Guild A post', 3))
    await flushPromises()
    expect(view!.text()).not.toContain('Old Guild A post')
    expect(view!.findComponent(PaginationWithEllipsis).props('currentPage')).toBe(1)
  })
  it('keeps the new profile loading when the old profile completes first', async () => {
    const old = deferred<ReturnType<typeof profile>>()
    const current = deferred<ReturnType<typeof profile>>()
    guildApi.getGuildProfile
      .mockImplementationOnce(() => old.promise)
      .mockImplementationOnce(() => current.promise)
    await render()
    route.params.guildName = 'guild-b'
    await flushPromises()
    old.resolve(profile('Old Guild A'))
    await flushPromises()
    expect(view!.findAllComponents(Skeleton).length).toBeGreaterThan(0)
    expect(view!.text()).not.toContain('Old Guild A')
    current.resolve(profile('Guild B'))
    await flushPromises()
    expect(view!.text()).toContain('Guild B')
  })
  it('keeps a new guild activity request loading when the old one fails', async () => {
    const old = deferred<ReturnType<typeof activity>>()
    const current = deferred<ReturnType<typeof activity>>()
    guildApi.getGuildForumActivity
      .mockImplementationOnce(() => old.promise)
      .mockImplementationOnce(() => current.promise)
    await render()
    await tab('Forum Activity')
    route.params.guildName = 'guild-b'
    await flushPromises()
    await tab('Forum Activity')
    old.reject(new Error('Old request failed'))
    await flushPromises()
    expect(view!.findAllComponents(Skeleton).length).toBeGreaterThan(0)
    expect(view!.text()).not.toContain('No recent forum activity')
    current.resolve(activity('Current guild activity'))
    await flushPromises()
    expect(view!.text()).toContain('Current guild activity')
  })
  it('keeps the newest repeated activity request when tabs are revisited during loading', async () => {
    const old = deferred<ReturnType<typeof activity>>()
    const current = deferred<ReturnType<typeof activity>>()
    guildApi.getGuildForumActivity
      .mockImplementationOnce(() => old.promise)
      .mockImplementationOnce(() => current.promise)
    await render()
    await tab('Forum Activity')
    await tab('Members')
    await tab('Forum Activity')
    expect(guildApi.getGuildForumActivity).toHaveBeenCalledTimes(2)
    current.resolve(activity('Newest activity'))
    await flushPromises()
    old.resolve(activity('Older activity'))
    await flushPromises()
    expect(view!.text()).toContain('Newest activity')
    expect(view!.text()).not.toContain('Older activity')
  })
  it('reports a failed page and retries the requested page instead of claiming empty history', async () => {
    await render()
    await tab('Forum Activity')
    guildApi.getGuildForumActivity.mockRejectedValueOnce({
      isAxiosError: true,
      response: { data: { error: { message: 'Activity temporarily unavailable' } } },
    })
    view!.findComponent(PaginationWithEllipsis).vm.$emit('pageChange', 2)
    await flushPromises()
    expect(view!.get('[role="alert"]').text()).toContain('Activity temporarily unavailable')
    expect(view!.text()).not.toContain('No recent forum activity')
    await view!
      .findAll('button')
      .find((button) => button.text() === 'Retry')!
      .trigger('click')
    await flushPromises()
    expect(guildApi.getGuildForumActivity).toHaveBeenLastCalledWith('Guild A', 2, 20)
    expect(view!.text()).toContain('Page 2 thread')
    expect(view!.find('[role="alert"]').exists()).toBe(false)
  })
})
