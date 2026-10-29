import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import { flushPromises, mount } from '@vue/test-utils'
import { createMemoryHistory, createRouter } from 'vue-router'
import history from '@/content/clientChangelog.json'

vi.mock('@unhead/vue', () => ({ useHead: vi.fn() }))
vi.mock('@/composables/useAuth', () => ({
  useAuth: () => ({ isAuthenticated: ref(false), accountName: ref(null) }),
}))
vi.mock('@tanstack/vue-query', () => ({ useQuery: () => ({ data: ref({ count: 0 }) }) }))
vi.mock('@/composables/useNews', () => ({
  useNews: () => ({
    data: ref({ news: 'MUD news from the game' }),
    isLoading: ref(false),
    isError: ref(false),
    error: ref(null),
    refetch: vi.fn(),
  }),
}))

import NewsView from '@/views/NewsView.vue'

let wrapper: ReturnType<typeof mount>
let router: ReturnType<typeof createRouter>

beforeEach(() => {
  router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/news', component: NewsView },
      { path: '/mudlet-gui', component: { template: '<p>Installation guide</p>' } },
    ],
  })
})

afterEach(() => wrapper?.unmount())

async function openNews(path: string) {
  await router.push(path)
  await router.isReady()
  wrapper = mount(NewsView, {
    global: {
      plugins: [router],
      stubs: { ChangelogList: { template: '<p>Website entries</p>' } },
    },
  })
  await flushPromises()
}

describe('News categories', () => {
  it('opens the client deep link anonymously with all history and accurate source links', async () => {
    await openNews('/news?tab=client')
    expect(wrapper.get('[role="tab"][data-state="active"]').text()).toBe('Mudlet Client')
    expect(wrapper.get('h2').text()).toBe('Mudlet Client Changelog')
    const versions = wrapper.findAll('details')
    expect(versions).toHaveLength(history.entries.length)
    expect(versions[0]?.attributes('open')).toBeDefined()
    expect(versions[0]?.text()).toContain(`Version ${history.entries[0]?.version}`)
    expect(versions.at(-1)?.text()).toContain('Original Arjinius Client')
    expect(versions.at(-1)?.text()).toContain('Date not recorded')
    history.entries.forEach((entry, index) => {
      expect(versions[index]?.get('a:last-child').attributes('href')).toBe(
        entry.releaseUrl || history.sourceUrl,
      )
    })
    expect(wrapper.get('a[href="/mudlet-gui"]').text()).toBe('Installation guide')
    expect(wrapper.find('a[href="/login"]').exists()).toBe(false)
    expect(wrapper.find('.tiptap-content script').exists()).toBe(false)
  })

  it('changes tabs, preserves other query values, and follows route navigation', async () => {
    await openNews('/news?tab=client&keep=yes')
    const websiteTab = wrapper
      .findAll('[role="tab"]')
      .find((tab) => tab.text() === 'Website Changelog')
    await websiteTab?.trigger('mousedown', { button: 0, ctrlKey: false })
    await flushPromises()
    expect(router.currentRoute.value.query).toEqual({ tab: 'changelog', keep: 'yes' })
    expect(wrapper.text()).toContain('Website entries')
    expect(wrapper.find('details').exists()).toBe(false)

    await router.push('/news?tab=mud')
    await flushPromises()
    expect(wrapper.text()).toContain('MUD news from the game')

    await router.push('/news?tab=client')
    await flushPromises()
    expect(wrapper.findAll('details')).toHaveLength(history.entries.length)
  })

  it.each(['/news', '/news?tab=unknown', '/news?tab=client&tab=mud'])(
    'falls back to MUD news for an absent or invalid category: %s',
    async (path) => {
      await openNews(path)
      expect(wrapper.get('[role="tab"][data-state="active"]').text()).toBe('MUD News')
      expect(wrapper.text()).toContain('MUD news from the game')
    },
  )
})
