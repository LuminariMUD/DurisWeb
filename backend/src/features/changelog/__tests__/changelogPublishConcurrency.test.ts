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
import type { RowDataPacket } from 'mysql2';

const port = process.env.TEST_CHANGELOG_DB_PORT;
if (
  port &&
  (!['23436', '23437'].includes(port) ||
    process.env.DB_PORT !== port ||
    process.env.DB_HOST !== '127.0.0.1' ||
    !process.env.DB_NAME?.startsWith('durisweb_qualification_'))
) {
  throw new Error('Changelog concurrency qualification requires a disposable database');
}

(port ? describe : describe.skip)('changelog publication on real SQL', () => {
  let pool: typeof import('../../../db/connection.js').pool;
  let service: typeof import('../service.js');
  let id: number;

  beforeAll(async () => {
    ({ pool } = await import('../../../db/connection.js'));
    service = await import('../service.js');
  });
  beforeEach(async () => {
    id = await service.createChangelogEntry({
      version: 'v1',
      title: 'Original draft',
      content: '<p>Original</p>',
      category: 'public',
      createdBy: 'SyntheticFixture',
    });
  });
  afterEach(async () => {
    jest.restoreAllMocks();
    if (id) await pool.query('DELETE FROM website_changelog WHERE id=?', [id]);
  });
  afterAll(async () => {
    if (pool) await pool.end();
  });

  function interceptTransactions(
    intercept: (sql: string, params: unknown, execute: () => Promise<unknown>) => Promise<unknown>,
  ) {
    const checkout = pool.getConnection.bind(pool);
    jest.spyOn(pool, 'getConnection').mockImplementation(
      async () =>
        new Proxy(await checkout(), {
          get(target, key) {
            const value: unknown = Reflect.get(target, key, target);
            if (key === 'query' && typeof value === 'function') {
              return (...args: unknown[]) =>
                intercept(
                  String(args[0]),
                  args[1],
                  async (): Promise<unknown> => Reflect.apply(value, target, args),
                );
            }
            return typeof value === 'function' ? value.bind(target) : value;
          },
        }),
    );
  }

  it('elects one concurrent publisher and permits an explicit unpublish/republish', async () => {
    const results = await Promise.all([
      service.updateChangelogEntry(id, { title: 'Publisher A', isPublished: true }),
      service.updateChangelogEntry(id, { title: 'Publisher B', isPublished: true }),
    ]);
    expect(results.filter((result) => result.publication !== null)).toHaveLength(1);
    expect(results.every((result) => result.found)).toBe(true);
    expect((await service.updateChangelogEntry(id, { isPublished: false })).publication).toBeNull();
    expect(
      (await service.updateChangelogEntry(id, { isPublished: true })).publication,
    ).not.toBeNull();
  });

  it('keeps a competing private draft outside the publication transaction and snapshot', async () => {
    let announceUpdate: () => void = () => {};
    let releasePublisher: () => void = () => {};
    const updated = new Promise<void>((resolve) => {
      announceUpdate = resolve;
    });
    const allowed = new Promise<void>((resolve) => {
      releasePublisher = resolve;
    });
    let paused = false;
    interceptTransactions(async (sql, params, execute) => {
      const result = await execute();
      if (
        !paused &&
        sql.startsWith('UPDATE website_changelog') &&
        Array.isArray(params) &&
        params.includes('Publisher')
      ) {
        paused = true;
        announceUpdate();
        await allowed;
      }
      return result;
    });
    const publishing = service.updateChangelogEntry(id, { title: 'Publisher', isPublished: true });
    let drafting: ReturnType<typeof service.updateChangelogEntry> | undefined;
    try {
      await updated;
      let draftFinished = false;
      drafting = service
        .updateChangelogEntry(id, { title: 'Private later draft', isPublished: false })
        .then((result) => {
          draftFinished = true;
          return result;
        });
      await new Promise((resolve) => setTimeout(resolve, 100));
      expect(draftFinished).toBe(false);
      releasePublisher();
      const publication = await publishing;
      await drafting;
      expect(publication.publication).toEqual({
        version: 'v1',
        title: 'Publisher',
        category: 'public',
      });
      const [rows] = await pool.query<RowDataPacket[]>(
        'SELECT title,is_published FROM website_changelog WHERE id=?',
        [id],
      );
      expect(rows[0]).toMatchObject({ title: 'Private later draft', is_published: 0 });
    } finally {
      releasePublisher();
      await Promise.allSettled([publishing, ...(drafting ? [drafting] : [])]);
    }
  });

  it('rolls back a failed publication without changing its draft', async () => {
    interceptTransactions(async (sql, _params, execute) => {
      if (sql.startsWith('UPDATE website_changelog')) throw new Error('Synthetic update failure');
      return execute();
    });
    await expect(
      service.updateChangelogEntry(id, { title: 'Publisher', isPublished: true }),
    ).rejects.toThrow('Synthetic update failure');
    const [rows] = await pool.query<RowDataPacket[]>(
      'SELECT title,is_published FROM website_changelog WHERE id=?',
      [id],
    );
    expect(rows[0]).toMatchObject({ title: 'Original draft', is_published: 0 });
  });
});
