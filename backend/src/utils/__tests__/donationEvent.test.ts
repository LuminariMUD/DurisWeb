import crypto from 'node:crypto';
import { describe, expect, it } from '@jest/globals';
import {
  buildDonationEvent,
  parseDonationAmountCents,
  sanitizeMudText,
  validateRedisNamespace,
} from '../donationEvent.js';

describe('donation event contract', () => {
  it('converts provider decimal amounts to exact integer cents', () => {
    expect(parseDonationAmountCents('25')).toBe(2500);
    expect(parseDonationAmountCents('25.5')).toBe(2550);
    expect(parseDonationAmountCents('0.01')).toBe(1);
  });

  it('rejects zero, negative, and over-precision amounts', () => {
    expect(() => parseDonationAmountCents('0')).toThrow();
    expect(() => parseDonationAmountCents('-1')).toThrow();
    expect(() => parseDonationAmountCents('1.234')).toThrow();
  });

  it('accepts only the MUD namespace shape', () => {
    expect(() => validateRedisNamespace('duris:production:main')).not.toThrow();
    expect(() => validateRedisNamespace('duris:local:test_1')).not.toThrow();
    expect(() => validateRedisNamespace('mud:nchat')).toThrow();
    expect(() => validateRedisNamespace('duris:production:Bad')).toThrow();
  });

  it('removes text that cannot cross the MUD color-control boundary', () => {
    expect(sanitizeMudText('safe text', 256)).toBe('safe text');
    expect(sanitizeMudText('unsafe & control', 256)).toBe('');
    expect(sanitizeMudText('unicode – text', 256)).toBe('');
    expect(sanitizeMudText('x'.repeat(257), 256)).toBe('');
  });

  it('builds the exact signed, namespaced envelope', () => {
    const secret = 's'.repeat(32);
    const now = 1_800_000_000;
    const input = {
      eventId: 'event-123456789012',
      issuedAt: now,
      amountCents: 2500,
      currency: 'USD',
      isPublic: true,
      characterName: 'Tester',
      message: 'Thank you',
      seasonEpoch: 7,
    };

    const result = buildDonationEvent(input, 'duris:production:main', secret, now);
    const canonical = 'v1\nevent-123456789012\n1800000000\n2500\nUSD\n1\nTester\nThank you';
    const expectedSignature = crypto.createHmac('sha256', secret).update(canonical).digest('hex');

    expect(result.channel).toBe('duris:production:main:season:7:nchat');
    expect(result.envelope).toEqual({
      schema_version: 1,
      event_id: input.eventId,
      issued_at: now,
      amount_cents: 2500,
      currency: 'USD',
      is_public: true,
      character_name: 'Tester',
      message: 'Thank you',
      signature: expectedSignature,
    });
  });

  it('downgrades an event to private when no safe character identity exists', () => {
    const result = buildDonationEvent(
      {
        eventId: 'event-123456789013',
        issuedAt: 1_800_000_000,
        amountCents: 1,
        currency: 'USD',
        isPublic: true,
        characterName: 'Bad & Name',
        message: null,
        seasonEpoch: 1,
      },
      'duris:local:test',
      's'.repeat(32),
      1_800_000_000,
    );

    expect(result.envelope.is_public).toBe(false);
    expect(result.envelope.character_name).toBe('');
  });
});
