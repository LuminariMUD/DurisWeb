import { describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'

const push = vi.fn()
vi.mock('vue-router', () => ({
  useRoute: () => ({ params: { guildName: 'fixture-guild' } }),
  useRouter: () => ({ push }),
}))
vi.mock('@/components/layout/BreadcrumbsNav.vue', () => ({ default: { template: '<nav />' } }))
vi.mock('@/features/profile/api', () => ({
  guildApi: {
    getGuildProfile: async () => ({
      name: 'Fixture Guild',
      racewar: 1,
      frags: 0,
      stats: { totalMembers: 0, forumPosts: 1, forumThreads: 1, pvpKills: 0, pvpDeaths: 0 },
      members: [],
    }),
    getGuildForumActivity: async () => ({
      posts: [
        {
          id: 1,
          threadId: 42,
          threadTitle: 'Fixture thread',
          characterName: 'Hero',
          categoryName: 'General',
          content: 'Hello',
          createdAt: '2026-01-01T00:00:00Z',
        },
      ],
      pagination: { page: 1, limit: 20, total: 1, totalPages: 1 },
    }),
  },
  profileApi: { getCharacterAccount: async () => ({ accountName: 'Fixture' }) },
}))

import GuildProfileView from '../GuildProfileView.vue'

describe('guild forum activity', () => {
  it('opens the thread through the registered forum-thread route', async () => {
    const view = mount(GuildProfileView)
    await flushPromises()
    const tab = view.findAll('button').find((button) => button.text() === 'Forum Activity')!
    await tab.trigger('mousedown', { button: 0 })
    await flushPromises()
    const title = view.findAll('*').filter((node) => node.text() === 'Fixture thread')
    await title.at(-1)!.trigger('click')
    expect(push).toHaveBeenCalledWith({ name: 'forum-thread', params: { threadId: '42' } })
  })
})
