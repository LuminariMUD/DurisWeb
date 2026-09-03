import { describe, expect, it } from '@jest/globals';
import { appendArrayValues } from '../arrayUtils.js';

describe('array utilities', () => {
  it('appends collections larger than the JavaScript call-argument limit', () => {
    const target = [-1];
    const values = Array.from({ length: 250_000 }, (_value, index) => index);

    appendArrayValues(target, values);

    expect(target).toHaveLength(250_001);
    expect(target[0]).toBe(-1);
    expect(target.at(-1)).toBe(249_999);
  });
});
