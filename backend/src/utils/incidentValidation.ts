import { validateBooleanField, validateObjectFields, validateStringField } from './validation.js';

export const INCIDENT_CREATE_FIELDS = [
  'incident_type',
  'severity',
  'title',
  'description',
  'started_at',
  'ended_at',
  'resolved',
  'public_visible',
] as const;

export const INCIDENT_UPDATE_FIELDS = [
  'incident_type',
  'severity',
  'title',
  'description',
  'started_at',
  'ended_at',
  'resolved',
  'resolution_notes',
  'public_visible',
  'detected_by',
  'exit_code',
  'crash_signal',
  'shutdown_reason',
  'pid',
  'uptime_seconds',
  'memory_mb',
  'cpu_percent',
  'core_dump_path',
  'core_dump_size_bytes',
  'has_backtrace',
  'backtrace',
  'crash_function',
  'crash_file',
  'crash_line',
  'exit_log_excerpt',
  'debug_log_excerpt',
  'online_players',
  'last_command',
  'analyzed',
  'notes',
] as const;

const INCIDENT_TYPES = ['crash', 'maintenance', 'degraded', 'outage'] as const;
const SEVERITIES = ['critical', 'major', 'minor', 'info'] as const;
const DETECTION_SOURCES = ['exit_log', 'process_monitor', 'manual'] as const;

type IncidentRecord = Record<string, unknown>;

function isRecord(value: unknown): value is IncidentRecord {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function validateNullableString(
  value: unknown,
  fieldName: string,
  maxLength: number,
): string | null {
  if (value === undefined || value === null) return null;
  return validateStringField(value, fieldName, maxLength);
}

function validateEnumValue(
  value: unknown,
  fieldName: string,
  allowedValues: readonly string[],
): string | null {
  if (value === undefined) return null;
  if (typeof value !== 'string' || !allowedValues.includes(value)) {
    return `${fieldName} must be one of: ${allowedValues.join(', ')}`;
  }
  return null;
}

function validateDateTime(value: unknown, fieldName: string, required = false): string | null {
  if (value === undefined || value === null || value === '') {
    return required ? `${fieldName} is required` : null;
  }
  if (typeof value !== 'string' || !Number.isFinite(new Date(value).getTime())) {
    return `${fieldName} must be a valid date-time`;
  }
  return null;
}

function validateNumber(
  value: unknown,
  fieldName: string,
  options: { integer?: boolean; min?: number; max?: number } = {},
): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return `${fieldName} must be a finite number`;
  }
  if (options.integer && !Number.isInteger(value)) {
    return `${fieldName} must be an integer`;
  }
  if (options.min !== undefined && value < options.min) {
    return `${fieldName} must be at least ${options.min}`;
  }
  if (options.max !== undefined && value > options.max) {
    return `${fieldName} must be at most ${options.max}`;
  }
  return null;
}

function validateIncidentCommon(values: IncidentRecord, requireCoreFields: boolean): string | null {
  const typeError = validateEnumValue(values.incident_type, 'incident_type', INCIDENT_TYPES);
  if (typeError) return typeError;

  const severityError = validateEnumValue(values.severity, 'severity', SEVERITIES);
  if (severityError) return severityError;

  const titleError = validateStringField(values.title, 'title', 255, requireCoreFields);
  if (titleError) return titleError;

  const stringFields: Array<[string, number]> = [
    ['description', 100_000],
    ['resolution_notes', 100_000],
    ['shutdown_reason', 255],
    ['crash_signal', 20],
    ['core_dump_path', 512],
    ['backtrace', 100_000],
    ['crash_function', 255],
    ['crash_file', 255],
    ['exit_log_excerpt', 100_000],
    ['debug_log_excerpt', 100_000],
    ['last_command', 100_000],
    ['notes', 100_000],
    ['wholist_snapshot', 100_000],
    ['cmd_debug_last3', 100_000],
    ['status_log_last3', 100_000],
    ['wizcmds_last3', 100_000],
  ];
  for (const [fieldName, maxLength] of stringFields) {
    const error = validateNullableString(values[fieldName], fieldName, maxLength);
    if (error) return error;
  }

  const detectedByError = validateEnumValue(values.detected_by, 'detected_by', DETECTION_SOURCES);
  if (detectedByError) return detectedByError;

  for (const fieldName of ['started_at', 'ended_at']) {
    const error = validateDateTime(
      values[fieldName],
      fieldName,
      fieldName === 'started_at' &&
        (requireCoreFields || Object.prototype.hasOwnProperty.call(values, fieldName)),
    );
    if (error) return error;
  }

  for (const fieldName of ['resolved', 'public_visible', 'has_backtrace', 'analyzed']) {
    const error = validateBooleanField(values[fieldName], fieldName);
    if (error) return error;
  }

  const integerFields: Array<[string, number | undefined, number | undefined]> = [
    ['exit_code', undefined, undefined],
    ['pid', 1, 2_147_483_647],
    ['uptime_seconds', 0, 2_147_483_647],
    ['core_dump_size_bytes', 0, Number.MAX_SAFE_INTEGER],
    ['crash_line', 1, 2_147_483_647],
    ['online_players', 0, 2_147_483_647],
  ];
  for (const [fieldName, min, max] of integerFields) {
    const error = validateNumber(values[fieldName], fieldName, { integer: true, min, max });
    if (error) return error;
  }

  for (const fieldName of ['memory_mb', 'cpu_percent']) {
    const error = validateNumber(values[fieldName], fieldName, { min: 0, max: 1_000_000 });
    if (error) return error;
  }

  if (values.started_at && values.ended_at) {
    const startedAt = new Date(String(values.started_at)).getTime();
    const endedAt = new Date(String(values.ended_at)).getTime();
    if (Number.isFinite(startedAt) && Number.isFinite(endedAt) && endedAt < startedAt) {
      return 'ended_at must be at or after started_at';
    }
  }

  return null;
}

export function validateCreateIncidentBody(value: unknown): string | null {
  const structureError = validateObjectFields(value, INCIDENT_CREATE_FIELDS);
  if (structureError) return structureError;
  if (!isRecord(value)) return 'Request body must be an object';
  return validateIncidentCommon(value, true);
}

export function validateUpdateIncidentBody(value: unknown): string | null {
  const structureError = validateObjectFields(value, INCIDENT_UPDATE_FIELDS);
  if (structureError) return structureError;
  if (!isRecord(value)) return 'Request body must be an object';
  if (Object.keys(value).length === 0) return 'At least one incident field is required';
  return validateIncidentCommon(value, false);
}
