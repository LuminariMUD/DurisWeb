import express from 'express';
import request from 'supertest';
import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { AppError } from '../../middleware/errorHandler.js';
import logger from '../logger.js';
import { sendRouteError } from '../routeError.js';

function appRejectingWith(error: unknown) {
  const app = express();
  app.get('/', (_req, res) => {
    sendRouteError(res, error, 'Failed to load thing', 'Load thing failed');
  });
  return app;
}

describe('sendRouteError', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('replaces internal error text with the public message and a logged reference', async () => {
    const log = jest.spyOn(logger, 'error').mockImplementation(() => logger);
    const error = Object.assign(new Error("Access denied for user 'SENTINEL'@'localhost'"), {
      code: 'ER_ACCESS_DENIED_ERROR',
      sql: 'SELECT SENTINEL',
    });

    const response = await request(appRejectingWith(error)).get('/');

    expect(response.status).toBe(500);
    expect(response.body).toEqual({
      error: 'Failed to load thing',
      reference: expect.stringMatching(/^[0-9a-f-]{36}$/),
    });
    expect(log.mock.calls).toEqual([
      [
        'Load thing failed',
        {
          reference: response.body.reference,
          code: 'ER_ACCESS_DENIED_ERROR',
        },
      ],
    ]);
    expect(JSON.stringify(log.mock.calls)).not.toContain('SELECT SENTINEL');
    expect(JSON.stringify(log.mock.calls)).not.toContain('SENTINEL');
  });

  it('passes a client AppError through unchanged', async () => {
    const response = await request(appRejectingWith(new AppError('Poll not found', 404))).get('/');

    expect(response.status).toBe(404);
    expect(response.body).toEqual({ error: 'Poll not found' });
  });

  it('hides a 5xx AppError', async () => {
    jest.spyOn(logger, 'error').mockImplementation(() => logger);
    const response = await request(appRejectingWith(new AppError('EACCES /srv/x', 503))).get('/');

    expect(response.status).toBe(500);
    expect(response.body.error).toBe('Failed to load thing');
  });

  it.each([0, 200, 399, 400.5, Number.NaN, Number.POSITIVE_INFINITY])(
    'does not publish an AppError with invalid client status %s',
    async (status) => {
      jest.spyOn(logger, 'error').mockImplementation(() => logger);
      const response = await request(appRejectingWith(new AppError('SENTINEL', status))).get('/');
      expect(response.status).toBe(500);
      expect(response.body.error).toBe('Failed to load thing');
      expect(JSON.stringify(response.body)).not.toContain('SENTINEL');
    },
  );
});
