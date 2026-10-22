import type { FactionOverlapHour } from '@/services/api'

/** One hour-long bucket, labelled in the viewer's timezone. */
export interface LocalOverlapHour extends Omit<FactionOverlapHour, 'timestamp'> {
  /** Local start time, `HH:mm` (half-hour zones start at `:30`). */
  label: string
  /** Minutes after local midnight the bucket starts at, for ordering. */
  localMinutes: number
  /** Unrounded percentage; round only when displaying text. */
  bothShare: number
}

/**
 * Convert dated buckets before combining them, preserving historical DST offsets.
 */
export function toLocalOverlapHours(
  hours: FactionOverlapHour[],
  timeZone?: string,
): LocalOverlapHour[] {
  const formatter = new Intl.DateTimeFormat('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
    timeZone,
  })
  const local = new Map<number, LocalOverlapHour>()
  let latestTimestamp = -Infinity
  let placeholderMinute = 0
  function bucket(localMinutes: number): LocalOverlapHour {
    let result = local.get(localMinutes)
    if (!result) {
      result = {
        label: `${String(Math.floor(localMinutes / 60)).padStart(2, '0')}:${String(localMinutes % 60).padStart(2, '0')}`,
        localMinutes,
        samples: 0,
        bothSamples: 0,
        bothShare: 0,
        goodsPeak: 0,
        goodsAverage: 0,
        evilsPeak: 0,
        evilsAverage: 0,
        goodsAverageWhileBoth: 0,
        evilsAverageWhileBoth: 0,
      }
      local.set(localMinutes, result)
    }
    return result
  }
  for (const hour of hours) {
    const parts = formatter.formatToParts(new Date(hour.timestamp * 1000))
    const localHour = Number(parts.find((part) => part.type === 'hour')?.value ?? 0)
    const minute = Number(parts.find((part) => part.type === 'minute')?.value ?? 0)
    if (hour.timestamp > latestTimestamp) {
      latestTimestamp = hour.timestamp
      placeholderMinute = minute
    }
    const result = bucket(localHour * 60 + minute)
    result.samples += hour.samples
    result.bothSamples += hour.bothSamples
    result.goodsPeak = Math.max(result.goodsPeak, hour.goodsPeak)
    result.evilsPeak = Math.max(result.evilsPeak, hour.evilsPeak)
    result.goodsAverage += hour.goodsAverage * hour.samples
    result.evilsAverage += hour.evilsAverage * hour.samples
    result.goodsAverageWhileBoth += hour.goodsAverageWhileBoth * hour.bothSamples
    result.evilsAverageWhileBoth += hour.evilsAverageWhileBoth * hour.bothSamples
  }
  // Fill one day's missing starts at the newest offset. Historical minute-offset
  // changes add only their observed starts, never another day of empty slots.
  if (hours.length) {
    for (let h = 0; h < 24; h++) bucket(h * 60 + placeholderMinute)
  }
  return [...local.values()]
    .map((hour) => ({
      ...hour,
      bothShare: hour.samples ? (hour.bothSamples / hour.samples) * 100 : 0,
      goodsAverage: hour.samples ? hour.goodsAverage / hour.samples : 0,
      evilsAverage: hour.samples ? hour.evilsAverage / hour.samples : 0,
      goodsAverageWhileBoth: hour.bothSamples ? hour.goodsAverageWhileBoth / hour.bothSamples : 0,
      evilsAverageWhileBoth: hour.bothSamples ? hour.evilsAverageWhileBoth / hour.bothSamples : 0,
    }))
    .sort((a, b) => a.localMinutes - b.localMinutes)
}

/** The hours when both sides were most often online together, best first. */
export function topOverlapWindows(hours: LocalOverlapHour[], count = 5): LocalOverlapHour[] {
  return hours
    .filter((hour) => hour.bothSamples > 0)
    .sort(
      (a, b) =>
        b.bothShare - a.bothShare ||
        b.bothSamples - a.bothSamples ||
        a.localMinutes - b.localMinutes,
    )
    .slice(0, count)
}

/** Name the zone rather than one offset that may not apply to all samples. */
export function timeZoneLabel(timeZone?: string): string {
  return new Intl.DateTimeFormat(undefined, { timeZone }).resolvedOptions().timeZone
}
