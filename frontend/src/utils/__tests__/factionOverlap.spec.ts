import { describe, expect, it } from 'vitest'
import type { FactionOverlapHour } from '@/services/api'
import { timeZoneLabel, toLocalOverlapHours, topOverlapWindows } from '../factionOverlap'

function hour(utcHour: number, bothSamples = 0, samples = 100): FactionOverlapHour {
  return {
    timestamp: Date.parse('2026-10-21T00:00:00Z') / 1000 + utcHour * 3600,
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

describe('toLocalOverlapHours', () => {
  it('relabels UTC buckets in the viewer timezone and starts the day at local midnight', () => {
    const local = toLocalOverlapHours(day, 'Australia/Sydney')
    expect(local).toHaveLength(24)
    expect(local[0]).toMatchObject({ label: '00:00', localMinutes: 0 })
    expect(local.find((entry) => entry.localMinutes === 660)?.label).toBe('11:00')
  })

  it('keeps hour-long buckets honest in half-hour timezones', () => {
    const local = toLocalOverlapHours(day, 'Australia/Adelaide')
    expect(local.find((entry) => entry.localMinutes === 630)?.label).toBe('10:30')
    expect(local[0]?.label).toBe('00:30')
  })

  it('uses the historical offset even when the viewer is currently in another season', () => {
    const july = { ...hour(0, 20), timestamp: Date.parse('2026-07-01T00:00:00Z') / 1000 }
    expect(topOverlapWindows(toLocalOverlapHours([july], 'Australia/Sydney'))[0]?.label).toBe(
      '10:00',
    )
  })

  it('splits the same UTC hour across historical offsets and weights local averages by samples', () => {
    const before = {
      ...hour(0, 10, 20),
      timestamp: Date.parse('2026-10-31T05:00:00Z') / 1000,
      goodsPeak: 8,
      goodsAverage: 4,
      goodsAverageWhileBoth: 6,
    }
    const after = { ...hour(0, 1, 10), timestamp: Date.parse('2026-11-02T05:00:00Z') / 1000 }
    const alsoOne = {
      ...hour(0, 5, 10),
      timestamp: Date.parse('2026-11-02T06:00:00Z') / 1000,
      goodsPeak: 2,
      goodsAverage: 1,
      goodsAverageWhileBoth: 3,
    }
    const local = toLocalOverlapHours([before, after, alsoOne], 'America/New_York')
    expect(local.find((entry) => entry.label === '00:00')).toMatchObject({
      samples: 10,
      bothSamples: 1,
    })
    expect(local.find((entry) => entry.label === '01:00')).toMatchObject({
      samples: 30,
      bothSamples: 15,
      bothShare: 50,
      goodsPeak: 8,
      goodsAverage: 3,
      goodsAverageWhileBoth: 5,
    })
  })

  it('does not invent samples for the skipped spring hour', () => {
    const before = { ...hour(0, 1), timestamp: Date.parse('2026-03-08T06:00:00Z') / 1000 }
    const after = { ...hour(0, 1), timestamp: Date.parse('2026-03-08T07:00:00Z') / 1000 }
    const local = toLocalOverlapHours([before, after], 'America/New_York')
    expect(local.find((entry) => entry.label === '01:00')?.samples).toBe(100)
    expect(local.find((entry) => entry.label === '02:00')?.samples).toBe(0)
    expect(local.find((entry) => entry.label === '03:00')?.samples).toBe(100)
  })

  it('reports the share of samples with both sides online and handles empty hours', () => {
    const local = toLocalOverlapHours([hour(0, 88, 672), hour(1, 0, 0)], 'UTC')
    expect(local[0]?.bothShare).toBeCloseTo((88 / 672) * 100)
    expect(local[1]?.bothShare).toBe(0)
  })
})

describe('topOverlapWindows', () => {
  it('ranks hours with overlap by share, breaking ties by more samples then earlier time', () => {
    const local = toLocalOverlapHours(
      [hour(0, 10), hour(1, 30), hour(2, 20, 200), hour(3, 20, 200), hour(4, 0), hour(5, 15)],
      'UTC',
    )
    expect(topOverlapWindows(local, 5).map((entry) => entry.localMinutes)).toEqual([
      60, 300, 120, 180, 0,
    ])
    expect(topOverlapWindows(local, 2)).toHaveLength(2)
  })

  it('returns nothing when the sides never overlapped', () => {
    expect(topOverlapWindows(toLocalOverlapHours(day, 'UTC'))).toEqual([])
  })

  it('ranks distinct shares before display rounding, even when raw counts favor the lower share', () => {
    const local = toLocalOverlapHours([hour(0, 7, 672), hour(1, 10, 1050)], 'UTC')
    const top = topOverlapWindows(local)
    expect(top.map((entry) => entry.label)).toEqual(['00:00', '01:00'])
    expect(top.map((entry) => entry.bothShare.toFixed(1))).toEqual(['1.0', '1.0'])
    expect(top[0]!.bothShare).toBeGreaterThan(top[1]!.bothShare)
  })
})

describe('timeZoneLabel', () => {
  it('names the viewer timezone', () => {
    expect(timeZoneLabel('UTC')).toMatch(/UTC/)
  })
})
