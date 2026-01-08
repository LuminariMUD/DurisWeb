import DOMPurify from 'dompurify';
import { parseHTML } from 'linkedom';

// Create a lightweight DOM window using linkedom (faster and lighter than jsdom)
const { window } = parseHTML('<!DOCTYPE html><html></html>');
const purify = DOMPurify(window as any);

/**
 * Configuration for DOMPurify
 * Allows safe HTML tags while preserving MUD color attributes
 */
const PURIFY_CONFIG = {
  ALLOWED_TAGS: [
    // Block elements
    'p',
    'div',
    'br',
    // Text formatting
    'strong',
    'em',
    'u',
    's',
    'code',
    'pre',
    'a',
    // Lists
    'ul',
    'ol',
    'li',
    // Headings
    'h1',
    'h2',
    'h3',
    'h4',
    'h5',
    'h6',
    // Other blocks
    'blockquote',
    'span',
    // Tables
    'table',
    'thead',
    'tbody',
    'tr',
    'td',
    'th',
    // Images
    'img',
  ],
  ALLOWED_ATTR: [
    'href',
    'target',
    'rel',
    'class',
    // MUD colors
    'data-mud-color',
    // Column layouts
    'data-columns',
    'data-bg-color',
    // Images
    'src',
    'alt',
    'data-alignment',
    // Tables
    'colspan',
    'rowspan',
  ],
  ALLOWED_URI_REGEXP: /^(?:(?:(?:f|ht)tps?|mailto|tel|callto|cid|xmpp):|[^a-z]|[a-z+.\-]+(?:[^a-z+.\-:]|$))/i,
  ALLOW_DATA_ATTR: false,
  KEEP_CONTENT: true,
};

/**
 * Sanitize HTML content from TipTap editor
 * - Removes malicious scripts and dangerous attributes
 * - Preserves MUD color codes and safe formatting
 * - Returns clean HTML ready for storage
 */
export function sanitizeContent(html: string): string {
  if (!html || typeof html !== 'string') {
    return '';
  }

  // Sanitize HTML with DOMPurify
  const clean = purify.sanitize(html, PURIFY_CONFIG);

  // Ensure links have safe attributes (no javascript: or data: URIs)
  return clean.replace(
    /<a\s+href="([^"]*)"/g,
    (match, href) => {
      // Remove javascript: and data: URIs
      if (href.match(/^(javascript|data|vbscript):/i)) {
        return '<a href="#"';
      }

      // Add rel="noopener noreferrer" to external links
      if (href.match(/^https?:\/\//i)) {
        return `<a href="${href}" target="_blank" rel="noopener noreferrer"`;
      }

      return match;
    }
  );
}

/**
 * Parse @mentions from HTML content
 * Returns array of mentioned account names
 */
export function parseMentions(html: string): string[] {
  if (!html || typeof html !== 'string') {
    return [];
  }

  // Strip HTML tags first
  const text = html.replace(/<[^>]*>/g, ' ');

  // Find all @username mentions
  // Username pattern: @[a-zA-Z0-9_]+ (alphanumeric + underscore)
  const mentionRegex = /@([a-zA-Z0-9_]+)/g;
  const mentions = new Set<string>();

  let match;
  while ((match = mentionRegex.exec(text)) !== null) {
    mentions.add(match[1]); // Add username without @
  }

  return Array.from(mentions);
}

/**
 * Extract MUD ANSI color codes from HTML
 * Returns array of unique color codes used in the content
 */
export function extractMudColors(html: string): string[] {
  if (!html || typeof html !== 'string') {
    return [];
  }

  const colorRegex = /data-mud-color="([^"]+)"/g;
  const colors = new Set<string>();

  let match;
  while ((match = colorRegex.exec(html)) !== null) {
    colors.add(match[1]); // Add color code (e.g., "&+R")
  }

  return Array.from(colors);
}

/**
 * Validate content length
 * Returns error message if content exceeds limits
 */
export function validateContentLength(
  html: string,
  maxLength: number = 50000
): string | null {
  if (!html) {
    return 'Content cannot be empty';
  }

  if (html.length > maxLength) {
    return `Content exceeds maximum length of ${maxLength} characters`;
  }

  // Check plain text length (without HTML tags)
  const plainText = html.replace(/<[^>]*>/g, '');
  if (plainText.trim().length === 0) {
    return 'Content cannot be empty';
  }

  return null;
}

/**
 * Process forum post/thread content
 * - Sanitizes HTML
 * - Extracts mentions for notifications
 * - Validates length
 * Returns processed content and metadata
 */
export function processForumContent(html: string): {
  content: string;
  mentions: string[];
  mudColors: string[];
  error: string | null;
} {
  // Validate length first
  const error = validateContentLength(html);
  if (error) {
    return {
      content: '',
      mentions: [],
      mudColors: [],
      error,
    };
  }

  // Sanitize content
  const content = sanitizeContent(html);

  // Extract mentions for notifications
  const mentions = parseMentions(content);

  // Extract MUD colors (for analytics, optional)
  const mudColors = extractMudColors(content);

  return {
    content,
    mentions,
    mudColors,
    error: null,
  };
}

/**
 * Convert plain text to safe HTML
 * Used for legacy content or text-only posts
 */
export function textToHtml(text: string): string {
  if (!text || typeof text !== 'string') {
    return '';
  }

  // Escape HTML entities
  const escaped = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

  // Convert newlines to <br>
  return escaped.replace(/\n/g, '<br>');
}

/**
 * Strip all HTML tags for plain text display
 * Used for previews, notifications, etc.
 */
export function htmlToText(html: string, maxLength?: number): string {
  if (!html || typeof html !== 'string') {
    return '';
  }

  // Remove HTML tags
  let text = html.replace(/<[^>]*>/g, ' ');

  // Decode HTML entities
  text = text
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&');

  // Collapse multiple spaces
  text = text.replace(/\s+/g, ' ').trim();

  // Truncate if needed
  if (maxLength && text.length > maxLength) {
    text = text.substring(0, maxLength) + '...';
  }

  return text;
}
