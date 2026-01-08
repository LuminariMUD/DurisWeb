import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { QueryClient, VueQueryPlugin } from '@tanstack/vue-query'
import AdminDashboardOverview from '../AdminDashboardOverview.vue'
import type { OverviewStats } from '@/composables/useAdminAnalytics'

// Mock the composables
const mockStats: OverviewStats = {
  currentOnlinePlayers: 5,
  peakPlayerCount: 12,
  peakPlayerTimestamp: '2025-01-01T12:00:00Z',
  totalForumPosts: 150,
  totalPvPBattles: 45,
  totalPlayerAccounts: 200,
  activeGuilds: 8,
  serverUptime: 86400000 // 1 day in ms
}

vi.mock('@/composables/useAdminAnalytics', () => ({
  useOverviewStats: () => ({
    data: { value: mockStats },
    isLoading: { value: false },
    error: { value: null }
  }),
  formatUptime: (ms: number) => {
    const days = Math.floor(ms / 86400000)
    return `${days}d`
  },
  formatRelativeTime: () => {
    return '2 hours ago'
  }
}))

import { ref } from 'vue'

const mockOnStatsUpdate = vi.fn()
const mockIsConnected = ref(true)

vi.mock('@/composables/useWebSocket', () => ({
  useWebSocket: () => ({
    isConnected: mockIsConnected,
    onStatsUpdate: mockOnStatsUpdate
  })
}))

describe('AdminDashboardOverview', () => {
  let queryClient: QueryClient

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false
        }
      }
    })
    // Reset WebSocket to connected state before each test
    mockIsConnected.value = true
  })

  const createWrapper = (stubs?: any) => {
    return mount(AdminDashboardOverview, {
      global: {
        plugins: [[VueQueryPlugin, { queryClient }]],
        stubs: stubs || {
          StatCard: {
            template: '<div class="stat-card">{{ title }}: {{ value }}</div>',
            props: ['title', 'value', 'icon', 'isLoading', 'live', 'subtitle']
          }
        }
      }
    })
  }

  it('renders without crashing', () => {
    const wrapper = createWrapper()
    expect(wrapper.exists()).toBe(true)
  })

  it('displays loading state correctly', async () => {
    vi.resetModules()
    vi.doMock('@/composables/useAdminAnalytics', () => ({
      useOverviewStats: () => ({
        data: { value: null },
        isLoading: { value: true },
        error: { value: null }
      }),
      formatUptime: () => '0s',
      formatRelativeTime: () => 'Never'
    }))

    const wrapper = createWrapper()
    await flushPromises()

    const statCards = wrapper.findAll('.stat-card')
    expect(statCards.length).toBeGreaterThan(0)
  })

  it('displays error alert when there is an error', async () => {
    vi.resetModules()
    vi.doMock('@/composables/useAdminAnalytics', () => ({
      useOverviewStats: () => ({
        data: { value: null },
        isLoading: { value: false },
        error: { value: new Error('Failed to load') }
      }),
      formatUptime: () => '0s',
      formatRelativeTime: () => 'Never'
    }))

    const wrapper = createWrapper()
    await flushPromises()

    expect(wrapper.text()).toContain('Failed to load analytics data')
  })

  it('renders all stat cards', () => {
    const wrapper = createWrapper()
    const statCards = wrapper.findAll('.stat-card')

    // Should have 8 stat cards
    expect(statCards.length).toBe(8)
  })

  it('displays correct stat values', () => {
    const wrapper = createWrapper()
    const text = wrapper.text()

    // Check if stats are displayed
    expect(text).toContain('Online Players')
    expect(text).toContain('Peak Player Count')
    expect(text).toContain('Total Forum Posts')
    expect(text).toContain('Total PvP Battles')
    expect(text).toContain('Player Accounts')
    expect(text).toContain('Active Guilds')
    expect(text).toContain('Server Uptime')
    expect(text).toContain('Database')
  })

  it('shows WebSocket connection alert when disconnected', async () => {
    // Set mock to disconnected BEFORE creating wrapper
    mockIsConnected.value = false

    const wrapper = createWrapper()
    await flushPromises()

    // Should show the WebSocket connection warning
    const text = wrapper.text()
    expect(text).toContain('Connecting to WebSocket for real-time updates')
  })

  it('renders summary cards', () => {
    const wrapper = createWrapper()
    const text = wrapper.text()

    expect(text).toContain('Forum Activity')
    expect(text).toContain('PvP Activity')
    expect(text).toContain('Player Base')
  })
})
