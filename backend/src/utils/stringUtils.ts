/**
 * String utility functions for DurisMUD
 * Non-display-related string operations (no HTML generation)
 */

// All valid ANSI color code patterns
const ANSI_PATTERNS = [
  /&=[a-zA-Z]{2}/g, // &=XY (background + foreground)
  /&[+\-][a-zA-Z*]/g, // &+X or &-X
  /&[nN]/g, // &n or &N (reset)
];

/**
 * Strips all ANSI color codes from text for plain text operations
 * @param text - The raw MUD text with ANSI codes
 * @returns Plain text without ANSI codes
 */
export function stripAnsiCodes(text: string | null): string {
  if (!text) return '';

  let plain = text;
  for (const pattern of ANSI_PATTERNS) {
    plain = plain.replace(pattern, '');
  }

  return plain;
}

/**
 * Extracts player name from player_description field
 * Format: "[56 Crusader] Juts (Githzerai)" -> "Juts"
 * @param description - Player description string
 * @returns Player name or empty string
 */
export function extractPlayerName(description: string): string {
  const match = description.match(/\]\s+(\w+)/);
  return match ? match[1] : '';
}

/**
 * Parses player description to extract level, class, name, and race
 * @param description - Player description string
 * @returns Object with parsed fields
 */
export function parsePlayerDescription(description: string): {
  level: number;
  class: string;
  name: string;
  race: string;
} {
  // Format: "[56 Crusader] Juts (Githzerai)"
  const match = description.match(/\[(\d+)\s+([^\]]+)\]\s+(\w+)(?:\s+\(([^)]+)\))?/);

  if (match) {
    return {
      level: parseInt(match[1]),
      class: match[2].trim(),
      name: match[3],
      race: match[4] || 'Unknown',
    };
  }

  return {
    level: 0,
    class: 'Unknown',
    name: '',
    race: 'Unknown',
  };
}

/**
 * Convert text to URL-friendly slug (like Django's slugify)
 * Strips ANSI codes, converts to lowercase, replaces spaces with hyphens
 */
export function slugify(text: string): string {
  if (!text) return '';

  // First strip ANSI codes
  const stripped = stripAnsiCodes(text);

  // Convert to lowercase and replace spaces/special chars with hyphens
  return stripped
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '') // Remove non-word chars except spaces and hyphens
    .replace(/[\s_]+/g, '-') // Replace spaces and underscores with hyphens
    .replace(/-+/g, '-') // Replace multiple hyphens with single hyphen
    .replace(/^-+|-+$/g, ''); // Remove leading/trailing hyphens
}
