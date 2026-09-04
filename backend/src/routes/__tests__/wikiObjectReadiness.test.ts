import { beforeAll, beforeEach, describe, expect, it, jest } from '@jest/globals';
import express, { type NextFunction, type Request, type Response } from 'express';
import request from 'supertest';

const getWikiAccessLevel = jest.fn<() => Promise<string>>();
const SOURCE_IDENTITY = { revision: 'a'.repeat(40), tree: 'b'.repeat(40) };
const getWikiObjectReference =
  jest.fn<() => Promise<{ issues: string[]; sourceIdentity: typeof SOURCE_IDENTITY | null }>>();
const getObjects = jest.fn<() => Promise<unknown>>();
const getObjectByVnum =
  jest.fn<(vnum: number, sourceIdentity: typeof SOURCE_IDENTITY) => Promise<unknown>>();
const getObjectTypes = jest.fn<() => Promise<unknown>>();
const getWearSlotTypes = jest.fn<() => Promise<unknown>>();
const getAffectTypes = jest.fn<() => Promise<unknown>>();
const getSpellEffectTypes = jest.fn<() => Promise<unknown>>();
const getObjectClasses = jest.fn<() => Promise<unknown>>();
const getObjectRaces = jest.fn<() => Promise<unknown>>();
const objectReaders = [
  getObjects,
  getObjectByVnum,
  getObjectTypes,
  getWearSlotTypes,
  getAffectTypes,
  getSpellEffectTypes,
  getObjectClasses,
  getObjectRaces,
];
class WikiObjectReferenceUnavailableError extends Error {}

jest.unstable_mockModule('../../services/wikiService.js', () => ({
  getWikiAccessLevel,
  getWikiObjectReference,
  getObjects,
  getObjectByVnum,
  getObjectTypes,
  getWearSlotTypes,
  getAffectTypes,
  getSpellEffectTypes,
  getObjectClasses,
  getObjectRaces,
  WikiObjectReferenceUnavailableError,
}));
jest.unstable_mockModule('../../middleware/auth.js', () => ({
  optionalAuth: (_req: Request, _res: Response, next: NextFunction) => next(),
  requireAuth: (_req: Request, _res: Response, next: NextFunction) => next(),
  requirePermission: () => (_req: Request, _res: Response, next: NextFunction) => next(),
}));

describe('wiki object route readiness', () => {
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
    '/api/wiki/objects',
    '/api/wiki/objects/42',
    '/api/wiki/objects/types',
    '/api/wiki/objects/slots',
    '/api/wiki/objects/affects',
    '/api/wiki/objects/spell-effects',
    '/api/wiki/objects/classes',
    '/api/wiki/objects/races',
  ])('returns the stable unavailable response for %s before reading object data', async (path) => {
    getWikiObjectReference.mockResolvedValueOnce({
      issues: ['not published'],
      sourceIdentity: null,
    });

    const response = await request(app).get(path);

    expect(response.status).toBe(503);
    expect(response.body).toEqual({
      code: 'WIKI_OBJECT_REFERENCE_UNAVAILABLE',
      error: 'Wiki object reference data is unavailable. An operator must publish it.',
    });
    for (const reader of objectReaders) expect(reader).not.toHaveBeenCalled();
  });

  it('preserves object detail lookup when the published generation is ready', async () => {
    getWikiObjectReference.mockResolvedValueOnce({ issues: [], sourceIdentity: SOURCE_IDENTITY });
    getObjectByVnum.mockResolvedValueOnce({ vnum: 42, name: 'Test object' });

    const response = await request(app).get('/api/wiki/objects/42');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ vnum: 42, name: 'Test object' });
    expect(getObjectByVnum).toHaveBeenCalledWith(42, SOURCE_IDENTITY);
  });

  it('returns the stable unavailable response when publication changes during detail assembly', async () => {
    getWikiObjectReference.mockResolvedValueOnce({ issues: [], sourceIdentity: SOURCE_IDENTITY });
    getObjectByVnum.mockRejectedValueOnce(new WikiObjectReferenceUnavailableError());

    const response = await request(app).get('/api/wiki/objects/42');

    expect(response.status).toBe(503);
    expect(response.body).toEqual({
      code: 'WIKI_OBJECT_REFERENCE_UNAVAILABLE',
      error: 'Wiki object reference data is unavailable. An operator must publish it.',
    });
  });
});
