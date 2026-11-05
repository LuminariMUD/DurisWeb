import { describe, expect, it } from '@jest/globals';

import { CLASS_BITS, RACE_IDS, getSlotIds, getSpellEffects } from '../wikiConstants.js';

describe('current MUD wiki masks', () => {
  it('decodes the Misty Vale shirt across separate affect banks', () => {
    expect(getSpellEffects(67143680, 0, 0, 4096)).toEqual([
      'Waterbreath',
      'Slow Poison',
      'Levitate',
      'No Fear',
    ]);
  });

  it('uses current protection, aura, and sanctuary bit positions', () => {
    expect(getSpellEffects(0, 64 + 2048, 2 ** 26 + 2 ** 29, 2 ** 17 + 2 ** 22)).toEqual([
      'Prot Cold',
      'Globe',
      'Blur',
      'Pass Without Trace',
      'Mage Flame',
      'Sanctuary',
    ]);
  });

  it('keeps masks above 32 bits distinct from the low flags', () => {
    expect(getSpellEffects(2 ** 32 + 2 ** 33 + 2 ** 34)).toEqual([
      'Infernal Fury',
      'Freedom of Movement',
      'Sanctum Draconis',
    ]);
    expect(() => getSpellEffects(Number.MAX_SAFE_INTEGER + 1)).toThrow('Invalid wiki affect mask');
  });

  it('keeps belt attachments and Dragoon restrictions without wrapping race bits', () => {
    expect(getSlotIds(8 + 8388608)).toEqual([3, 23]);
    expect(CLASS_BITS).toContain(2 ** 29);
    expect(RACE_IDS.filter((id) => (1 & (1 << (id - 1))) !== 0)).toEqual([1]);
    expect(RACE_IDS.filter((id) => (2147483648 & (1 << (id - 1))) !== 0)).toEqual([32]);
  });
});
