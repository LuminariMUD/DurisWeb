export interface ParsedContent {
  type: 'quote' | 'text'
  author?: string
  content: string
}

/**
 * Parse BBCode-style quotes from post content
 * Format: [quote=Author]quoted text[/quote]
 */
export function parseQuotes(content: string): ParsedContent[] {
  const parts: ParsedContent[] = []
  const quoteRegex = /\[quote=([^\]]+)\]([\s\S]*?)\[\/quote\]/gi

  let lastIndex = 0
  let match: RegExpExecArray | null

  while ((match = quoteRegex.exec(content)) !== null) {
    // Add text before quote
    if (match.index > lastIndex) {
      const textContent = content.substring(lastIndex, match.index).trim()
      if (textContent) {
        parts.push({
          type: 'text',
          content: textContent
        })
      }
    }

    // Add quote
    if (match[1] && match[2]) {
      parts.push({
        type: 'quote',
        author: match[1],
        content: match[2].trim()
      })
    }

    lastIndex = quoteRegex.lastIndex
  }

  // Add remaining text
  if (lastIndex < content.length) {
    const textContent = content.substring(lastIndex).trim()
    if (textContent) {
      parts.push({
        type: 'text',
        content: textContent
      })
    }
  }

  // If no quotes were found, return the whole content as text
  if (parts.length === 0) {
    parts.push({
      type: 'text',
      content: content
    })
  }

  return parts
}

/**
 * Check if content contains any quotes
 */
export function hasQuotes(content: string): boolean {
  return /\[quote=.*?\]/i.test(content)
}
