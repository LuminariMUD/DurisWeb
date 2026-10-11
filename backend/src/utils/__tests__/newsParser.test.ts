import { describe, expect, it } from '@jest/globals';
import { parseLatestNewsEntry } from '../newsParser.js';

describe('latest news section', () => {
  it('extracts the first colored range and wrapped bullets, stopping at the next heading', () => {
    expect(
      parseLatestNewsEntry(`&+WUpdated: September 21, 2026&n

&+R09/15/26 - 09/21/26&n &+L-&n &+YKingdom works&n
&+W-----------------------------------&n

&+CWorkshops&n
&+Y-&n Leaders can build a &+Rforge&n,
  &+Mloom&n and store.
- A second item
  with another line.

&+CAnother subsection&n
- Third item
09/07/26 - 09/14/26 - Older changes
- Must not appear
12/13/25
- Historical item`),
    ).toEqual({
      date: '09/15/26 - 09/21/26',
      items: [
        '- Leaders can build a forge, loom and store.',
        '- A second item with another line.',
        '- Third item',
      ],
    });
  });

  it('joins wrapped hyphenated words', () => {
    expect(parseLatestNewsEntry('9/21/26\n- Character-\n  creation rooms')).toEqual({
      date: '9/21/26',
      items: ['- Character-creation rooms'],
    });
  });

  it.each(['1/2/25', '01/02/2025', '1/2/25 - Title', '1/2/25 – Title'])(
    'retains single-date entries: %s',
    (heading) => {
      expect(
        parseLatestNewsEntry(`${heading}\r\n- Change\r\n* Detail\r\n  wrapped\r\n1/1/25\r\n- Old`),
      ).toEqual({
        date: heading.split(' ')[0],
        items: ['- Change', '* Detail wrapped'],
      });
    },
  );

  it.each([
    '',
    'No dated news',
    'September 21, 2026\n- New\n12/13/25\n- Old',
    '09/15/26 - 09/21/26 - Empty\n12/13/25\n- Old',
    '09/31/26 - Invalid\n12/13/25\n- Old',
    '09/21/26 - 09/15/26\n- Reversed',
    '2026-09-21 New format\n12/13/25\n- Old',
  ])('does not fall back from missing or invalid latest content: %s', (content) => {
    expect(parseLatestNewsEntry(content)).toBeNull();
  });
});
