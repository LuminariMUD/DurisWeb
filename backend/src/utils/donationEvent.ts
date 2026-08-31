import crypto from 'node:crypto';

const EVENT_ID_PATTERN = /^[A-Za-z0-9_-]{16,64}$/;
const NAMESPACE_PREFIX_PATTERN = /^duris:(local|production):/;
const DEPLOYMENT_PATTERN = /^[a-z0-9](?:[a-z0-9_-]{0,30}[a-z0-9])?$/;
const CURRENCY_PATTERN = /^[A-Z]{3}$/;
const AMOUNT_PATTERN = /^(?:0|[1-9]\d*)(?:\.\d{1,2})?$/;
const MAX_AMOUNT_CENTS = 100_000_000;
const MAX_CLOCK_SKEW_SECONDS = 300;

export class DonationDeliveryConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DonationDeliveryConfigurationError';
  }
}

export interface DonationEventInput {
  eventId: string;
  issuedAt: number;
  amountCents: number;
  currency: string;
  isPublic: boolean;
  characterName: string | null;
  message: string | null;
  seasonEpoch: number;
}

export interface DonationEventEnvelope {
  schema_version: 1;
  event_id: string;
  issued_at: number;
  amount_cents: number;
  currency: string;
  is_public: boolean;
  character_name: string;
  message: string;
  signature: string;
}

export interface BuiltDonationEvent {
  channel: string;
  envelope: DonationEventEnvelope;
}

export function parseDonationAmountCents(value: string): number {
  if (!AMOUNT_PATTERN.test(value)) {
    throw new Error('Donation amount must be a positive decimal with at most two fractional digits');
  }

  const [wholePart, fractionPart = ''] = value.split('.');
  const whole = Number(wholePart);
  const cents = whole * 100 + Number(fractionPart.padEnd(2, '0'));

  if (!Number.isSafeInteger(cents) || cents < 1 || cents > MAX_AMOUNT_CENTS) {
    throw new Error('Donation amount is outside the supported range');
  }

  return cents;
}

export function validateRedisNamespace(value: string): void {
  if (!NAMESPACE_PREFIX_PATTERN.test(value)) {
    throw new Error('REDIS_NAMESPACE must start with duris:local: or duris:production:');
  }

  const deployment = value.slice(value.indexOf(':', 'duris:'.length) + 1);
  if (!DEPLOYMENT_PATTERN.test(deployment)) {
    throw new Error('REDIS_NAMESPACE deployment must use lowercase letters, digits, hyphens, or underscores');
  }
}

export function sanitizeMudText(value: string | null | undefined, maxBytes: number): string {
  if (!value) return '';
  if (Buffer.byteLength(value, 'utf8') > maxBytes || !/^[\x20-\x7e]*$/.test(value) || value.includes('&')) {
    return '';
  }
  return value;
}

export function buildDonationEvent(
  input: DonationEventInput,
  namespace: string,
  secret: string,
  now = Math.floor(Date.now() / 1000),
): BuiltDonationEvent {
  if (!EVENT_ID_PATTERN.test(input.eventId)) {
    throw new Error('Donation event ID has an invalid format');
  }
  if (!Number.isInteger(input.issuedAt) || Math.abs(input.issuedAt - now) > MAX_CLOCK_SKEW_SECONDS) {
    throw new Error('Donation event timestamp is outside the accepted clock window');
  }
  if (!Number.isSafeInteger(input.amountCents) || input.amountCents < 1 || input.amountCents > MAX_AMOUNT_CENTS) {
    throw new Error('Donation event amount is outside the supported range');
  }
  if (!CURRENCY_PATTERN.test(input.currency)) {
    throw new Error('Donation event currency must be a three-letter uppercase code');
  }
  if (!Number.isSafeInteger(input.seasonEpoch) || input.seasonEpoch < 1) {
    throw new Error('Donation event season epoch is invalid');
  }
  validateRedisNamespace(namespace);
  if (Buffer.byteLength(secret, 'utf8') < 32) {
    throw new Error('REDIS_DONATION_SECRET must contain at least 32 bytes');
  }

  const characterName = sanitizeMudText(input.characterName, 32);
  const message = sanitizeMudText(input.message, 256);
  const isPublic = input.isPublic && characterName.length > 0;
  const canonical = [
    'v1',
    input.eventId,
    input.issuedAt,
    input.amountCents,
    input.currency,
    isPublic ? 1 : 0,
    characterName,
    message,
  ].join('\n');
  const signature = crypto.createHmac('sha256', secret).update(canonical, 'utf8').digest('hex');

  return {
    channel: `${namespace}:season:${input.seasonEpoch}:nchat`,
    envelope: {
      schema_version: 1,
      event_id: input.eventId,
      issued_at: input.issuedAt,
      amount_cents: input.amountCents,
      currency: input.currency,
      is_public: isPublic,
      character_name: characterName,
      message,
      signature,
    },
  };
}
