import { beforeAll, beforeEach, describe, expect, it, jest } from '@jest/globals';
import express, { type NextFunction, type Request, type Response } from 'express';
import request from 'supertest';

const getWikiAccessLevel = jest.fn<() => Promise<string>>();
const SOURCE_IDENTITY = { revision: 'a'.repeat(40), tree: 'b'.repeat(40) };
const getWikiMobReference =
  jest.fn<() => Promise<{ issues: string[]; sourceIdentity: typeof SOURCE_IDENTITY | null }>>();
const getMobs = jest.fn<() => Promise<unknown>>();
const getMobByZoneAndVnum =
  jest.fn<
    (zoneNumber: number, vnum: number, sourceIdentity: typeof SOURCE_IDENTITY) => Promise<unknown>
  >();
const getMobClasses = jest.fn<() => Promise<unknown>>();
const getMobRaces = jest.fn<() => Promise<unknown>>();
const getActFlags = jest.fn<() => Promise<unknown>>();
const mobReaders = [getMobs, getMobByZoneAndVnum, getMobClasses, getMobRaces, getActFlags];
class WikiMobReferenceUnavailableError extends Error {}

jest.unstable_mockModule('../../services/wikiService.js', () => ({
  getWikiAccessLevel,
  getWikiMobReference,
  getMobs,
  getMobByZoneAndVnum,
  getMobClasses,
  getMobRaces,
  getActFlags,
  WikiMobReferenceUnavailableError,
}));
jest.unstable_mockModule('../../middleware/auth.js', () => ({
  optionalAuth: (_req: Request, _res: Response, next: NextFunction) => next(),
  requireAuth: (_req: Request, _res: Response, next: NextFunction) => next(),
  requirePermission: () => (_req: Request, _res: Response, next: NextFunction) => next(),
}));

describe('wiki mob route readiness', () => {
  let app: express.Express;

  beforeAll(async () => {
    const { default: wikiRoutes } = await import('../wiki.js');
    app = express();
    app.use('/api/wiki', wikiRoutes);
  });

  beforeEach(() => {
    jest.clearAllMocks();
    getWikiAccessLevel.mockResolvedValue('public');
  });

  it.each([
    '/api/wiki/mobs',
    '/api/wiki/mobs/7/201',
    '/api/wiki/mobs/classes',
    '/api/wiki/mobs/races',
    '/api/wiki/mobs/flags',
  ])('returns the stable unavailable response for %s before reading mob data', async (path) => {
    getWikiMobReference.mockResolvedValueOnce({
      issues: ['not published'],
      sourceIdentity: null,
    });

    const response = await request(app).get(path);

    expect(response.status).toBe(503);
    expect(response.body).toEqual({
      code: 'WIKI_MOB_REFERENCE_UNAVAILABLE',
      error: 'Wiki mob reference data is unavailable. An operator must publish it.',
    });
    for (const reader of mobReaders) expect(reader).not.toHaveBeenCalled();
  });

  it('preserves mob detail lookup when the published generation is ready', async () => {
    getWikiMobReference.mockResolvedValueOnce({ issues: [], sourceIdentity: SOURCE_IDENTITY });
    getMobByZoneAndVnum.mockResolvedValueOnce({ vnum: 201, name: 'Test mob' });

    const response = await request(app).get('/api/wiki/mobs/7/201');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ vnum: 201, name: 'Test mob' });
    expect(getMobByZoneAndVnum).toHaveBeenCalledWith(7, 201, SOURCE_IDENTITY);
  });

  it('returns the stable unavailable response when publication changes during detail assembly', async () => {
    getWikiMobReference.mockResolvedValueOnce({ issues: [], sourceIdentity: SOURCE_IDENTITY });
    getMobByZoneAndVnum.mockRejectedValueOnce(new WikiMobReferenceUnavailableError());

    const response = await request(app).get('/api/wiki/mobs/7/201');

    expect(response.status).toBe(503);
    expect(response.body).toEqual({
      code: 'WIKI_MOB_REFERENCE_UNAVAILABLE',
      error: 'Wiki mob reference data is unavailable. An operator must publish it.',
    });
  });
});
