import {
  validateIntegerField,
  validateObjectFields,
  validateStringField,
} from './validation.js';

const ANALYTICS_FIELDS = [
  'sessionId',
  'path',
  'pageTitle',
  'referrer',
  'utmSource',
  'utmMedium',
  'utmCampaign',
  'screenWidth',
  'screenHeight',
  'loadTimeMs',
] as const;

function validateNullableString(
  value: unknown,
  fieldName: string,
  maxLength: number,
  required = false,
): string | null {
  if (value === null && !required) return null;
  return validateStringField(value, fieldName, maxLength, required);
}

export function validateAnalyticsTrackingPayload(body: unknown): string | null {
  const objectError = validateObjectFields(body, ANALYTICS_FIELDS);
  if (objectError) return objectError;

  const value = body as Record<string, unknown>;
  const stringChecks: Array<[unknown, string, number, boolean]> = [
    [value.sessionId, 'sessionId', 128, true],
    [value.path, 'path', 2048, true],
    [value.pageTitle, 'pageTitle', 256, false],
    [value.referrer, 'referrer', 2048, false],
    [value.utmSource, 'utmSource', 256, false],
    [value.utmMedium, 'utmMedium', 256, false],
    [value.utmCampaign, 'utmCampaign', 256, false],
  ];

  for (const [fieldValue, fieldName, maxLength, required] of stringChecks) {
    const error = validateNullableString(fieldValue, fieldName, maxLength, required);
    if (error) return error;
  }

  const integerChecks: Array<[unknown, string, number, number]> = [
    [value.screenWidth, 'screenWidth', 1, 10000],
    [value.screenHeight, 'screenHeight', 1, 10000],
    [value.loadTimeMs, 'loadTimeMs', 0, 3600000],
  ];
  for (const [fieldValue, fieldName, min, max] of integerChecks) {
    const error = validateIntegerField(fieldValue, fieldName, {
      min,
      max,
      allowNull: true,
    });
    if (error) return error;
  }

  return null;
}
