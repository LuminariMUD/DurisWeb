import type { MudAlignment } from '../types/mud.js'

/** Decode the server's race/class cell; unknown or forbidden cells allow nothing. */
export function chargenAlignments(value: unknown): MudAlignment[] {
  switch (value) {
    case 'good':
      return ['good']
    case 'neutral':
      return ['neutral']
    case 'evil':
      return ['evil']
    case 'any':
      return ['good', 'neutral', 'evil']
    case 'good_neutral':
      return ['good', 'neutral']
    case 'neutral_evil':
      return ['neutral', 'evil']
    default:
      return []
  }
}
