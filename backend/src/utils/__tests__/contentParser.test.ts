import { describe, expect, it } from '@jest/globals';
import {
  escapeHtml,
  MAX_NEWS_LENGTH,
  processNewsForWrite,
  processContentForWrite,
  processForumContent,
  sanitizeContent,
} from '../contentParser.js';

describe('content write validation', () => {
  it('reports oversized content before a write can occur', () => {
    const result = processForumContent('x'.repeat(50_001));

    expect(result.error).toContain('maximum length');
    expect(result.content).toBe('');
  });

  it('rejects content that sanitizes to an empty string', () => {
    const result = processContentForWrite('<script>alert(1)</script>');

    expect(result.error).toBe('Content cannot be empty after sanitization');
    expect(result.content).toBe('');
  });

  it('accepts safe content and returns the sanitized representation', () => {
    const result = processContentForWrite('<p>hello <strong>Duris</strong></p>');

    expect(result.error).toBeNull();
    expect(result.content).toContain('<strong>Duris</strong>');
  });

  it.each([
    ['script elements', '<script>alert(1)</script>', /<script/i],
    ['event handlers', '<img src="x" onerror="alert(1)">', /onerror/i],
    ['SVG handlers', '<svg onload="alert(1)">x</svg>', /<svg|onload/i],
  ])('removes %s from stored HTML', (_label, input, unsafePattern) => {
    expect(sanitizeContent(input)).not.toMatch(unsafePattern);
  });

  it('removes unsafe URL schemes while preserving link text', () => {
    const sanitized = sanitizeContent('<a href="javascript:alert(1)">read this</a>');

    expect(sanitized).not.toMatch(/javascript:/i);
    expect(sanitized).toContain('read this');
  });

  it('encodes dynamic text for HTML metadata contexts', () => {
    expect(escapeHtml(`A&B <tag> "double" 'single'`)).toBe(
      'A&amp;B &lt;tag&gt; &quot;double&quot; &#39;single&#39;',
    );
  });
});

describe('MUD news write validation', () => {
  it.each([54_922, 56_066, MAX_NEWS_LENGTH])(
    'accepts %i characters without changing text',
    (length) => {
      const content = '&+YNews&n\n  build <forge|loom> <direction> & more\n'.padEnd(length, 'x');
      expect(processNewsForWrite(content)).toEqual({ content, error: null });
    },
  );

  it('rejects the first character beyond the news limit', () => {
    expect(processNewsForWrite('x'.repeat(MAX_NEWS_LENGTH + 1)).error).toContain('maximum length');
  });

  it.each([null, undefined, 123, {}, [], '', ' \n\t', '&+R&n', 'text\0hidden', '\u001b[2J'])(
    'rejects invalid news: %p',
    (input) => {
      expect(processNewsForWrite(input).error).not.toBeNull();
      expect(processNewsForWrite(input).content).toBe('');
    },
  );

  it('retains the forum and other HTML write limits', () => {
    expect(processForumContent('x'.repeat(50_001)).error).toContain('50000');
    expect(processContentForWrite('x'.repeat(50_001)).error).toContain('50000');
  });
});
