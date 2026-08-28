import express from 'express';
import request from 'supertest';
import { beforeAll, describe, expect, it } from '@jest/globals';
import { errorHandler } from '../errorHandler.js';

let app: express.Express;

describe('global request error handling', () => {
  beforeAll(async () => {
    const { configureRequestBodyParsers } = await import('../requestLimits.js');

    app = express();
    configureRequestBodyParsers(app);
    app.post('/json', (_req, res) => res.json({ ok: true }));
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
});
