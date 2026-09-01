import { describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import { mount } from '@vue/test-utils'

const zoneInfo = ref({
  id: 1,
  zoneId: 'zone-a',
  description: 'hello',
  descriptionHtml:
    '<p>hello <strong>Duris</strong></p><script>alert(1)</script><img src="x" onerror="alert(2)">',
  ownerAccount: 'Cwial',
  createdAt: '2026-08-28T00:00:00.000Z',
  updatedAt: '2026-08-28T00:00:00.000Z',
})

vi.mock('@tanstack/vue-query', () => ({
  useQuery: () => ({
    data: zoneInfo,
    isLoading: ref(false),
    error: ref(null),
  }),
  useMutation: () => ({
    mutate: vi.fn(),
    isPending: ref(false),
  }),
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}))

vi.mock('@/services/api', () => ({
  builderApi: {
    getZoneInfo: vi.fn(),
    updateZoneInfo: vi.fn(),
  },
}))

vi.mock('@/composables/useToast', () => ({
  useToast: () => ({ success: vi.fn(), error: vi.fn() }),
}))

import ZoneDescription from '../ZoneDescription.vue'

const passthrough = {
  template: '<div><slot /></div>',
}

describe('ZoneDescription content safety', () => {
  it('does not render executable stored zone HTML', () => {
    const wrapper = mount(ZoneDescription, {
      props: { zoneId: 'zone-a', zoneName: 'Zone A', canEdit: false },
      global: {
        stubs: {
          Button: passthrough,
          Skeleton: passthrough,
          Alert: passthrough,
          AlertDescription: passthrough,
          TipTapEditor: passthrough,
          Edit: passthrough,
          Save: passthrough,
          X: passthrough,
          AlertCircle: passthrough,
        },
      },
    })

    const content = wrapper.find('.prose').html()
    expect(content).not.toMatch(/<script|onerror/i)
    expect(content).toContain('<strong>Duris</strong>')
  })
})
