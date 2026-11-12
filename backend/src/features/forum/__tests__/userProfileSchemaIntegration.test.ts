import crypto from 'node:crypto';

import { afterAll, beforeAll, describe, expect, it, jest } from '@jest/globals';
import express from 'express';
import type { ResultSetHeader, RowDataPacket } from 'mysql2';
import request from 'supertest';
import { stubModule } from '../../../test/stubModule.js';

let nativeGuildName = '';
const nativeGuild = () => ({
  guildId: 1,
  name: nativeGuildName,
  racewar: 3,
  frags: 0,
  members: [],
  rankTitles: {
    enemy: 'Enemy',
    onParole: 'On parole',
    member: 'Member',
    senior: 'Senior',
    officer: 'Officer',
    deputy: 'Deputy',
    leader: 'Leader',
    king: 'King',
  },
});
jest.unstable_mockModule(
  '../../../services/mudGuildParser.js',
  stubModule(new URL('../../../services/mudGuildParser.js', import.meta.url), {
    getAllGuilds: async () => (nativeGuildName ? [{ id: 'synthetic', name: nativeGuildName }] : []),
    parseGuildFile: async () => (nativeGuildName ? nativeGuild() : null),
  }),
);

const settings = { pvpDelayMinutes: 15, respectWebinfoToggle: false };
jest.unstable_mockModule('../../../services/webSettingsService.js', () => ({
  getWebSettings: async () => settings,
}));

jest.unstable_mockModule('../../../db/redis.js', () => ({
  default: {},
  checkRedisConnection: jest.fn<() => Promise<boolean>>().mockResolvedValue(true),
  closeRedisConnection: jest.fn<() => Promise<void>>().mockResolvedValue(),
  deleteCache: jest.fn<() => Promise<void>>().mockResolvedValue(),
  getCache: jest.fn<() => Promise<null>>().mockResolvedValue(null),
  getCachedOrFetch: jest.fn(),
  mapToObject: jest.fn(),
  objectToMap: jest.fn(),
  objectToMapNumeric: jest.fn(),
  setCache: jest.fn<() => Promise<void>>().mockResolvedValue(),
}));
jest.unstable_mockModule('../../../realtime/broadcasts.js', () => ({
  broadcastForumPost: jest.fn(),
}));
jest.unstable_mockModule('../../../services/pushNotificationService.js', () => ({
  broadcastPush: jest.fn(),
  sendAuctionOutbidNotification: jest.fn(),
  sendAuctionWonNotification: jest.fn(),
  sendForumReplyNotification: jest.fn(),
  sendItemSoldNotification: jest.fn(),
}));

const { pool } = await import('../../../db/connection.js');
const { forumRouter: forumRoutes } = await import('../routes.js');

interface SchemaColumnRow extends RowDataPacket {
  TABLE_NAME: string;
  COLUMN_NAME: string;
}

const schemaColumns = {
  account_characters: ['account_name', 'char_name', 'deleted_at', 'pid'],
  frag_leaderboard: ['deleted_at', 'pid', 'total_frags'],
  player_data: [
    'bank_copper',
    'bank_gold',
    'bank_platinum',
    'bank_silver',
    'copper',
    'gold',
    'pid',
    'platinum',
    'silver',
  ],
} as const;

describe('user profile schema integration', () => {
  const fixtureSuffix = crypto.randomUUID().replaceAll('-', '').slice(0, 20);
  const accountName = `profile_${fixtureSuffix}`;
  const firstCharacterName = `profile_a_${fixtureSuffix}`;
  const duplicateCharacterName = `profile_dup_${fixtureSuffix}`;
  const secondCharacterName = `profile_b_${fixtureSuffix}`;
  let firstPid = 0;
  let secondPid = 0;
  let accountCreated = false;
  const eventIds: number[] = [];

  beforeAll(async () => {
    const [columns] = await pool.query<SchemaColumnRow[]>(
      `SELECT TABLE_NAME, COLUMN_NAME
       FROM information_schema.columns
       WHERE table_schema = DATABASE()
         AND table_name IN ('account_characters', 'frag_leaderboard', 'player_data')`,
    );
    const presentColumns = new Set(columns.map((row) => `${row.TABLE_NAME}.${row.COLUMN_NAME}`));

    for (const [tableName, requiredColumns] of Object.entries(schemaColumns)) {
      for (const columnName of requiredColumns) {
        if (!presentColumns.has(`${tableName}.${columnName}`)) {
          throw new Error(`Profile schema fixture is missing ${tableName}.${columnName}`);
        }
      }
    }

    await pool.query('INSERT INTO accounts (account_name) VALUES (?)', [accountName]);
    accountCreated = true;

    const [firstPlayer] = await pool.query<ResultSetHeader>(
      `INSERT INTO player_data (
         name, account_name, copper, silver, gold, platinum,
         bank_copper, bank_silver, bank_gold, bank_platinum
       ) VALUES (?, ?, 5, 2, 3, 4, 6, 7, 8, 9)`,
      [firstCharacterName, accountName],
    );
    firstPid = firstPlayer.insertId;

    const [secondPlayer] = await pool.query<ResultSetHeader>(
      `INSERT INTO player_data (
         name, account_name, copper, silver, gold, platinum,
         bank_copper, bank_silver, bank_gold, bank_platinum
       ) VALUES (?, ?, 2, 2, 2, 2, 2, 2, 2, 2)`,
      [secondCharacterName, accountName],
    );
    secondPid = secondPlayer.insertId;

    await pool.query(
      `INSERT INTO account_characters (account_name, pid, char_name)
       VALUES (?, ?, ?), (?, ?, ?), (?, ?, ?)`,
      [
        accountName,
        firstPid,
        firstCharacterName,
        accountName,
        firstPid,
        duplicateCharacterName,
        accountName,
        secondPid,
        secondCharacterName,
      ],
    );
    await pool.query(
      `INSERT INTO frag_leaderboard
         (pid, account_name, char_name, total_frags, racewar)
       VALUES (?, ?, ?, 1234, 1), (?, ?, ?, 567, 1)`,
      [firstPid, accountName, firstCharacterName, secondPid, accountName, secondCharacterName],
    );
    for (const stamp of [
      '2000-01-01 12:00:00',
      new Date().toISOString().slice(0, 19).replace('T', ' '),
    ]) {
      const [result] = await pool.query<ResultSetHeader>(
        'INSERT INTO pkill_event (stamp, room_vnum, room_name) VALUES (?, 0, ?)',
        [stamp, 'Profile fixture'],
      );
      eventIds.push(result.insertId);
      await pool.query(
        `INSERT INTO pkill_info (event_id, pid, level, pk_type, equip)
         VALUES (?, ?, 1, 'VICTIM', ''), (?, ?, 1, 'KILLER', '')`,
        [result.insertId, firstPid, result.insertId, secondPid],
      );
    }
  });

  afterAll(async () => {
    try {
      if (eventIds.length) {
        await pool.query('DELETE FROM pkill_info WHERE event_id IN (?)', [eventIds]);
        await pool.query('DELETE FROM pkill_event WHERE id IN (?)', [eventIds]);
      }
      const playerIds = [firstPid, secondPid].filter((pid) => pid > 0);
      if (playerIds.length)
        await pool.query('DELETE FROM frag_leaderboard WHERE pid IN (?)', [playerIds]);
      if (accountCreated)
        await pool.query('DELETE FROM account_characters WHERE account_name = ?', [accountName]);
      if (playerIds.length)
        await pool.query('DELETE FROM player_data WHERE pid IN (?)', [playerIds]);
      if (accountCreated)
        await pool.query('DELETE FROM accounts WHERE account_name = ?', [accountName]);
    } finally {
      await pool.end();
    }
  });

  it('filters character history and statistics until the delay expires', async () => {
    const { getCharacterPvPEvents, getCharacterProfile, getAccountCharacters } = await import(
      '../../../services/forumService.js'
    );
    const history = await getCharacterPvPEvents(firstCharacterName);
    expect(history.total).toBe(1);
    expect(history.events).toEqual([
      expect.objectContaining({ eventId: eventIds[0], date: '2000-01-01T12:00:00.000Z' }),
    ]);
    const profile = await getCharacterProfile(firstCharacterName);
    expect(profile.stats.pvpDeaths).toBe(1);
    const characters = await getAccountCharacters(accountName);
    expect(characters.characters.find((c) => c.pid === firstPid)?.stats.deaths).toBe(1);
  });

  it('marks guild links live only when current positive pid and name both match', async () => {
    const { getGuildProfile } = await import('../../../services/forumService.js');
    const [next] = await pool.query<RowDataPacket[]>(
      'SELECT COALESCE(MAX(id),0)+1 AS id FROM associations',
    );
    const associationId = Number(next[0].id);
    const [original] = await pool.query<RowDataPacket[]>(
      'SELECT pid,assoc_id FROM player_data WHERE pid IN (?,?)',
      [firstPid, secondPid],
    );
    const differentName = `different_${fixtureSuffix}`;
    nativeGuildName = `Synthetic guild ${fixtureSuffix}`;
    let created = false;
    try {
      await pool.query('INSERT INTO associations (id,name) VALUES (?,?)', [
        associationId,
        nativeGuildName,
      ]);
      created = true;
      await pool.query('UPDATE player_data SET assoc_id=? WHERE pid IN (?,?)', [
        associationId,
        firstPid,
        secondPid,
      ]);
      await pool.query(
        'UPDATE account_characters SET char_name=? WHERE account_name=? AND pid=? AND char_name=?',
        [differentName, accountName, secondPid, secondCharacterName],
      );
      const profile = await getGuildProfile(nativeGuildName);
      expect(
        profile.members.map((member: { pid: number; characterExists: boolean }) => [
          member.pid,
          member.characterExists,
        ]),
      ).toEqual(
        expect.arrayContaining([
          [firstPid, true],
          [secondPid, false],
        ]),
      );
      expect(JSON.stringify(profile)).not.toContain(accountName);
    } finally {
      nativeGuildName = '';
      await pool.query(
        'UPDATE account_characters SET char_name=? WHERE account_name=? AND pid=? AND char_name=?',
        [secondCharacterName, accountName, secondPid, differentName],
      );
      for (const row of original)
        await pool.query('UPDATE player_data SET assoc_id=? WHERE pid=?', [row.assoc_id, row.pid]);
      if (created) await pool.query('DELETE FROM associations WHERE id=?', [associationId]);
    }
  });

  it('keeps independent aggregates while hiding character totals from public profiles', async () => {
    const { getUserProfile } = await import('../../../services/forumService.js');
    const profile = await getUserProfile(accountName);
    expect(profile?.stats).toMatchObject({
      characterCount: 2,
      totalDeaths: 1,
      totalFrags: 17,
      totalWealth: 18645,
    });
    const app = express();
    app.use('/api/forum', forumRoutes);

    const response = await request(app).get(`/api/forum/users/${accountName}/profile`);

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      accountName,
      stats: {
        characterCount: null,
        totalDeaths: null,
        totalFrags: null,
        totalThreads: 0,
        totalPosts: 0,
        totalWealth: null,
      },
    });
  });

  it('serves frag summaries from real SQL without revealing an owner or duplicating links', async () => {
    const { default: fragRoutes } = await import('../../../routes/frag.js');
    const app = express();
    app.use('/api/frag', fragRoutes);
    const leaderboard = await request(app)
      .get('/api/frag/leaderboard')
      .query({ char_name: firstCharacterName, account_name: 'Differentaccount' });
    expect(leaderboard.status).toBe(200);
    expect(leaderboard.body.data).toHaveLength(1);
    expect(leaderboard.body.pagination.total).toBe(1);
    expect(leaderboard.body.data[0]).toMatchObject({
      char_name: firstCharacterName,
      total_frags: 12.34,
    });
    const player = await request(app).get(`/api/frag/player/${firstCharacterName}`);
    expect(player.status).toBe(200);
    expect(player.body).toMatchObject({ char_name: firstCharacterName, total_frags: 12.34 });
    const gainers = await request(app).get('/api/frag/top-gainers');
    expect(gainers.status).toBe(200);
    for (const response of [leaderboard, player, gainers]) {
      expect(JSON.stringify(response.body)).not.toContain(accountName);
      expect(JSON.stringify(response.body)).not.toContain('account_name');
    }
    expect((await request(app).get(`/api/frag/account/${accountName}`)).status).toBe(404);
  });
});
