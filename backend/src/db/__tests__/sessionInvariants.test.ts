import { afterEach, describe, expect, it, jest } from '@jest/globals';

import logger from '../../utils/logger.js';
import {
  type SessionInvariants,
  detectIsolationVariableName,
  pool,
  samplePoolSessionInvariants,
  sessionInvariantDrift,
} from '../connection.js';

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

  describe('samplePoolSessionInvariants', () => {
    const getConnection = pool.getConnection.bind(pool);
    let loggerError: ReturnType<typeof jest.spyOn>;

    afterEach(() => {
      pool.getConnection = getConnection;
      jest.restoreAllMocks();
    });

    function mockCheckout(row: object): void {
      const query = jest.fn<(...args: unknown[]) => Promise<unknown>>();
      query.mockResolvedValueOnce([[]]);
      query.mockResolvedValueOnce([[row]]);
      (pool as unknown as { getConnection: () => Promise<unknown> }).getConnection = jest
        .fn<() => Promise<unknown>>()
        .mockResolvedValue({ query, release: jest.fn() });
    }

    it('alerts on drift without throwing', async () => {
      mockCheckout({ ...strictSession, sqlMode: '' });
      loggerError = jest.spyOn(logger, 'error').mockImplementation(() => logger);

      await expect(samplePoolSessionInvariants()).resolves.toBeUndefined();
      expect(loggerError).toHaveBeenCalledWith(
        expect.stringContaining('web pool session invariants drifted on sampled checkout'),
      );
    });

    it('stays quiet on a clean checkout', async () => {
      mockCheckout(strictSession);
      loggerError = jest.spyOn(logger, 'error').mockImplementation(() => logger);

      await expect(samplePoolSessionInvariants()).resolves.toBeUndefined();
      expect(loggerError).not.toHaveBeenCalled();
    });

    it('alerts instead of throwing when the sampled checkout fails', async () => {
      (pool as unknown as { getConnection: () => Promise<unknown> }).getConnection = jest
        .fn<() => Promise<unknown>>()
        .mockRejectedValue(new Error('pool closed'));
      loggerError = jest.spyOn(logger, 'error').mockImplementation(() => logger);

      await expect(samplePoolSessionInvariants()).resolves.toBeUndefined();
      expect(loggerError).toHaveBeenCalledWith(
        'Pool session invariant sampling failed:',
        expect.anything(),
      );
    });
  });

  describe('detectIsolationVariableName', () => {
    it('returns transaction_isolation when supported by the database server (MySQL 8+)', async () => {
      const mockConn = {
        query: jest.fn<(...args: unknown[]) => Promise<unknown>>().mockResolvedValueOnce([[]]),
      };
      await expect(detectIsolationVariableName(mockConn as any)).resolves.toBe(
        'transaction_isolation',
      );
      expect(mockConn.query).toHaveBeenCalledWith('SELECT @@SESSION.transaction_isolation');
    });

    it('falls back to tx_isolation when transaction_isolation is unknown (MariaDB 10.11 code)', async () => {
      const err = Object.assign(new Error('Unknown system variable'), {
        code: 'ER_UNKNOWN_SYSTEM_VARIABLE',
      });
      const mockConn = {
        query: jest.fn<(...args: unknown[]) => Promise<unknown>>().mockRejectedValueOnce(err),
      };
      await expect(detectIsolationVariableName(mockConn as any)).resolves.toBe('tx_isolation');
    });

    it('falls back to tx_isolation when transaction_isolation is unknown (MariaDB errno 1193)', async () => {
      const err = Object.assign(new Error('Unknown system variable'), {
        errno: 1193,
      });
      const mockConn = {
        query: jest.fn<(...args: unknown[]) => Promise<unknown>>().mockRejectedValueOnce(err),
      };
      await expect(detectIsolationVariableName(mockConn as any)).resolves.toBe('tx_isolation');
    });

    it('rethrows unexpected database errors', async () => {
      const err = Object.assign(new Error('Connection lost'), {
        code: 'ECONNRESET',
      });
      const mockConn = {
        query: jest.fn<(...args: unknown[]) => Promise<unknown>>().mockRejectedValueOnce(err),
      };
      await expect(detectIsolationVariableName(mockConn as any)).rejects.toThrow('Connection lost');
    });
  });
});
