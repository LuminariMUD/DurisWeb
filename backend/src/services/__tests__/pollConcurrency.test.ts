import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from '@jest/globals';
import type { ResultSetHeader, RowDataPacket } from 'mysql2';
import type { UserPermissions } from '../permissionService.js';

const port = process.env.TEST_POLL_DB_PORT;
if (
  port &&
  (process.env.DB_HOST !== '127.0.0.1' ||
    process.env.DB_PORT !== port ||
    !process.env.DB_NAME?.startsWith('durisweb_qualification_'))
) {
  throw new Error('Poll concurrency qualification requires a disposable database');
}
jest.unstable_mockModule('../categoryService.js', () => ({
  getCategoryAccessForAccount: async () => ({ canView: true, canPost: true, canModerate: false }),
}));

const permissions: UserPermissions = {
  accountName: 'SyntheticVoter',
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
};

(port ? describe : describe.skip)('poll mutations on real SQL', () => {
  let pool: typeof import('../../db/connection.js').pool;
  let service: typeof import('../pollService.js');
  let categoryId = 0;
  let threadId = 0;
  let pollId = 0;
  let optionId = 0;

  beforeAll(async () => {
    ({ pool } = await import('../../db/connection.js'));
    service = await import('../pollService.js');
    const [category] = await pool.query<ResultSetHeader>(
      'INSERT INTO forum_categories (name,access_type) VALUES (?,?)',
      ['Synthetic poll races', 'public'],
    );
    categoryId = category.insertId;
  });
  beforeEach(async () => {
    threadId = 0;
    const [thread] = await pool.query<ResultSetHeader>(
      'INSERT INTO forum_threads (category_id,author_account_name,title,content) VALUES (?,?,?,?)',
      [categoryId, permissions.accountName, 'Synthetic poll', 'Synthetic content'],
    );
    threadId = thread.insertId;
    pollId = await service.createPoll(
      threadId,
      {
        question: 'Synthetic choice?',
        options: ['One', 'Two'],
        isMultipleChoice: false,
        minChoices: 1,
        maxChoices: 1,
        isAnonymous: false,
        resultsVisibility: 'always',
      },
      permissions.accountName,
      permissions,
    );
    const [options] = await pool.query<RowDataPacket[]>(
      'SELECT id FROM forum_poll_options WHERE poll_id=? ORDER BY id',
      [pollId],
    );
    optionId = Number(options[0].id);
    await service.castVote(pollId, [optionId], permissions.accountName, permissions);
  });
  afterEach(async () => {
    jest.restoreAllMocks();
    if (threadId) await pool.query('DELETE FROM forum_threads WHERE id=?', [threadId]);
  });
  afterAll(async () => {
    if (!pool) return;
    try {
      if (categoryId) await pool.query('DELETE FROM forum_categories WHERE id=?', [categoryId]);
    } finally {
      await pool.end();
    }
  });

  function interceptTransactions(
    intercept: (sql: string, execute: () => Promise<unknown>) => Promise<unknown>,
  ) {
    const checkout = pool.getConnection.bind(pool);
    jest.spyOn(pool, 'getConnection').mockImplementation(
      async () =>
        new Proxy(await checkout(), {
          get(target, key) {
            const value: unknown = Reflect.get(target, key, target);
            if (key === 'query' && typeof value === 'function') {
              return (...args: unknown[]) =>
                intercept(String(args[0]), async () => Reflect.apply(value, target, args));
            }
            return typeof value === 'function' ? value.bind(target) : value;
          },
        }),
    );
  }

  it('serializes two removals so the same vote cannot decrement twice', async () => {
    let signalRead: () => void = () => {};
    let releaseRead: () => void = () => {};
    const read = new Promise<void>((resolve) => {
      signalRead = resolve;
    });
    const allowed = new Promise<void>((resolve) => {
      releaseRead = resolve;
    });
    let paused = false;
    interceptTransactions(async (sql, execute) => {
      const result = await execute();
      if (!paused && sql.startsWith('SELECT option_id FROM forum_poll_votes')) {
        paused = true;
        signalRead();
        await allowed;
      }
      return result;
    });
    const first = service.removeVote(pollId, permissions.accountName, permissions);
    let second: typeof first | undefined;
    try {
      await read;
      second = service.removeVote(pollId, permissions.accountName, permissions);
      await new Promise((resolve) => setTimeout(resolve, 100));
      releaseRead();
      const results = await Promise.allSettled([first, second]);
      expect(results.map((r) => r.status).sort()).toEqual(['fulfilled', 'rejected']);
      expect(results.find((r) => r.status === 'rejected')).toMatchObject({
        reason: { statusCode: 409 },
      });
      const [rows] = await pool.query<RowDataPacket[]>(
        'SELECT vote_count FROM forum_poll_options WHERE id=?',
        [optionId],
      );
      expect(Number(rows[0].vote_count)).toBe(0);
    } finally {
      releaseRead();
      await Promise.allSettled([first, ...(second ? [second] : [])]);
    }
  });

  it('rechecks a close committed after authorization but before mutation', async () => {
    const checkout = pool.getConnection.bind(pool);
    let close = true;
    jest.spyOn(pool, 'getConnection').mockImplementation(async () => {
      if (close) {
        close = false;
        await service.closePoll(pollId, permissions.accountName, permissions);
      }
      return checkout();
    });
    await expect(
      service.removeVote(pollId, permissions.accountName, permissions),
    ).rejects.toMatchObject({ statusCode: 409 });
    const [rows] = await pool.query<RowDataPacket[]>(
      'SELECT vote_count FROM forum_poll_options WHERE id=?',
      [optionId],
    );
    expect(Number(rows[0].vote_count)).toBe(1);
  });

  it('keeps a concurrent close behind a vote that already checked active state', async () => {
    let signalRead: () => void = () => {};
    let releaseRead: () => void = () => {};
    const read = new Promise<void>((resolve) => {
      signalRead = resolve;
    });
    const allowed = new Promise<void>((resolve) => {
      releaseRead = resolve;
    });
    let paused = false;
    interceptTransactions(async (sql, execute) => {
      const result = await execute();
      if (!paused && sql.startsWith('SELECT * FROM forum_polls WHERE id')) {
        paused = true;
        signalRead();
        await allowed;
      }
      return result;
    });
    const voting = service.castVote(pollId, [optionId], 'SyntheticOther', permissions);
    let closing: Promise<void> | undefined;
    try {
      await read;
      let closed = false;
      closing = service.closePoll(pollId, permissions.accountName, permissions).then(() => {
        closed = true;
      });
      await new Promise((resolve) => setTimeout(resolve, 100));
      expect(closed).toBe(false);
      releaseRead();
      await Promise.all([voting, closing]);
      const [rows] = await pool.query<RowDataPacket[]>(
        'SELECT vote_count FROM forum_poll_options WHERE id=?',
        [optionId],
      );
      expect(Number(rows[0].vote_count)).toBe(2);
    } finally {
      releaseRead();
      await Promise.allSettled([voting, ...(closing ? [closing] : [])]);
    }
  });
});
