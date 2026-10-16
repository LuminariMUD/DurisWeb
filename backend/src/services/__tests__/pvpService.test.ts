import { afterAll, beforeAll, beforeEach, describe, expect, it, jest } from '@jest/globals';
import mysql, { type Connection } from 'mysql2/promise';
import type { SearchFilters } from '../../types/index.js';
import { extractPlayerName } from '../../utils/stringUtils.js';

const query = jest.fn<(sql: string, params?: unknown[]) => Promise<unknown>>();
const settings = { pvpDelayMinutes: 0, respectWebinfoToggle: true };
jest.unstable_mockModule('../../db/connection.js', () => ({ pool: { query } }));
jest.unstable_mockModule('../webSettingsService.js', () => ({
  getWebSettings: async () => settings,
}));
jest.unstable_mockModule('../../utils/logger.js', () => ({
  default: { error: jest.fn() },
  isErrorWithCode: () => false,
}));
const service = await import('../pvpService.js');

beforeEach(() => {
  query.mockReset();
  settings.respectWebinfoToggle = true;
  settings.pvpDelayMinutes = 0;
});

describe('historical PvP records', () => {
  it.each([
    ['Fixture', 'Fixture'],
    ['&+RFixture&n', 'Fixture'],
    ['[ 5 &+RWarrior&n] Fixture &n-Guild- (Human)', 'Fixture'],
    ['', ''],
    ['not a character description', ''],
  ])('extracts the name from %s without inventing an identity', (description, expected) => {
    expect(extractPlayerName(description)).toBe(expected);
  });

  it('filters on captured levels and includes levels in list summaries', async () => {
    query.mockResolvedValueOnce([[{ total: 1 }]]).mockResolvedValueOnce([
      [
        {
          id: 1,
          stamp_epoch: 1577836800,
          killers: 'Fixture<<>>1<<>>56',
          victims: 'Other<<>>0<<>>1<<>>52',
        },
      ],
    ]);
    const filters: SearchFilters = { level_min: 50, level_max: 55 };
    const result = await service.getPvPEvents(filters);
    expect(
      query.mock.calls.every(
        ([sql]) => sql.includes('matched.level >= ?') && sql.includes('matched.level <= ?'),
      ),
    ).toBe(true);
    expect(result.events[0].killers).toEqual([
      { description: 'Fixture', isLeader: true, level: 56 },
    ]);
    expect(result.events[0].victims[0]).toMatchObject({ level: 52, died: true });
  });

  it('keeps name-only players in leaderboards and autocomplete with their captured level', async () => {
    const row = { player_description: 'Fixture', level: 56, kills: 1, deaths: 0, kd_ratio: 1 };
    query.mockResolvedValueOnce([[row]]).mockResolvedValueOnce([[row]]);
    expect((await service.getLeaderboard('kills', 'all'))[0]).toMatchObject({
      playerName: 'Fixture',
      level: 56,
      class: '',
      race: '',
    });
    expect(await service.getPlayerAutocomplete('', 1, 20)).toEqual([
      {
        name: 'Fixture',
        displayName: 'Fixture',
        level: 56,
        class: '',
        race: '',
      },
    ]);
  });

  it('looks up name-only player statistics and their opponents', async () => {
    query
      .mockResolvedValueOnce([[{ pid: 0, player_description: 'Fixture', level: 56 }]])
      .mockResolvedValueOnce([[{ kills: 1, deaths: 0, kd_ratio: 1 }]])
      .mockResolvedValueOnce([
        [{ event_id: 1, stamp_epoch: 1577836800, pk_type: 'KILLER', opponents: 'Other' }],
      ])
      .mockResolvedValueOnce([[]])
      .mockResolvedValueOnce([[{ player_description: 'Other', count: 1 }]]);
    const result = await service.getPlayerStats('Fixture');
    expect(result).toMatchObject({
      playerName: 'Fixture',
      level: 56,
      mostKilled: [{ opponent_name: 'Other', count: 1 }],
    });
    expect(query.mock.calls.every(([, params]) => params?.includes('Fixture'))).toBe(true);
  });

  it('reads metadata from the MUD formatter with a padded single-digit level', async () => {
    const description = '[ 5 &+RWarrior&n] Fixture &n-Guild- &n(Human&n)';
    const row = { player_description: description, level: 5, kills: 1, deaths: 0, kd_ratio: 1 };
    query
      .mockResolvedValueOnce([[row]])
      .mockResolvedValueOnce([[row]])
      .mockResolvedValueOnce([[row]])
      .mockResolvedValueOnce([[{ ...row, latest_description: description }]])
      .mockResolvedValue([[]]);
    const metadata = { level: 5, class: '&+RWarrior&n', race: 'Human&n' };
    expect((await service.getLeaderboard('kills', 'all'))[0]).toMatchObject(metadata);
    expect((await service.getPlayerAutocomplete('Fixture'))[0]).toMatchObject(metadata);
    expect(await service.getPlayerStats('Fixture')).toMatchObject(metadata);
  });
});

// Opt in only on a disposable instance. The production/default ports are refused,
// and no application environment file or database credentials are used.
const fixturePort = Number(process.env.TEST_PVP_DB_PORT);
const databaseTests = fixturePort ? describe : describe.skip;
databaseTests('PvP SQL contract on a disposable database', () => {
  let connection: Connection;
  beforeAll(async () => {
    if (
      !Number.isInteger(fixturePort) ||
      fixturePort < 1024 ||
      [3306, 3307].includes(fixturePort)
    ) {
      throw new Error('TEST_PVP_DB_PORT must identify a disposable instance');
    }
    connection = await mysql.createConnection({
      host: '127.0.0.1',
      port: fixturePort,
      user: 'root',
      dateStrings: true,
    });
    await connection.query('CREATE DATABASE pvp_snapshot_test');
    await connection.changeUser({ database: 'pvp_snapshot_test' });
    // changeUser resets session variables; set the fixture timezone afterward.
    await connection.query("SET time_zone = '+00:00'");
    await connection.query(
      'CREATE TABLE pkill_event(id INT PRIMARY KEY, stamp DATETIME, room_name TEXT, room_vnum INT, like_count INT DEFAULT 0, comment_count INT DEFAULT 0)',
    );
    await connection.query(
      'CREATE TABLE pkill_info(id INT PRIMARY KEY, event_id INT, pid INT, level INT, pk_type VARCHAR(20), player_description VARCHAR(255), equip TEXT, log TEXT, inroom INT, leader INT)',
    );
    await connection.query('CREATE TABLE player_data(pid INT PRIMARY KEY, act2 BIGINT)');
    await connection.query(
      'CREATE TABLE pvp_battle_favorites(event_id INT, account_name VARCHAR(255), created_at DATETIME DEFAULT CURRENT_TIMESTAMP)',
    );
    await connection.query(
      'CREATE TABLE pvp_battle_likes(event_id INT, account_name VARCHAR(255), UNIQUE(event_id, account_name))',
    );
    await connection.query(
      `CREATE TABLE pvp_battle_comments(id INT PRIMARY KEY AUTO_INCREMENT, event_id INT, account_name VARCHAR(255), character_pid INT, content TEXT, parent_id INT, is_deleted INT DEFAULT 0, created_at DATETIME DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP, quoted_text TEXT, line_number INT, participant_id INT)`,
    );
    await connection.query(
      'CREATE TABLE frag_leaderboard(pid INT, char_name VARCHAR(255), race VARCHAR(255), class VARCHAR(255), level INT)',
    );
    await connection.query(
      "INSERT INTO pkill_event(id,stamp,room_name,room_vnum) VALUES(1,'2020-01-01','Fixture room',1)",
    );
    await connection.query('INSERT INTO player_data VALUES (1,0),(2,134217728),(3,134217728)');
    await connection.query('INSERT INTO pkill_info VALUES ?', [
      [
        [1, 1, 1, 56, 'KILLER', 'Fixture', '<wielded> private sword', '', 1, 1],
        [
          2,
          1,
          2,
          52,
          'VICTIM',
          '[52 &+RCleric&n] Other (Orc)',
          '<held> shield',
          'You fall.\r\n',
          1,
          0,
        ],
        [3, 1, 3, 51, 'KILLER', '[51 Warrior] Ally (Human)', '', '', 1, 0],
      ],
    ]);
  });
  beforeEach(async () => {
    await connection.query('DELETE FROM pvp_battle_comments');
    await connection.query('DELETE FROM pvp_battle_likes');
    await connection.query('DELETE FROM pvp_battle_favorites');
    await connection.query('DELETE FROM pkill_info WHERE event_id != 1');
    await connection.query('DELETE FROM pkill_event WHERE id != 1');
    query.mockImplementation(async (sql, params) => connection.query(sql, params));
  });
  afterAll(async () => {
    if (connection) {
      await connection.query('DROP DATABASE pvp_snapshot_test');
      await connection.end();
    }
  });

  it('finds the existing battle by numeric level and retains every participant', async () => {
    const result = await service.getPvPEvents({ level_min: 50 } as SearchFilters);
    expect(result.total).toBe(1);
    expect(result.events[0]).toMatchObject({ killer_count: 2, victim_count: 1 });
    expect(result.events[0].killers).toContainEqual({
      description: 'Fixture',
      isLeader: true,
      level: 56,
    });
  });

  it('keeps raw snapshots behind the privacy gate and exposes public snapshots intact', async () => {
    const result = await service.getPvPEventDetail(1);
    expect(result?.participants.find((p) => p.pid === 1)?.equip).toBeNull();
    expect(result?.participants.find((p) => p.pid === 2)).toMatchObject({
      equip: '<held> shield',
      log: 'You fall.\r\n',
    });
    expect(result?.participants.find((p) => p.pid === 3)?.equip).toBe('');
    settings.respectWebinfoToggle = false;
    expect((await service.getPvPEventDetail(1))?.participants.find((p) => p.pid === 1)?.equip).toBe(
      '<wielded> private sword',
    );
  });

  it('serves names, levels, rich metadata, and statistics for both record formats', async () => {
    expect(await service.getLeaderboard('kills', 'all')).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ playerName: 'Fixture', level: 56, class: '', race: '' }),
        expect.objectContaining({ playerName: 'Ally', level: 51, class: 'Warrior', race: 'Human' }),
      ]),
    );
    expect(await service.getPlayerAutocomplete('Fixture')).toEqual([
      { name: 'Fixture', displayName: 'Fixture', level: 56, class: '', race: '' },
    ]);
    expect(await service.getPlayerStats('Fixture')).toMatchObject({
      playerName: 'Fixture',
      level: 56,
      kills: 1,
      deaths: 0,
    });
    expect(await service.getPlayerStats('Nobody')).toBeNull();
    expect(await service.getClassMatchups('all')).toEqual([
      { killer_class: 'Warrior', victim_class: 'Cleric', wins: 1 },
    ]);
  });

  it.each<SearchFilters>([
    { player: 'Fixture' },
    { class: 'Warrior' },
    { race: 'Orc' },
    { level_min: 55 },
    { level_max: 52 },
    { alignment: 'evil' },
  ])('preserves both complete teams for participant filter %j', async (filters) => {
    const result = await service.getPvPEvents(filters);
    expect(result.total).toBe(1);
    expect(result.events).toHaveLength(1);
    expect(result.events[0]).toMatchObject({ killer_count: 2, victim_count: 1 });
  });

  it('excludes out-of-room participants from both search counts and results', async () => {
    await connection.query("INSERT INTO pkill_info VALUES (4,1,4,56,'KILLER','Outside','','',0,0)");
    expect(await service.getPvPEvents({ player: 'Outside' })).toEqual({ events: [], total: 0 });
    await connection.query('DELETE FROM pkill_info WHERE id = 4');
  });

  it('includes the entire selected calendar day and emits explicit timestamp offsets', async () => {
    await connection.query(
      "INSERT INTO pkill_event(id,stamp) VALUES (2,'2020-01-01 12:00:00'),(3,'2020-01-02 00:00:00')",
    );
    const result = await service.getPvPEvents({ date_from: '2020-01-01', date_to: '2020-01-01' });
    expect(result.events.map((e) => e.id)).toEqual([2, 1]);
    expect(result.events[0].stamp).toBe('2020-01-01T12:00:00.000Z');
    expect((await service.getPvPEventDetail(2))?.event.stamp).toBe(result.events[0].stamp);
  });

  it('aggregates historical descriptions by PID and resolves exact names before statistics', async () => {
    await connection.query(
      "INSERT INTO pkill_event(id,stamp) VALUES (2,'2020-01-02'),(3,'2020-01-03')",
    );
    await connection.query(
      "INSERT INTO pkill_info VALUES (4,2,1,55,'KILLER','[55 Warrior] Fixture (Human)','','',1,0),(5,3,4,55,'VICTIM','[55 Warrior] Fixturebeta (Human)','','',1,0)",
    );
    const ranks = await service.getLeaderboard('kills', 'all');
    expect(ranks.filter((p) => p.playerName === 'Fixture')).toEqual([
      expect.objectContaining({ kills: 2, deaths: 0, level: 55 }),
    ]);
    expect(await service.getPlayerStats('Fixture')).toMatchObject({
      kills: 2,
      deaths: 0,
      level: 55,
    });
    const first = await service.getPlayerAutocomplete('Fixture', 1, 1);
    const second = await service.getPlayerAutocomplete('Fixture', 2, 1);
    expect(first.map((p) => p.name)).toEqual(['Fixture']);
    expect(second.map((p) => p.name)).toEqual(['Fixturebeta']);
  });

  it('keeps fresh battles out of every public summary until the visibility cutoff', async () => {
    settings.pvpDelayMinutes = 15;
    await connection.query(
      "INSERT INTO pkill_event(id,stamp,room_name,room_vnum) VALUES(2,NOW(),'Hidden room',2)",
    );
    await connection.query(
      "INSERT INTO pkill_info VALUES (4,2,4,56,'KILLER','[56 Mage] Hidden (Human)','','',1,1),(5,2,5,56,'VICTIM','[56 Rogue] Concealed (Orc)','','',1,1)",
    );
    await connection.query(
      "INSERT INTO pvp_battle_favorites(event_id,account_name) VALUES (2,'fixture')",
    );
    expect((await service.getPvPEvents({})).events.map((e) => e.id)).toEqual([1]);
    expect(await service.getPvPEventDetail(2)).toBeNull();
    expect(
      (await service.getLeaderboard('kills', 'all')).some((p) => p.playerName === 'Hidden'),
    ).toBe(false);
    expect(await service.getPlayerStats('Hidden')).toBeNull();
    expect(await service.getPlayerAutocomplete('Hidden')).toEqual([]);
    expect(await service.getLocationAutocomplete('Hidden')).toEqual([]);
    expect(await service.getKillTimeline('7d')).toEqual([]);
    expect((await service.getActiveHours('7d')).reduce((sum, row) => sum + row.kills, 0)).toBe(0);
    expect(await service.getPopularLocations(10, '7d')).toEqual([]);
    expect(await service.getClassMatchups('7d')).toEqual([]);
    expect(await service.getUserFavorites('fixture')).toEqual({ data: [], total: 0 });
    settings.pvpDelayMinutes = 0;
    expect((await service.getPvPEvents({})).events.map((e) => e.id)).toEqual([2, 1]);
    expect(await service.getPlayerStats('Hidden')).toMatchObject({ kills: 1 });
    expect(await service.getPlayerAutocomplete('Hidden')).toHaveLength(1);
    expect(await service.getLocationAutocomplete('Hidden')).toHaveLength(1);
    expect(await service.getKillTimeline('7d')).toHaveLength(1);
    expect((await service.getActiveHours('7d')).reduce((sum, row) => sum + row.kills, 0)).toBe(1);
    expect(await service.getPopularLocations(10, '7d')).toHaveLength(1);
    expect(await service.getClassMatchups('7d')).toEqual([
      { killer_class: 'Mage', victim_class: 'Rogue', wins: 1 },
    ]);
    expect((await service.getUserFavorites('fixture')).total).toBe(1);
  });

  it.each([
    ['comments', () => service.getBattleComments(2)],
    ['stats', () => service.getBattleInteractionStats(2, 'fixture')],
    ['like status', () => service.hasUserLiked(2, 'fixture')],
    ['like', () => service.addBattleLike(2, 'fixture')],
    ['unlike', () => service.removeBattleLike(2, 'fixture')],
    ['favorite status', () => service.hasUserFavorited(2, 'fixture')],
    ['favorite', () => service.addBattleFavorite(2, 'fixture')],
    ['unfavorite', () => service.removeBattleFavorite(2, 'fixture')],
    ['comment', () => service.createBattleComment(2, 'fixture', 'Hidden comment')],
  ])(
    'refuses hidden-event %s before reading or changing interactions',
    async (_name, operation) => {
      settings.pvpDelayMinutes = 15;
      await connection.query('INSERT INTO pkill_event(id,stamp) VALUES(2,NOW())');
      await expect(operation()).rejects.toMatchObject({ statusCode: 404 });
      expect(query.mock.calls).toHaveLength(1);
      expect(query.mock.calls[0][0]).toMatch(/^SELECT e.id/);
    },
  );

  it('conceals comments on events hidden by a changed delay, including edit and delete', async () => {
    settings.pvpDelayMinutes = 15;
    await connection.query('INSERT INTO pkill_event(id,stamp) VALUES(2,NOW())');
    await connection.query(
      "INSERT INTO pvp_battle_comments(id,event_id,account_name,content) VALUES(1,2,'fixture','Comment')",
    );
    expect(await service.getBattleCommentById(1)).toBeNull();
    expect(await service.updateBattleComment(1, 'fixture', 'Changed')).toBe(false);
    expect(await service.deleteBattleComment(1, 'fixture', false)).toBe(false);
    settings.pvpDelayMinutes = 0;
    expect(await service.getBattleCommentById(1)).toEqual({ eventId: 2, accountName: 'fixture' });
    expect(await service.getBattleComments(2)).toHaveLength(1);
    expect(await service.getBattleInteractionStats(2)).toMatchObject({ likeCount: 0 });
  });

  it('retains deleted thread slots and their replies in the comment count', async () => {
    await connection.query(
      "INSERT INTO pvp_battle_comments(id,event_id,account_name,content,parent_id) VALUES(1,1,'fixture','Parent',NULL),(2,1,'fixture','Reply',1)",
    );
    await connection.query('UPDATE pkill_event SET comment_count = 2 WHERE id = 1');
    await service.deleteBattleComment(1, 'fixture', false);
    await service.deleteBattleComment(1, 'fixture', false);
    expect((await service.getBattleInteractionStats(1)).commentCount).toBe(2);
    expect(await service.getBattleComments(1)).toEqual([
      expect.objectContaining({
        content: '[deleted]',
        replies: [expect.objectContaining({ content: 'Reply' })],
      }),
    ]);
    await connection.query('UPDATE pkill_event SET comment_count = 0 WHERE id = 1');
  });

  it('releases batches in timestamp/ID order and rechecks the delay on every poll', async () => {
    settings.pvpDelayMinutes = 15;
    await connection.query(
      "INSERT INTO pkill_event(id,stamp) VALUES(2,'2020-01-01'),(3,'2020-01-01'),(4,NOW())",
    );
    const cursor = { stamp: '2020-01-01T00:00:00.000Z', id: 1 };
    expect((await service.getReleasedEventsAfter(cursor, 1)).map((e) => e.id)).toEqual([2]);
    expect(
      (await service.getReleasedEventsAfter({ ...cursor, id: 2 }, 100)).map((e) => e.id),
    ).toEqual([3]);
    settings.pvpDelayMinutes = 0;
    expect(
      (await service.getReleasedEventsAfter({ ...cursor, id: 3 }, 100)).map((e) => e.id),
    ).toEqual([4]);
    expect(query.mock.calls.every(([sql]) => !sql.includes('COUNT('))).toBe(true);
  });

  it('counts complete matchup history beyond the former 1,000-row sample', async () => {
    const events = Array.from({ length: 1001 }, (_, i) => [i + 2, '2020-01-01']);
    await connection.query('INSERT INTO pkill_event(id,stamp) VALUES ?', [events]);
    const players = events.flatMap(([id], i) => [
      [i * 2 + 4, id, 10, 56, 'KILLER', '[56 Mage] History (Human)', '', '', 1, 1],
      [i * 2 + 5, id, 11, 56, 'VICTIM', '[56 Rogue] Opponent (Orc)', '', '', 1, 0],
    ]);
    await connection.query('INSERT INTO pkill_info VALUES ?', [players]);
    expect(await service.getClassMatchups('all')).toContainEqual({
      killer_class: 'Mage',
      victim_class: 'Rogue',
      wins: 1001,
    });
  });
});
