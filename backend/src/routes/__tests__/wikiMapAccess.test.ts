import { beforeAll, beforeEach, describe, expect, it, jest } from '@jest/globals';
import express, { type NextFunction, type Request, type Response } from 'express';
import request from 'supertest';

const getWikiAccessLevel = jest.fn<() => Promise<string>>();
const generateMapImage = jest.fn(async () => Buffer.from('png'));
const getMapSectorGrid = jest.fn(async () => ({ layer: 0, sectors: 'AA==' }));
class MapSectorUnavailableError extends Error {}
let authenticated = false;
jest.unstable_mockModule('../../services/wikiService.js', () => ({
  getWikiAccessLevel,
  generateMapImage,
  getMapSectorGrid,
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
