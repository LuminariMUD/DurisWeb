import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { resetBackendConfigurationForTests } from '../../config/environment.js';

const mudQuery = jest.fn<(...args: unknown[]) => Promise<unknown>>();
const webQuery = jest.fn<(...args: unknown[]) => Promise<unknown>>();
const connectionQuery = jest.fn<(...args: unknown[]) => Promise<unknown>>();
const connection = {
  beginTransaction: jest.fn<() => Promise<void>>(),
  query: connectionQuery,
  commit: jest.fn<() => Promise<void>>(),
  rollback: jest.fn<() => Promise<void>>(),
  release: jest.fn<() => void>(),
};
const webPool = {
  getConnection: jest.fn<() => Promise<typeof connection>>(),
  query: webQuery,
};
const mudPool = { query: mudQuery };
const logger = {
  error: jest.fn<(...args: unknown[]) => void>(),
  info: jest.fn<(...args: unknown[]) => void>(),
  warn: jest.fn<(...args: unknown[]) => void>(),
};

jest.unstable_mockModule('../../db/connection.js', () => ({ webPool, pool: webPool, mudPool }));
jest.unstable_mockModule('../../utils/logger.js', () => ({ default: logger }));

const { getAccountDonationTotal, recordDonation } = await import('../donationService.js');

const donation = {
  message_id: 'message-123456789012',
  type: 'Donation',
  amount: '25.50',
  currency: 'USD',
  from_name: 'Supporter',
  email: 'supporter@example.invalid',
  message: 'Thank you',
  is_public: true,
  timestamp: '2026-08-31T00:00:00.000Z',
  is_subscription_payment: false,
  is_first_subscription_payment: false,
  tier_name: null,
};

beforeEach(() => {
  process.env.DONATIONS_ENABLED = 'true';
  process.env.KOFI_VERIFICATION_TOKEN = 'provider-token';
  process.env.MUD_REDIS_ENABLED = 'true';
  process.env.MUD_REDIS_AUTH_MODE = 'none';
  process.env.MUD_REDIS_HOST = 'redis.test.invalid';
  process.env.MUD_REDIS_PORT = '6379';
  process.env.MUD_REDIS_DB = '0';
  process.env.MUD_REDIS_NAMESPACE = 'duris:local:test';
  process.env.MUD_REDIS_TLS = 'false';
  process.env.MUD_REDIS_DONATION_SECRET = 's'.repeat(32);
  resetBackendConfigurationForTests();
  jest.clearAllMocks();
  webPool.getConnection.mockResolvedValue(connection);
  mudQuery.mockResolvedValueOnce([[{ account_name: 'Tester' }]]);
  mudQuery.mockResolvedValueOnce([[{ char_name: 'Tester' }]]);
  connection.beginTransaction.mockResolvedValue(undefined);
  connection.commit.mockResolvedValue(undefined);
  connection.rollback.mockResolvedValue(undefined);
  connection.release.mockReturnValue(undefined);
  connectionQuery.mockImplementation(async (...args: unknown[]) => {
    const sql = String(args[0]);
    if (sql.includes('INSERT INTO donations')) return [{ insertId: 42 }, []];
    return [{}, []];
  });
});

describe('donation persistence boundary', () => {
  it('records the donation and outbox event in one WebService transaction', async () => {
    const result = await recordDonation(donation);

    expect(result).toMatchObject({
      duplicate: false,
      accountName: 'Tester',
      characterName: 'Tester',
      amount: 25.5,
      amountCents: 2550,
    });
    expect(result.eventId).toEqual(expect.any(String));
    expect(mudQuery).toHaveBeenCalledTimes(2);
    expect(connection.beginTransaction).toHaveBeenCalledTimes(1);
    expect(connection.commit).toHaveBeenCalledTimes(1);
    expect(connection.rollback).not.toHaveBeenCalled();
    expect(connection.release).toHaveBeenCalledTimes(1);

    const sql = connectionQuery.mock.calls.map(([statement]) => String(statement)).join('\n');
    expect(sql).toContain('INSERT INTO donations');
    expect(sql).toContain('INSERT INTO web_donation_totals');
    expect(sql).toContain('INSERT INTO donation_outbox');
    expect(sql).not.toContain('UPDATE accounts');
  });

  it('turns a concurrent provider duplicate into an acknowledged duplicate', async () => {
    const duplicateError = Object.assign(new Error('duplicate'), { code: 'ER_DUP_ENTRY' });
    connectionQuery.mockRejectedValueOnce(duplicateError);
    webQuery.mockResolvedValueOnce([[{ id: 42 }]]);

    const result = await recordDonation(donation);

    expect(result.duplicate).toBe(true);
    expect(connection.rollback).toHaveBeenCalledTimes(1);
    expect(connection.commit).not.toHaveBeenCalled();
    expect(connection.release).toHaveBeenCalledTimes(1);
  });

  it('reads totals from the WebService-owned totals table', async () => {
    webQuery.mockResolvedValueOnce([[{ total_cents: '375' }]]);

    await expect(getAccountDonationTotal('Tester')).resolves.toBe(3.75);
    expect(webQuery).toHaveBeenCalledWith(
      'SELECT total_cents FROM web_donation_totals WHERE account_name = ?',
      ['Tester'],
    );
  });
});
