import { validateBooleanField, validateIntegerField, validateObjectFields } from './validation.js';

const ZONE_UPDATE_FIELDS = [
  'epicType',
  'alignment',
  'suggestedGroupSize',
  'difficulty',
  'epicPayout',
  'taskZone',
  'questZone',
  'trophyZone',
  'randomsZone',
] as const;
const BULK_ZONE_FIELDS = ['zoneNumbers', 'data'] as const;

export function parseZoneNumber(value: string | undefined): number | null {
  if (!value || !/^(?:0|[1-9]\d*)$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

export function validateZoneUpdatePayload(body: unknown): string | null {
  const objectError = validateObjectFields(body, ZONE_UPDATE_FIELDS);
  if (objectError) return objectError;

  const value = body as Record<string, unknown>;
  if (Object.keys(value).length === 0) return 'At least one zone field is required';

  const integerChecks: Array<[unknown, string, number, number]> = [
    [value.epicType, 'epicType', 0, 3],
    [value.alignment, 'alignment', -5, 5],
    [value.suggestedGroupSize, 'suggestedGroupSize', 1, 20],
    [value.difficulty, 'difficulty', 0, 10],
    [value.epicPayout, 'epicPayout', 0, 500],
  ];
  for (const [fieldValue, fieldName, min, max] of integerChecks) {
    const error = validateIntegerField(fieldValue, fieldName, { min, max });
    if (error) return error;
  }

  for (const fieldName of ['taskZone', 'questZone', 'trophyZone', 'randomsZone']) {
    const error = validateBooleanField(value[fieldName], fieldName);
    if (error) return error;
  }

  return null;
}

export function validateBulkZoneUpdatePayload(body: unknown): string | null {
  const objectError = validateObjectFields(body, BULK_ZONE_FIELDS);
  if (objectError) return objectError;

  const value = body as Record<string, unknown>;
  if (!Array.isArray(value.zoneNumbers) || value.zoneNumbers.length === 0) {
    return 'zoneNumbers must be a non-empty array';
  }
  if (value.zoneNumbers.length > 1000) {
    return 'zoneNumbers must contain at most 1000 entries';
  }

  for (const zoneNumber of value.zoneNumbers) {
    const error = validateIntegerField(zoneNumber, 'zoneNumbers[]', { min: 0, max: 1000000000 });
    if (error) return error;
  }

  if (value.data === null || typeof value.data !== 'object' || Array.isArray(value.data)) {
    return 'data object is required';
  }
  return validateZoneUpdatePayload(value.data);
}
