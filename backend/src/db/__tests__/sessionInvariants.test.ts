import { describe, expect, it } from '@jest/globals';

import { type SessionInvariants, sessionInvariantDrift } from '../connection.js';

const strictSession: SessionInvariants = {
  sqlMode: 'STRICT_TRANS_TABLES,NO_ZERO_DATE,NO_ZERO_IN_DATE,ERROR_FOR_DIVISION_BY_ZERO',
  globalSqlMode: 'STRICT_TRANS_TABLES,NO_ZERO_DATE,NO_ZERO_IN_DATE,ERROR_FOR_DIVISION_BY_ZERO',
  isolationLevel: 'REPEATABLE-READ',
  globalIsolationLevel: 'REPEATABLE-READ',
  timeZone: 'SYSTEM',
  globalTimeZone: 'SYSTEM',
  foreignKeyChecks: 1,
};

describe('pooled session invariants', () => {
  it('accepts a connection that still matches the server defaults', () => {
    expect(sessionInvariantDrift(strictSession)).toEqual([]);
  });

  it('reports a cleared sql_mode as the disabled-safeguard failure it is', () => {
    const drift = sessionInvariantDrift({ ...strictSession, sqlMode: '' });
    expect(drift).toHaveLength(1);
    expect(drift[0]).toMatch(/sql_mode is empty/);
  });

  it('reports sql_mode, isolation, time zone, and foreign-key drift together', () => {
    expect(
      sessionInvariantDrift({
        ...strictSession,
        sqlMode: 'NO_ENGINE_SUBSTITUTION',
        isolationLevel: 'READ-COMMITTED',
        timeZone: '+00:00',
        foreignKeyChecks: 0,
      }),
    ).toHaveLength(4);
  });
});
