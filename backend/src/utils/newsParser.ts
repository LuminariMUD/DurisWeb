/**
 * parses the latest news entry from the news content
 *
 * news format:
 * M/D/YY or MM/DD/YY
 * - bullet point 1
 * - bullet point 2
 * * sub-bullet (treated as continuation)
 *
 * next date...
 */

import { stripAnsiCodes } from './stringUtils.js'

export interface NewsEntry {
  date: string
  items: string[]
}

/**
 * extracts the first (latest) news entry from the content
 */
export function parseLatestNewsEntry(content: string): NewsEntry | null {
  if (!content || !content.trim()) {
    return null
  }

  const lines = content.split('\n')

  // regex to match date pattern: M/D/YY, MM/DD/YY, M/DD/YY, MM/D/YY
  const datePattern = /^\d{1,2}\/\d{1,2}\/\d{2,4}\s*$/

  let date: string | null = null
  const items: string[] = []
  let foundFirstDate = false

  for (const line of lines) {
    // strip ansi codes before processing
    const cleanLine = stripAnsiCodes(line).trim()

    // skip empty lines before first date
    if (!foundFirstDate && !cleanLine) {
      continue
    }

    // check if this is a date line
    if (datePattern.test(cleanLine)) {
      if (foundFirstDate) {
        // we've hit the next date entry, stop here
        break
      }
      // this is the first date
      date = cleanLine
      foundFirstDate = true
      continue
    }

    // if we haven't found a date yet, skip
    if (!foundFirstDate) {
      continue
    }

    // collect bullet points (lines starting with - or *)
    if (cleanLine.startsWith('- ') || cleanLine.startsWith('* ')) {
      items.push(cleanLine)
    }
  }

  if (!date || items.length === 0) {
    return null
  }

  return { date, items }
}
