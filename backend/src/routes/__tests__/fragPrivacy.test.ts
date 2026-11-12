import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, jest } from '@jest/globals';

const query = jest.fn<(...args: unknown[]) => Promise<unknown>>();
jest.unstable_mockModule('../../db/connection.js', () => ({ pool: { query } }));
jest.unstable_mockModule('../../utils/logger.js', () => ({ default: { error: jest.fn() } }));

// Simulates a database row that still holds the owning account (issue #181).
const row = {
  char_name: 'Hero',
  account_name: 'Secretaccount',
  total_frags: 12.5,
  frags_gained: 3,
  racewar: 1,
  race: 'Human',
  class: 'Warrior',
  level: 50,
  last_updated: '2026-01-01',
  global_rank: 1,
};

let app: express.Express;
beforeEach(async () => {
  jest.resetModules();
  jest.resetAllMocks();
  const { default: routes } = await import('../frag.js');
  app = express();
  app.use('/api/frag', routes);
});

describe('public frag API never names the owning account', () => {
  it.each([1, 2, 3, 4])('preserves supported faction %s in database filters', async (racewar) => {
    query.mockResolvedValueOnce([[{ total: 0 }]]).mockResolvedValueOnce([[]]);
    const response = await request(app).get(`/api/frag/leaderboard?racewar=${racewar}`);
    expect(response.status).toBe(200);
    expect(query.mock.calls.map(([, params]) => params)).toEqual([[racewar], [racewar, 50, 0]]);
  });

  it('no longer serves an account roster', async () => {
    const response = await request(app).get('/api/frag/account/Secretaccount');
    expect(response.status).toBe(404);
    expect(query).not.toHaveBeenCalled();
  });

  it('omits the account from leaderboard rows and ignores an account filter', async () => {
    query.mockResolvedValueOnce([[{ total: 1 }]]).mockResolvedValueOnce([[row]]);
    const response = await request(app).get('/api/frag/leaderboard?account_name=Secretaccount');
    expect(response.status).toBe(200);
    expect(response.body.data).toHaveLength(1);
    expect(JSON.stringify(response.body)).not.toContain('Secretaccount');
    for (const [sql, params] of query.mock.calls) {
      expect(sql).not.toContain('account');
      expect(params).not.toContain('Secretaccount');
    }
  });

  it.each(['/api/frag/top-gainers', '/api/frag/player/Hero'])(
    'omits the account from %s',
    async (path) => {
      query.mockResolvedValueOnce([[row]]);
      const response = await request(app).get(path);
      expect(response.status).toBe(200);
      expect(JSON.stringify(response.body)).toContain('Hero');
      expect(JSON.stringify(response.body)).not.toContain('Secretaccount');
      expect(query.mock.calls[0]?.[0]).not.toContain('account_name');
    },
  );
});
