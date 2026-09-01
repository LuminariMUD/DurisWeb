import { flushPromises, mount } from '@vue/test-utils'
import { createMemoryHistory, createRouter } from 'vue-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import HookHealthCard from '../HookHealthCard.vue'
import { hooksApi } from '@/services/hooksApi'
import { response } from './fixtures'

afterEach(() => vi.restoreAllMocks())

describe('hook health dashboard summary', () => {
  it('renders authoritative counts and links to Hook Control', async () => {
    vi.spyOn(hooksApi, 'getAll').mockResolvedValue(structuredClone(response))
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        { path: '/', component: { template: '<div />' } },
        { path: '/admin/mud/hooks', component: { template: '<div />' } },
      ],
    })
    await router.push('/')
    await router.isReady()

    const wrapper = mount(HookHealthCard, { global: { plugins: [router] } })
    await flushPromises()

    expect(wrapper.text()).toContain('Hook health')
    expect(wrapper.text()).toContain('14')
    expect(wrapper.find('a[href="/admin/mud/hooks"]').exists()).toBe(true)
  })
})
