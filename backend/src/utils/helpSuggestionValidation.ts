import {
  validateIntegerField,
  validateObjectFields,
  validateStringField,
} from './validation.js';

const CREATE_FIELDS = [
  'suggestionType',
  'pageId',
  'title',
  'text',
  'categoryId',
  'seeAlso',
  'submitterNotes',
] as const;
const UPDATE_FIELDS = ['title', 'text', 'categoryId', 'seeAlso', 'submitterNotes'] as const;
const REVIEW_FIELDS = ['action', 'reviewerNotes'] as const;

function validateNullableString(
  value: unknown,
  fieldName: string,
  maxLength: number,
): string | null {
  if (value === null) return null;
  return validateStringField(value, fieldName, maxLength);
}

function validateSuggestionFields(
  value: Record<string, unknown>,
  requireTitleAndText: boolean,
): string | null {
  const titleError = validateStringField(value.title, 'title', 200, requireTitleAndText);
  if (titleError) return titleError;

  const textError = validateStringField(value.text, 'text', 20000, requireTitleAndText);
  if (textError) return textError;

  const pageIdError = validateIntegerField(value.pageId, 'pageId', {
    min: 1,
    max: 1000000000,
    allowNull: !requireTitleAndText,
  });
  if (pageIdError) return pageIdError;

  const categoryIdError = validateIntegerField(value.categoryId, 'categoryId', {
    min: 0,
    max: 1000,
    allowNull: true,
  });
  if (categoryIdError) return categoryIdError;

  const seeAlsoError = validateNullableString(value.seeAlso, 'seeAlso', 2000);
  if (seeAlsoError) return seeAlsoError;

  return validateNullableString(value.submitterNotes, 'submitterNotes', 5000);
}

export function validateCreateHelpSuggestionPayload(body: unknown): string | null {
  const objectError = validateObjectFields(body, CREATE_FIELDS);
  if (objectError) return objectError;

  const value = body as Record<string, unknown>;
  if (typeof value.suggestionType !== 'string' || !['new', 'edit'].includes(value.suggestionType)) {
    return 'suggestionType must be new or edit';
  }

  if (value.suggestionType === 'edit' && (value.pageId === undefined || value.pageId === null)) {
    return 'pageId is required for edit suggestions';
  }

  return validateSuggestionFields(value, true);
}

export function validateUpdateHelpSuggestionPayload(body: unknown): string | null {
  const objectError = validateObjectFields(body, UPDATE_FIELDS);
  if (objectError) return objectError;

  const value = body as Record<string, unknown>;
  if (Object.keys(value).length === 0) return 'At least one update field is required';
  return validateSuggestionFields(value, false);
}

export function validateReviewHelpSuggestionPayload(body: unknown): string | null {
  const objectError = validateObjectFields(body, REVIEW_FIELDS);
  if (objectError) return objectError;

  const value = body as Record<string, unknown>;
  if (typeof value.action !== 'string' || !['approve', 'reject', 'needs_revision'].includes(value.action)) {
    return 'Invalid review action';
  }

  return validateNullableString(value.reviewerNotes, 'reviewerNotes', 5000);
}

export function parseHelpSuggestionId(value: string | undefined): number | null {
  if (!value || !/^[1-9]\d*$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : null;
}
