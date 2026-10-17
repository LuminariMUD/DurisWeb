import { describe, expect, it } from '@jest/globals';
import { safeFailureCode } from '../safeFailureCode.js';

describe('safe failure diagnostics', () => {
  it('retains an allowlisted driver code without its identifying payload', () => {
    const error = Object.assign(new Error('private-message'), {
      code: 'ER_LOCK_DEADLOCK',
      sql: 'private-bindings',
    });
    expect(safeFailureCode(error)).toBe('ER_LOCK_DEADLOCK');
  });
  it('does not treat arbitrary strings or raw driver messages as safe codes', () => {
    for (const error of [
      new Error('ECONNREFUSED private-message'),
      { code: 'PRIVATE_SENTINEL' },
      { code: 123 },
      'private-message',
      null,
    ])
      expect(safeFailureCode(error)).toBe('unclassified');
  });
  it('does not invoke accessors while extracting diagnostics', () => {
    let reads = 0;
    const error = {
      get code() {
        reads++;
        throw new Error('private-message');
      },
    };
    expect(safeFailureCode(error)).toBe('unclassified');
    expect(reads).toBe(0);
  });
});
