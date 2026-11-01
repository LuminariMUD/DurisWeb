import { afterAll, beforeAll, describe, expect, it, jest } from '@jest/globals';
import mysql, { type Connection } from 'mysql2/promise';

const selected = process.env.TEST_TRAFFIC_DB_PORT;
const port = selected ? Number(selected) : undefined;
if (selected && ![23436, 23437].includes(port!)) {
  throw new Error('Admin read qualification requires an explicitly owned disposable SQL port');
}
const native = port ? describe : describe.skip;
const name = `durisweb_qualification_admin_reads_${process.pid}`;
let db: Connection | undefined;
let created = false;
let getPlayerStats: typeof import('../analyticsService.js')['getPlayerStats'];
let getTopPages: typeof import('../webAnalyticsService.js')['getTopPages'];
let getUserList: typeof import('../userManagementService.js')['getUserList'];
let content: typeof import('../contentService.js');

native('admin reads on native SQL', () => {
  beforeAll(async () => {
    db = await mysql.createConnection({ host: '127.0.0.1', port, user: 'root', password: '' });
    await db.query('CREATE DATABASE ??', [name]);
    created = true;
    await db.changeUser({ database: name });
    await db.query("SET SESSION sql_mode = CONCAT_WS(',', @@sql_mode, 'ONLY_FULL_GROUP_BY')");
    // Minimal synthetic tables for these read queries; no shared schema or data is used.
    for (const statement of [
      'CREATE TABLE frag_leaderboard (pid INT, level INT, racewar INT, deleted_at DATETIME NULL)',
      'CREATE TABLE player_data (pid INT, level INT, racewar INT, race INT, m_class INT, assoc_id INT)',
      'CREATE TABLE associations (id INT, name VARCHAR(64), active BOOLEAN)',
      'CREATE TABLE account_characters (pid INT, account_name VARCHAR(64), char_name VARCHAR(64), deleted_at DATETIME NULL)',
      'CREATE TABLE accounts (account_name VARCHAR(64), email VARCHAR(128))',
      'CREATE TABLE races (id INT, name VARCHAR(64))',
      'CREATE TABLE classes (id INT, name VARCHAR(64))',
      'CREATE TABLE ip_info (pid INT, last_ip VARCHAR(45), last_connect DATETIME)',
      'CREATE TABLE user_bans (account_name VARCHAR(64), is_active BOOLEAN, reason TEXT, banned_at DATETIME, banned_by VARCHAR(64))',
      'CREATE TABLE web_sessions (account_name VARCHAR(64), created_at DATETIME)',
      'CREATE TABLE page_views (path VARCHAR(255), page_title VARCHAR(255), session_id VARCHAR(64), created_at DATETIME)',
      'CREATE TABLE pages (id INT PRIMARY KEY AUTO_INCREMENT, title VARCHAR(256), text TEXT, category_id INT, last_update DATETIME, last_update_by VARCHAR(64), ip_number VARCHAR(45))',
    ]) {
      await db.query(statement);
    }
    jest.unstable_mockModule('../../db/connection.js', () => ({ pool: db }));
    jest.unstable_mockModule('../../db/redis.js', () => ({
      getCache: async () => null,
      setCache: async () => {},
      deleteCache: async () => {},
    }));
    jest.unstable_mockModule('../serverMonitor.js', () => ({ getServerUptime: () => 0 }));
    jest.unstable_mockModule('../serverHealthService.js', () => ({
      getOnlinePlayerCount: () => 0,
    }));
    jest.unstable_mockModule('../mudAuctionClient.js', () => ({
      sendMudCommandAsync: jest.fn(),
      isMudConnected: () => false,
    }));
    jest.unstable_mockModule('../../hooks/hookGate.js', () => ({ isHookEnabledSync: () => false }));
    ({ getPlayerStats } = await import('../analyticsService.js'));
    ({ getTopPages } = await import('../webAnalyticsService.js'));
    ({ getUserList } = await import('../userManagementService.js'));
    content = await import('../contentService.js');
  });

  afterAll(async () => {
    if (db) {
      if (created) await db.query('DROP DATABASE ??', [name]);
      await db.end();
    }
  });

  it('excludes avatars, higher staff and deleted characters from both level statistics', async () => {
    await db!.query(`INSERT INTO frag_leaderboard VALUES
      (1, 10, 1, NULL), (2, 56, 2, NULL), (3, 57, 1, NULL),
      (4, 62, 1, NULL), (5, 55, 1, NOW())`);
    expect(await getPlayerStats()).toMatchObject({ maxLevel: 56, avgLevel: 33 });
    await db!.query('UPDATE frag_leaderboard SET deleted_at = NOW() WHERE level < 57');
    expect(await getPlayerStats()).toMatchObject({ maxLevel: 0, avgLevel: 0 });
  });

  it('groups pages with differing or missing titles, preserving counts, date range and limit', async () => {
    await db!.query(`INSERT INTO page_views VALUES
      ('/guide', 'Guide', 'a', NOW()), ('/guide', 'A guide', 'a', NOW()),
      ('/guide', NULL, 'b', NOW()), ('/news', NULL, 'a', NOW()),
      ('/old', 'Old', 'c', DATE_SUB(NOW(), INTERVAL 40 DAY))`);
    expect(await getTopPages(30, 20)).toEqual([
      {
        path: '/guide',
        pageTitle: 'A guide',
        views: 3,
        uniqueVisitors: 2,
        avgTimeOnPage: 0,
        bounceRate: 0,
      },
      {
        path: '/news',
        pageTitle: null,
        views: 1,
        uniqueVisitors: 1,
        avgTimeOnPage: 0,
        bounceRate: 0,
      },
    ]);
    expect(await getTopPages(30, 1)).toHaveLength(1);
  });

  it('returns one row per active character and the latest web login or null', async () => {
    await db!.query(`INSERT INTO account_characters VALUES
      (1, 'Alice', 'Alpha', NULL), (2, 'Bob', 'Beta', NULL), (3, 'Alice', 'Retired', NOW())`);
    await db!.query(`INSERT INTO web_sessions VALUES
      ('Alice', '2026-10-01 12:00:00'), ('Alice', '2026-10-03 12:00:00')`);
    const result = await getUserList({ sort_by: 'character_name', sort_order: 'asc', limit: 10 });
    expect(result.pagination).toMatchObject({ total: 2, totalPages: 1 });
    expect(result.data.map((row) => row.character_name)).toEqual(['Alpha', 'Beta']);
    expect(result.data[0].web_last_login).toEqual(new Date('2026-10-03T12:00:00'));
    expect(result.data[1].web_last_login).toBeNull();
    expect((await getUserList({ search: 'Bob', limit: 10 })).data).toHaveLength(1);
  });

  it('saves help edits immediately and reads back text, MUD colors and attribution', async () => {
    const page = await content.createHelpPage({
      title: 'REGRESSION HELP',
      text: '&+WOriginal&n',
      last_update_by: 'Alice',
    });
    const text = '&+GUpdated help&n\nSecond line';
    await content.updateHelpPage(page.id, { text, last_update_by: 'Bob' });
    const saved = await content.getHelpPageById(page.id);
    expect(saved).toMatchObject({ text, category_id: 0, last_update_by: 'Bob' });
    expect(saved.last_update).toBeInstanceOf(Date);
  });
});
