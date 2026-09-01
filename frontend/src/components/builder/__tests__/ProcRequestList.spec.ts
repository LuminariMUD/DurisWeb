import { describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import { mount } from '@vue/test-utils'

const requests = ref([
  {
    id: 1,
    zoneId: 'zone-a',
    entityType: 'room',
    vnum: 100,
    title: 'Add room behavior',
    description: 'hello',
    descriptionHtml:
      '<p>hello <strong>Duris</strong></p><script>alert(1)</script><img src="x" onerror="alert(2)">',
    status: 'requested',
    assignedTo: null,
    requestedBy: 'Cwial',
    requestedAt: '2026-08-28T00:00:00.000Z',
    updatedAt: '2026-08-28T00:00:00.000Z',
  },
])

vi.mock('@tanstack/vue-query', () => ({
  useQuery: () => ({
    data: requests,
    isLoading: ref(false),
    error: ref(null),
  }),
  useMutation: () => ({ mutate: vi.fn() }),
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}))

vi.mock('@/services/api', () => ({
  builderApi: {
    getProcRequests: vi.fn(),
    deleteProcRequest: vi.fn(),
    updateProcRequestStatus: vi.fn(),
  },
}))

vi.mock('@/composables/useAuth', () => ({
  useAuth: () => ({}),
}))

vi.mock('@/composables/useToast', () => ({
  useToast: () => ({ success: vi.fn(), error: vi.fn() }),
}))

import ProcRequestList from '../ProcRequestList.vue'

const passthrough = {
  template: '<div><slot /></div>',
}

describe('ProcRequestList content safety', () => {
  it('does not render executable stored description HTML', () => {
    const wrapper = mount(ProcRequestList, {
      props: { zoneId: 'zone-a', canEdit: false },
      global: {
        stubs: {
          Button: passthrough,
          Badge: passthrough,
          Skeleton: passthrough,
          Alert: passthrough,
          AlertDescription: passthrough,
          Input: passthrough,
          Select: passthrough,
          SelectContent: passthrough,
          SelectItem: passthrough,
          SelectTrigger: passthrough,
          SelectValue: passthrough,
          DropdownMenu: passthrough,
          DropdownMenuContent: passthrough,
          DropdownMenuItem: passthrough,
          DropdownMenuSeparator: passthrough,
          DropdownMenuTrigger: passthrough,
          ProcRequestDialog: passthrough,
        },
      },
    })

    const description = wrapper.find('.proc-description').html()
    expect(description).not.toMatch(/<script|onerror/i)
    expect(description).toContain('<strong>Duris</strong>')
  })
})
