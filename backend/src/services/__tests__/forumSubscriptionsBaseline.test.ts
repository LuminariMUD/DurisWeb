import { afterAll, beforeAll, beforeEach, describe, expect, it, jest } from '@jest/globals';
import mysql from 'mysql2/promise';
import type { RowDataPacket } from 'mysql2/promise';
import { loadWebBaselineBundle } from '../../db/webBaselineBundle.js';

const query = jest.fn<(sql: string, values?: unknown[]) => Promise<unknown>>();
const release = jest.fn();
jest.unstable_mockModule('../../db/connection.js', () => ({
  pool: { query, getConnection: async () => ({ query, release }) },
}));
jest.unstable_mockModule('../accountService.js', () => ({ searchAccounts: jest.fn() }));
jest.unstable_mockModule('../permissionService.js', () => ({}));
jest.unstable_mockModule('../categoryService.js', () => ({
  getCategoryAccessForAccount: jest.fn(),
}));
jest.unstable_mockModule('../guildService.js', () => ({ findCharacterGuild: jest.fn() }));
jest.unstable_mockModule('../../utils/contentParser.js', () => ({
  processForumContent: jest.fn(),
}));
jest.unstable_mockModule('../postImageService.js', () => ({
  extractImageUrls: jest.fn(),
  extractForumImageSources: jest.fn(),
  linkImagesToPost: jest.fn(),
  linkImagesToThread: jest.fn(),
}));
jest.unstable_mockModule('../unifiedNotificationService.js', () => ({}));
jest.unstable_mockModule('../pushNotificationService.js', () => ({
  sendForumReplyNotification: jest.fn(),
}));
jest.unstable_mockModule('../webSettingsService.js', () => ({ getWebSettings: jest.fn() }));
jest.unstable_mockModule('../pvpVisibility.js', () => ({
  getPvpDelayMinutes: jest.fn(),
  pvpVisibilitySql: jest.fn(),
  pvpTimestamp: jest.fn(),
}));
jest.unstable_mockModule('../../utils/logger.js', () => ({
  default: { error: jest.fn() },
  isErrorWithCode: jest.fn(),
}));
const { getUserSubscriptions, createPostNotifications, getPostsByThread } = await import(
  '../forumService.js'
);

beforeEach(() => {
  query.mockReset();
  release.mockClear();
});
it('releases its connection when a subscription read fails', async () => {
  query.mockRejectedValueOnce(new Error('synthetic query failure'));
  await expect(getUserSubscriptions('synthetic-reader')).rejects.toThrow('synthetic query failure');
  expect(release).toHaveBeenCalledTimes(1);
});

const ports = (process.env.TEST_BASELINE_DB_PORTS ?? '').split(',').filter(Boolean).map(Number);
if (
  ports.some(
    (port) =>
      !Number.isInteger(port) || port < 1024 || port > 65535 || [3306, 3307, 13306].includes(port),
  )
) {
  throw new Error('TEST_BASELINE_DB_PORTS must select disposable loopback servers');
}
for (const port of ports) {
  describe(`forum services on canonical baseline at disposable port ${port}`, () => {
    let connection: mysql.Connection;
    let created = false;
    const database = `durisweb_forum_baseline_${process.pid}`;
    beforeAll(async () => {
      connection = await mysql.createConnection({ host: '127.0.0.1', port, user: 'root' });
      await connection.query(
        `CREATE DATABASE ${database} CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`,
      );
      created = true;
      await connection.changeUser({ database });
      for (const { sql } of loadWebBaselineBundle().tables) await connection.query(sql);
      await connection.query(
        "INSERT INTO forum_categories (id, name) VALUES (1, 'Synthetic category')",
      );
      await connection.query(
        "INSERT INTO forum_threads (id, category_id, author_account_name, title, content) VALUES (1, 1, 'synthetic-author', 'Synthetic thread', 'Content')",
      );
      await connection.query(`INSERT INTO forum_subscriptions (user_account_name, subscription_type, thread_id, category_id, notification_preference) VALUES
        ('synthetic-reader', 'thread', 1, NULL, 'all'),
        ('category-reader', 'category', NULL, 1, 'all'),
        ('muted-reader', 'thread', 1, NULL, 'none'),
        ('synthetic-author', 'thread', 1, NULL, 'all')`);
    }, 60000);
    beforeEach(() => {
      query.mockImplementation((sql, values) => connection.query(sql, values));
    });
    afterAll(async () => {
      if (created) await connection.query(`DROP DATABASE ${database}`);
      await connection?.end();
    });
    it('reads empty and populated subscriptions with account isolation', async () => {
      await expect(getUserSubscriptions('no-subscriptions')).resolves.toEqual({
        threads: [],
        categories: [],
      });
      const result = await getUserSubscriptions('synthetic-reader');
      expect(result.threads).toHaveLength(1);
      expect(result.threads[0]).toMatchObject({
        accountName: 'synthetic-reader',
        threadId: 1,
        threadTitle: 'Synthetic thread',
      });
      expect(result.categories).toEqual([]);
      const category = await getUserSubscriptions('category-reader');
      expect(category.threads).toEqual([]);
      expect(category.categories[0]).toMatchObject({
        accountName: 'category-reader',
        categoryId: 1,
      });
    });
    it('locates linked posts beyond page one with stable ordering and active-post visibility', async () => {
      await connection.query(
        'CREATE TABLE frag_leaderboard (pid BIGINT PRIMARY KEY, char_name VARCHAR(50))',
      );
      for (let id = 1; id <= 55; id++) {
        await connection.query(
          "INSERT INTO forum_posts (id,thread_id,author_account_name,content,created_at,is_deleted) VALUES (?,1,'synthetic-author',?,'2026-10-16 10:00:00',?)",
          [id, `Post ${id}`, id === 1 ? 1 : 0],
        );
      }
      const result = await getPostsByThread(1, '', 1, 50, undefined, { targetPostId: 55 });
      expect(result.page).toBe(2);
      expect(result.total).toBe(54);
      expect(result.posts.map(({ id }) => id)).toEqual([52, 53, 54, 55]);
      expect((await getPostsByThread(1, '', 1, 50, undefined, { targetPostId: 51 })).page).toBe(1);
      for (const targetPostId of [1, 99999]) {
        const missing = await getPostsByThread(1, '', 1, 50, undefined, { targetPostId });
        expect(missing.page).toBe(1);
        expect(missing.posts.map(({ id }) => id)).not.toContain(1);
      }
      expect(
        (await getPostsByThread(999, '', 1, 50, undefined, { targetPostId: 55 })).posts,
      ).toEqual([]);
    });
    it('persists notifications for enabled subscribers with working links and structured post data', async () => {
      await createPostNotifications(7, 1, 1, 'synthetic-author', 'SyntheticCharacter');
      const [rows] = await connection.query<RowDataPacket[]>(
        'SELECT * FROM notifications ORDER BY account_name',
      );
      expect(rows.map((row) => row.account_name)).toEqual(['category-reader', 'synthetic-reader']);
      for (const row of rows) {
        expect(row).toMatchObject({
          source: 'forum',
          notification_type: 'new_post',
          link: '/forum/thread/1#post-7',
          triggered_by_account: 'synthetic-author',
          triggered_by_character: 'SyntheticCharacter',
        });
        expect(typeof row.data === 'string' ? JSON.parse(row.data) : row.data).toEqual({
          threadId: 1,
          postId: 7,
        });
        expect(row.message).toContain('SyntheticCharacter');
      }
    });
  });
}
