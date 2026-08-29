import crypto from 'node:crypto';
import express from 'express';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it, jest } from '@jest/globals';

const isDuplicateDonation = jest.fn<(...args: unknown[]) => Promise<boolean>>();
const processDonation = jest.fn<(...args: unknown[]) => Promise<unknown>>();
const publishDonationToMud = jest.fn<(...args: unknown[]) => Promise<void>>();
const logger = { error: jest.fn(), info: jest.fn(), warn: jest.fn() };

jest.unstable_mockModule('../../services/donationService.js', () => ({
  isDuplicateDonation,
  processDonation,
  publishDonationToMud,
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
  process.env.KOFI_VERIFICATION_TOKEN = verificationToken;
  const { default: kofiRoutes } = await import('../kofi.js');
  app = express();
  app.set('trust proxy', 1);
  app.use(express.json());
  app.use(express.urlencoded({ extended: false }));
  app.use('/', kofiRoutes);
});

beforeEach(() => {
  process.env.KOFI_VERIFICATION_TOKEN = verificationToken;
  jest.clearAllMocks();
  isDuplicateDonation.mockResolvedValue(false);
  processDonation.mockResolvedValue({ characterName: null, amount: 25 });
  publishDonationToMud.mockResolvedValue(undefined);
});

afterAll(() => {
  delete process.env.KOFI_VERIFICATION_TOKEN;
});

describe('Ko-fi webhook validation and authentication', () => {
  it('fails closed when the verification token is not configured', async () => {
    delete process.env.KOFI_VERIFICATION_TOKEN;

    const response = await request(app)
      .post('/')
      .set('X-Forwarded-For', '10.0.7.1')
      .send({ data: JSON.stringify(validDonation()) });

    expect(response.status).toBe(503);
    expect(processDonation).not.toHaveBeenCalled();
  });

  it('rejects a wrong verification token before persistence', async () => {
    const donation = validDonation();
    donation.verification_token = crypto.randomBytes(32).toString('hex');

    const response = await request(app)
      .post('/')
      .set('X-Forwarded-For', '10.0.7.2')
      .send({ data: JSON.stringify(donation) });

    expect(response.status).toBe(403);
    expect(processDonation).not.toHaveBeenCalled();
  });

  it('rejects invalid monetary values before persistence', async () => {
    const donation = validDonation();
    donation.amount = '-10';

    const response = await request(app)
      .post('/')
      .set('X-Forwarded-For', '10.0.7.3')
      .send({ data: JSON.stringify(donation) });

    expect(response.status).toBe(400);
    expect(processDonation).not.toHaveBeenCalled();
  });

  it('rejects missing required provider fields before persistence', async () => {
    const donation = validDonation();
    delete (donation as Partial<typeof donation>).is_public;

    const response = await request(app)
      .post('/')
      .set('X-Forwarded-For', '10.0.7.6')
      .send({ data: JSON.stringify(donation) });

    expect(response.status).toBe(400);
    expect(processDonation).not.toHaveBeenCalled();
  });

  it('accepts a valid signed webhook payload', async () => {
    const donation = validDonation();
    (donation as Record<string, unknown>).shop_items = [{ item: 'provider-specific-field' }];

    const response = await request(app)
      .post('/')
      .set('X-Forwarded-For', '10.0.7.4')
      .send({ data: JSON.stringify(donation) });

    expect(response.status).toBe(200);
    expect(processDonation).toHaveBeenCalledTimes(1);
    expect(publishDonationToMud).toHaveBeenCalledTimes(1);
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
    expect(processDonation).toHaveBeenCalledTimes(30);
  });
});
