import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick, ref, type Ref } from 'vue'
import { mount } from '@vue/test-utils'
import type { FactionOverlap, FactionOverlapDays, FactionOverlapHour } from '@/services/api'

const overlap = {
  data: ref<FactionOverlap>(),
  isLoading: ref(false),
  isError: ref(false),
  refetch: vi.fn(),
}
const requestedDays = vi.hoisted(() => ({
  current: undefined as Ref<FactionOverlapDays> | undefined,
}))
const viewer = vi.hoisted(() => ({ timeZone: 'Australia/Sydney' }))
vi.mock('@/composables/usePublicStatistics', () => ({
  useFactionOverlap: (days: Ref<FactionOverlapDays>) => {
    requestedDays.current = days
    return overlap
  },
}))
// Pin the viewer to Sydney so labels do not depend on the test machine.
vi.mock('@/utils/factionOverlap', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/utils/factionOverlap')>()
  return {
    ...actual,
    timeZoneLabel: () => viewer.timeZone,
    toLocalOverlapHours: (hours: FactionOverlapHour[]) =>
      actual.toLocalOverlapHours(hours, viewer.timeZone),
  }
})
import FactionOverlapView from '../FactionOverlapView.vue'
import { chartTheme, heatColor } from '@/utils/chartTheme'

function hour(utcHour: number, overrides: Partial<FactionOverlapHour> = {}): FactionOverlapHour {
  return {
    timestamp: Date.parse('2026-10-21T00:00:00Z') / 1000 + utcHour * 3600,
    samples: 672,
    bothSamples: 0,
    goodsPeak: 0,
    goodsAverage: 0,
    evilsPeak: 1,
    evilsAverage: 0.3,
    goodsAverageWhileBoth: 0,
    evilsAverageWhileBoth: 0,
    ...overrides,
  }
}

function summary(hours: FactionOverlapHour[]): FactionOverlap {
  return {
    days: 14,
    firstDate: '2026-10-04',
    lastDate: '2026-10-17',
    samples: hours.reduce((total, entry) => total + entry.samples, 0),
    hours,
  }
}

let wrapper: ReturnType<typeof mount>
const mountView = () =>
  mount(FactionOverlapView, { global: { stubs: { RouterLink: { template: '<a><slot /></a>' } } } })

beforeEach(() => {
  vi.clearAllMocks()
  viewer.timeZone = 'Australia/Sydney'
  overlap.isLoading.value = false
  overlap.isError.value = false
  overlap.data.value = summary(
    Array.from({ length: 24 }, (_, utcHour) => {
      if (utcHour === 0) {
        return hour(0, {
          bothSamples: 88,
          goodsPeak: 3,
          evilsPeak: 6,
          goodsAverageWhileBoth: 1.5,
          evilsAverageWhileBoth: 2.27,
        })
      }
      if (utcHour === 21) {
        return hour(21, { bothSamples: 79, goodsPeak: 2, evilsPeak: 3, goodsAverageWhileBoth: 1.9 })
      }
      return hour(utcHour)
    }),
  )
})
afterEach(() => wrapper?.unmount())

describe('Faction Overlap', () => {
  it('leads with the best hour in the viewer timezone and its peak counts', () => {
    wrapper = mountView()
    const best = wrapper.get('[aria-label="Best hour"]').text()
    expect(best).toContain('11:00')
    expect(best).toContain('13.1% of samples')
    expect(best).toContain('3')
    expect(best).toContain('6')
    expect(wrapper.text()).toContain('timezone (Australia/Sydney)')
    expect(wrapper.text()).toContain('minimum 24-hour delay')
  })

  it('ranks only hours where both sides were online', () => {
    wrapper = mountView()
    const rows = wrapper.findAll('tbody tr')
    expect(rows).toHaveLength(2)
    expect(rows[0]?.text()).toContain('11:00')
    expect(rows[1]?.text()).toContain('08:00')
    expect(wrapper.get('#overlap-top').text()).toBe('Top 2 windows')
  })

  it('draws all 24 hours from local midnight and describes each for assistive technology', async () => {
    wrapper = mountView()
    const hours = wrapper.findAll('ul[aria-label="Peak players and overlap by hour"] button')
    expect(hours).toHaveLength(24)
    expect(hours[0]?.attributes('aria-label')).toContain('00:00 Australia/Sydney')
    await hours[0]?.trigger('focus')
    expect(wrapper.get('[aria-live="polite"]').text()).toContain('00:00 Australia/Sydney')
  })

  it('requests a different window when the range changes', async () => {
    wrapper = mountView()
    expect(requestedDays.current?.value).toBe(14)
    const sevenDays = wrapper.findAll('[aria-label="Days to include"] button')[0]
    await sevenDays?.trigger('click')
    await nextTick()
    expect(requestedDays.current?.value).toBe(7)
    expect(sevenDays?.attributes('aria-pressed')).toBe('true')
  })

  it('says so when the sides never overlapped', () => {
    overlap.data.value = summary(Array.from({ length: 24 }, (_, utcHour) => hour(utcHour)))
    wrapper = mountView()
    expect(wrapper.get('[aria-label="Best hour"]').text()).toContain('not online together')
    expect(wrapper.find('tbody').exists()).toBe(false)
  })

  it('colors measured zero overlap separately from missing samples, including an all-zero period', () => {
    overlap.data.value = summary([hour(0), hour(1, { samples: 0 })])
    wrapper = mountView()
    const buttons = wrapper.findAll('ul[aria-label="Peak players and overlap by hour"] button')
    const zero = buttons.find((button) => button.attributes('aria-label')?.startsWith('11:00 '))!
    const missing = buttons.find((button) => button.attributes('aria-label')?.startsWith('12:00 '))!
    const color = (value: string) => {
      const element = document.createElement('span')
      element.style.background = value
      return element.style.background
    }
    expect((zero.get('span[style*="background"]').element as HTMLElement).style.background).toBe(
      color(heatColor(0)),
    )
    expect((missing.get('span[style*="background"]').element as HTMLElement).style.background).toBe(
      color(chartTheme.noData),
    )
  })

  it('explains shifted hour starts across a half-hour clock change without inventing empty rows', () => {
    viewer.timeZone = 'Australia/Lord_Howe'
    overlap.data.value = summary([
      hour(0, { timestamp: Date.parse('2026-10-02T00:00:00Z') / 1000, bothSamples: 10 }),
      hour(0, { timestamp: Date.parse('2026-10-05T00:00:00Z') / 1000, bothSamples: 20 }),
    ])
    wrapper = mountView()
    expect(wrapper.text()).toContain("The timezone's minute offset changed")
    const hours = wrapper.findAll('ul[aria-label="Peak players and overlap by hour"] button')
    expect(hours).toHaveLength(25)
    expect(hours.some((button) => button.attributes('aria-label')?.startsWith('10:30 '))).toBe(true)
    expect(hours.some((button) => button.attributes('aria-label')?.startsWith('11:00 '))).toBe(true)
  })

  it('shows the empty state before any day is published', () => {
    overlap.data.value = summary([])
    wrapper = mountView()
    expect(wrapper.get('[role="status"]').text()).toContain('No published faction activity yet')
  })

  it('shows a retryable failure', async () => {
    overlap.isError.value = true
    wrapper = mountView()
    expect(wrapper.get('[role="alert"]').text()).toContain('Unable to load')
    await wrapper.get('[role="alert"] button').trigger('click')
    expect(overlap.refetch).toHaveBeenCalled()
  })
})
