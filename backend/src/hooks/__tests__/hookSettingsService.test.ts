/**
 * @jest-environment node
 */
import { afterAll, afterEach, beforeAll, describe, expect, it, jest } from '@jest/globals';
import { inspect } from 'node:util';
import { spawnSync } from 'node:child_process';
import type { RowDataPacket } from 'mysql2';
import mysql from 'mysql2/promise';
import { runFixtureWebMigrations } from '../../test/webMigrationFixture.js';
import { verifiedWebBaselineCoverage } from '../../db/webBaseline.js';
import { HOOK_AUDIT_MIGRATION } from '../../db/hookAuditSchema.js';
import logger from '../../utils/logger.js';
import {
  getWebSettings,
  getWebSetting,
  getWebSettingsRaw,
  updateWebSetting,
} from '../../services/webSettingsService.js';

import { pool } from '../../db/connection.js';
import crypto from 'node:crypto';
import {
  processHookAuditJournal,
  HOOK_JOURNAL_PREFIX,
  getHookAuditHealth,
  startHookAuditWorker,
  stopHookAuditWorker,
} from '../hookToggleJournal.js';
import { getToggleableHooks, requireHook } from '../registry.js';
import { markFlatfileUnavailable, resetFlatfileHookStateForTests } from '../flatfileHookState.js';
import {
  getHookStatus,
  getHookStatuses,
  peekWebState,
  refreshHookState,
  resetMudHookStateProvider,
  setHookEnabled as applyHookEnabled,
  setMudHookStateProvider,
  HookToggleError,
} from '../hookSettingsService.js';

const ACTOR = `HookTest_${crypto.randomBytes(6).toString('hex')}`;
const identities = new Set<string>();
async function setHookEnabled(
  id: string,
  enabled: boolean,
  actor: string,
  identity: string = crypto.randomUUID(),
) {
  identities.add(identity);
  return applyHookEnabled(id, enabled, actor, identity);
}
const SUBJECT = 'auction_new';
const SUBJECT_KEY = requireHook(SUBJECT).webSettingKey as string;
const nativePort = Number(process.env.TEST_HOOK_AUDIT_DB_PORT);
const nativeDatabase = process.env.DB_NAME ?? '';
if (
  process.env.TEST_HOOK_AUDIT_DB_PORT &&
  (![23436, 23437].includes(nativePort) ||
    process.env.DB_HOST !== '127.0.0.1' ||
    !nativeDatabase.startsWith('durisweb_qualification_'))
)
  throw new Error('Hook audit restart qualification requires the dedicated disposable fixture');

async function seedRows(): Promise<void> {
  for (const hook of getToggleableHooks()) {
    await pool.query(
      `INSERT INTO web_settings (setting_key, setting_value)
       VALUES (?, 'true')
       ON DUPLICATE KEY UPDATE setting_value = 'true'`,
      [hook.webSettingKey],
    );
  }
  await refreshHookState();
}

beforeAll(async () => {
  await seedRows();
});

afterEach(async () => {
  await stopHookAuditWorker();
  jest.restoreAllMocks();
  resetFlatfileHookStateForTests();
  resetMudHookStateProvider();
  await seedRows();
  if (identities.size) {
    await pool.query('DELETE FROM admin_action_log WHERE hook_event_id IN (?)', [[...identities]]);
    await pool.query('DELETE FROM web_settings WHERE setting_key IN (?)', [
      [...identities].map((id) => HOOK_JOURNAL_PREFIX + id),
    ]);
    identities.clear();
  }
  await processHookAuditJournal();
});

function interceptQueries(
  intercept: (sql: string, execute: () => Promise<unknown>) => Promise<unknown>,
): void {
  const checkout = pool.getConnection.bind(pool);
  jest.spyOn(pool, 'getConnection').mockImplementation(
    async () =>
      new Proxy(await checkout(), {
        get(target, key) {
          const value: unknown = Reflect.get(target, key, target);
          if ((key === 'query' || key === 'execute') && typeof value === 'function')
            return (...args: unknown[]) => {
              const first = args[0];
              const sql =
                typeof first === 'string'
                  ? first
                  : typeof first === 'object' && first !== null && 'sql' in first
                    ? String(first.sql)
                    : '';
              return intercept(sql, async () => Reflect.apply(value, target, args));
            };
          return typeof value === 'function' ? value.bind(target) : value;
        },
      }),
  );
}
async function auditCount(identity: string): Promise<number> {
  const [rows] = await pool.query<RowDataPacket[]>(
    'SELECT COUNT(*) AS count FROM admin_action_log WHERE hook_event_id=?',
    [identity],
  );
  return Number(rows[0].count);
}
async function storedJournal(identity: string) {
  const [rows] = await pool.query<RowDataPacket[]>(
    'SELECT setting_value,description FROM web_settings WHERE setting_key=?',
    [HOOK_JOURNAL_PREFIX + identity],
  );
  if (!rows.length) return null;
  const saved = JSON.parse(String(rows[0].setting_value)) as {
    event: { previous: boolean; enabled: boolean };
    delivery: { attempts: number; nextAttemptAtEpoch: number };
  };
  return {
    ...saved,
    delivery: {
      ...saved.delivery,
      state:
        rows[0].description === 'hook audit delivered'
          ? 'delivered'
          : rows[0].description === 'hook audit pending'
            ? 'pending'
            : 'invalid',
    },
  };
}

describe('durable hook changes and recovery', () => {
  it('refuses terminal, unknown hooks and malformed input before any transaction checkout', async () => {
    const checkout = jest.spyOn(pool, 'getConnection');
    await expect(setHookEnabled('terminal', false, ACTOR)).rejects.toMatchObject({
      code: 'always_on',
    });
    await expect(setHookEnabled('not_a_hook', false, ACTOR)).rejects.toMatchObject({
      code: 'unknown_hook',
    });
    await expect(
      setHookEnabled(SUBJECT, false, ACTOR, 'invalid-request-identity'),
    ).rejects.toMatchObject({ code: 'invalid_request' });
    await expect(setHookEnabled(SUBJECT, false, 'x'.repeat(51))).rejects.toMatchObject({
      code: 'invalid_request',
    });
    expect(checkout).not.toHaveBeenCalled();
  });
  if (nativePort)
    it('reverses unused audit schema and recovers both lost DDL acknowledgements', async () => {
      runFixtureWebMigrations(nativePort, nativeDatabase, {
        direction: 'down',
        name: HOOK_AUDIT_MIGRATION,
        loseDdlAcknowledgement: true,
      });
      await expect(verifiedWebBaselineCoverage(pool)).rejects.toThrow(
        /schema_drift_admin_action_log/,
      );
      runFixtureWebMigrations(nativePort, nativeDatabase, {
        direction: 'down',
        name: HOOK_AUDIT_MIGRATION,
      });
      runFixtureWebMigrations(nativePort, nativeDatabase, {
        direction: 'up',
        name: HOOK_AUDIT_MIGRATION,
        loseDdlAcknowledgement: true,
      });
      await expect(verifiedWebBaselineCoverage(pool)).rejects.toThrow(
        /schema_drift_admin_action_log/,
      );
      runFixtureWebMigrations(nativePort, nativeDatabase, {
        direction: 'up',
        name: HOOK_AUDIT_MIGRATION,
      });
      expect((await verifiedWebBaselineCoverage(pool)).size).toBe(85);
      await setHookEnabled(SUBJECT, false, ACTOR);
      expect(() =>
        runFixtureWebMigrations(nativePort, nativeDatabase, {
          direction: 'down',
          name: HOOK_AUDIT_MIGRATION,
        }),
      ).toThrow(/hook_audit_rollback_refuses_journal/);
    }, 60000);
  it('reads the locked durable old state instead of a stale cache and hides internal keys', async () => {
    await pool.query('UPDATE web_settings SET setting_value=? WHERE setting_key=?', [
      'false',
      SUBJECT_KEY,
    ]);
    expect(peekWebState()?.get(SUBJECT)).toBe(true);
    const changed = await setHookEnabled(SUBJECT, true, ACTOR);
    expect(changed.change?.event.previous).toBe(false);
    const key = HOOK_JOURNAL_PREFIX + changed.change!.event.id;
    expect(await getWebSetting(key)).toBeNull();
    expect(await getWebSetting(key.replace('hook', 'hóok'))).toBeNull(); // The DB collation folds accents.
    expect(
      (await getWebSettingsRaw()).some(({ setting_key }) =>
        setting_key.startsWith(HOOK_JOURNAL_PREFIX),
      ),
    ).toBe(false);
    expect(inspect(await getWebSettings())).not.toContain(changed.change!.event.id);
    await expect(updateWebSetting(key, 'overwrite', ACTOR)).rejects.toThrow(
      'Reserved internal setting',
    );
  });

  it('serializes duplicate/concurrent identities and never reverts a newer accepted change', async () => {
    const identity = crypto.randomUUID();
    const results = await Promise.all(
      Array.from({ length: 6 }, () => setHookEnabled(SUBJECT, false, ACTOR, identity)),
    );
    expect(new Set(results.map(({ change }) => change?.event.id))).toEqual(new Set([identity]));
    expect(results.filter(({ change }) => change?.replayed === false)).toHaveLength(1);
    await setHookEnabled(SUBJECT, true, ACTOR);
    const replay = await setHookEnabled(SUBJECT, false, ACTOR, identity);
    expect(replay.webEnabled).toBe(true);
    expect(replay.change?.event).toEqual(results[0].change?.event);
    await expect(setHookEnabled(SUBJECT, true, ACTOR, identity)).rejects.toMatchObject({
      code: 'idempotency_conflict',
    });
    await expect(setHookEnabled('flag_parsing', false, ACTOR, identity)).rejects.toMatchObject({
      code: 'idempotency_conflict',
    });
    await expect(
      setHookEnabled(SUBJECT, false, 'AnotherSyntheticOperator', identity),
    ).rejects.toMatchObject({ code: 'idempotency_conflict' });
    await processHookAuditJournal({ force: true });
    expect(await auditCount(identity)).toBe(1);
  });

  it('records a distinct same-state request and a deterministic absent-key default', async () => {
    await pool.query('DELETE FROM web_settings WHERE setting_key=?', [SUBJECT_KEY]);
    const first = await setHookEnabled(SUBJECT, true, ACTOR);
    const second = await setHookEnabled(SUBJECT, true, ACTOR);
    expect(first.change?.event).toMatchObject({ previous: true, enabled: true });
    expect(second.change?.event).toMatchObject({ previous: true, enabled: true });
    expect(second.change?.event.id).not.toBe(first.change?.event.id);
  });

  it('serializes distinct concurrent changes against the same authoritative hook row', async () => {
    const changes = await Promise.all([
      setHookEnabled(SUBJECT, false, ACTOR),
      setHookEnabled(SUBJECT, false, ACTOR),
    ]);
    expect(changes.map(({ change }) => change!.event.previous).sort()).toEqual([false, true]);
    await processHookAuditJournal({ force: true });
    for (const changed of changes) expect(await auditCount(changed.change!.event.id)).toBe(1);
  });

  it('uses one UTC instant for the event, setting provenance and audit under a database offset', async () => {
    const connection = await pool.getConnection();
    const [before] = await connection.query<RowDataPacket[]>('SELECT @@time_zone AS zone');
    const checkout = jest.spyOn(pool, 'getConnection').mockResolvedValue(
      new Proxy(connection, {
        get(target, key) {
          if (key === 'release') return () => {};
          const value: unknown = Reflect.get(target, key, target);
          return typeof value === 'function' ? value.bind(target) : value;
        },
      }),
    );
    try {
      await connection.query("SET time_zone='+03:00'");
      const changed = await setHookEnabled(SUBJECT, false, ACTOR);
      const iso = new Date(changed.change!.event.occurredAtEpoch * 1000).toISOString();
      expect(changed.webProvenance.changedAt).toBe(iso);
      await processHookAuditJournal({ force: true });
      const [audit] = await connection.query<RowDataPacket[]>(
        "SELECT DATE_FORMAT(`timestamp`,'%Y-%m-%d %H:%i:%s') AS event_utc FROM admin_action_log WHERE hook_event_id=?",
        [changed.change!.event.id],
      );
      expect(audit[0].event_utc).toBe(iso.slice(0, 19).replace('T', ' '));
    } finally {
      checkout.mockRestore();
      try {
        await connection.query('SET time_zone=?', [String(before[0].zone)]);
        connection.release();
      } catch {
        connection.destroy();
      }
    }
  });

  it('refuses a nontransactional settings engine before writing either durable value', async () => {
    const identity = crypto.randomUUID();
    await pool.query('ALTER TABLE web_settings ENGINE=MyISAM');
    try {
      await expect(setHookEnabled(SUBJECT, false, ACTOR, identity)).rejects.toMatchObject({
        code: 'storage_unavailable',
      });
      const [rows] = await pool.query<RowDataPacket[]>(
        'SELECT setting_value FROM web_settings WHERE setting_key=?',
        [SUBJECT_KEY],
      );
      expect(rows[0].setting_value).toBe('true');
      expect(await storedJournal(identity)).toBeNull();
    } finally {
      await pool.query('ALTER TABLE web_settings ENGINE=InnoDB');
    }
  });

  it('round-trips the JSON receipt without relaxing a no-backslash SQL safeguard', async () => {
    const connection = await pool.getConnection();
    const [before] = await connection.query<RowDataPacket[]>('SELECT @@sql_mode AS mode');
    const originalMode = String(before[0].mode);
    const checkout = jest.spyOn(pool, 'getConnection').mockResolvedValue(
      new Proxy(connection, {
        get(target, key) {
          if (key === 'release') return () => {};
          const value: unknown = Reflect.get(target, key, target);
          return typeof value === 'function' ? value.bind(target) : value;
        },
      }),
    );
    try {
      await connection.query('SET sql_mode=?', [originalMode + ',NO_BACKSLASH_ESCAPES']);
      const changed = await setHookEnabled(SUBJECT, false, ACTOR);
      expect((await storedJournal(changed.change!.event.id))?.event).toMatchObject({
        previous: true,
        enabled: false,
      });
      await processHookAuditJournal({ force: true });
      expect(await auditCount(changed.change!.event.id)).toBe(1);
    } finally {
      checkout.mockRestore();
      try {
        await connection.query('SET sql_mode=?', [originalMode]);
        connection.release();
      } catch {
        connection.destroy();
      }
    }
  });

  it('keeps the toggle durable while its audit table is unavailable and publishes after recovery', async () => {
    await pool.query('RENAME TABLE admin_action_log TO hook_test_unavailable_audit');
    let identity = '';
    try {
      const changed = await setHookEnabled(SUBJECT, false, ACTOR);
      identity = changed.change!.event.id;
      expect(changed.webEnabled).toBe(false);
      expect((await processHookAuditJournal({ force: true })).failed).toBe(1);
      expect((await storedJournal(identity))?.delivery).toMatchObject({
        state: 'pending',
        attempts: 1,
      });
      expect(await getHookAuditHealth()).toMatchObject({
        unacknowledgedRows: 1,
        sinkReadable: false,
      });
      expect((await getHookStatus(SUBJECT)).webEnabled).toBe(false);
    } finally {
      await pool.query('RENAME TABLE hook_test_unavailable_audit TO admin_action_log');
    }
    await processHookAuditJournal({ force: true });
    expect(await auditCount(identity)).toBe(1);
    expect((await storedJournal(identity))?.delivery.state).toBe('delivered');
  });

  it('rolls the setting and receipt back if authoritative commit fails without leaking errors', async () => {
    let injected = false;
    const log = jest.spyOn(logger, 'error').mockImplementation(() => logger);
    interceptQueries(async (sql, execute) => {
      if (!injected && sql === 'COMMIT') {
        injected = true;
        throw Object.assign(new Error('sensitive-driver-sentinel'), {
          sql: 'private-sql-sentinel',
        });
      }
      return execute();
    });
    const identity = crypto.randomUUID();
    await expect(setHookEnabled(SUBJECT, false, ACTOR, identity)).rejects.toMatchObject({
      code: 'storage_unavailable',
    });
    expect(await storedJournal(identity)).toBeNull();
    await refreshHookState();
    expect((await getHookStatus(SUBJECT)).webEnabled).toBe(true);
    expect(inspect(log.mock.calls)).not.toMatch(/sensitive-driver-sentinel|private-sql-sentinel/);
  });

  it('recovers a committed setting after a lost acknowledgement without applying it twice', async () => {
    let injected = false;
    interceptQueries(async (sql, execute) => {
      const result = await execute();
      if (!injected && sql === 'COMMIT') {
        injected = true;
        throw new Error('synthetic_lost_setting_ack');
      }
      return result;
    });
    const changed = await setHookEnabled(SUBJECT, false, ACTOR);
    expect(changed).toMatchObject({ webEnabled: false, change: { replayed: true } });
    expect((await storedJournal(changed.change!.event.id))?.event).toMatchObject({
      previous: true,
      enabled: false,
    });
  });

  it.each(['insert', 'commit'])(
    'recovers an audit failure after %s without duplicating the audit or rewriting a newer setting',
    async (phase) => {
      const changed = await setHookEnabled(SUBJECT, false, ACTOR);
      await setHookEnabled(SUBJECT, true, ACTOR);
      let injected = false;
      interceptQueries(async (sql, execute) => {
        const result = await execute();
        if (
          !injected &&
          (phase === 'insert' ? sql.startsWith('INSERT INTO admin_action_log') : sql === 'COMMIT')
        ) {
          injected = true;
          throw new Error('synthetic_lost_audit_ack');
        }
        return result;
      });
      await processHookAuditJournal({ force: true });
      await processHookAuditJournal({ force: true });
      expect(await auditCount(changed.change!.event.id)).toBe(1);
      expect((await getHookStatus(SUBJECT)).webEnabled).toBe(true);
    },
  );

  it('bounds the batch and retains malformed/oversized envelopes without starving valid events', async () => {
    const bad = crypto.randomUUID(),
      large = crypto.randomUUID(),
      malformed = crypto.randomUUID();
    identities.add(bad);
    identities.add(large);
    identities.add(malformed);
    await pool.query('INSERT INTO web_settings (setting_key,setting_value) VALUES (?,?)', [
      HOOK_JOURNAL_PREFIX + malformed,
      JSON.stringify({
        version: 1,
        event: {
          id: malformed,
          hookId: SUBJECT,
          actor: ACTOR,
          previous: true,
          enabled: false,
          occurredAtEpoch: 1,
        },
        delivery: {
          state: { toString: null },
          attempts: 0,
          nextAttemptAtEpoch: 1,
          deliveredAtEpoch: null,
          lastFailure: null,
        },
      }),
    ]);
    await pool.query('INSERT INTO web_settings (setting_key,setting_value) VALUES (?,?),(?,?)', [
      HOOK_JOURNAL_PREFIX + bad,
      'private-invalid-sentinel',
      HOOK_JOURNAL_PREFIX + large,
      'x'.repeat(2049),
    ]);
    for (let index = 0; index < 8; index++) await setHookEnabled(SUBJECT, true, ACTOR);
    const first = await processHookAuditJournal({ batchSize: 3, force: true });
    expect(first.scanned).toBeLessThanOrEqual(3);
    for (let index = 0; index < 5; index++)
      await processHookAuditJournal({ batchSize: 3, force: true });
    const health = await getHookAuditHealth();
    expect(health.journalRows).toBe(11);
    expect(health.unacknowledgedRows).toBe(3);
    expect(health.lastCompleteScanInvalidRows).toBe(3);
    expect(inspect(health)).not.toContain('private-invalid-sentinel');
  });

  it('rejects a conflicting preexisting audit identity instead of falsely acknowledging attribution', async () => {
    const changed = await setHookEnabled(SUBJECT, false, ACTOR);
    await pool.query(
      "INSERT INTO admin_action_log (account_name,action_type,target,hook_event_id) VALUES ('SyntheticConflict','property_change','different',?)",
      [changed.change!.event.id],
    );
    expect((await processHookAuditJournal({ force: true })).failed).toBe(1);
    expect((await storedJournal(changed.change!.event.id))?.delivery.state).toBe('pending');
    expect((await getHookAuditHealth()).lastFailureCategory).toBe('audit_identity_conflict');
  });

  it('uses its bounded batch for pending work rather than repeatedly scanning delivered history', async () => {
    for (let index = 0; index < 30; index++) await setHookEnabled(SUBJECT, true, ACTOR);
    for (let index = 0; index < 3; index++)
      await processHookAuditJournal({ batchSize: 100, force: true });
    expect((await getHookAuditHealth()).unacknowledgedRows).toBe(0);
    const newest = await setHookEnabled(
      SUBJECT,
      false,
      ACTOR,
      'ffffffff-ffff-4fff-bfff-ffffffffffff',
    );
    expect((await processHookAuditJournal({ batchSize: 1, force: true })).delivered).toBe(1);
    expect(await auditCount(newest.change!.event.id)).toBe(1);
  });

  it('does not resurrect a stale cache snapshot that finishes after a committed toggle', async () => {
    const original = pool.query.bind(pool);
    let held = false,
      release: () => void = () => {},
      captured: () => void = () => {};
    const ready = new Promise<void>((resolve) => {
      captured = resolve;
    });
    const hold = new Promise<void>((resolve) => {
      release = resolve;
    });
    jest.spyOn(pool, 'query').mockImplementation((async (...args: unknown[]) => {
      const result = await Reflect.apply(original, pool, args);
      if (!held && String(args[0]).includes('UNIX_TIMESTAMP(updated_at)')) {
        held = true;
        captured();
        await hold;
      }
      return result;
    }) as typeof pool.query);
    const refresh = refreshHookState();
    try {
      await ready;
      await setHookEnabled(SUBJECT, false, ACTOR);
    } finally {
      release();
      await refresh;
    }
    expect(peekWebState()?.get(SUBJECT)).toBe(false);
  });

  it('never overlaps worker polls and stops its lifecycle before pool shutdown', async () => {
    await setHookEnabled(SUBJECT, false, ACTOR);
    const first = processHookAuditJournal({ force: true });
    expect(await processHookAuditJournal({ force: true })).toMatchObject({ busy: true });
    await first;
    startHookAuditWorker();
    await stopHookAuditWorker();
    expect((await getHookAuditHealth()).workerRunning).toBe(false);
  });

  if (nativePort)
    it('keeps attribution across real process restarts and an audit-write permission outage', async () => {
      const root = await mysql.createConnection({
        host: '127.0.0.1',
        port: nativePort,
        user: 'root',
        database: nativeDatabase,
      });
      const user = `dw_hook_recovery_${process.pid}`,
        password = 'synthetic-recovery-only';
      let created = false;
      const identity = crypto.randomUUID();
      identities.add(identity);
      try {
        await root.query('CREATE USER ?@? IDENTIFIED BY ?', [user, '%', password]);
        created = true;
        await root.query('GRANT SELECT ON ??.* TO ?@?', [
          nativeDatabase.replaceAll('_', '\\_'),
          user,
          '%',
        ]);
        await root.query('GRANT INSERT,UPDATE,DELETE ON ??.web_settings TO ?@?', [
          nativeDatabase,
          user,
          '%',
        ]);
        childJournal('produce', identity, { DB_USER: user, DB_PASSWORD: password });
        expect((await storedJournal(identity))?.delivery).toMatchObject({
          state: 'pending',
          attempts: 0,
        });
        childJournal('publish-failure', identity, { DB_USER: user, DB_PASSWORD: password });
        expect((await storedJournal(identity))?.delivery).toMatchObject({
          state: 'pending',
          attempts: 1,
        });
        await root.query('GRANT INSERT ON ??.admin_action_log TO ?@?', [nativeDatabase, user, '%']);
        childJournal('publish', identity, { DB_USER: user, DB_PASSWORD: password });
        expect(await auditCount(identity)).toBe(1);
        await refreshHookState();
        expect((await getHookStatus(SUBJECT)).webEnabled).toBe(false);
      } finally {
        if (created) await root.query('DROP USER ?@?', [user, '%']);
        await root.end();
      }
    }, 60000);

  if (nativePort)
    it('survives process death after audit insert without losing or duplicating the event', async () => {
      const changed = await setHookEnabled(SUBJECT, false, ACTOR);
      childJournal('crash-after-insert', changed.change!.event.id);
      expect(await auditCount(changed.change!.event.id)).toBe(0);
      expect((await storedJournal(changed.change!.event.id))?.delivery.state).toBe('pending');
      await processHookAuditJournal({ force: true });
      expect(await auditCount(changed.change!.event.id)).toBe(1);
    });
});

function childJournal(
  mode: string,
  identity: string,
  overrides: Record<string, string> = {},
): void {
  const script = `
    import {pathToFileURL} from 'node:url';
    const [root,mode,identity,actor]=process.argv.slice(1);
    const {pool,closeDatabaseConnection}=await import(pathToFileURL(root+'/src/db/connection.ts').href);
    const {setHookEnabled}=await import(pathToFileURL(root+'/src/hooks/hookSettingsService.ts').href);
    const {processHookAuditJournal}=await import(pathToFileURL(root+'/src/hooks/hookToggleJournal.ts').href);
    if(mode==='crash-after-insert'){
      const checkout=pool.getConnection.bind(pool);
      pool.getConnection=async()=>new Proxy(await checkout(),{get(target,key){
        const value=Reflect.get(target,key,target);
        if(key==='query'||key==='execute')return (...args)=>{
          const sql=typeof args[0]==='string'?args[0]:args[0].sql;
          if(sql==='UPDATE web_settings SET setting_value=?,description=? WHERE setting_key=?'){console.log('Journal child operation verified.');process.exit(0);}
          return Reflect.apply(value,target,args);
        };
        return typeof value==='function'?value.bind(target):value;
      }});
    }
    try{
      if(mode==='produce')await setHookEnabled('auction_new',false,actor,identity);
      else{
        const result=await processHookAuditJournal({force:true});
        if(mode==='publish-failure'?result.failed!==1:result.delivered!==1)throw new Error('Unexpected child delivery result');
      }
      console.log('Journal child operation verified.');
    }finally{await closeDatabaseConnection();const {default:redis}=await import(pathToFileURL(root+'/src/db/redis.ts').href);redis.disconnect();}
  `;
  const result = spawnSync(
    process.execPath,
    [
      '--import',
      'tsx',
      '--input-type=module',
      '--eval',
      script,
      process.cwd(),
      mode,
      identity,
      ACTOR,
    ],
    {
      cwd: process.cwd(),
      env: { ...process.env, ...overrides, DOTENV_CONFIG_QUIET: 'true' },
      encoding: 'utf8',
      timeout: 30000,
    },
  );
  expect({ status: result.status, stderr: result.stderr }).toMatchObject({ status: 0 });
  expect(result.stdout).toContain('Journal child operation verified.');
}

afterAll(async () => {
  // Match the project convention: release the pool so Jest exits cleanly.
  await pool.end();
});

describe('hook settings store', () => {
  it('reports every registered hook, including the always-on terminal', async () => {
    const statuses = await getHookStatuses();
    expect(statuses).toHaveLength(14);
    expect(statuses.find((s) => s.hook.id === 'terminal')?.active).toBe(true);
  });

  it('defaults an absent row to enabled rather than disabled', async () => {
    await pool.query('DELETE FROM web_settings WHERE setting_key = ?', [SUBJECT_KEY]);
    await refreshHookState();

    const status = await getHookStatus(SUBJECT);
    expect(status.webEnabled).toBe(true);
  });

  it('treats an unparseable value as enabled rather than guessing disabled', async () => {
    await pool.query('UPDATE web_settings SET setting_value = ? WHERE setting_key = ?', [
      'not-a-boolean',
      SUBJECT_KEY,
    ]);
    await refreshHookState();

    const status = await getHookStatus(SUBJECT);
    expect(status.webEnabled).toBe(true);
  });

  it('accepts both boolean spellings used in web_settings', async () => {
    for (const [raw, expected] of [
      ['true', true],
      ['1', true],
      ['false', false],
      ['0', false],
      ['TRUE', true],
    ] as const) {
      await pool.query('UPDATE web_settings SET setting_value = ? WHERE setting_key = ?', [
        raw,
        SUBJECT_KEY,
      ]);
      await refreshHookState();
      expect((await getHookStatus(SUBJECT)).webEnabled).toBe(expected);
    }
  });
});

describe('toggling', () => {
  it('persists a change and invalidates the cache before returning', async () => {
    const status = await setHookEnabled(SUBJECT, false, ACTOR);
    expect(status.webEnabled).toBe(false);

    // Cache was cleared on write, so a fresh read must see the new value
    // without waiting for a TTL.
    expect((await getHookStatus(SUBJECT)).webEnabled).toBe(false);

    const [rows] = (await pool.query(
      'SELECT setting_value, updated_by FROM web_settings WHERE setting_key = ?',
      [SUBJECT_KEY],
    )) as [Array<{ setting_value: string; updated_by: string }>, unknown];
    expect(rows[0].setting_value).toBe('false');
    expect(rows[0].updated_by).toBe(ACTOR);
    expect(status.webProvenance.actor).toBe(ACTOR);
    expect(status.webProvenance.changedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('records the change in the admin action log with the actor and both values', async () => {
    const changed = await setHookEnabled(SUBJECT, false, ACTOR);
    await processHookAuditJournal({ force: true });

    const [rows] = (await pool.query(
      `SELECT account_name, old_value, new_value FROM admin_action_log
       WHERE hook_event_id = ?`,
      [changed.change!.event.id],
    )) as [Array<{ account_name: string; old_value: string; new_value: string }>, unknown];

    expect(rows).toHaveLength(1);
    expect(rows[0].account_name).toBe(ACTOR);
    expect(rows[0].old_value).toBe('enabled');
    expect(rows[0].new_value).toBe('disabled');
  });

  it('refuses to toggle an always-on hook', async () => {
    await expect(setHookEnabled('terminal', false, ACTOR)).rejects.toBeInstanceOf(HookToggleError);
    await expect(setHookEnabled('terminal', false, ACTOR)).rejects.toMatchObject({
      code: 'always_on',
    });
  });

  it('refuses an unregistered hook id', async () => {
    await expect(setHookEnabled('not_a_hook', false, ACTOR)).rejects.toMatchObject({
      code: 'unknown_hook',
    });
  });
});

describe('effective state against MUD reports', () => {
  it('reports mismatch when the website is on and the MUD is off', async () => {
    setMudHookStateProvider({ getState: () => 'disabled' });
    const status = await getHookStatus(SUBJECT);
    expect(status.effective).toBe('mismatch');
    expect(status.active).toBe(false);
  });

  it('reports off, not mismatch, when the website is the one disabling', async () => {
    setMudHookStateProvider({ getState: () => 'disabled' });
    await setHookEnabled(SUBJECT, false, ACTOR);
    const status = await getHookStatus(SUBJECT);
    expect(status.effective).toBe('off');
  });

  it('defaults to unknown for MUD-gated hooks before a bridge exists', async () => {
    const status = await getHookStatus(SUBJECT);
    expect(status.mudState).toBe('unknown');
    expect(status.active).toBe(false);
  });

  it('treats hooks with no MUD gate as website-decided', async () => {
    const status = await getHookStatus('flag_parsing');
    expect(status.mudState).toBe('not_gated');
    expect(status.effective).toBe('on');
  });

  it('overlays an unavailable resource on only its filesystem-backed hook', async () => {
    markFlatfileUnavailable('connection_log', 'Required comm log is unavailable.');

    const statuses = await getHookStatuses();
    expect(statuses.find((status) => status.hook.id === 'connection_log')).toMatchObject({
      mudState: 'unavailable',
      effective: 'unavailable',
      active: false,
      resource: {
        availability: 'unavailable',
        droppedInputs: 0,
      },
    });
    expect(statuses.find((status) => status.hook.id === 'flag_parsing')).toMatchObject({
      mudState: 'not_gated',
      effective: 'on',
      resource: { availability: 'available' },
    });
    expect(statuses.find((status) => status.hook.id === 'guild_parsing')?.resource).toBeNull();
  });
});

describe('event-path cache', () => {
  it('exposes a synchronous view after loading', async () => {
    await refreshHookState();
    const state = peekWebState();
    expect(state).not.toBeNull();
    expect(state?.get(SUBJECT)).toBe(true);
  });
});
