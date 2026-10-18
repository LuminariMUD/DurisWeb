import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import { flushPromises, mount } from '@vue/test-utils'

const dates = {
  data: ref<{ dates: string[] }>(),
  isLoading: ref(false),
  isError: ref(false),
  refetch: vi.fn(),
}
const activity = {
  data: ref<{
    data: { timestamp: number; goods: number; evils: number; neutrals: number; undeads: number }[]
  }>(),
  isLoading: ref(false),
  isError: ref(false),
  refetch: vi.fn(),
}
const picker = vi.hoisted(() => ({ create: vi.fn(), destroy: vi.fn() }))
vi.mock('flatpickr', () => ({ default: picker.create }))
vi.mock('@/composables/usePublicStatistics', () => ({
  useAvailableDates: () => dates,
  useFactionActivity: () => activity,
}))
vi.mock('vue-chartjs', () => ({
  Line: { name: 'Line', props: ['data', 'options'], template: '<div data-testid="chart" />' },
}))
import FactionActivityView from '../FactionActivityView.vue'

let wrapper: ReturnType<typeof mount>
beforeEach(() => {
  vi.clearAllMocks()
  picker.create.mockReturnValue({ destroy: picker.destroy })
  dates.data.value = { dates: ['2026-10-16', '2026-10-15'] }
  dates.isLoading.value = false
  dates.isError.value = false
  activity.data.value = {
    data: [{ timestamp: 1792108800, goods: 3, evils: 2, neutrals: 1, undeads: 0 }],
  }
  activity.isLoading.value = false
  activity.isError.value = false
})
afterEach(() => wrapper?.unmount())

describe('Faction Activity', () => {
  it('opens on the newest eligible server date and labels chart times in UTC', async () => {
    wrapper = mount(FactionActivityView)
    await flushPromises()
    expect(picker.create).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        defaultDate: '2026-10-16',
        maxDate: '2026-10-16',
        enable: ['2026-10-16', '2026-10-15'],
      }),
    )
    expect(wrapper.get('[aria-label="Activity date (UTC)"]').attributes('readonly')).toBeDefined()
    const chart = wrapper.getComponent({ name: 'Line' })
    expect(chart.props('data').labels).toEqual(['00:00'])
    expect(chart.props('data').datasets.map((series: { data: number[] }) => series.data)).toEqual([
      [3],
      [2],
      [1],
      [0],
    ])
    expect(wrapper.text()).toContain('minimum 24-hour delay')
  })

  it('initializes the picker after dates load', async () => {
    dates.data.value = undefined
    dates.isLoading.value = true
    wrapper = mount(FactionActivityView)
    expect(wrapper.get('[role="status"]').text()).toContain('Loading activity')
    expect(picker.create).not.toHaveBeenCalled()
    dates.data.value = { dates: ['2026-10-15'] }
    dates.isLoading.value = false
    await flushPromises()
    expect(picker.create).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ defaultDate: '2026-10-15' }),
    )
  })

  it.each(['dates', 'activity'])(
    'shows a retryable failure when %s cannot load',
    async (source) => {
      const state = source === 'dates' ? dates : activity
      state.isError.value = true
      wrapper = mount(FactionActivityView)
      expect(wrapper.get('[role="alert"]').text()).toContain('Unable to load')
      expect(wrapper.find('[data-testid="chart"]').exists()).toBe(false)
      await wrapper.get('button').trigger('click')
      expect(state.refetch).toHaveBeenCalledOnce()
    },
  )

  it('shows an explicit unpublished state with no unusable date picker', () => {
    dates.data.value = { dates: [] }
    activity.data.value = undefined
    wrapper = mount(FactionActivityView)
    expect(wrapper.get('[role="status"]').text()).toContain('No published faction activity yet')
    expect(wrapper.find('input').exists()).toBe(false)
    expect(picker.create).not.toHaveBeenCalled()
  })
})
