import { stripAnsiCodes } from './stringUtils.js';

export interface NewsEntry {
  date: string;
  items: string[];
}

const NUMERIC_DATE = String.raw`\d{1,2}/\d{1,2}/(?:\d{4}|\d{2})`;
const HEADING = new RegExp(
  `^(${NUMERIC_DATE})(?:\\s*[-–—]\\s*(${NUMERIC_DATE}))?(?:\\s+[-–—:]\\s+.+)?$`,
);

function dateValue(value: string): number | null {
  const [month, day, shortYear] = value.split('/').map(Number);
  const year = shortYear < 100 ? 2000 + shortYear : shortYear;
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
    ? date.getTime()
    : null;
}

/** Extract the first dated section; never fall through an empty or invalid section. */
export function parseLatestNewsEntry(content: string): NewsEntry | null {
  let date: string | null = null;
  const items: string[] = [];
  let continuingBullet = false;

  for (const line of content.split(/\r?\n/)) {
    const plainLine = stripAnsiCodes(line);
    const cleanLine = plainLine.trim();
    const heading = HEADING.exec(cleanLine);

    if (heading) {
      if (date) break;
      const start = dateValue(heading[1]);
      const end = heading[2] ? dateValue(heading[2]) : start;
      if (start === null || end === null || end < start) return null;
      date = heading[2] ? `${heading[1]} - ${heading[2]}` : heading[1];
      continue;
    }

    // An unsupported numeric heading must not advertise an older section.
    if (/^\d{1,4}[/.\-]/.test(cleanLine)) {
      if (!date) return null;
      break;
    }
    if (!date) {
      if (/^[-*]\s+\S/.test(cleanLine)) return null;
      continue;
    }

    if (/^[-*]\s+\S/.test(cleanLine)) {
      items.push(cleanLine);
      continuingBullet = true;
    } else if (continuingBullet && cleanLine && /^\s/.test(plainLine)) {
      const separator = /[a-zA-Z]-$/.test(items[items.length - 1]) ? '' : ' ';
      items[items.length - 1] += separator + cleanLine;
    } else {
      // Blank lines, separators and subsection titles end a wrapped bullet.
      continuingBullet = false;
    }
  }

  return date && items.length ? { date, items } : null;
}
