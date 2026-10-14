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
          killers: 'Fixture<<>>1<<>>56',
          victims: 'Other<<>>0<<>>1<<>>52',
        },
      ],
    ]);
    const filters: SearchFilters = { level_min: 50, level_max: 55 };
    const result = await service.getPvPEvents(filters);
    expect(
      query.mock.calls.every(
        ([sql]) => sql.includes('p.level >= ?') && sql.includes('p.level <= ?'),
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
      .mockResolvedValueOnce([
        [{ latest_description: 'Fixture', level: 56, kills: 1, deaths: 0, kd_ratio: 1 }],
      ])
      .mockResolvedValueOnce([[{ event_id: 1, pk_type: 'KILLER', opponents: 'Other' }]])
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
    await connection.query(
      'CREATE TABLE pkill_event(id INT PRIMARY KEY, stamp DATETIME, room_name TEXT, room_vnum INT, like_count INT DEFAULT 0, comment_count INT DEFAULT 0)',
    );
    await connection.query(
      'CREATE TABLE pkill_info(id INT PRIMARY KEY, event_id INT, pid INT, level INT, pk_type VARCHAR(20), player_description VARCHAR(255), equip TEXT, log TEXT, inroom INT, leader INT)',
    );
    await connection.query('CREATE TABLE player_data(pid INT PRIMARY KEY, act2 BIGINT)');
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
  beforeEach(() => {
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
});
