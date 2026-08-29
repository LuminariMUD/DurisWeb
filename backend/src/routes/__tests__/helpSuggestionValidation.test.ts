import express from 'express';
import request from 'supertest';
import { beforeAll, beforeEach, describe, expect, it, jest } from '@jest/globals';

const createSuggestion = jest.fn<(...args: unknown[]) => Promise<any>>();
const updateSuggestion = jest.fn<(...args: unknown[]) => Promise<any>>();
const getSuggestionById = jest.fn<(...args: unknown[]) => Promise<any>>();
const cancelSuggestion = jest.fn<(...args: unknown[]) => Promise<boolean>>();
const reviewSuggestion = jest.fn<(...args: unknown[]) => Promise<any>>();
const logQuery = jest.fn<(...args: unknown[]) => Promise<unknown>>();

jest.unstable_mockModule('../../middleware/auth.js', () => ({
  requireAuth: (req: any, _res: any, next: any) => {
    req.user = {
      accountName: 'Cwial',
      email: 'cwial@example.invalid',
      sessionId: 'suggestion-test-session',
      permissions: {},
      adminPermissions: new Set(),
    };
    next();
  },
  requirePermission: () => (_req: any, _res: any, next: any) => next(),
}));
jest.unstable_mockModule('../../services/helpSuggestionService.js', () => ({
  createSuggestion,
  updateSuggestion,
  getSuggestionById,
  cancelSuggestion,
  reviewSuggestion,
}));
jest.unstable_mockModule('../../db/connection.js', () => ({
  pool: { query: logQuery },
}));
jest.unstable_mockModule('../../utils/logger.js', () => ({
  getErrorMessage: (error: unknown) => String(error),
}));

describe('help suggestion write validation', () => {
  let app: express.Express;

  beforeAll(async () => {
    const { default: helpSuggestionRoutes } = await import('../helpSuggestions.js');
    app = express();
    app.set('trust proxy', 1);
    app.use(express.json());
    app.use('/api', helpSuggestionRoutes);
  });

  beforeEach(() => {
    jest.clearAllMocks();
    createSuggestion.mockResolvedValue({ id: 1, title: 'Valid' });
    updateSuggestion.mockResolvedValue({ id: 1, title: 'Updated' });
    getSuggestionById.mockResolvedValue({
      id: 1,
      submitted_by: 'Cwial',
      status: 'pending',
      title: 'Existing',
    });
    cancelSuggestion.mockResolvedValue(true);
    reviewSuggestion.mockResolvedValue({ id: 1, title: 'Reviewed', status: 'approved' });
    logQuery.mockResolvedValue([{ insertId: 1 }]);
  });

  it('rejects unknown create fields before persistence', async () => {
    const response = await request(app)
      .post('/api/guide/suggestions')
      .set('X-Forwarded-For', '10.0.1.10')
      .send({ suggestionType: 'new', title: 'Title', text: 'Text', extra: true });

    expect(response.status).toBe(400);
    expect(createSuggestion).not.toHaveBeenCalled();
  });

  it('rejects oversized and wrongly typed create fields before persistence', async () => {
    const response = await request(app)
      .post('/api/guide/suggestions')
      .set('X-Forwarded-For', '10.0.1.11')
      .send({
        suggestionType: 'new',
        title: 'x'.repeat(201),
        text: 'Text',
        categoryId: '1',
      });

    expect(response.status).toBe(400);
    expect(createSuggestion).not.toHaveBeenCalled();
  });

  it('accepts a bounded create payload', async () => {
    const response = await request(app)
      .post('/api/guide/suggestions')
      .set('X-Forwarded-For', '10.0.1.12')
      .send({
        suggestionType: 'edit',
        pageId: 42,
        title: 'A valid title',
        text: 'A valid suggestion',
        categoryId: 10,
        seeAlso: 'related-page',
        submitterNotes: 'context',
      });

    expect(response.status).toBe(201);
    expect(createSuggestion).toHaveBeenCalledWith({
      suggestionType: 'edit',
      pageId: 42,
      title: 'A valid title',
      text: 'A valid suggestion',
      categoryId: 10,
      seeAlso: 'related-page',
      submitterNotes: 'context',
    }, 'Cwial', expect.any(String));
  });

  it('rejects update unknown fields and wrong types before lookup/persistence', async () => {
    const response = await request(app)
      .patch('/api/guide/suggestions/1')
      .set('X-Forwarded-For', '10.0.1.13')
      .send({ title: 99, unexpected: 'nope' });

    expect(response.status).toBe(400);
    expect(getSuggestionById).not.toHaveBeenCalled();
    expect(updateSuggestion).not.toHaveBeenCalled();
  });

  it('rejects non-canonical suggestion IDs before lookup', async () => {
    const response = await request(app)
      .get('/api/guide/suggestions/12abc')
      .set('X-Forwarded-For', '10.0.1.16');

    expect(response.status).toBe(400);
    expect(getSuggestionById).not.toHaveBeenCalled();
  });

  it('rejects oversized review notes before lookup/persistence', async () => {
    const response = await request(app)
      .patch('/api/admin/help-suggestions/1/review')
      .set('X-Forwarded-For', '10.0.1.14')
      .send({ action: 'approve', reviewerNotes: 'x'.repeat(5001) });

    expect(response.status).toBe(400);
    expect(getSuggestionById).not.toHaveBeenCalled();
    expect(reviewSuggestion).not.toHaveBeenCalled();
  });

  it('rate-limits repeated suggestion creates from one client', async () => {
    const payload = { suggestionType: 'new', title: 'Title', text: 'Text' };
    let lastResponse;

    for (let attempt = 0; attempt < 11; attempt += 1) {
      lastResponse = await request(app)
        .post('/api/guide/suggestions')
        .set('X-Forwarded-For', '10.0.1.15')
        .send(payload);
    }

    expect(lastResponse!.status).toBe(429);
    expect(createSuggestion).toHaveBeenCalledTimes(10);
  });
});
