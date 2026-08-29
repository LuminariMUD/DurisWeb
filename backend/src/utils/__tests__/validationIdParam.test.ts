import { describe, expect, it } from '@jest/globals';
import { validateIdParam } from '../validation.js';

describe('strict ID parameter validation', () => {
  it('accepts only positive safe integer strings', () => {
    expect(validateIdParam('12')).toBe(12);
    expect(validateIdParam('1')).toBe(1);
  });

  it.each(['12abc', '1.5', '-1', '0', ' 12', '12 ', '1e2', ''])
    ('rejects non-canonical ID %s', (value) => {
      expect(validateIdParam(value)).toBeNull();
    });
});
