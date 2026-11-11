import { describe, expect, it } from '@jest/globals';
import { MAX_NAMED_REPORT_LENGTH, parseNamedReport, stripMudColors } from '../parser.js';
import { SAMPLE_REPORT, namedReport, zoneLine } from './namedReportFixture.js';

describe('named report parser', () => {
  it('reads every zone row with its spells, pieces, and cooldowns', () => {
    const report = parseNamedReport(SAMPLE_REPORT);
    expect(report?.zones).toEqual([
      {
        zone: 14,
        name: 'The Goblin Warrens',
        coloredName: '&+gThe Goblin Warrens&n',
        spells: [
          { name: 'armor', pieces: 3, cooldown: null },
          { name: 'bless', pieces: 3, cooldown: null },
        ],
      },
      {
        zone: 40,
        name: 'Orc Stronghold',
        coloredName: 'Orc Stronghold',
        spells: [{ name: 'conjure elemental', pieces: 6, cooldown: 'five_minutes' }],
      },
      {
        zone: 73,
        name: 'Fire Giants Keep',
        coloredName: '&+rFire &+RGiants&n Keep',
        spells: [{ name: 'stone skin', pieces: 6, cooldown: 'one_minute' }],
      },
      { zone: 300, name: 'Quiet Marsh', coloredName: 'Quiet Marsh', spells: [] },
    ]);
  });

  it('keeps the notes block, from the Notes line up to the table header', () => {
    const notes = parseNamedReport(SAMPLE_REPORT)?.notes ?? '';
    expect(notes.startsWith('  &+MNotes&n:')).toBe(true);
    expect(notes).toContain('Guardian Spirits requires a Shaman wearer.');
    expect(notes).not.toContain('ZONE ID');
    expect(notes).not.toContain('Current listing');
  });

  it('accepts CRLF line endings', () => {
    expect(parseNamedReport(SAMPLE_REPORT.replace(/\n/g, '\r\n'))?.zones).toHaveLength(4);
  });

  it.each([
    ['empty text', ''],
    ['text without the table header', 'Something else entirely\n #14 Zone &+W|&n '],
    ['a header with no zone rows', namedReport([])],
    ['a malformed zone row', namedReport([' #14 Zone with no column separator\n'])],
    [
      'a malformed spell entry',
      namedReport([' #14 Zone                    &+W|&n &+Barmor &+W(&+Ymany&+W)&n\n']),
    ],
    ['a zero piece count', namedReport([zoneLine(14, 'Zone', [['B', 'armor', 0]])])],
    ['oversized input', SAMPLE_REPORT + ' '.repeat(MAX_NAMED_REPORT_LENGTH)],
  ])('rejects %s', (_label, raw) => {
    expect(parseNamedReport(raw)).toBeNull();
  });

  it('strips MUD color codes, including background and reset codes', () => {
    expect(stripMudColors('&+rRed&n &=LgBack&N &-bdim&+*')).toBe('Red Back dim');
  });
});
