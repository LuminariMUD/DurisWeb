import { beforeAll, beforeEach, describe, expect, it, jest } from '@jest/globals';
import express, { type NextFunction, type Request, type Response } from 'express';
import request from 'supertest';

const getWikiAccessLevel = jest.fn<() => Promise<string>>();
const generateMapImage = jest.fn(async () => Buffer.from('png'));
const getMapSectorGrid = jest.fn(async () => ({ layer: 0, sectors: 'AA==' }));
const getZoneEntrances = jest.fn<
  (
    bounds: { minX: number; maxX: number; minY: number; maxY: number },
    layer: number,
  ) => Promise<unknown[]>
>(async () => []);
class MapSectorUnavailableError extends Error {}
let authenticated = false;
jest.unstable_mockModule('../../services/wikiService.js', () => ({
  getWikiAccessLevel,
  generateMapImage,
  getMapSectorGrid,
  getZoneEntrances,
  MapSectorUnavailableError,
}));
jest.unstable_mockModule('../../middleware/auth.js', () => ({
  optionalAuth: (req: Request, _res: Response, next: NextFunction) => {
    if (authenticated) req.user = { accountName: 'fixture' } as Request['user'];
    next();
  },
  requireAuth: (_req: Request, _res: Response, next: NextFunction) => next(),
  requirePermission: () => (_req: Request, _res: Response, next: NextFunction) => next(),
}));

describe('wiki map HTTP cache and access transitions', () => {
  let app: express.Express;
  beforeAll(async () => {
    const { default: routes } = await import('../wiki.js');
    app = express();
    app.use('/api/wiki', routes);
  });
  beforeEach(() => {
    jest.clearAllMocks();
    authenticated = false;
    getWikiAccessLevel.mockResolvedValue('public');
  });
  it('returns a stable unavailable response when sector I/O is bounded out', async () => {
    getMapSectorGrid.mockRejectedValueOnce(new MapSectorUnavailableError());
    const response = await request(app).get('/api/wiki/map/sectors?layer=0');
    expect(response.status).toBe(503);
    expect(response.body).toEqual({ error: 'Map sectors are temporarily unavailable' });
    expect(response.headers['cache-control']).toBe('no-store');
  });
  it.each([
    'maxX=Infinity',
    'maxX=399.001',
    'maxX=0&minX=50',
    'maxX=700',
    'maxX=4097',
    'maxX=399&layer=999',
    'maxX=399&layer=1.5',
    'maxX=399&minY=-5000',
  ])('rejects invalid entrance bounds or layers without querying SQL (%s)', async (suffix) => {
    const params = new URLSearchParams({
      minX: '0',
      maxX: '399',
      minY: '0',
      maxY: '399',
      layer: '0',
    });
    for (const pair of suffix.split('&')) {
      const [key, value] = pair.split('=');
      params.set(key!, value!);
    }
    const response = await request(app).get(`/api/wiki/map/entrances?${params}`);
    expect(response.status).toBe(400);
    expect(getZoneEntrances).not.toHaveBeenCalled();
  });
  it('normalizes valid integer bounds and preserves all four map layers', async () => {
    const response = await request(app).get(
      '/api/wiki/map/entrances?minX=00&maxX=0399&minY=0&maxY=399&layer=-1',
    );
    expect(response.status).toBe(200);
    expect(getZoneEntrances).toHaveBeenCalledWith({ minX: 0, maxX: 399, minY: 0, maxY: 399 }, -1);
  });
  it.each(['image', 'sectors'])(
    'never caches /map/%s across visibility or login changes',
    async (endpoint) => {
      const path = `/api/wiki/map/${endpoint}?layer=0`;
      const publicResponse = await request(app).get(path);
      expect(publicResponse.status).toBe(200);
      expect(publicResponse.headers['cache-control']).toBe('no-store');
      getWikiAccessLevel.mockResolvedValue('registered');
      expect((await request(app).get(path)).status).toBe(401);
      authenticated = true;
      const privateResponse = await request(app).get(path);
      expect(privateResponse.status).toBe(200);
      expect(privateResponse.headers['cache-control']).toBe('no-store');
      authenticated = false;
      const loggedOut = await request(app).get(path);
      expect(loggedOut.status).toBe(401);
      expect(loggedOut.headers['cache-control']).toBe('no-store');
      expect(endpoint === 'image' ? generateMapImage : getMapSectorGrid).toHaveBeenCalledTimes(2);
    },
  );
});
