/**
 * Parses the MUD's cached `namedreport` text (Redis `cache:named`) into rows.
 *
 * The MUD writes this report in `generate_named_report()`: a colored notes
 * header, a `ZONE ID / NAME` table header, then one line per named set:
 *
 *   ` #<zone> <padded zone name>    &+W|&n <spell>&+W,&n <spell>...`
 *
 * Each spell is `&+<color><name> &+W(&+Y<pieces>&+W)&n`, where the color marks
 * the cooldown (`&+G` one minute, `&+y` five minutes). The text arrives from
 * the MUD and is untrusted: anything that does not match is rejected.
 */

export type NamedSetCooldown = 'one_minute' | 'five_minutes' | null;

export interface NamedSetSpell {
  name: string;
  pieces: number;
  cooldown: NamedSetCooldown;
}

export interface NamedSetZone {
  zone: number;
  name: string;
  /** Zone name with its MUD color codes, for rendering on ink. */
  coloredName: string;
  spells: NamedSetSpell[];
}

export interface NamedSetReport {
  /** The report's notes block, with MUD color codes. */
  notes: string;
  zones: NamedSetZone[];
}

/** Far above the real report (about 10 KB); larger input is not this report. */
export const MAX_NAMED_REPORT_LENGTH = 256 * 1024;
const MAX_ZONES = 2000;
const MAX_SPELLS_PER_ZONE = 16;
const MAX_PIECES = 99;
const MAX_NAME_LENGTH = 120;

const MUD_COLOR_CODE = /&(?:=[a-zA-Z]{2}|[+-][a-zA-Z*]|[nN])/g;
const TABLE_HEADER = /ZONE ID \/ NAME/;
const ZONE_LINE = /^ #(\d{1,6}) (.*)$/;
const COLUMN_SEPARATOR = '&+W|&n';
const SPELL_SEPARATOR = '&+W,&n ';
const SPELL_ENTRY = /^&\+([a-zA-Z])([^&()]+?) &\+W\(&\+Y(\d{1,2})&\+W\)&n$/;

export function stripMudColors(text: string): string {
  return text.replace(MUD_COLOR_CODE, '');
}

function cooldownFor(color: string): NamedSetCooldown {
  if (color === 'G') return 'one_minute';
  if (color === 'y') return 'five_minutes';
  return null;
}

function parseSpells(text: string): NamedSetSpell[] | null {
  const trimmed = text.trim();
  if (!trimmed) return [];
  const entries = trimmed.split(SPELL_SEPARATOR);
  if (entries.length > MAX_SPELLS_PER_ZONE) return null;
  const spells: NamedSetSpell[] = [];
  for (const entry of entries) {
    const match = SPELL_ENTRY.exec(entry.trim());
    if (!match) return null;
    const name = match[2].trim();
    const pieces = Number(match[3]);
    if (!name || name.length > MAX_NAME_LENGTH || pieces < 1 || pieces > MAX_PIECES) return null;
    spells.push({ name, pieces, cooldown: cooldownFor(match[1]) });
  }
  return spells;
}

function parseZoneLine(line: string): NamedSetZone | null {
  const match = ZONE_LINE.exec(line);
  if (!match) return null;
  const separator = match[2].lastIndexOf(COLUMN_SEPARATOR);
  if (separator < 0) return null;
  const zone = Number(match[1]);
  const coloredName = match[2].slice(0, separator).trim();
  const name = stripMudColors(coloredName).trim();
  if (!name || coloredName.length > MAX_NAME_LENGTH * 4) return null;
  const spells = parseSpells(match[2].slice(separator + COLUMN_SEPARATOR.length));
  if (!spells) return null;
  return { zone, name, coloredName, spells };
}

/** Parse the cached report, or return null when it is not a well-formed report. */
export function parseNamedReport(raw: string): NamedSetReport | null {
  if (!raw || raw.length > MAX_NAMED_REPORT_LENGTH) return null;
  const lines = raw.replace(/\r/g, '').split('\n');
  const headerIndex = lines.findIndex((line) => TABLE_HEADER.test(line));
  if (headerIndex < 0) return null;

  const notesStart = lines.findIndex((line) => /Notes/.test(line));
  const notes =
    notesStart >= 0 && notesStart < headerIndex
      ? lines.slice(notesStart, headerIndex).join('\n').trimEnd()
      : '';

  const zones: NamedSetZone[] = [];
  // The line after the header is a rule; every later non-blank line is a set.
  for (const line of lines.slice(headerIndex + 2)) {
    if (!line.trim()) continue;
    const zone = parseZoneLine(line);
    if (!zone) return null;
    zones.push(zone);
    if (zones.length > MAX_ZONES) return null;
  }
  if (zones.length === 0) return null;
  return { notes, zones };
}
