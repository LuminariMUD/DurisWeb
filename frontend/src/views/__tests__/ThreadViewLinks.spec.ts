import { flushPromises, shallowMount } from '@vue/test-utils'
import { nextTick } from 'vue'
import { useRoute } from 'vue-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const getThread = vi.hoisted(() => vi.fn())
vi.mock('@/services/api', () => ({ forumApi: { getThread } }))
vi.mock('@unhead/vue', () => ({ useHead: vi.fn() }))
vi.mock('vue-router', async () => {
  const { reactive } = await import('vue')
  const route = reactive({ hash: '#post-55' })
  return { useRoute: () => route, useRouter: () => ({ back: vi.fn() }) }
})
vi.mock('@/composables/useAuth', async () => {
  const { ref } = await import('vue')
  return {
    useAuth: () => ({
      isAuthenticated: ref(false),
      accountName: ref(''),
      selectedCharacter: ref(null),
      permissions: ref({}),
    }),
  }
})
vi.mock('@/composables/useWebSocket', () => ({
  useWebSocket: () => ({ onForumPost: vi.fn(), offForumPost: vi.fn() }),
}))
vi.mock('@/composables/useDraftAutosave', async () => {
  const { ref } = await import('vue')
  return {
    useDraftAutosave: () => ({
      hasDraft: ref(false),
      formatDraftTime: vi.fn(),
      restoreDraft: vi.fn(),
      clearDraft: vi.fn(),
    }),
  }
})
vi.mock('@/composables/useMentionAutocomplete', async () => {
  const { ref } = await import('vue')
  return {
    useMentionAutocomplete: () => ({
      suggestions: ref([]),
      selectedIndex: ref(0),
      isOpen: ref(false),
      selectMention: vi.fn(),
      getDropdownPosition: () => ({}),
    }),
  }
})

import ThreadView from '../ThreadView.vue'

const global = { renderStubDefaultSlot: true, stubs: { RouterLink: true } }

function response(id = 55, page = 2) {
  return {
    thread: {
      id: 1,
      title: 'Linked thread',
      author: 'FixtureAlice',
      author_account_name: 'FixtureAlice',
      content: 'Synthetic thread',
      created_at: '2026-10-16T10:00:00Z',
      reply_count: 55,
    },
    category: { id: 1, name: 'Synthetic category' },
    posts: [
      {
        id,
        thread_id: 1,
        author: 'FixtureBob',
        content: `Synthetic post ${id}`,
        created_at: '2026-10-16T10:00:00Z',
        parent_post_id: null,
        reactions: [],
      },
    ],
    pagination: { page, limit: 50, total: 55, pages: 2 },
  }
}

describe('forum notification post destinations', () => {
  const scroll = vi.fn()
  beforeEach(() => {
    vi.clearAllMocks()
    useRoute().hash = '#post-55'
    getThread.mockResolvedValue(response())
    Element.prototype.scrollIntoView = scroll
  })
  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('loads the linked post page, renders its anchor and scrolls after rendering', async () => {
    const wrapper = shallowMount(ThreadView, {
      props: { threadId: '1' },
      attachTo: document.body,
      global,
    })
    await flushPromises()
    expect(getThread).toHaveBeenCalledWith(1, 1, 50, 55)
    expect(wrapper.find('#post-55').exists()).toBe(true)
    expect(scroll).toHaveBeenCalledWith({ block: 'center' })
    expect(wrapper.findComponent({ name: 'PaginationWithEllipsis' }).props()).toMatchObject({
      currentPage: 2,
      totalPages: 2,
    })
    wrapper.unmount()
  })

  it('handles a new hash on the same mounted thread and a new thread route', async () => {
    const wrapper = shallowMount(ThreadView, {
      props: { threadId: '1' },
      attachTo: document.body,
      global,
    })
    await flushPromises()
    getThread.mockResolvedValue(response(7, 1))
    useRoute().hash = '#post-7'
    await flushPromises()
    expect(getThread).toHaveBeenLastCalledWith(1, 1, 50, 7)
    expect(wrapper.find('#post-7').exists()).toBe(true)
    expect(scroll).toHaveBeenCalledTimes(2)
    await wrapper.setProps({ threadId: '2' })
    await flushPromises()
    expect(getThread).toHaveBeenLastCalledWith(2, 1, 50, 7)
    wrapper.unmount()
  })

  it('ignores invalid fragments and missing posts without scrolling to unrelated content', async () => {
    useRoute().hash = '#post-9007199254740992'
    await nextTick()
    const wrapper = shallowMount(ThreadView, {
      props: { threadId: '1' },
      attachTo: document.body,
      global,
    })
    await flushPromises()
    expect(getThread).toHaveBeenLastCalledWith(1, 1, 50, undefined)
    expect(scroll).not.toHaveBeenCalled()
    useRoute().hash = '#post-99'
    await flushPromises()
    expect(wrapper.find('#post-99').exists()).toBe(false)
    expect(scroll).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it('keeps the latest destination when an older request finishes last', async () => {
    let resolveFirst!: (value: ReturnType<typeof response>) => void
    getThread.mockReturnValueOnce(
      new Promise<ReturnType<typeof response>>((resolve) => {
        resolveFirst = resolve
      }),
    )
    const wrapper = shallowMount(ThreadView, {
      props: { threadId: '1' },
      attachTo: document.body,
      global,
    })
    getThread.mockResolvedValue(response(7, 1))
    useRoute().hash = '#post-7'
    await flushPromises()
    resolveFirst(response(55, 2))
    await flushPromises()
    expect(wrapper.find('#post-7').exists()).toBe(true)
    expect(wrapper.find('#post-55').exists()).toBe(false)
    expect(scroll).toHaveBeenCalledTimes(1)
    wrapper.unmount()
  })
})
