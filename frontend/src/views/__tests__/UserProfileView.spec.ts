import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import { flushPromises, mount } from '@vue/test-utils'
import type { AccountCharactersResponse, UserPost, UserProfileWithStats, UserThread } from '@/types'
import { Tabs } from '@/components/ui/tabs'

const accountName = ref<string | null>(null)
const hasPermission = vi.fn(() => false)
const getProfile = vi.fn<(name: string) => Promise<UserProfileWithStats>>()
const getCharacters = vi.fn<(name: string) => Promise<AccountCharactersResponse>>()
const getThreads = vi.fn(async () => ({
  threads: publicThreads,
  pagination: { page: 1, limit: 20, total: 1, totalPages: 1 },
}))
const getPosts = vi.fn(async () => ({
  posts: publicPosts,
  pagination: { page: 1, limit: 20, total: 1, totalPages: 1 },
}))

vi.mock('vue-router', () => ({ useRouter: () => ({ push: vi.fn() }) }))
vi.mock('@/composables/useAuth', () => ({
  useAuth: () => ({ accountName, hasPermission }),
}))
vi.mock('@/services/api', () => ({
  profileApi: {
    getUserProfile: (name: string) => getProfile(name),
    getAccountCharacters: (name: string) => getCharacters(name),
    getUserThreads: () => getThreads(),
    getUserPosts: () => getPosts(),
  },
  pvpApi: {
    getUserFavorites: async () => ({
      data: [],
      pagination: { page: 1, limit: 20, total: 0, totalPages: 0 },
    }),
  },
}))

import UserProfileView from '../UserProfileView.vue'

const publicThreads: UserThread[] = [
  {
    id: 1,
    categoryId: 1,
    categoryName: 'Public forum',
    title: 'Public topic',
    content: 'Public thread body',
    characterName: 'Secretalt',
    createdAt: '2026-01-01T00:00:00Z',
    viewCount: 4,
    replyCount: 1,
    isPinned: false,
    isLocked: false,
  },
]
const publicPosts: UserPost[] = [
  {
    id: 1,
    threadId: 1,
    threadTitle: 'Public topic',
    categoryId: 1,
    categoryName: 'Public forum',
    content: 'Public post body',
    characterName: 'Secretalt',
    createdAt: '2026-01-01T00:00:00Z',
    editedAt: null,
  },
]

const characters: AccountCharactersResponse = {
  characters: [
    {
      pid: 1,
      name: 'Secretalt',
      race: 'Private race',
      class: 'Private class',
      level: 54,
      guild: 'Private guild',
      guildRank: 'Private rank',
      spec: 'Private spec',
      active: true,
      money: 1234,
      balance: 2000,
      playtime: 7200,
      epics: 7,
      stats: { frags: 12, deaths: 4, fragRank: 2, kdRatio: 3, forumPosts: 3, forumThreads: 2 },
    },
  ],
  totals: { characterCount: 1, totalFrags: 12, totalDeaths: 4, totalWealth: 3234 },
}

let wrapper: ReturnType<typeof mount> | undefined
function render() {
  wrapper = mount(UserProfileView, {
    props: { accountName: 'Player' },
    global: {
      stubs: {
        BreadcrumbsNav: true,
        ProfileHeroBanner: true,
        PushNotificationToggle: true,
        PaginationWithEllipsis: true,
        Dialog: true,
      },
    },
  })
  return wrapper
}

function expectPrivateDetailsHidden(view: ReturnType<typeof render>) {
  for (const label of [
    'Characters',
    'Frags',
    'Deaths',
    'K/D',
    'Wealth',
    'Secretalt',
    'Private race',
    'Private class',
    'Private guild',
    'Private rank',
    'Private spec',
  ]) {
    expect(view.text()).not.toContain(label)
  }
  expect(view.text()).toContain('Threads')
  expect(view.text()).toContain('Posts')
  expect(view.text()).toContain('Favorites')
}

beforeEach(() => {
  accountName.value = null
  hasPermission.mockReset().mockReturnValue(false)
  getCharacters.mockReset().mockResolvedValue(characters)
  getThreads.mockClear()
  getPosts.mockClear()
  // Stale owner totals must still stay out of a non-owner's rendered page.
  getProfile.mockReset().mockImplementation(async (name) => ({
    accountName: name,
    bio: 'Public bio',
    avatarUrl: null,
    bannerUrl: null,
    website: null,
    location: null,
    createdAt: '2026-01-01T00:00:00Z',
    lastSeenAt: '2026-01-01T00:00:00Z',
    stats: {
      totalPosts: 3,
      totalThreads: 2,
      totalReactionsReceived: 0,
      reputationScore: 0,
      firstPostAt: null,
      lastPostAt: null,
      characterCount: 1,
      totalFrags: 12,
      totalDeaths: 4,
      totalWealth: 3234,
    },
  }))
})
afterEach(() => wrapper?.unmount())

describe('owner-only profile character details', () => {
  it('does not request or render a roster for an anonymous visitor', async () => {
    const view = render()
    await flushPromises()
    expect(getCharacters).not.toHaveBeenCalled()
    expect(getThreads).toHaveBeenCalledOnce()
    expectPrivateDetailsHidden(view)
  })

  it('does not grant another account profile access through staff editing permission', async () => {
    accountName.value = 'Staff'
    hasPermission.mockReturnValue(true)
    const view = render()
    await flushPromises()
    expect(getCharacters).not.toHaveBeenCalled()
    expectPrivateDetailsHidden(view)
  })

  it('keeps forum activity visible without its author-character labels for non-owners', async () => {
    const view = render()
    await flushPromises()
    expect(view.text()).toContain('Public topic')
    expect(view.text()).not.toContain('as Secretalt')
    view.findComponent(Tabs).vm.$emit('update:modelValue', 'posts')
    await flushPromises()
    expect(getPosts).toHaveBeenCalledOnce()
    expect(view.text()).toContain('Public post body')
    expectPrivateDetailsHidden(view)
  })

  it('retains forum author-character labels on the owner profile', async () => {
    accountName.value = 'Player'
    const view = render()
    await flushPromises()
    view.findComponent(Tabs).vm.$emit('update:modelValue', 'threads')
    await flushPromises()
    expect(view.text()).toContain('as Secretalt')
    view.findComponent(Tabs).vm.$emit('update:modelValue', 'posts')
    await flushPromises()
    expect(view.text()).toContain('Public post body')
    expect(view.text()).toContain('as Secretalt')
  })

  it('keeps the full roster and details available to the owner regardless of casing', async () => {
    accountName.value = 'pLaYeR'
    const view = render()
    await flushPromises()
    expect(getCharacters).toHaveBeenCalledExactlyOnceWith('Player')
    for (const label of [
      'Characters',
      'Secretalt',
      'Private race',
      'Private class',
      'Private guild',
      'Private rank',
      'Private spec',
      'Lv.54',
      'Epics',
      'Frag Rank:',
      'Forum:',
      'Wealth',
      'Playtime:',
    ]) {
      expect(view.text()).toContain(label)
    }
  })

  it('clears the owner roster when navigating to someone else in the same component', async () => {
    accountName.value = 'Player'
    const view = render()
    await flushPromises()
    expect(view.text()).toContain('Secretalt')
    await view.setProps({ accountName: 'Other' })
    await flushPromises()
    expect(getCharacters).toHaveBeenCalledOnce()
    expectPrivateDetailsHidden(view)
  })

  it('ignores an in-flight owner roster response after logout', async () => {
    let finishRequest!: (value: AccountCharactersResponse) => void
    getCharacters.mockReturnValueOnce(
      new Promise((resolve) => {
        finishRequest = resolve
      }),
    )
    accountName.value = 'Player'
    const view = render()
    await flushPromises()
    expect(getCharacters).toHaveBeenCalledOnce()
    accountName.value = null
    await flushPromises()
    finishRequest(characters)
    await flushPromises()
    expectPrivateDetailsHidden(view)
  })

  it('loads the private roster after the visitor signs in as its owner', async () => {
    const view = render()
    await flushPromises()
    accountName.value = 'Player'
    await flushPromises()
    expect(getCharacters).toHaveBeenCalledExactlyOnceWith('Player')
    expect(view.text()).toContain('Secretalt')
  })
})
