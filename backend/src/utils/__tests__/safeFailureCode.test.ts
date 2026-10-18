import { describe, expect, it } from '@jest/globals';
import { safeFailureCode } from '../safeFailureCode.js';

describe('safe failure diagnostics', () => {
  it.each(['ER_LOCK_DEADLOCK', 'ER_CHECKREAD'])(
    'retains allowlisted driver code %s without its identifying payload',
    (code) => {
      const error = Object.assign(new Error('private-message'), {
        code,
        sql: 'private-bindings',
      });
      expect(safeFailureCode(error)).toBe(code);
    },
  );
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
