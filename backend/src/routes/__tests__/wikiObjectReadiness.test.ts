import { beforeAll, beforeEach, describe, expect, it, jest } from '@jest/globals';
import express, { type NextFunction, type Request, type Response } from 'express';
import request from 'supertest';

const getWikiAccessLevel = jest.fn<() => Promise<string>>();
const getWikiObjectReferenceIssues = jest.fn<() => Promise<string[]>>();
const getObjects = jest.fn<() => Promise<unknown>>();
const getObjectByVnum = jest.fn<(vnum: number) => Promise<unknown>>();
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

jest.unstable_mockModule('../../services/wikiService.js', () => ({
  getWikiAccessLevel,
  getWikiObjectReferenceIssues,
  getObjects,
  getObjectByVnum,
  getObjectTypes,
  getWearSlotTypes,
  getAffectTypes,
  getSpellEffectTypes,
  getObjectClasses,
  getObjectRaces,
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
    getWikiObjectReferenceIssues.mockResolvedValueOnce(['not published']);

    const response = await request(app).get(path);

    expect(response.status).toBe(503);
    expect(response.body).toEqual({
      code: 'WIKI_OBJECT_REFERENCE_UNAVAILABLE',
      error: 'Wiki object reference data is unavailable. An operator must publish it.',
    });
    for (const reader of objectReaders) expect(reader).not.toHaveBeenCalled();
  });

  it('preserves object detail lookup when the published generation is ready', async () => {
    getWikiObjectReferenceIssues.mockResolvedValueOnce([]);
    getObjectByVnum.mockResolvedValueOnce({ vnum: 42, name: 'Test object' });

    const response = await request(app).get('/api/wiki/objects/42');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ vnum: 42, name: 'Test object' });
    expect(getObjectByVnum).toHaveBeenCalledWith(42);
  });
});
