import {
  parsePagination,
  validateBooleanField,
  validateObjectFields,
  validateStringField,
} from '../../utils/validation.js';

const CHANGELOG_WRITE_FIELDS = ['version', 'title', 'content', 'category', 'isPublished'] as const;

export function listPagination(page: unknown, limit: unknown) {
  if (
    [page, limit].some(
      (value) => value !== undefined && (typeof value !== 'string' || !/^\d+$/.test(value)),
    )
  ) {
    return null;
  }
  return parsePagination(
    typeof page === 'string' ? page : undefined,
    typeof limit === 'string' ? limit : undefined,
    20,
    100,
  );
}

export function validateChangelogWriteBody(
  body: unknown,
  requireCoreFields: boolean,
): string | null {
  const structureError = validateObjectFields(body, CHANGELOG_WRITE_FIELDS);
  if (structureError) {
    return structureError;
  }

  const values = body as Record<string, unknown>;
  const versionError = validateStringField(values.version, 'version', 50, requireCoreFields);
  if (versionError) {
    return versionError;
  }

  const titleError = validateStringField(values.title, 'title', 255, requireCoreFields);
  if (titleError) {
    return titleError;
  }

  const contentError = validateStringField(values.content, 'content', 50_000, requireCoreFields);
  if (contentError) {
    return contentError;
  }

  if (
    values.category !== undefined &&
    (typeof values.category !== 'string' || !['public', 'admin'].includes(values.category))
  ) {
    return 'category must be "public" or "admin"';
  }

  const publishedError = validateBooleanField(values.isPublished, 'isPublished');
  if (publishedError) {
    return publishedError;
  }

  if (!requireCoreFields && Object.keys(values).length === 0) {
    return 'At least one changelog field is required';
  }

  return null;
}
