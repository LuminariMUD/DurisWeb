import { afterAll, beforeAll, beforeEach, describe, expect, it, jest } from '@jest/globals';
import mysql, { type Pool, type PoolConnection, type RowDataPacket } from 'mysql2/promise';
import knex, { type Knex } from 'knex';
import { resolve } from 'node:path';
import type { postBattleToDiscord } from '../discordService.js';

// Migrations run separately from the src/ application build, as in Knex's runner.
const migrationPath = resolve('migrations/20261016150000_pvp_discord_delivery.ts');
const { up, down } = (await import(migrationPath)) as {
  up: (db: Knex) => Promise<void>;
  down: (db: Knex) => Promise<void>;
};
const auditMigration = (await import(
  resolve('migrations/20261016160000_pvp_discord_audit_columns.ts')
)) as {
  up: (db: Knex) => Promise<void>;
  down: (db: Knex) => Promise<void>;
};

let database: Pool;
let migrationDb: Knex;
const channelId = '123456789012345678';
const configuration = {
  database: { database: 'pvp_delivery_test' },
  discordBot: { channelId, token: 'fixture-only' },
};
const send = jest.fn<typeof postBattleToDiscord>();
const getConnection = jest.fn<() => Promise<PoolConnection>>();
jest.unstable_mockModule('../../db/connection.js', () => ({
  pool: { getConnection },
}));
jest.unstable_mockModule('../../config/environment.js', () => ({
  getBackendConfiguration: () => configuration,
}));
jest.unstable_mockModule('../discordService.js', () => ({ postBattleToDiscord: send }));
jest.unstable_mockModule('../webSettingsService.js', () => ({ getWebSettings: jest.fn() }));
jest.unstable_mockModule('../../utils/logger.js', () => ({ default: { error: jest.fn() } }));
const service = await import('../pvpDiscordDelivery.js');

const port = Number(process.env.TEST_PVP_DB_PORT);
const isolated = port ? describe : describe.skip;
isolated('durable Discord delivery on a disposable database', () => {
  beforeAll(async () => {
    if (!Number.isInteger(port) || port < 1024 || [3306, 3307].includes(port)) {
      throw new Error('TEST_PVP_DB_PORT must identify a disposable instance');
    }
    const connection = await mysql.createConnection({ host: '127.0.0.1', port, user: 'root' });
    await connection.query('CREATE DATABASE pvp_delivery_test');
    await connection.end();
    const options = { host: '127.0.0.1', port, user: 'root', database: 'pvp_delivery_test' };
    database = mysql.createPool({ ...options, dateStrings: true });
    migrationDb = knex({ client: 'mysql2', connection: options });
    await database.query(
      'CREATE TABLE pkill_event(id INT PRIMARY KEY, stamp DATETIME NOT NULL, room_name TEXT)',
    );
    await database.query(
      'CREATE TABLE pkill_info(event_id INT, player_description TEXT, pk_type VARCHAR(20), leader INT, inroom INT)',
    );
    await database.query(
      'CREATE TABLE web_settings(setting_key VARCHAR(64) PRIMARY KEY, setting_value TEXT, updated_by VARCHAR(64), updated_at DATETIME)',
    );
    await up(migrationDb);
    await auditMigration.up(migrationDb);
  });
  afterAll(async () => {
    if (database) {
      await migrationDb.destroy();
      await database.query('DROP DATABASE pvp_delivery_test');
      await database.end();
    }
  });
  beforeEach(async () => {
    getConnection.mockReset().mockImplementation(() => database.getConnection());
    await database.query('DROP TRIGGER IF EXISTS fail_delivery_receipt');
    await database.query('DROP TRIGGER IF EXISTS fail_destination_state');
    for (const table of [
      'web_pvp_discord_deliveries',
      'web_pvp_discord_destinations',
      'pkill_info',
      'pkill_event',
      'web_settings',
    ]) {
      await database.query(`DELETE FROM ${table}`);
    }
    await database.query(
      "INSERT INTO web_settings(setting_key,setting_value) VALUES ('discord_webhook_enabled','false'),('pvp_delay_minutes','0')",
    );
    configuration.discordBot.channelId = channelId;
    send.mockReset().mockResolvedValue({ status: 'delivered', messageId: '987654321' });
  });

  async function event(id: number, stamp = '2020-01-01 00:00:00') {
    await database.query('INSERT INTO pkill_event(id,stamp,room_name) VALUES (?, ?, ?)', [
      id,
      stamp,
      'Fixture room',
    ]);
    await database.query(
      "INSERT INTO pkill_info VALUES (?, 'Fixture', 'KILLER', 1, 1), (?, 'Victim', 'VICTIM', 0, 1)",
      [id, id],
    );
  }
  async function rows(sql = 'SELECT * FROM web_pvp_discord_deliveries ORDER BY event_id') {
    return (await database.query<RowDataPacket[]>(sql))[0];
  }
  async function makeReady() {
    await database.query('UPDATE web_pvp_discord_deliveries SET available_at = UTC_TIMESTAMP()');
    await database.query('UPDATE web_pvp_discord_destinations SET available_at = UTC_TIMESTAMP()');
  }

  it('reverses and reapplies its migration without modifying MUD tables', async () => {
    await event(1);
    await auditMigration.down(migrationDb);
    await down(migrationDb);
    expect(await rows('SELECT id FROM pkill_event')).toEqual([{ id: 1 }]);
    await up(migrationDb);
    await auditMigration.up(migrationDb);
    expect(await rows()).toEqual([]);
  });

  it('upgrades existing receipts with unique row IDs and destination timestamps reversibly', async () => {
    await auditMigration.down(migrationDb);
    await service.setDiscordAutoPosting(true, 'fixture');
    await event(1);
    await service.pollDiscordDeliveries();
    const [receipt] = await rows();
    const [destination] = await rows('SELECT * FROM web_pvp_discord_destinations');
    await auditMigration.up(migrationDb);
    expect((await rows())[0]).toMatchObject({ ...receipt, id: expect.any(Number) });
    expect((await rows('SELECT * FROM web_pvp_discord_destinations'))[0]).toMatchObject({
      ...destination,
      id: expect.any(Number),
      created_at: destination.activated_at,
      updated_at: destination.activated_at,
    });
    await database.query("UPDATE web_pvp_discord_destinations SET updated_at = '2000-01-01'");
    await event(2);
    send.mockResolvedValueOnce({ status: 'failed', code: 'forbidden' });
    await service.pollDiscordDeliveries();
    expect((await rows('SELECT * FROM web_pvp_discord_destinations'))[0].updated_at).not.toContain(
      '2000-01-01',
    );
    const receipts = await rows();
    expect(new Set(receipts.map((row) => row.id)).size).toBe(2);
    await auditMigration.down(migrationDb);
    expect((await rows())[0]).toEqual(receipt);
    await auditMigration.up(migrationDb);
  });

  it('starts at first enable without historical flooding and drains more than one tied-timestamp batch', async () => {
    await event(1);
    await service.pollDiscordDeliveries();
    expect(await rows('SELECT * FROM web_pvp_discord_destinations')).toEqual([]);
    await service.setDiscordAutoPosting(true, 'fixture');
    for (let id = 2; id <= 105; id++) await event(id);
    await service.pollDiscordDeliveries();
    expect(send).toHaveBeenCalledTimes(100);
    await service.pollDiscordDeliveries();
    expect(send.mock.calls.map(([id]) => id)).toEqual(Array.from({ length: 104 }, (_, i) => i + 2));
    expect((await rows()).every((row) => row.status === 'delivered')).toBe(true);
    // A fresh invocation owns no memory watermark; persisted successes are sufficient.
    await service.pollDiscordDeliveries();
    expect(send).toHaveBeenCalledTimes(104);
  });

  it('does not strand out-of-order commits, changed delay, or the exact release boundary', async () => {
    await service.setDiscordAutoPosting(true, 'fixture');
    await database.query(
      "UPDATE web_settings SET setting_value='15' WHERE setting_key='pvp_delay_minutes'",
    );
    await database.query(
      "INSERT INTO pkill_event VALUES (5, DATE_SUB(NOW(), INTERVAL 15 MINUTE), 'Boundary'), (7, NOW(), 'Hidden')",
    );
    await service.pollDiscordDeliveries();
    expect(send.mock.calls.map(([id]) => id)).toEqual([5]);
    // A lower ID commits after a higher one has already been delivered.
    await event(3);
    await service.pollDiscordDeliveries();
    expect(send.mock.calls.map(([id]) => id)).toEqual([5, 3]);
    await database.query(
      "UPDATE web_settings SET setting_value='0' WHERE setting_key='pvp_delay_minutes'",
    );
    await service.pollDiscordDeliveries();
    expect(send.mock.calls.map(([id]) => id)).toEqual([5, 3, 7]);
  });

  it('applies the first-enable ID cutoff to earlier reservations while recovering late commits above it', async () => {
    const writer = await database.getConnection();
    try {
      await writer.beginTransaction();
      await writer.query("INSERT INTO pkill_event VALUES (1, '2020-01-01', 'Earlier reservation')");
      await event(2);
      await service.setDiscordAutoPosting(true, 'fixture');
      expect((await rows('SELECT * FROM web_pvp_discord_destinations'))[0].boundary_event_id).toBe(
        2,
      );
      await writer.commit();
      await service.pollDiscordDeliveries();
      expect(send).not.toHaveBeenCalled();

      await writer.beginTransaction();
      await writer.query(
        "INSERT INTO pkill_event VALUES (3, '2020-01-01', 'Post-boundary reservation')",
      );
      await event(4);
      await service.pollDiscordDeliveries();
      expect(send.mock.calls.map(([id]) => id)).toEqual([4]);
      await writer.commit();
      await service.pollDiscordDeliveries();
      expect(send.mock.calls.map(([id]) => id)).toEqual([4, 3]);
    } finally {
      await writer.rollback();
      writer.release();
    }
  });

  it('retains pause backlog and rechecks a raised privacy delay before sending queued work', async () => {
    await service.setDiscordAutoPosting(true, 'fixture');
    await service.setDiscordAutoPosting(false, 'fixture');
    await database.query("INSERT INTO pkill_event VALUES (1, NOW(), 'Fixture')");
    await service.pollDiscordDeliveries();
    expect((await rows())[0].status).toBe('pending');
    expect(send).not.toHaveBeenCalled();
    await database.query(
      "UPDATE web_settings SET setting_value='15' WHERE setting_key='pvp_delay_minutes'",
    );
    await service.setDiscordAutoPosting(true, 'fixture');
    await service.pollDiscordDeliveries();
    expect(send).not.toHaveBeenCalled();
    await database.query(
      "UPDATE web_settings SET setting_value='0' WHERE setting_key='pvp_delay_minutes'",
    );
    await service.pollDiscordDeliveries();
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('rechecks delay between attempts in one batch', async () => {
    await service.setDiscordAutoPosting(true, 'fixture');
    await database.query("INSERT INTO pkill_event VALUES (1, NOW(), 'One'), (2, NOW(), 'Two')");
    send.mockImplementationOnce(async () => {
      await database.query(
        "UPDATE web_settings SET setting_value='15' WHERE setting_key='pvp_delay_minutes'",
      );
      return { status: 'delivered', messageId: '1' };
    });
    await service.pollDiscordDeliveries();
    expect(send).toHaveBeenCalledTimes(1);
    expect((await rows()).map((row) => row.status)).toEqual(['delivered', 'pending']);
  });

  it.each([
    ['rate_limited', false, 65_500],
    ['server_error', true, 30_000],
    ['network_error', true, 30_000],
  ] as const)(
    'persists %s and retries only after its deadline with the same nonce',
    async (code, ambiguous, retryAfterMs) => {
      await service.setDiscordAutoPosting(true, 'fixture');
      await event(1);
      await event(2);
      send.mockResolvedValueOnce({ status: 'retry', code, retryAfterMs, ambiguous });
      await service.pollDiscordDeliveries();
      expect(send).toHaveBeenCalledTimes(1);
      const [pending] = await rows(
        'SELECT *, TIMESTAMPDIFF(SECOND,UTC_TIMESTAMP(),available_at) AS delay FROM web_pvp_discord_deliveries ORDER BY event_id',
      );
      expect(pending.status).toBe('pending');
      expect(pending.error_code).toBe(code);
      expect(pending.ambiguous).toBe(Number(ambiguous));
      expect(pending.delay).toBeGreaterThanOrEqual(Math.ceil(retryAfterMs / 1000) - 1);
      await service.pollDiscordDeliveries();
      expect(send).toHaveBeenCalledTimes(1);
      await makeReady();
      await service.pollDiscordDeliveries();
      expect(send).toHaveBeenCalledTimes(3);
      expect(send.mock.calls[1][4]).toEqual(send.mock.calls[0][4]);
    },
  );

  it.each(['unauthorized', 'forbidden', 'not_found', 'http_error'] as const)(
    'blocks the destination on %s without a rapid per-event retry loop',
    async (code) => {
      await service.setDiscordAutoPosting(true, 'fixture');
      await event(1);
      await event(2);
      send.mockResolvedValueOnce({ status: 'failed', code });
      await service.pollDiscordDeliveries();
      await makeReady();
      await service.pollDiscordDeliveries();
      expect(send).toHaveBeenCalledTimes(1);
      expect((await rows('SELECT * FROM web_pvp_discord_destinations'))[0].blocked_reason).toBe(
        code,
      );
      expect((await rows())[0].status).toBe('failed');
      expect((await rows())[1].status).toBe('pending');
    },
  );

  it.each(['retry', 'failed'] as const)(
    'rolls back the %s event result when its destination policy cannot be saved',
    async (status) => {
      await service.setDiscordAutoPosting(true, 'fixture');
      await event(1);
      await event(2);
      send.mockResolvedValueOnce(
        status === 'retry'
          ? { status, code: 'network_error', retryAfterMs: 30_000, ambiguous: true }
          : { status, code: 'forbidden' },
      );
      await database.query(`CREATE TRIGGER fail_destination_state BEFORE UPDATE ON web_pvp_discord_destinations
        FOR EACH ROW BEGIN IF NEW.blocked_reason IS NOT NULL OR NEW.available_at > OLD.available_at
        THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'fixture destination failure'; END IF; END`);
      await expect(service.pollDiscordDeliveries()).rejects.toThrow('fixture destination failure');
      expect((await rows()).map((row) => row.status)).toEqual(['sending', 'pending']);
      expect((await rows())[0]).toMatchObject({ error_code: null, attempts: 1 });
      expect(
        (await rows('SELECT * FROM web_pvp_discord_destinations'))[0].blocked_reason,
      ).toBeNull();
      await database.query('DROP TRIGGER fail_destination_state');
      await makeReady();
      await service.pollDiscordDeliveries();
      expect(send.mock.calls.map(([id]) => id)).toEqual([1, 1, 2]);
      expect(send.mock.calls[1][4]).toEqual(send.mock.calls[0][4]);
      expect((await rows())[0]).toMatchObject({ status: 'delivered', ambiguous: 1 });
    },
  );

  it('keeps an invalid event visible as failed while delivering other events', async () => {
    await service.setDiscordAutoPosting(true, 'fixture');
    await event(1);
    await event(2);
    send.mockResolvedValueOnce({ status: 'failed', code: 'invalid_payload' });
    await service.pollDiscordDeliveries();
    expect((await rows()).map((row) => row.status)).toEqual(['failed', 'delivered']);
  });

  it('preserves old-channel pending work and starts a new channel with future battles', async () => {
    await service.setDiscordAutoPosting(true, 'fixture');
    await event(1);
    send.mockResolvedValueOnce({
      status: 'retry',
      code: 'network_error',
      retryAfterMs: 30_000,
      ambiguous: true,
    });
    await service.pollDiscordDeliveries();
    configuration.discordBot.channelId = '987654321012345678';
    await service.pollDiscordDeliveries();
    expect(send).toHaveBeenCalledTimes(1);
    await event(2);
    await service.pollDiscordDeliveries();
    expect(send.mock.calls[1][4]?.channelId).toBe(configuration.discordBot.channelId);
    configuration.discordBot.channelId = channelId;
    await makeReady();
    await service.pollDiscordDeliveries();
    expect(send.mock.calls.slice(2).map(([id]) => id)).toEqual([1, 2]);
    expect(send.mock.calls.slice(2).every((call) => call[4]?.channelId === channelId)).toBe(true);
  });

  it('manual posting satisfies automatic delivery and explicit reposts still work', async () => {
    await service.setDiscordAutoPosting(true, 'fixture');
    await event(1);
    await service.setDiscordAutoPosting(false, 'fixture');
    expect(await service.manualPostBattle(1)).toEqual({ success: true });
    await service.setDiscordAutoPosting(true, 'fixture');
    await service.pollDiscordDeliveries();
    expect(send).toHaveBeenCalledTimes(1);
    expect(await service.manualPostBattle(1)).toEqual({ success: true });
    expect(send).toHaveBeenCalledTimes(2);
    expect(send.mock.calls.every((call) => call[4] === undefined)).toBe(true);
    send.mockResolvedValueOnce({
      status: 'retry',
      code: 'network_error',
      retryAfterMs: 30_000,
      ambiguous: true,
    });
    expect(await service.manualPostBattle(1)).toMatchObject({ success: false });
    expect((await rows())[0].status).toBe('delivered');
  });

  it('does not post missing or embargoed events through the manual API service', async () => {
    await database.query(
      "UPDATE web_settings SET setting_value='15' WHERE setting_key='pvp_delay_minutes'",
    );
    await database.query("INSERT INTO pkill_event VALUES (1, NOW(), 'Hidden')");
    expect(await service.manualPostBattle(1)).toMatchObject({ success: false });
    expect(await service.manualPostBattle(999)).toMatchObject({ success: false });
    expect(send).not.toHaveBeenCalled();
  });

  it('serializes concurrent workers, manual posts and toggle changes during a slow send', async () => {
    await service.setDiscordAutoPosting(true, 'fixture');
    await event(1);
    let finish!: () => void;
    let started!: () => void;
    const sending = new Promise<void>((resolve) => {
      started = resolve;
    });
    send.mockImplementationOnce(async () => {
      started();
      await new Promise<void>((resolve) => {
        finish = resolve;
      });
      return { status: 'delivered', messageId: '1' };
    });
    const first = service.pollDiscordDeliveries();
    await sending;
    await service.pollDiscordDeliveries();
    expect(await service.manualPostBattle(1)).toMatchObject({ success: false });
    await expect(service.setDiscordAutoPosting(false, 'fixture')).rejects.toThrow('busy');
    expect(send).toHaveBeenCalledTimes(1);
    finish();
    await first;
    await service.setDiscordAutoPosting(false, 'fixture');
  });

  it('recovers a crash after Discord accepted but before its receipt could be committed', async () => {
    await service.setDiscordAutoPosting(true, 'fixture');
    await event(1);
    await database.query(`CREATE TRIGGER fail_delivery_receipt BEFORE UPDATE ON web_pvp_discord_deliveries
      FOR EACH ROW BEGIN IF NEW.status = 'delivered' THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'fixture receipt failure'; END IF; END`);
    await expect(service.pollDiscordDeliveries()).rejects.toThrow('fixture receipt failure');
    expect((await rows())[0].status).toBe('sending');
    await database.query('DROP TRIGGER fail_delivery_receipt');
    await service.pollDiscordDeliveries();
    expect(send).toHaveBeenCalledTimes(1);
    await makeReady();
    await service.pollDiscordDeliveries();
    expect(send.mock.calls[1][4]).toEqual(send.mock.calls[0][4]);
    expect((await rows())[0]).toMatchObject({ status: 'delivered', ambiguous: 1, attempts: 2 });
    await service.pollDiscordDeliveries();
    expect(send).toHaveBeenCalledTimes(2);
  });

  it('reports last automatic success, failed work and old-channel backlog without message content', async () => {
    expect(await service.getDiscordDeliveryStatus()).toMatchObject({
      configured: true,
      enabled: false,
      activated: false,
      pending: 0,
      failed: 0,
    });
    await service.setDiscordAutoPosting(true, 'fixture');
    await event(1);
    await service.pollDiscordDeliveries();
    await service.manualPostBattle(1);
    await event(2);
    send.mockResolvedValueOnce({ status: 'failed', code: 'forbidden' });
    await service.pollDiscordDeliveries();
    const status = await service.getDiscordDeliveryStatus();
    expect(status).toMatchObject({
      activated: true,
      blockedReason: 'forbidden',
      failed: 1,
      lastAutomaticSuccess: { eventId: 1, at: expect.stringMatching(/Z$/) },
      outstanding: [{ eventId: 2, status: 'failed', attempts: 1, errorCode: 'forbidden' }],
    });
    expect(JSON.stringify(status)).not.toMatch(/fixture-only|Fixture|Victim|nonce|token/);
    configuration.discordBot.channelId = '987654321012345678';
    expect(await service.getDiscordDeliveryStatus()).toMatchObject({
      activated: false,
      lastAutomaticSuccess: null,
      otherDestinations: [{ channelId, outstanding: 1 }],
    });
  });

  it('keeps status fields in one snapshot while a worker commits between reads', async () => {
    await service.setDiscordAutoPosting(true, 'fixture');
    await service.setDiscordAutoPosting(false, 'fixture');
    await event(1);
    await service.pollDiscordDeliveries();
    await service.setDiscordAutoPosting(true, 'fixture');
    const connection = await database.getConnection();
    await connection.query('SET SESSION TRANSACTION ISOLATION LEVEL READ COMMITTED');
    const originalQuery = connection.query.bind(connection);
    const query = jest.spyOn(connection, 'query').mockImplementation(async (...args) => {
      const result = await originalQuery(...args);
      const sql: unknown = args[0];
      if (typeof sql === 'string' && sql.includes('AS pending')) {
        await service.pollDiscordDeliveries();
      }
      return result;
    });
    getConnection.mockResolvedValueOnce(connection);
    try {
      expect(await service.getDiscordDeliveryStatus()).toMatchObject({
        pending: 1,
        lastAutomaticSuccess: null,
        outstanding: [{ eventId: 1, status: 'pending' }],
      });
    } finally {
      query.mockRestore();
    }
    expect(await service.getDiscordDeliveryStatus()).toMatchObject({
      pending: 0,
      lastAutomaticSuccess: { eventId: 1 },
      outstanding: [],
    });
  });

  it('counts undiscovered eligible work for inactive destinations without duplicating receipts or exposing embargoed battles', async () => {
    await service.setDiscordAutoPosting(true, 'fixture');
    await event(1);
    await service.pollDiscordDeliveries();
    await event(2);
    send.mockResolvedValueOnce({ status: 'failed', code: 'invalid_payload' });
    await service.pollDiscordDeliveries();
    configuration.discordBot.channelId = '987654321012345678';
    await service.pollDiscordDeliveries();
    await event(3);
    await database.query(
      "UPDATE web_settings SET setting_value='15' WHERE setting_key='pvp_delay_minutes'",
    );
    await database.query("INSERT INTO pkill_event VALUES (4, NOW(), 'Hidden')");
    await service.pollDiscordDeliveries();
    expect((await service.getDiscordDeliveryStatus()).otherDestinations).toEqual([
      { channelId, outstanding: 2 },
    ]);
    // Status must not create delivery records or send old-channel messages.
    expect(
      (await rows()).filter((row) => row.channel_id === channelId).map((row) => row.event_id),
    ).toEqual([1, 2]);
    configuration.discordBot.channelId = channelId;
    await service.pollDiscordDeliveries();
    expect(
      send.mock.calls.filter((call) => call[4]?.channelId === channelId).map(([id]) => id),
    ).toEqual([1, 2, 3]);
  });

  it('operator retry preserves receipts, pause, uncertainty and rate-limit deadlines', async () => {
    await service.setDiscordAutoPosting(true, 'fixture');
    await event(1);
    await service.pollDiscordDeliveries();
    await event(2);
    send.mockResolvedValueOnce({ status: 'failed', code: 'forbidden' });
    await service.pollDiscordDeliveries();
    await service.setDiscordAutoPosting(false, 'fixture');
    await database.query(
      'UPDATE web_pvp_discord_destinations SET available_at=DATE_ADD(UTC_TIMESTAMP(),INTERVAL 5 MINUTE)',
    );
    expect(await service.retryFailedDiscordDeliveries()).toBe(true);
    expect(await service.getDiscordDeliveryStatus()).toMatchObject({
      enabled: false,
      blockedReason: null,
      pending: 1,
      failed: 0,
      lastAutomaticSuccess: { eventId: 1 },
    });
    await service.pollDiscordDeliveries();
    expect(send).toHaveBeenCalledTimes(2);
    await service.setDiscordAutoPosting(true, 'fixture');
    await service.pollDiscordDeliveries();
    expect(send).toHaveBeenCalledTimes(2);
    await makeReady();
    await service.pollDiscordDeliveries();
    expect(send.mock.calls.map(([id]) => id)).toEqual([1, 2, 2]);
  });
});
