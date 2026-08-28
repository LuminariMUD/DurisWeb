import { describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import { mount } from '@vue/test-utils'

const queryData = ref({
  entries: [
    {
      id: 1,
      version: '1.0.0',
      title: 'Release',
      content: '<p>hello <strong>Duris</strong></p><script>alert(1)</script><img src="x" onerror="alert(2)">',
      category: 'public',
      createdBy: 'Cwial',
      createdAt: '2026-08-28T00:00:00.000Z',
      updatedAt: '2026-08-28T00:00:00.000Z',
      isPublished: true,
      isRead: false,
    },
  ],
  total: 1,
})

vi.mock('@tanstack/vue-query', () => ({
  useQuery: () => ({
    data: queryData,
    isLoading: ref(false),
    isError: ref(false),
    error: ref(null),
    refetch: vi.fn(),
  }),
  useQueryClient: () => ({
    invalidateQueries: vi.fn(),
  }),
}))

vi.mock('@/composables/useAuth', () => ({
  useAuth: () => ({
    isAuthenticated: ref(false),
    accountName: ref(null),
  }),
}))

vi.mock('@/services/api', () => ({
  changelogApi: {
    getEntries: vi.fn(),
    markAsRead: vi.fn(),
  },
}))

import ChangelogList from '../ChangelogList.vue'

const passthrough = {
  template: '<div><slot /></div>',
}

describe('ChangelogList content safety', () => {
  it('does not render executable stored markup', () => {
    const wrapper = mount(ChangelogList, {
      global: {
        stubs: {
          Button: passthrough,
          Badge: passthrough,
          ChevronDown: passthrough,
          Circle: passthrough,
          CheckCircle2: passthrough,
        },
      },
    })

    const content = wrapper.find('.tiptap-content').html()
    expect(content).not.toMatch(/<script|onerror/i)
    expect(content).toContain('<strong>Duris</strong>')
  })
})
