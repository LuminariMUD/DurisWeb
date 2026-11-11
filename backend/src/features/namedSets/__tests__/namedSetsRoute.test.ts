import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { SAMPLE_REPORT } from './namedReportFixture.js';

const getNamedEquipment = jest.fn<() => Promise<string | null>>();
const warn = jest.fn();
jest.unstable_mockModule('../../../services/onlinePlayersService.js', () => ({
  getNamedEquipment,
}));
jest.unstable_mockModule('../../../utils/logger.js', () => ({
  default: { error: jest.fn(), warn },
}));

let app: express.Express;
beforeEach(async () => {
  jest.resetModules();
  jest.resetAllMocks();
  const { namedSetsRouter } = await import('../routes.js');
  app = express();
  app.use('/api/named-sets', namedSetsRouter);
});

const namedSets = () => request(app).get('/api/named-sets');

describe('GET /api/named-sets', () => {
  it('serves the parsed report publicly', async () => {
    getNamedEquipment.mockResolvedValue(SAMPLE_REPORT);
    const response = await namedSets();
    expect(response.status).toBe(200);
    expect(response.headers['cache-control']).toBe('public, max-age=300');
    expect(response.body.zones).toHaveLength(4);
    expect(response.body.zones[0]).toMatchObject({ zone: 14, name: 'The Goblin Warrens' });
    expect(response.body.notes).toContain('Notes');
    expect(typeof response.body.fetchedAt).toBe('string');
  });

  it('reports unavailable when the MUD cache is empty', async () => {
    getNamedEquipment.mockResolvedValue(null);
    const response = await namedSets();
    expect(response.status).toBe(503);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.body).toEqual({ error: 'Named set report is not available right now' });
  });

  it('fails closed on a malformed cache value without echoing it', async () => {
    getNamedEquipment.mockResolvedValue('<script>not a report</script>');
    const response = await namedSets();
    expect(response.status).toBe(503);
    expect(JSON.stringify(response.body)).not.toContain('script');
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('fails closed when the cache read throws', async () => {
    getNamedEquipment.mockRejectedValue(new Error('redis down'));
    expect((await namedSets()).status).toBe(503);
  });

  it('shares one cache read across concurrent requests and reuses it', async () => {
    let release: (value: string) => void = () => {};
    let started: () => void = () => {};
    const entered = new Promise<void>((resolve) => {
      started = resolve;
    });
    getNamedEquipment.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          release = resolve;
          started();
        }),
    );
    const responses = Array.from({ length: 10 }, () => namedSets().then((r) => r));
    await entered;
    // Let the other requests reach the handler and join the pending read.
    await new Promise((resolve) => setTimeout(resolve, 50));
    release(SAMPLE_REPORT);
    for (const response of await Promise.all(responses)) expect(response.status).toBe(200);
    expect((await namedSets()).status).toBe(200);
    expect(getNamedEquipment).toHaveBeenCalledTimes(1);
  });
});
