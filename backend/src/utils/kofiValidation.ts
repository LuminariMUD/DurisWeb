import { validateBooleanField, validateStringField } from './validation.js';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const AMOUNT_PATTERN = /^(?:0|[1-9]\d*)(?:\.\d{1,2})?$/;

/**
 * Validate the stable Ko-fi webhook fields that are consumed by accounting and
 * MUD notification code. Unknown provider fields are intentionally tolerated so
 * Ko-fi can add event-specific fields without breaking delivery.
 */
export function validateKofiDonationPayload(value: unknown): string | null {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return 'Webhook payload must be an object';
  }

  const payload = value as Record<string, unknown>;
  const requiredStringFields: Array<[unknown, string, number]> = [
    [payload.message_id, 'message_id', 200],
    [payload.type, 'type', 64],
    [payload.amount, 'amount', 32],
    [payload.currency, 'currency', 3],
    [payload.from_name, 'from_name', 200],
    [payload.email, 'email', 320],
    [payload.timestamp, 'timestamp', 64],
  ];

  for (const [fieldValue, fieldName, maxLength] of requiredStringFields) {
    const error = validateStringField(fieldValue, fieldName, maxLength, true);
    if (error) return error;
  }

  if (!/^[A-Z]{3}$/.test(payload.currency as string)) {
    return 'currency must be a three-letter uppercase code';
  }
  if (!EMAIL_PATTERN.test(payload.email as string)) {
    return 'email must be valid';
  }
  if (!AMOUNT_PATTERN.test(payload.amount as string)) {
    return 'amount must be a positive decimal with at most two fractional digits';
  }

  const amount = Number(payload.amount);
  if (!Number.isFinite(amount) || amount <= 0 || amount > 1_000_000) {
    return 'amount must be greater than 0 and at most 1000000';
  }

  const timestamp = Date.parse(payload.timestamp as string);
  if (!Number.isFinite(timestamp)) {
    return 'timestamp must be a valid date';
  }

  for (const fieldName of [
    'is_public',
    'is_subscription_payment',
    'is_first_subscription_payment',
  ]) {
    if (!(fieldName in payload)) {
      return `${fieldName} is required`;
    }
    const error = validateBooleanField(payload[fieldName], fieldName);
    if (error) return error;
  }

  for (const fieldName of ['message', 'tier_name']) {
    const fieldValue = payload[fieldName];
    if (fieldValue !== null && fieldValue !== undefined) {
      const error = validateStringField(
        fieldValue,
        fieldName,
        fieldName === 'message' ? 4000 : 200,
      );
      if (error) return error;
    }
  }

  return null;
}
