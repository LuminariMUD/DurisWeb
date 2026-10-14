import { stripAnsiCodes } from '@/utils/ansiParser'

/** Older outcomes captured only a name, without the bracketed character details. */
export function extractPlayerName(description: string): string | null {
  const plain = stripAnsiCodes(description).trim()
  const match = plain.match(/\]\s+(\w+)/)
  return match?.[1] ?? (/^\w+$/.test(plain) ? plain : null)
}
