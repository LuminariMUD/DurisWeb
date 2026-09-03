import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { createRouter, createMemoryHistory } from 'vue-router'
import { QueryClient, VueQueryPlugin } from '@tanstack/vue-query'
import DashboardView from '../DashboardView.vue'

// Mock the composables
vi.mock('@/composables/useAuth', () => ({
  useAuth: () => ({
    isOverlord: { value: true },
    permissions: { value: { immortalLevel: 62 } },
  }),
}))

describe('DashboardView', () => {
  let router: any
  let queryClient: QueryClient
  const wrappers: Array<ReturnType<typeof mount>> = []

  beforeEach(async () => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
        },
      },
    })

    router = createRouter({
      history: createMemoryHistory(),
      routes: [
        {
          path: '/dashboard',
          name: 'dashboard',
          component: DashboardView,
        },
        {
          path: '/forum',
          name: 'forum',
          component: { template: '<div>Forum</div>' },
        },
      ],
    })

    await router.push('/dashboard')
    await router.isReady()

    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        json: async () => ({ bootTime: null }),
      })),
    )
  })

  afterEach(() => {
    while (wrappers.length > 0) wrappers.pop()?.unmount()
    vi.unstubAllGlobals()
  })

  it('renders the dashboard page', () => {
    const wrapper = mount(DashboardView, {
      global: {
        plugins: [router, [VueQueryPlugin, { queryClient }]],
      },
    })
    wrappers.push(wrapper)

    expect(wrapper.text()).toContain('Server Dashboard')
  })

  it('displays the correct title', () => {
    const wrapper = mount(DashboardView, {
      global: {
        plugins: [router, [VueQueryPlugin, { queryClient }]],
      },
    })
    wrappers.push(wrapper)

    expect(wrapper.find('h1').text()).toBe('Server Dashboard')
  })

  it('shows subtitle with overlord requirement', () => {
    const wrapper = mount(DashboardView, {
      global: {
        plugins: [router, [VueQueryPlugin, { queryClient }]],
      },
    })
    wrappers.push(wrapper)

    expect(wrapper.text()).toContain('Overlord only')
  })

  it('renders AdminDashboardOverview component', () => {
    const wrapper = mount(DashboardView, {
      global: {
        plugins: [router],
        stubs: {
          AdminDashboardOverview: {
            template: '<div data-testid="dashboard-overview">Dashboard Overview</div>',
          },
        },
      },
    })
    wrappers.push(wrapper)

    expect(wrapper.find('[data-testid="dashboard-overview"]').exists()).toBe(true)
  })
})
