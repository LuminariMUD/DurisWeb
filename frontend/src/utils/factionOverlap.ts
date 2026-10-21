import type { FactionOverlapHour } from '@/services/api'

/** One hour-long bucket, labelled in the viewer's timezone. */
export interface LocalOverlapHour extends FactionOverlapHour {
  /** Local start time, `HH:mm` (half-hour zones start at `:30`). */
  label: string
  /** Minutes after local midnight the bucket starts at, for ordering. */
  localMinutes: number
  /** Percentage of samples with both sides online, one decimal place. */
  bothShare: number
}

function timeParts(date: Date, timeZone?: string) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
    timeZone,
  }).formatToParts(date)
  const hour = Number(parts.find((part) => part.type === 'hour')?.value ?? 0)
  const minute = Number(parts.find((part) => part.type === 'minute')?.value ?? 0)
  return { hour, minute }
}

/**
 * Relabel UTC hour buckets in the viewer's timezone and order them from local
 * midnight. Uses the offset in effect at `now`, so a window spanning a
 * daylight-saving change is shown at the current offset.
 */
export function toLocalOverlapHours(
  hours: FactionOverlapHour[],
  now: Date = new Date(),
  timeZone?: string,
): LocalOverlapHour[] {
  const day = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
  return hours
    .map((hour) => {
      const { hour: localHour, minute } = timeParts(
        new Date(day + hour.utcHour * 3_600_000),
        timeZone,
      )
      const bothShare =
        hour.samples > 0 ? Math.round((hour.bothSamples / hour.samples) * 1000) / 10 : 0
      return {
        ...hour,
        label: `${String(localHour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`,
        localMinutes: localHour * 60 + minute,
        bothShare,
      }
    })
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

/** Short timezone name for the viewer, such as `AEDT` or `GMT+11`. */
export function timeZoneLabel(now: Date = new Date(), timeZone?: string): string {
  const part = new Intl.DateTimeFormat(undefined, { timeZoneName: 'short', timeZone })
    .formatToParts(now)
    .find((piece) => piece.type === 'timeZoneName')
  return part?.value ?? 'local time'
}
