import { randomUUID } from 'node:crypto';
import { Request, Response, NextFunction } from 'express';
import multer from 'multer';
import logger from '../utils/logger.js';
import { safeFailureCode } from '../utils/safeFailureCode.js';

export interface ApiError extends Error {
  statusCode?: number;
  isOperational?: boolean;
  /** Set by http-errors (body-parser) for a client error; its message may contain input. */
  expose?: boolean;
}

/**
 * Custom API Error class
 */
export class AppError extends Error implements ApiError {
  statusCode: number;
  isOperational: boolean;

  constructor(message: string, statusCode: number = 500) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = true;

    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * Global error handling middleware
 */
export function errorHandler(
  err: ApiError,
  req: Request,
  res: Response,
  _next: NextFunction,
): void {
  // Parser errors retain their client status but may embed request bodies in their message.
  // Only application and fixed upload errors carry text written for the caller (#176).
  const isUploadError = err instanceof multer.MulterError;
  const requested = isUploadError ? 400 : err.statusCode || 0;
  const isPublic =
    Number.isInteger(requested) &&
    requested >= 400 &&
    requested < 500 &&
    (isUploadError || err instanceof AppError || err.expose === true);
  const statusCode = isPublic ? requested : 500;
  const message = !isPublic
    ? 'Internal Server Error'
    : err instanceof AppError || isUploadError
      ? err.message
      : requested === 413
        ? 'Request body too large'
        : 'Invalid request';
  const reference = isPublic ? undefined : randomUUID();

  logger.error('Request failed', {
    statusCode,
    reference,
    method: req.method,
    code: safeFailureCode(err),
  });

  res.status(statusCode).json({
    success: false,
    error: {
      message,
      statusCode,
      ...(reference && { reference }),
    },
  });
}

/**
 * 404 Not Found handler
 */
export function notFoundHandler(req: Request, _res: Response, next: NextFunction): void {
  const error = new AppError(`Route ${req.originalUrl} not found`, 404);
  next(error);
}

/** Reserve the API namespace before static files and the Vue history fallback. */
export function apiNotFound(_req: Request, res: Response): void {
  res.set('Cache-Control', 'no-store').status(404).json({ error: 'API route not found' });
}

/**
 * Async error wrapper - catches errors in async route handlers
 */
export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<any>,
) {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}
