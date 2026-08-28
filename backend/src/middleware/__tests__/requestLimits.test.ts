import express from 'express';
import request from 'supertest';
import { beforeAll, describe, expect, it } from '@jest/globals';

let app: express.Express;

describe('request body limits', () => {
  beforeAll(async () => {
    const { configureRequestBodyParsers } = await import('../requestLimits.js');

    app = express();
    configureRequestBodyParsers(app);
    app.post('/json', (req, res) => res.json({ received: Object.keys(req.body).length }));
    app.post('/form', (req, res) => res.json({ received: Object.keys(req.body).length }));
    app.use((error: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
      res.status(error.status ?? 500).json({ error: error.type ?? 'request_error' });
    });
  });

  it('rejects a JSON body above the explicit limit', async () => {
    const response = await request(app)
      .post('/json')
      .set('Content-Type', 'application/json')
      .send({ payload: 'x'.repeat(1_048_577) });

    expect(response.status).toBe(413);
    expect(response.body.error).toBe('entity.too.large');
  });

  it('rejects URL-encoded requests above the explicit parameter limit', async () => {
    const form = Object.fromEntries(
      Array.from({ length: 201 }, (_, index) => [`field${index}`, 'value'])
    );

    const response = await request(app)
      .post('/form')
      .type('form')
      .send(form);

    expect(response.status).toBe(413);
    expect(response.body.error).toBe('parameters.too.many');
  });
});
