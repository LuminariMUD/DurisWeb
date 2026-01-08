/**
 * Input validation utilities for route handlers
 * Provides safe parsing and bounds checking for common parameter types
 */

/**
 * Parse an integer from a string with bounds checking
 * Returns the default value if the input is invalid, NaN, or out of bounds
 */
export function parseIntSafe(
  value: string | undefined,
  defaultValue: number,
  min?: number,
  max?: number
): number {
  if (value === undefined || value === '') {
    return defaultValue;
  }

  const parsed = parseInt(value, 10);

  if (isNaN(parsed)) {
    return defaultValue;
  }

  if (min !== undefined && parsed < min) {
    return min;
  }

  if (max !== undefined && parsed > max) {
    return max;
  }

  return parsed;
}

/**
 * Parse a float from a string with bounds checking
 */
export function parseFloatSafe(
  value: string | undefined,
  defaultValue: number,
  min?: number,
  max?: number
): number {
  if (value === undefined || value === '') {
    return defaultValue;
  }

  const parsed = parseFloat(value);

  if (isNaN(parsed) || !isFinite(parsed)) {
    return defaultValue;
  }

  if (min !== undefined && parsed < min) {
    return min;
  }

  if (max !== undefined && parsed > max) {
    return max;
  }

  return parsed;
}

/**
 * Parse pagination parameters with safe bounds
 */
export function parsePagination(
  pageParam: string | undefined,
  limitParam: string | undefined,
  defaultLimit: number = 50,
  maxLimit: number = 100
): { page: number; limit: number } {
  return {
    page: parseIntSafe(pageParam, 1, 1, 10000),
    limit: parseIntSafe(limitParam, defaultLimit, 1, maxLimit),
  };
}

/**
 * Validate that a string ID parameter is a positive integer
 * Returns null if invalid
 */
export function validateIdParam(value: string | undefined): number | null {
  if (value === undefined || value === '') {
    return null;
  }

  const parsed = parseInt(value, 10);

  if (isNaN(parsed) || parsed <= 0) {
    return null;
  }

  return parsed;
}

/**
 * Sanitize a string for use in searches
 * Removes potentially dangerous characters while preserving search functionality
 */
export function sanitizeSearchString(value: string | undefined, maxLength: number = 100): string {
  if (!value) {
    return '';
  }

  // Trim and limit length
  let sanitized = value.trim().slice(0, maxLength);

  // Remove null bytes and control characters (except newlines/tabs)
  sanitized = sanitized.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');

  return sanitized;
}

/**
 * Validate that a value is one of allowed values
 */
export function validateEnum<T extends string>(
  value: string | undefined,
  allowedValues: readonly T[],
  defaultValue: T
): T {
  if (!value) {
    return defaultValue;
  }

  if (allowedValues.includes(value as T)) {
    return value as T;
  }

  return defaultValue;
}

/**
 * Parse a boolean query parameter
 * Accepts 'true', '1', 'yes' as true; everything else is false
 */
export function parseBooleanSafe(value: string | undefined, defaultValue: boolean = false): boolean {
  if (value === undefined || value === '') {
    return defaultValue;
  }

  const lowerValue = value.toLowerCase();
  return lowerValue === 'true' || lowerValue === '1' || lowerValue === 'yes';
}

/**
 * Validate a date string (YYYY-MM-DD format)
 * Returns null if invalid
 */
export function validateDateString(value: string | undefined): string | null {
  if (!value) {
    return null;
  }

  // Check format
  const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
  if (!dateRegex.test(value)) {
    return null;
  }

  // Check if it's a valid date
  const date = new Date(value);
  if (isNaN(date.getTime())) {
    return null;
  }

  return value;
}

/**
 * Validate hour parameter (0-23)
 */
export function validateHour(value: string | undefined): number | undefined {
  if (value === undefined || value === '') {
    return undefined;
  }

  const parsed = parseInt(value, 10);

  if (isNaN(parsed) || parsed < 0 || parsed > 23) {
    return undefined;
  }

  return parsed;
}
