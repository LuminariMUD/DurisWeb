import { afterAll, beforeAll, describe, expect, it, jest } from '@jest/globals';
import mysql, { type Connection, type Pool, type RowDataPacket } from 'mysql2/promise';
import {
  readOwnerSchemaFixture,
  applyOwnerSchemaFixture,
  ownerMetadataFingerprint,
} from '../../test/ownerSchemaFixture.js';
import { prepareFixtureMetadata, runFixtureWebMigrations } from '../../test/webMigrationFixture.js';
import { seedTrafficPvpFixture, TRAFFIC_PVP_EVENTS } from '../../test/trafficPvpFixture.js';
import { runWebBaseline, externalSchemaSha256 } from '../../db/webBaseline.js';
import { loadWebBaselineBundle } from '../../db/webBaselineBundle.js';

const selected = process.env.TEST_TRAFFIC_DB_PORT;
const port = selected ? Number(selected) : undefined;
if (
  selected &&
  (!port || ![23436, 23437].includes(port) || !process.env.TEST_BASELINE_MUD_SOURCE)
) {
  throw new Error('Traffic qualification requires a disposable port and pinned owner inputs');
}
const native = port ? describe : describe.skip;
const name = `durisweb_qualification_traffic_pvp_${process.pid}`;
let admin: Connection | undefined;
let pool: Pool | undefined;
let created = false;
let service: typeof import('../pvpService.js');

native('mature PvP query qualification on the owner schema', () => {
  beforeAll(async () => {
    const inputs = readOwnerSchemaFixture(process.env.TEST_BASELINE_MUD_SOURCE!);
    admin = await mysql.createConnection({
      host: '127.0.0.1',
      port,
      user: 'root',
      password: '',
      charset: 'utf8mb4',
    });
    await admin.query('CREATE DATABASE ?? CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci', [
      name,
    ]);
    created = true;
    await admin.changeUser({ database: name });
    await prepareFixtureMetadata(admin);
    await applyOwnerSchemaFixture(admin, port!, name, inputs);
    const fingerprint = await ownerMetadataFingerprint(admin, inputs);
    const bundle = loadWebBaselineBundle();
    await runWebBaseline(admin, 'bootstrap', await externalSchemaSha256(admin, bundle));
    runFixtureWebMigrations(port!, name);
    await seedTrafficPvpFixture(admin);
    expect(await ownerMetadataFingerprint(admin, inputs)).toBe(fingerprint);
    pool = mysql.createPool({
      host: '127.0.0.1',
      port,
      user: 'root',
      password: '',
      database: name,
      connectionLimit: 10,
      dateStrings: true,
    });
    jest.unstable_mockModule('../../db/connection.js', () => ({ pool, mudPool: pool }));
    // Isolate the SQL projection; settings/cache/provider behavior has separate tests.
    jest.unstable_mockModule('../webSettingsService.js', () => ({
      getWebSettings: async () => ({ pvpDelayMinutes: 15, respectWebinfoToggle: true }),
    }));
    service = await import('../pvpService.js');
  }, 120_000);

  afterAll(async () => {
    await pool?.end();
    if (admin) {
      if (created) await admin.query('DROP DATABASE ??', [name]);
      await admin.end();
    }
  });

  it('preserves ordered pages, all participant snapshots, totals and the release cutoff', async () => {
    const first = await service.getPvPEvents({ page: 1, limit: 50 });
    const second = await service.getPvPEvents({ page: 2, limit: 50 });
    expect(first.total).toBe(TRAFFIC_PVP_EVENTS);
    expect(first.events.map((event) => event.id)).toEqual(
      Array.from({ length: 50 }, (_, i) => i + 1),
    );
    expect(second.events.map((event) => event.id)).toEqual(
      Array.from({ length: 50 }, (_, i) => i + 51),
    );
    for (const event of [...first.events, ...second.events]) {
      expect(event.killers).toHaveLength(2);
      expect(event.victims).toHaveLength(2);
    }
  });

  it('applies the participant filter before selecting the page and preserves likes ordering', async () => {
    const matched = await service.getPvPEvents({ page: 1, limit: 50, player: 'Trafficchar0001' });
    expect(matched.total).toBe(200);
    expect(matched.events).toHaveLength(50);
    for (const event of matched.events) {
      expect(
        [...event.killers, ...event.victims].some((p) => p.description.includes('Trafficchar0001')),
      ).toBe(true);
    }
    const liked = await service.getPvPEvents({ page: 1, limit: 50, sort_by: 'likes' });
    expect(liked.events.map((event) => event.id)).toEqual(
      Array.from({ length: 50 }, (_, i) => (i + 1) * 31),
    );
  });

  it('limits the optimizer outer participant aggregation to the requested page', async () => {
    if (!pool) throw new Error('Missing native query pool');
    const query = jest.spyOn(pool, 'query');
    try {
      expect((await service.getPvPEvents({ page: 1, limit: 50 })).events).toHaveLength(50);
      const calls: readonly (readonly unknown[])[] = query.mock.calls;
      const summary = calls.find(
        ([sql]) => typeof sql === 'string' && sql.includes('GROUP_CONCAT('),
      );
      if (!summary || typeof summary[0] !== 'string')
        throw new Error('Actual summary statement was not captured');
      const bindings = summary[1];
      if (
        !Array.isArray(bindings) ||
        !bindings.every(
          (value: unknown): value is string | number =>
            typeof value === 'string' || typeof value === 'number',
        )
      ) {
        throw new Error('Unexpected native query binding');
      }
      const [plan] = await pool.query<RowDataPacket[]>('EXPLAIN ' + summary[0], bindings);
      const outerEvents = plan.filter((row) => Number(row.id) === 1 && row.table !== 'p');
      expect(outerEvents).toHaveLength(1);
      expect(Number(outerEvents[0].rows)).toBeLessThanOrEqual(50);
    } finally {
      query.mockRestore();
    }
  });

  it('preserves ascending release-cursor batches and the newest startup cursor', async () => {
    if (!pool) throw new Error('Missing native query pool');
    const [rows] = await pool.query<RowDataPacket[]>(
      'SELECT UNIX_TIMESTAMP(stamp) AS epoch FROM pkill_event WHERE id=4',
    );
    const batch = await service.getReleasedEventsAfter(
      { id: 4, stamp: new Date(Number(rows[0].epoch) * 1000).toISOString() },
      2,
    );
    expect(batch.map((event) => event.id)).toEqual([3, 2]);
    const rest = await service.getReleasedEventsAfter({ id: 2, stamp: batch[1].stamp }, 10);
    expect(rest.map((event) => event.id)).toEqual([1]);
    expect((await service.getLatestReleasedEvent())?.id).toBe(1);
  });
});
