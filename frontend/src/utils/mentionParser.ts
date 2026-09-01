import type { VNode } from 'vue'
import { h } from 'vue'

/**
 * Parse text for @mentions and convert them to clickable links
 * @param text - The text content to parse
 * @returns Array of VNodes (text and links mixed)
 */
export function parseMentionsForVue(text: string): VNode[] {
  const mentionRegex = /@([a-zA-Z0-9_-]+)/g
  const nodes: VNode[] = []
  let lastIndex = 0
  let match: RegExpExecArray | null

  while ((match = mentionRegex.exec(text)) !== null) {
    // Add text before the mention
    if (match.index > lastIndex) {
      nodes.push(h('span', text.slice(lastIndex, match.index)))
    }

    // Add the mention as a link
    const username = match[1]
    nodes.push(
      h(
        'a',
        {
          href: `/user/${username}`,
          class: 'mention-link text-primary hover:underline font-medium',
          onClick: (e: MouseEvent) => {
            // Let Vue Router handle the navigation
            e.preventDefault()
            window.dispatchEvent(new CustomEvent('mention-click', { detail: { username } }))
          },
        },
        `@${username}`,
      ),
    )

    lastIndex = match.index + match[0].length
  }

  // Add remaining text
  if (lastIndex < text.length) {
    nodes.push(h('span', text.slice(lastIndex)))
  }

  return nodes.length > 0 ? nodes : [h('span', text)]
}

/**
 * Check if text contains mentions
 * @param text - The text to check
 * @returns True if text contains @mentions
 */
export function hasMentions(text: string): boolean {
  return /@([a-zA-Z0-9_-]+)/.test(text)
}

/**
 * Extract all mentions from text
 * @param text - The text to extract mentions from
 * @returns Array of usernames (without @)
 */
export function extractMentionUsernames(text: string): string[] {
  const mentionRegex = /@([a-zA-Z0-9_-]+)/g
  const matches = text.matchAll(mentionRegex)
  const usernames = new Set<string>()

  for (const match of matches) {
    if (match[1]) {
      usernames.add(match[1])
    }
  }

  return Array.from(usernames)
}
