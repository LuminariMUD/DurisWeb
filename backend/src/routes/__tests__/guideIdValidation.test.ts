import express from 'express';
import request from 'supertest';
import { beforeAll, beforeEach, describe, expect, it, jest } from '@jest/globals';

const query = jest.fn<(...args: unknown[]) => Promise<unknown>>();

jest.unstable_mockModule('../../db/connection.js', () => ({
  pool: { query },
}));
jest.unstable_mockModule('../../utils/logger.js', () => ({
  getErrorMessage: (error: unknown) => String(error),
}));

describe('guide resource ID validation', () => {
  let app: express.Express;

  beforeAll(async () => {
    const { default: guideRoutes } = await import('../guide.js');
    app = express();
    app.use('/api/guide', guideRoutes);
  });

  beforeEach(() => {
    query.mockReset();
  });

  it('rejects non-canonical help IDs before querying the database', async () => {
    const response = await request(app).get('/api/guide/help/12abc');

    expect(response.status).toBe(400);
    expect(query).not.toHaveBeenCalled();
  });

  it('preserves valid help detail lookups', async () => {
    query.mockResolvedValueOnce([[
      {
        id: 12,
        title: 'Help page',
        text: 'Safe text',
        category_id: 0,
        last_update: null,
        last_update_by: 'Cwial',
      },
    ]]);

    const response = await request(app).get('/api/guide/help/12');

    expect(response.status).toBe(200);
    expect(response.body.id).toBe(12);
    expect(query).toHaveBeenCalledWith(expect.stringContaining('WHERE id = ?'), [12]);
  });
});
