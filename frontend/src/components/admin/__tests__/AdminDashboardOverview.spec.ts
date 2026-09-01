import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { QueryClient, VueQueryPlugin } from '@tanstack/vue-query'
import { ref } from 'vue'
import AdminDashboardOverview from '../AdminDashboardOverview.vue'
import type { OverviewStats } from '@/composables/useAdminAnalytics'

const FIXTURE_STATS: OverviewStats = {
  currentOnlinePlayers: 5,
  peakPlayerCount: 12,
  peakPlayerTimestamp: '2025-01-01T12:00:00Z',
  totalForumPosts: 150,
  totalPvPBattles: 45,
  totalPlayerAccounts: 200,
  activeGuilds: 8,
  serverUptime: 86_400_000,
}

const statsData = ref<OverviewStats | null>(FIXTURE_STATS)
const statsLoading = ref(false)
const statsError = ref<Error | null>(null)
const activityData = ref([])
const activityLoading = ref(false)
const WHO_FIXTURE = {
  char_name: 'Cwial',
  level: 56,
  account: 'account',
  race: '&+BHuman&n',
  class: '&+WWarrior&n',
  client: 'web',
  uptime_seconds: 60,
  last_ip: '203.0.113.10',
  last_connect: '2026-09-01T10:00:00.000Z',
}
const whoListData = ref([WHO_FIXTURE])
const whoListLoading = ref(false)
const refetchStats = vi.fn()
const refetchWhoList = vi.fn()

vi.mock('@/composables/useAdminAnalytics', () => ({
  useOverviewStats: () => ({
    data: statsData,
    isLoading: statsLoading,
    error: statsError,
    refetch: refetchStats,
  }),
  usePlayerActivity: () => ({
    data: activityData,
    isLoading: activityLoading,
  }),
  useWhoList: () => ({
    data: whoListData,
    isLoading: whoListLoading,
    refetch: refetchWhoList,
  }),
  formatUptime: (milliseconds: number) => `${Math.floor(milliseconds / 86_400_000)}d`,
  formatRelativeTime: () => '2 hours ago',
}))

const isConnected = ref(true)
const socketMethods = {
  onPlayerLogin: vi.fn(),
  offPlayerLogin: vi.fn(),
  onPlayerLogout: vi.fn(),
  offPlayerLogout: vi.fn(),
  onWholist: vi.fn(),
  offWholist: vi.fn(),
  onMudOnline: vi.fn(),
  offMudOnline: vi.fn(),
  onMudCrash: vi.fn(),
  offMudCrash: vi.fn(),
  subscribePlayerEvents: vi.fn(async () => undefined),
  unsubscribePlayerEvents: vi.fn(),
}

vi.mock('@/composables/useWebSocket', () => ({
  useWebSocket: () => ({ isConnected, ...socketMethods }),
}))

describe('AdminDashboardOverview', () => {
  let queryClient: QueryClient
  const wrappers: Array<ReturnType<typeof mount>> = []

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    statsData.value = FIXTURE_STATS
    statsLoading.value = false
    statsError.value = null
    activityData.value = []
    activityLoading.value = false
    whoListData.value = [WHO_FIXTURE]
    whoListLoading.value = false
    isConnected.value = true
    vi.clearAllMocks()
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

  function createWrapper() {
    const wrapper = mount(AdminDashboardOverview, {
      global: {
        plugins: [[VueQueryPlugin, { queryClient }]],
        stubs: {
          StatCard: {
            template: '<div class="stat-card">{{ title }}: {{ value }}</div>',
            props: ['title', 'value', 'icon', 'isLoading', 'live', 'subtitle'],
          },
          LineChart: true,
          RouterLink: { template: '<a><slot /></a>' },
        },
      },
    })
    wrappers.push(wrapper)
    return wrapper
  }

  it('renders without crashing', async () => {
    const wrapper = createWrapper()
    await flushPromises()
    expect(wrapper.exists()).toBe(true)
  })

  it('displays loading state correctly', () => {
    statsData.value = null
    statsLoading.value = true

    const wrapper = createWrapper()
    expect(wrapper.findAll('.stat-card')).toHaveLength(8)
  })

  it('displays error alert when there is an error', () => {
    statsData.value = null
    statsError.value = new Error('Failed to load')

    const wrapper = createWrapper()
    expect(wrapper.text()).toContain('Failed to load analytics data')
  })

  it('renders all stat cards', () => {
    const wrapper = createWrapper()
    expect(wrapper.findAll('.stat-card')).toHaveLength(8)
  })

  it('displays correct stat labels', () => {
    const text = createWrapper().text()

    expect(text).toContain('Online Players')
    expect(text).toContain('Peak Player Count')
    expect(text).toContain('Total Forum Posts')
    expect(text).toContain('Total PvP Battles')
    expect(text).toContain('Player Accounts')
    expect(text).toContain('Active Guilds')
    expect(text).toContain('Server Uptime')
    expect(text).toContain('Database')
  })

  it('does not subscribe for player events while disconnected', async () => {
    isConnected.value = false

    createWrapper()
    await flushPromises()
    expect(socketMethods.subscribePlayerEvents).not.toHaveBeenCalled()
  })

  it('renders the current online roster', () => {
    const text = createWrapper().text()

    expect(text).toContain('Currently Online')
    expect(text).toContain('Cwial')
    expect(text).toContain('Human')
  })
})
