import { randomUUID } from 'node:crypto';
import type { Response } from 'express';
import { AppError } from '../middleware/errorHandler.js';
import logger, { getErrorMessage } from './logger.js';
import { safeFailureCode } from './safeFailureCode.js';

/** True for an error whose message was written for the caller (an `AppError` below 500). */
export function isPublicError(error: unknown): error is AppError {
  return error instanceof AppError && error.statusCode < 500;
}

/**
 * Send a typed public error as-is; hide anything else behind a fixed message and a
 * reference. The reference, failure code and original message go to the server log only (#176).
 */
export function sendRouteError(
  res: Response,
  error: unknown,
  publicMessage: string,
  context: string,
): Response {
  if (isPublicError(error)) return res.status(error.statusCode).json({ error: error.message });
  const reference = randomUUID();
  // The server log keeps the detail the response hides, as the routes' own error logs do.
  logger.error(context, {
    reference,
    code: safeFailureCode(error),
    message: getErrorMessage(error),
  });
  return res.status(500).json({ error: publicMessage, reference });
}
