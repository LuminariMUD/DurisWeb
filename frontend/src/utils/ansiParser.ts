/**
 * Parses DurisMUD ANSI color codes to HTML with Tailwind classes
 * Based on the color codes used in the MUD server (comm.c, map.c)
 *
 * MUD Color Code Format:
 * - &+X  = Foreground (single letter, uppercase = bold)
 * - &-X  = Background (single letter)
 * - &=XY = Background + Foreground (TWO letters)
 * - &n/&N = Reset
 *
 * Colors: l/L(black), r/R(red), g/G(green), y/Y(yellow), b/B(blue), m/M(magenta), c/C(cyan), w/W(white)
 */

export interface AnsiColor {
  code: string
  class: string
  description: string
}

// Background colors (first letter in &=XY)
const bgColors: Record<string, string> = {
  l: 'bg-black',
  L: 'bg-gray-800',
  r: 'bg-red-900',
  R: 'bg-red-800',
  g: 'bg-green-900',
  G: 'bg-green-800',
  y: 'bg-yellow-900',
  Y: 'bg-yellow-700',
  b: 'bg-blue-900',
  B: 'bg-blue-800',
  m: 'bg-purple-900',
  M: 'bg-purple-800',
  c: 'bg-cyan-900',
  C: 'bg-cyan-800',
  w: 'bg-gray-400',
  W: 'bg-white',
}

// Foreground colors (second letter in &=XY, or single letter in &+X)
const fgColors: Record<string, string> = {
  l: 'text-gray-400',
  L: 'text-gray-500 font-bold',
  r: 'text-red-600',
  R: 'text-red-400 font-bold',
  g: 'text-green-600',
  G: 'text-green-400 font-bold',
  y: 'text-yellow-600',
  Y: 'text-yellow-300 font-bold',
  b: 'text-blue-600',
  B: 'text-blue-400 font-bold',
  m: 'text-purple-600',
  M: 'text-purple-400 font-bold',
  c: 'text-cyan-600',
  C: 'text-cyan-300 font-bold',
  w: 'text-gray-400',
  W: 'text-white font-bold',
}

// Build color map dynamically
function buildAnsiColors(): AnsiColor[] {
  const colors: AnsiColor[] = []
  const letters = ['l', 'L', 'r', 'R', 'g', 'G', 'y', 'Y', 'b', 'B', 'm', 'M', 'c', 'C', 'w', 'W']

  // Generate all &=XY combinations (background + foreground)
  for (const bg of letters) {
    for (const fg of letters) {
      colors.push({
        code: `&=${bg}${fg}`,
        class: `${bgColors[bg]} ${fgColors[fg]}`,
        description: `${bg} bg + ${fg} fg`,
      })
    }
  }

  // Foreground colors (&+X)
  for (const letter of letters) {
    colors.push({
      code: `&+${letter}`,
      class: fgColors[letter] ?? 'text-gray-300',
      description: `Foreground ${letter}`,
    })
  }

  // Background colors (&-X)
  for (const letter of letters) {
    colors.push({
      code: `&-${letter}`,
      class: bgColors[letter] ?? 'bg-gray-800',
      description: `Background ${letter}`,
    })
  }

  // Normal/Reset
  colors.push({ code: '&n', class: 'text-gray-300', description: 'Normal (reset)' })
  colors.push({ code: '&N', class: 'text-gray-300', description: 'Normal' })

  // Special formatting
  colors.push({ code: '&+u', class: 'underline', description: 'Underline' })
  colors.push({ code: '&+f', class: 'animate-pulse', description: 'Flash/Blink' })
  colors.push({ code: '&+i', class: 'italic', description: 'Italic' })
  colors.push({ code: '&+d', class: 'font-bold', description: 'Bold' })
  colors.push({ code: '&+*', class: 'text-white font-bold animate-pulse', description: 'Blinking' })

  return colors
}

export const ANSI_COLORS: AnsiColor[] = buildAnsiColors()

/**
 * Escape HTML special characters to prevent XSS
 */
function _escapeHtml(text: string): string {
  const map: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;',
  }
  // Only escape HTML chars, not our ANSI codes
  return text.replace(/[&<>"']/g, (char) => {
    // Don't escape & if it's part of an ANSI code
    if (
      char === '&' &&
      /&\+?[a-zA-Z*]/.test(text.substring(text.indexOf(char), text.indexOf(char) + 3))
    ) {
      return char
    }
    return map[char] || char
  })
}

// Standard ANSI SGR (Select Graphic Rendition) code mappings
const ANSI_SGR_CLASSES: Record<string, string> = {
  '0': 'text-gray-300', // Reset
  '1': 'font-bold', // Bold
  '30': 'text-gray-500', // Black (brightened for visibility on black bg)
  '31': 'text-red-600', // Red
  '32': 'text-green-500', // Green
  '33': 'text-yellow-500', // Yellow
  '34': 'text-blue-500', // Blue
  '35': 'text-purple-500', // Magenta
  '36': 'text-cyan-400', // Cyan
  '37': 'text-gray-300', // White
  '90': 'text-gray-500', // Bright Black (Gray)
  '91': 'text-red-400', // Bright Red
  '92': 'text-green-400', // Bright Green
  '93': 'text-yellow-300', // Bright Yellow
  '94': 'text-blue-400', // Bright Blue
  '95': 'text-purple-400', // Bright Magenta
  '96': 'text-cyan-300', // Bright Cyan
  '97': 'text-white', // Bright White
}

/**
 * Parse standard ANSI escape sequences to CSS classes
 * Format: ESC[<code>m or ESC[<code>;<code>m
 */
function parseStandardAnsi(text: string): string {
  // Match ANSI escape sequences: ESC [ <params> m
  // ESC can be \x1B or \u001B
  const ansiRegex = /\x1B\[([0-9;]*)m/g

  let html = text
  let lastClasses = 'text-gray-300'

  html = html.replace(ansiRegex, (match, params) => {
    if (!params || params === '0') {
      lastClasses = 'text-gray-300'
      return `</span><span class="${lastClasses}">`
    }

    const codes = params.split(';')
    const classes: string[] = []

    for (const code of codes) {
      if (ANSI_SGR_CLASSES[code]) {
        classes.push(ANSI_SGR_CLASSES[code])
      }
    }

    if (classes.length > 0) {
      lastClasses = classes.join(' ')
    }

    return `</span><span class="${lastClasses}">`
  })

  return html
}

/**
 * Parse ANSI color codes to HTML with Tailwind CSS classes
 * Supports both DurisMUD codes (&+G) and standard ANSI escape sequences (\x1B[32m)
 */
export function parseAnsiToHtml(text: string): string {
  if (!text) return ''
  if (typeof text !== 'string') {
    console.warn('[AnsiParser] Received non-string input:', text)
    return String(text)
  }

  let html = text

  // Escape HTML special characters (but preserve & for ANSI codes)
  html = html
    .replace(/&(?![+=\-nN]|[+=\-][a-zA-Z*])/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')

  // First, handle standard ANSI escape sequences
  html = parseStandardAnsi(html)

  // Then, handle DurisMUD color codes
  // Sort colors by length (longest first) to handle multi-char codes correctly
  const sortedColors = [...ANSI_COLORS].sort((a, b) => b.code.length - a.code.length)

  // Replace each color code with closing previous span and opening new one
  for (const color of sortedColors) {
    const regex = new RegExp(escapeRegExp(color.code), 'g')
    html = html.replace(regex, `</span><span class="${color.class}">`)
  }

  // Clean up carriage returns
  html = html.replace(/\r\n/g, '\n').replace(/\r/g, '')

  // Wrap in a base span
  html = `<span class="text-gray-300">${html}</span>`

  // Remove any empty spans
  html = html.replace(/<span[^>]*><\/span>/g, '')

  return html
}

/**
 * Parse ANSI to plain text (strip all color codes)
 */
export function stripAnsiCodes(text: string): string {
  if (!text) return ''

  let result = text
  for (const color of ANSI_COLORS) {
    const regex = new RegExp(escapeRegExp(color.code), 'g')
    result = result.replace(regex, '')
  }

  return result
}

/**
 * Convert text to URL-friendly slug (like Django's slugify)
 * Strips ANSI codes, converts to lowercase, replaces spaces with hyphens
 */
export function slugify(text: string): string {
  if (!text) return ''

  // First strip ANSI codes
  const stripped = stripAnsiCodes(text)

  // Convert to lowercase and replace spaces/special chars with hyphens
  return stripped
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '') // Remove non-word chars except spaces and hyphens
    .replace(/[\s_]+/g, '-') // Replace spaces and underscores with hyphens
    .replace(/-+/g, '-') // Replace multiple hyphens with single hyphen
    .replace(/^-+|-+$/g, '') // Remove leading/trailing hyphens
}

/**
 * Escape special regex characters
 */
function escapeRegExp(string: string): string {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

// Hex colors for foreground (used in canvas rendering)
const fgHexColors: Record<string, string> = {
  l: '#9ca3af',
  L: '#6b7280',
  r: '#dc2626',
  R: '#f87171',
  g: '#16a34a',
  G: '#4ade80',
  y: '#ca8a04',
  Y: '#fde047',
  b: '#2563eb',
  B: '#60a5fa',
  m: '#9333ea',
  M: '#c084fc',
  c: '#0891b2',
  C: '#67e8f9',
  w: '#9ca3af',
  W: '#ffffff',
}

// Build ANSI_TO_HEX dynamically
function buildAnsiToHex(): Record<string, string> {
  const map: Record<string, string> = {}
  const letters = ['l', 'L', 'r', 'R', 'g', 'G', 'y', 'Y', 'b', 'B', 'm', 'M', 'c', 'C', 'w', 'W']

  // &=XY codes use the foreground color for text rendering
  for (const bg of letters) {
    for (const fg of letters) {
      map[`&=${bg}${fg}`] = fgHexColors[fg] ?? '#d1d5db'
    }
  }

  // &+X foreground colors
  for (const letter of letters) {
    map[`&+${letter}`] = fgHexColors[letter] ?? '#d1d5db'
  }

  // &-X background colors (use as foreground for canvas)
  for (const letter of letters) {
    map[`&-${letter}`] = fgHexColors[letter] ?? '#d1d5db'
  }

  // Normal/Reset
  map['&n'] = '#d1d5db'
  map['&N'] = '#d1d5db'

  return map
}

// ANSI code to hex color mapping for canvas rendering
const ANSI_TO_HEX: Record<string, string> = buildAnsiToHex()

export interface AnsiSegment {
  text: string
  color: string
  bold?: boolean
}

/**
 * Parse ANSI text into segments with hex colors for canvas rendering
 */
export function parseAnsiToSegments(text: string): AnsiSegment[] {
  if (!text) return []

  const segments: AnsiSegment[] = []
  let currentColor = '#d1d5db' // Default gray
  let currentBold = false

  // Regex to match ANSI codes: &=XY (4 chars), &+X (3 chars), &-X (3 chars), &n (2 chars)
  const ansiRegex = /&(=[a-zA-Z]{2}|[+\-][a-zA-Z*]|[nN])/g

  let lastIndex = 0
  let match

  while ((match = ansiRegex.exec(text)) !== null) {
    // Add text before this code
    if (match.index > lastIndex) {
      const textBefore = text.substring(lastIndex, match.index)
      if (textBefore) {
        segments.push({ text: textBefore, color: currentColor, bold: currentBold })
      }
    }

    // Update current color
    const fullCode = match[0]
    if (ANSI_TO_HEX[fullCode]) {
      currentColor = ANSI_TO_HEX[fullCode]
      currentBold = fullCode.startsWith('&=') || /[A-Z]$/.test(fullCode)
    }

    lastIndex = match.index + match[0].length
  }

  // Add remaining text
  if (lastIndex < text.length) {
    segments.push({ text: text.substring(lastIndex), color: currentColor, bold: currentBold })
  }

  return segments
}

/**
 * Draw ANSI-colored text on a canvas context
 * Returns the total width drawn
 */
export function drawAnsiText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  baseFont: string = '24px system-ui, -apple-system, sans-serif',
): number {
  const segments = parseAnsiToSegments(text)
  let currentX = x

  for (const segment of segments) {
    ctx.fillStyle = segment.color
    ctx.font = segment.bold ? `bold ${baseFont}` : baseFont
    ctx.fillText(segment.text, currentX, y)
    currentX += ctx.measureText(segment.text).width
  }

  return currentX - x
}

/**
 * Parse ANSI for Vue component (returns v-html safe string)
 * Handles line-by-line parsing to reset colors at each newline
 */
export function parseAnsiForVue(text: string, collapseBlankLines = false): string {
  if (!text) return ''

  // Optionally collapse blank lines (for combat logs)
  let processedText = text
  if (collapseBlankLines) {
    // Normalize line endings first (CRLF -> LF)
    processedText = processedText.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
    // Remove single blank lines (double newlines -> single newline)
    // but keep blank lines before prompts (< XXXh/XXXH pattern)
    processedText = processedText.replace(/\n\n(?!&\+g<)/g, '\n')
    // Collapse 3+ consecutive newlines into 2 (one blank line)
    processedText = processedText.replace(/\n{3,}/g, '\n\n')
  }

  // First escape HTML entities except our ANSI codes
  // Protect &+, &=, &-, and &n/&N patterns from being escaped
  const safe = processedText
    .replace(/&(?![+=\-nN]|[+=\-][a-zA-Z*])/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')

  // Split by newlines and parse each line independently
  // This ensures colors reset at each line
  const lines = safe.split('\n')
  const parsedLines = lines.map((line) => {
    if (!line) return '' // Empty line

    let html = line

    // Sort colors by length (longest first) to handle multi-char codes correctly
    const sortedColors = [...ANSI_COLORS].sort((a, b) => b.code.length - a.code.length)

    // Replace each color code with closing previous span and opening new one
    for (const color of sortedColors) {
      const regex = new RegExp(escapeRegExp(color.code), 'g')
      html = html.replace(regex, `</span><span class="${color.class}">`)
    }

    // Wrap in a base span and close it at end of line
    html = `<span class="text-gray-300">${html}</span>`

    // Remove any empty spans
    html = html.replace(/<span[^>]*><\/span>/g, '')

    return html
  })

  // Join lines with newlines
  return parsedLines.join('\n')
}

/** Convert MUD text to escaped, colored paragraphs for the editor. */
export function ansiToHtmlWithStyles(text: string): string {
  if (!text) return ''
  const escape = (value: string) =>
    value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

  return text
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((line) => {
      let color = '&n'
      let offset = 0
      let html = ''
      const append = (value: string) => {
        if (value) html += `<span data-mud-color="${escape(color)}">${escape(value)}</span>`
      }
      for (const match of line.matchAll(/&(=[a-zA-Z]{2}|[+\-][a-zA-Z*]|[nN])/g)) {
        append(line.slice(offset, match.index))
        color = match[0]
        offset = match.index + color.length
      }
      append(line.slice(offset))
      return `<p>${html}</p>`
    })
    .join('')
}

/** Serialize editor text and MUD colors without treating literal text as markup. */
export function htmlToAnsi(html: string): string {
  if (!html) return ''
  const template = document.createElement('template')
  template.innerHTML = html
  const validColor = /^&(=[a-zA-Z]{2}|[+\-][a-zA-Z*]|[nN])$/
  let activeColor = '&n'
  const isBlock = (node: Node) =>
    node instanceof HTMLElement &&
    /^(P|DIV|H[1-6]|LI|UL|OL|BLOCKQUOTE|PRE|TABLE|TR|HR)$/.test(node.tagName)

  const serializeChildren = (parent: Node, color: string): string => {
    const children = Array.from(parent.childNodes)
    return children
      .map((child, index) => {
        const separator = index > 0 && (isBlock(child) || isBlock(children[index - 1]!)) ? '\n' : ''
        return separator + serialize(child, color)
      })
      .join('')
  }

  const serialize = (node: Node, color = '&n'): string => {
    if (node.nodeType === Node.TEXT_NODE) {
      const value = node.textContent || ''
      if (!value) return ''
      const prefix = color === activeColor ? '' : color
      activeColor = color
      return prefix + value
    }
    if (!(node instanceof HTMLElement)) return ''
    if (node.tagName === 'BR') return '\n'
    if (node.tagName === 'HR') return '----------------------------------------'
    const mudColor = node.getAttribute('data-mud-color')
    const nextColor = mudColor && validColor.test(mudColor) ? mudColor : color
    if (isBlock(node)) activeColor = '&n'
    const value = serializeChildren(node, nextColor)
    if (!isBlock(node)) return value
    const reset = activeColor === '&n' ? '' : '&n'
    activeColor = '&n'
    return value + reset
  }

  return serializeChildren(template.content, '&n')
}
