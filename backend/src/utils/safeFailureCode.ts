const allowedCodes = new Set([
  'ECONNREFUSED',
  'ECONNRESET',
  'ETIMEDOUT',
  'ENOTFOUND',
  'EPIPE',
  'PROTOCOL_CONNECTION_LOST',
  'PROTOCOL_SEQUENCE_TIMEOUT',
  'ER_ACCESS_DENIED_ERROR',
  'ER_BAD_DB_ERROR',
  'ER_NO_SUCH_TABLE',
  'ER_BAD_FIELD_ERROR',
  'ER_PARSE_ERROR',
  'ER_LOCK_DEADLOCK',
  'ER_LOCK_WAIT_TIMEOUT',
  'ER_DUP_ENTRY',
  'ER_NO_REFERENCED_ROW_2',
  'ER_ROW_IS_REFERENCED_2',
  'ER_DATA_TOO_LONG',
  'ER_TRUNCATED_WRONG_VALUE',
  'ER_QUERY_INTERRUPTED',
]);

/** Preserve actionable driver categories without forwarding messages, SQL or bindings. */
export function safeFailureCode(error: unknown): string {
  if (!error || typeof error !== 'object') return 'unclassified';
  try {
    const code: unknown = Object.getOwnPropertyDescriptor(error, 'code')?.value;
    return typeof code === 'string' && allowedCodes.has(code) ? code : 'unclassified';
  } catch {
    return 'unclassified';
  }
}
