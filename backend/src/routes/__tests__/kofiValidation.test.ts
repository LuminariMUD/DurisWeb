import crypto from 'node:crypto';
import express from 'express';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { resetBackendConfigurationForTests } from '../../config/environment.js';

const recordDonation =
  jest.fn<
    (...args: unknown[]) => Promise<{
      duplicate: boolean;
      eventId: string | null;
      accountName: string | null;
      characterName: string | null;
      amount: number;
      amountCents: number;
    }>
  >();
const logger = { error: jest.fn(), info: jest.fn(), warn: jest.fn() };

jest.unstable_mockModule('../../services/donationService', () => ({
  recordDonation,
}));
jest.unstable_mockModule('../../utils/logger.js', () => ({
  default: logger,
}));

const verificationToken = crypto.randomBytes(32).toString('hex');
let app: express.Express;

const validDonation = () => ({
  verification_token: verificationToken,
  message_id: `message-${crypto.randomUUID()}`,
  type: 'Donation',
  amount: '25.00',
  currency: 'USD',
  from_name: 'Supporter',
  email: 'supporter@example.invalid',
  message: 'Keep up the good work',
  is_public: true,
  timestamp: new Date().toISOString(),
  is_subscription_payment: false,
  is_first_subscription_payment: false,
  tier_name: null,
});

beforeAll(async () => {
  process.env.DONATIONS_ENABLED = 'true';
  process.env.MUD_REDIS_ENABLED = 'true';
  process.env.MUD_REDIS_AUTH_MODE = 'none';
  process.env.MUD_REDIS_HOST = 'redis.test.invalid';
  process.env.MUD_REDIS_PORT = '6379';
  process.env.MUD_REDIS_DB = '0';
  process.env.MUD_REDIS_TLS = 'false';
  process.env.MUD_REDIS_NAMESPACE = 'duris:local:test';
  process.env.KOFI_VERIFICATION_TOKEN = verificationToken;
  process.env.MUD_REDIS_DONATION_SECRET = crypto.randomBytes(32).toString('hex');
  resetBackendConfigurationForTests();
  const { default: kofiRoutes } = await import('../kofi.js');
  app = express();
  app.set('trust proxy', 1);
  app.use(express.json());
  app.use(express.urlencoded({ extended: false }));
  app.use('/', kofiRoutes);
});

beforeEach(() => {
  process.env.DONATIONS_ENABLED = 'true';
  process.env.KOFI_VERIFICATION_TOKEN = verificationToken;
  process.env.MUD_REDIS_DONATION_SECRET = crypto.randomBytes(32).toString('hex');
  resetBackendConfigurationForTests();
  jest.clearAllMocks();
  recordDonation.mockResolvedValue({
    duplicate: false,
    eventId: 'event-123456789012',
    accountName: null,
    characterName: null,
    amount: 25,
    amountCents: 2500,
  });
});

afterAll(() => {
  process.env.DONATIONS_ENABLED = 'false';
  delete process.env.KOFI_VERIFICATION_TOKEN;
  delete process.env.MUD_REDIS_DONATION_SECRET;
  resetBackendConfigurationForTests();
});

describe('Ko-fi webhook validation and authentication', () => {
  it('fails closed when donations are explicitly disabled', async () => {
    process.env.DONATIONS_ENABLED = 'false';
    resetBackendConfigurationForTests();

    const response = await request(app)
      .post('/')
      .set('X-Forwarded-For', '10.0.7.1')
      .send({ data: JSON.stringify(validDonation()) });

    expect(response.status).toBe(503);
    expect(recordDonation).not.toHaveBeenCalled();
  });

  it('rejects a wrong verification token before persistence', async () => {
    const donation = validDonation();
    donation.verification_token = crypto.randomBytes(32).toString('hex');

    const response = await request(app)
      .post('/')
      .set('X-Forwarded-For', '10.0.7.2')
      .send({ data: JSON.stringify(donation) });

    expect(response.status).toBe(403);
    expect(recordDonation).not.toHaveBeenCalled();
  });

  it('rejects invalid monetary values before persistence', async () => {
    const donation = validDonation();
    donation.amount = '-10';

    const response = await request(app)
      .post('/')
      .set('X-Forwarded-For', '10.0.7.3')
      .send({ data: JSON.stringify(donation) });

    expect(response.status).toBe(400);
    expect(recordDonation).not.toHaveBeenCalled();
  });

  it('rejects missing required provider fields before persistence', async () => {
    const donation = validDonation();
    delete (donation as Partial<typeof donation>).is_public;

    const response = await request(app)
      .post('/')
      .set('X-Forwarded-For', '10.0.7.6')
      .send({ data: JSON.stringify(donation) });

    expect(response.status).toBe(400);
    expect(recordDonation).not.toHaveBeenCalled();
  });

  it('accepts a valid signed webhook payload', async () => {
    const donation = validDonation();
    (donation as Record<string, unknown>).shop_items = [{ item: 'provider-specific-field' }];

    const response = await request(app)
      .post('/')
      .set('X-Forwarded-For', '10.0.7.4')
      .send({ data: JSON.stringify(donation) });

    expect(response.status).toBe(200);
    expect(recordDonation).toHaveBeenCalledTimes(1);
  });

  it('rejects an oversized nested provider payload before persistence', async () => {
    const donation = validDonation();
    donation.message = 'x'.repeat(20_000);

    const response = await request(app)
      .post('/')
      .set('X-Forwarded-For', '10.0.7.8')
      .send({ data: JSON.stringify(donation) });

    expect(response.status).toBe(413);
    expect(recordDonation).not.toHaveBeenCalled();
  });

  it('returns a retryable response when durable recording fails', async () => {
    recordDonation.mockRejectedValueOnce(new Error('database unavailable'));

    const response = await request(app)
      .post('/')
      .set('X-Forwarded-For', '10.0.7.9')
      .send({ data: JSON.stringify(validDonation()) });

    expect(response.status).toBe(503);
    expect(recordDonation).toHaveBeenCalledTimes(1);
  });

  it('rate-limits repeated webhook requests from one client', async () => {
    const ip = '10.0.7.5';
    let lastResponse;
    for (let attempt = 0; attempt < 31; attempt += 1) {
      lastResponse = await request(app)
        .post('/')
        .set('X-Forwarded-For', ip)
        .send({ data: JSON.stringify(validDonation()) });
    }

    expect(lastResponse!.status).toBe(429);
    expect(recordDonation).toHaveBeenCalledTimes(30);
  });
});
