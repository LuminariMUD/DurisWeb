import { defineComponent, nextTick } from 'vue'
import { flushPromises, mount } from '@vue/test-utils'
import { createMemoryHistory, createRouter } from 'vue-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { hooksApi } from '@/services/hooksApi'
import { useHookControl } from '../useHookControl'
import { response } from '@/components/admin/hooks/__tests__/fixtures'

vi.mock('@/services/hooksApi', async () => {
  const actual = await vi.importActual<typeof import('@/services/hooksApi')>('@/services/hooksApi')
  return {
    ...actual,
    hooksApi: { getAll: vi.fn(), reconcile: vi.fn(), setWebsite: vi.fn() },
  }
})

const Harness = defineComponent({
  setup() {
    return useHookControl({ poll: false })
  },
  template: '<div>{{ selectedHook?.id ?? "none" }} / {{ summary.total }}</div>',
})

async function mountedAt(path: string) {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/admin/mud/hooks', component: Harness }],
  })
  await router.push(path)
  await router.isReady()
  const wrapper = mount(Harness, { global: { plugins: [router] } })
  await flushPromises()
  await nextTick()
  return { router, wrapper }
}

beforeEach(() => {
  vi.mocked(hooksApi.getAll).mockResolvedValue(structuredClone(response))
})

describe('hook control query ownership', () => {
  it('opens a registered hook from the deep-link query', async () => {
    const { wrapper } = await mountedAt('/admin/mud/hooks?hook=auction_new')
    expect(wrapper.text()).toContain('auction_new / 14')
  })

  it('removes an invalid hook id after the authoritative registry loads', async () => {
    const { router, wrapper } = await mountedAt('/admin/mud/hooks?hook=not_registered')
    expect(wrapper.text()).toContain('none / 14')
    expect(router.currentRoute.value.query.hook).toBeUndefined()
  })
})
