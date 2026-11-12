import { randomUUID } from 'node:crypto';
import type { Response } from 'express';
import { AppError } from '../middleware/errorHandler.js';
import logger from './logger.js';
import { safeFailureCode } from './safeFailureCode.js';

/** True for an error whose message was written for the caller (an `AppError` below 500). */
export function isPublicError(error: unknown): error is AppError {
  return (
    error instanceof AppError &&
    Number.isInteger(error.statusCode) &&
    error.statusCode >= 400 &&
    error.statusCode < 500
  );
}

/**
 * Send a typed public error as-is; hide anything else behind a fixed message and a
 * reference. Only the reference and allowlisted failure code go to the server log (#176).
 */
export function sendRouteError(
  res: Response,
  error: unknown,
  publicMessage: string,
  context: string,
): Response {
  if (isPublicError(error)) return res.status(error.statusCode).json({ error: error.message });
  const reference = randomUUID();
  logger.error(context, {
    reference,
    code: safeFailureCode(error),
  });
  return res.status(500).json({ error: publicMessage, reference });
}
