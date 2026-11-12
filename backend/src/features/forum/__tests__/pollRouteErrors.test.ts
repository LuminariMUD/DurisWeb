import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import express from 'express';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import type { UserPermissions } from '../../../services/permissionService.js';
import { stubModule } from '../../../test/stubModule.js';

// Real poll routes and auth; threads, polls and persistence are synthetic (#176).
const thread = { id: 3, category_id: 1, author_account_name: 'voter' };
const getThreadById = jest.fn(async (..._args: unknown[]) => thread);
const getPollById = jest.fn(async (..._args: unknown[]) => ({ id: 5, thread_id: 3 }));
const castVote = jest.fn(async (..._args: unknown[]) => undefined);
const createPoll = jest.fn(async (..._args: unknown[]): Promise<number> => 5);
const stub = (specifier: string, overrides?: Record<string, unknown>) =>
  jest.unstable_mockModule(specifier, stubModule(new URL(specifier, import.meta.url), overrides));

const permissions = (accountName: string): UserPermissions => ({
  accountName,
  role: 'player',
  immortalLevel: null,
  maxLevel: 50,
  canAccessImmortalForum: false,
  canAccessGodForum: false,
  guilds: [],
  canModerate: false,
  canBan: false,
  canEditPosts: false,
  canDeletePosts: false,
  canPinThreads: false,
  canLockThreads: false,
  adminPermissions: [],
});

stub('../../../db/connection.js', { pool: {}, mudPool: {} });
stub('../../../db/redis.js', { getCache: async () => null });
stub('../../../services/sessionService.js', { hasActiveWebSession: async () => true });
stub('../../../services/accountService.js', {
  parseAccountFile: async (accountName: string) => ({ accountName, characters: [] }),
});
stub('../../../services/permissionService.js', {
  getUserPermissions: async (accountName: string) => permissions(accountName),
});
stub('../../../services/adminPermissionService.js', { getUserPermissions: async () => new Set() });
stub('../../../services/forumService.js', { getThreadById });
stub('../../../services/categoryService.js', {
  getCategoryAccessForAccount: async () => ({ canPost: true }),
});
stub('../../../services/pollService.js', { getPollById, castVote, createPoll });

const { forumReactionPollRoutes } = await import('../reactionPollRoutes.js');
const { generateAccessToken } = await import('../../../middleware/auth.js');
const { AppError } = await import('../../../middleware/errorHandler.js');
const { default: logger } = await import('../../../utils/logger.js');
const app = express();
app.use(cookieParser());
app.use(express.json());
app.use('/api/forum', forumReactionPollRoutes);

const cookie = `access_token=${generateAccessToken('voter', 'voter@example.invalid', 'sid')}`;
const vote = () =>
  request(app)
    .post('/api/forum/polls/5/vote')
    .set('Cookie', cookie)
    .send({ optionIds: [1] });
const newPoll = {
  question: 'Which zone next?',
  options: ['North', 'South'],
  isMultipleChoice: false,
  minChoices: 1,
  maxChoices: 1,
  isAnonymous: false,
  resultsVisibility: 'always',
};

describe('poll route error responses', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('passes a typed poll validation message to the voter', async () => {
    castVote.mockRejectedValueOnce(new AppError('This poll is no longer accepting votes', 409));
    const response = await vote();
    expect(response.status).toBe(409);
    expect(response.body).toEqual({ error: 'This poll is no longer accepting votes' });
  });

  it('keeps driver text out of a failed vote', async () => {
    const log = jest.spyOn(logger, 'error').mockImplementation(() => logger);
    castVote.mockRejectedValueOnce(
      Object.assign(new Error("SENTINEL Table 'duris.poll_votes' doesn't exist"), {
        code: 'ER_NO_SUCH_TABLE',
      }),
    );
    const response = await vote();
    expect(response.status).toBe(500);
    expect(JSON.stringify(response.body)).not.toContain('SENTINEL');
    expect(response.body).toEqual({ error: 'Failed to vote', reference: expect.any(String) });
    expect(log).toHaveBeenCalledTimes(1);
    expect(log.mock.calls[0]).toEqual([
      'Vote failed',
      { reference: response.body.reference, code: 'ER_NO_SUCH_TABLE' },
    ]);
    expect(JSON.stringify(log.mock.calls)).not.toContain('SENTINEL');
    expect(JSON.stringify(log.mock.calls)).toContain(response.body.reference);
    log.mockRestore();
  });

  it('reports a duplicate poll from the driver code, not its message', async () => {
    createPoll.mockRejectedValueOnce(
      Object.assign(new Error("SENTINEL Duplicate entry '3' for key 'thread_id'"), {
        code: 'ER_DUP_ENTRY',
      }),
    );
    const response = await request(app)
      .post('/api/forum/threads/3/poll')
      .set('Cookie', cookie)
      .send(newPoll);
    expect(response.status).toBe(409);
    expect(response.body).toEqual({ error: 'This thread already has a poll' });
  });
});
