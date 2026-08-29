import { validateObjectFields, validateStringField } from './validation.js';

const MUD_CONTROL_REASON_FIELDS = ['reason'] as const;

export function validateMudControlReasonPayload(body: unknown): string | null {
  const objectError = validateObjectFields(body, MUD_CONTROL_REASON_FIELDS);
  if (objectError) return objectError;
  return validateStringField(
    (body as Record<string, unknown>).reason,
    'reason',
    1000,
    true,
  );
}
