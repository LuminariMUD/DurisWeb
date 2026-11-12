import express from 'express';
import request from 'supertest';
import { beforeAll, describe, expect, it } from '@jest/globals';
import { AppError, asyncHandler, errorHandler } from '../errorHandler.js';

let app: express.Express;

describe('global request error handling', () => {
  beforeAll(async () => {
    const { configureRequestBodyParsers } = await import('../requestLimits.js');

    app = express();
    configureRequestBodyParsers(app);
    app.post('/json', (_req, res) => res.json({ ok: true }));
    app.get(
      '/driver',
      asyncHandler(async () => {
        throw Object.assign(new Error("Table 'duris.secret_table' doesn't exist"), {
          code: 'ER_NO_SUCH_TABLE',
        });
      }),
    );
    app.get(
      '/public',
      asyncHandler(async () => {
        throw new AppError('Bid too low', 400);
      }),
    );
    app.get(
      '/internal-app-error',
      asyncHandler(async () => {
        throw new AppError('ECONNREFUSED 127.0.0.1:3307', 503);
      }),
    );
    app.use(errorHandler);
  });

  it('returns 413 for an oversized body instead of converting it to 500', async () => {
    const response = await request(app)
      .post('/json')
      .set('Content-Type', 'application/json')
      .send({ payload: 'x'.repeat(1_048_577) });

    expect(response.status).toBe(413);
    expect(response.body.error.statusCode).toBe(413);
  });

  it('returns 400 for malformed JSON instead of converting it to 500', async () => {
    const response = await request(app)
      .post('/json')
      .set('Content-Type', 'application/json')
      .send('{"payload":');

    expect(response.status).toBe(400);
    expect(response.body.error.statusCode).toBe(400);
  });

  it('hides driver text behind a generic 500 with a reference', async () => {
    const response = await request(app).get('/driver');

    expect(response.status).toBe(500);
    expect(JSON.stringify(response.body)).not.toContain('secret_table');
    expect(response.body.error).toEqual({
      message: 'Internal Server Error',
      statusCode: 500,
      reference: expect.stringMatching(/^[0-9a-f-]{36}$/),
    });
  });

  it('keeps the message of a client AppError', async () => {
    const response = await request(app).get('/public');

    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      success: false,
      error: { message: 'Bid too low', statusCode: 400 },
    });
  });

  it('treats a 5xx AppError as internal', async () => {
    const response = await request(app).get('/internal-app-error');

    expect(response.status).toBe(500);
    expect(JSON.stringify(response.body)).not.toContain('ECONNREFUSED');
  });
});
