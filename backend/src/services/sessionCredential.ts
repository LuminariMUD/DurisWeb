import { createHash } from 'node:crypto';

/** Hash the exact issued bytes; this is not JWT signature/type validation. */
export function refreshTokenDigest(token: unknown): Buffer | null {
  if (typeof token !== 'string' || token.length === 0) return null;
  return createHash('sha256').update(token, 'utf8').digest();
}
