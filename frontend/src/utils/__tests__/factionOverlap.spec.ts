import { describe, expect, it } from 'vitest'
import type { FactionOverlapHour } from '@/services/api'
import { timeZoneLabel, toLocalOverlapHours, topOverlapWindows } from '../factionOverlap'

function hour(utcHour: number, bothSamples = 0, samples = 100): FactionOverlapHour {
  return {
    utcHour,
    samples,
    bothSamples,
    goodsPeak: 1,
    goodsAverage: 0.1,
    evilsPeak: 2,
    evilsAverage: 0.4,
    goodsAverageWhileBoth: bothSamples ? 1 : 0,
    evilsAverageWhileBoth: bothSamples ? 1.5 : 0,
  }
}

const day = Array.from({ length: 24 }, (_, utcHour) => hour(utcHour))
const now = new Date('2026-10-21T03:00:00Z')

describe('toLocalOverlapHours', () => {
  it('relabels UTC buckets in the viewer timezone and starts the day at local midnight', () => {
    const local = toLocalOverlapHours(day, now, 'Australia/Sydney')
    expect(local).toHaveLength(24)
    expect(local[0]).toMatchObject({ utcHour: 13, label: '00:00', localMinutes: 0 })
    expect(local.find((entry) => entry.utcHour === 0)?.label).toBe('11:00')
  })

  it('keeps hour-long buckets honest in half-hour timezones', () => {
    const local = toLocalOverlapHours(day, now, 'Australia/Adelaide')
    expect(local.find((entry) => entry.utcHour === 0)?.label).toBe('10:30')
    expect(local[0]?.label).toBe('00:30')
  })

  it('uses the offset in effect now, so winter shows standard time', () => {
    const july = new Date('2026-07-01T03:00:00Z')
    expect(
      toLocalOverlapHours(day, july, 'Australia/Sydney').find((entry) => entry.utcHour === 0)
        ?.label,
    ).toBe('10:00')
  })

  it('reports the share of samples with both sides online and handles empty hours', () => {
    const local = toLocalOverlapHours([hour(0, 88, 672), hour(1, 0, 0)], now, 'UTC')
    expect(local.map((entry) => entry.bothShare)).toEqual([13.1, 0])
  })
})

describe('topOverlapWindows', () => {
  it('ranks hours with overlap by share, breaking ties by more samples then earlier time', () => {
    const local = toLocalOverlapHours(
      [hour(0, 10), hour(1, 30), hour(2, 20, 200), hour(3, 20, 200), hour(4, 0), hour(5, 15)],
      now,
      'UTC',
    )
    expect(topOverlapWindows(local, 5).map((entry) => entry.utcHour)).toEqual([1, 5, 2, 3, 0])
    expect(topOverlapWindows(local, 2)).toHaveLength(2)
  })

  it('returns nothing when the sides never overlapped', () => {
    expect(topOverlapWindows(toLocalOverlapHours(day, now, 'UTC'))).toEqual([])
  })
})

describe('timeZoneLabel', () => {
  it('names the viewer timezone', () => {
    expect(timeZoneLabel(now, 'UTC')).toMatch(/UTC/)
  })
})
