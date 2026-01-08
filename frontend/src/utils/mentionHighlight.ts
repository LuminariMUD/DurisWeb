/**
 * Utility for highlighting @mentions in content
 */

/**
 * Highlight @mentions in plain text or HTML content
 * Converts @username to a styled span element
 */
export function highlightMentions(content: string): string {
  if (!content) return content

  // Regex to match @username (alphanumeric, underscore, hyphen)
  // Only match at word boundaries to avoid matching emails etc.
  const mentionRegex = /(?:^|[\s>])(@[a-zA-Z0-9_-]+)/g

  return content.replace(mentionRegex, (match, mention) => {
    // Preserve the leading character (space or >)
    const leadingChar = match[0] === '@' ? '' : match[0]
    return `${leadingChar}<span class="mention-highlight">${mention}</span>`
  })
}

/**
 * Sanitize and highlight mentions in HTML content
 * Use this for displaying comment/proc request content
 */
export function processContentWithMentions(contentHtml: string | null, contentText: string): string {
  if (contentHtml) {
    // Process HTML content - be careful with nested HTML
    return highlightMentions(contentHtml)
  }

  if (contentText) {
    // For plain text, escape HTML first then highlight
    const escaped = escapeHtml(contentText)
    return highlightMentions(escaped)
  }

  return ''
}

/**
 * Escape HTML special characters
 */
function escapeHtml(text: string): string {
  const div = document.createElement('div')
  div.textContent = text
  return div.innerHTML
}
