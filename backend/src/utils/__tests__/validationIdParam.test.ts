import { describe, expect, it } from '@jest/globals';
import {
  parseStrictPositiveId,
  parseStrictPositiveIdArray,
  validateIdParam,
} from '../validation.js';

describe('strict ID parameter validation', () => {
  it('accepts only positive safe integer strings', () => {
    expect(validateIdParam('12')).toBe(12);
    expect(validateIdParam('1')).toBe(1);
  });

  it.each(['12abc', '1.5', '-1', '0', ' 12', '12 ', '1e2', ''])(
    'rejects non-canonical ID %s',
    (value) => {
      expect(validateIdParam(value)).toBeNull();
    },
  );

  it('accepts canonical positive safe IDs from JSON numbers and strings', () => {
    expect(parseStrictPositiveId(12)).toBe(12);
    expect(parseStrictPositiveId('12')).toBe(12);
  });

  it.each([0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1, '12abc', '', null, true, undefined])(
    'rejects unsafe or coercive body ID %p',
    (value) => {
      expect(parseStrictPositiveId(value)).toBeNull();
    },
  );

  it('accepts a bounded array of canonical positive IDs', () => {
    expect(parseStrictPositiveIdArray([1, '2'])).toEqual([1, 2]);
  });

  it('rejects malformed or oversized positive-ID arrays', () => {
    expect(parseStrictPositiveIdArray([1, '2abc'])).toBeNull();
    expect(
      parseStrictPositiveIdArray(Array.from({ length: 101 }, (_, index) => index + 1)),
    ).toBeNull();
  });
});
