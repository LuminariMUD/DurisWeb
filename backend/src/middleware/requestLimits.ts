import express, { type Application } from 'express';

/**
 * Request-body limits are intentionally centralized so route additions cannot
 * silently fall back to Express/body-parser defaults.
 */
export const REQUEST_BODY_LIMITS = Object.freeze({
  json: '1mb',
  urlencoded: '256kb',
  urlencodedParameterLimit: 200,
});

export function configureRequestBodyParsers(app: Application): void {
  app.use(express.json({
    limit: REQUEST_BODY_LIMITS.json,
    strict: true,
  }));
  app.use(express.urlencoded({
    extended: true,
    limit: REQUEST_BODY_LIMITS.urlencoded,
    parameterLimit: REQUEST_BODY_LIMITS.urlencodedParameterLimit,
  }));
}
