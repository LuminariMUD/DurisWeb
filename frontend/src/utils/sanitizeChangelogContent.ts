import DOMPurify from 'dompurify'

const CHANGELOG_ALLOWED_TAGS = [
  'p',
  'div',
  'br',
  'strong',
  'em',
  'u',
  's',
  'code',
  'pre',
  'a',
  'ul',
  'ol',
  'li',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'blockquote',
  'span',
  'table',
  'thead',
  'tbody',
  'tr',
  'td',
  'th',
  'img',
]

const CHANGELOG_ALLOWED_ATTR = [
  'href',
  'target',
  'rel',
  'class',
  'data-mud-color',
  'data-columns',
  'data-bg-color',
  'data-alignment',
  'src',
  'alt',
  'colspan',
  'rowspan',
]

export function sanitizeChangelogContent(content: string): string {
  return DOMPurify.sanitize(content, {
    ALLOWED_TAGS: CHANGELOG_ALLOWED_TAGS,
    ALLOWED_ATTR: CHANGELOG_ALLOWED_ATTR,
    ALLOW_DATA_ATTR: false,
    KEEP_CONTENT: true,
  })
}
