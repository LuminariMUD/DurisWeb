import fs from 'node:fs';
import path from 'node:path';
import {
  type BaselineDatabaseFamily,
  type BaselineTable,
  type WebBaselineBundle,
  loadWebBaselineBundle,
  loadWebForwardSchemas,
  normalizedTableDefinition,
  sha256,
  verifyWebBaselineSources,
  webBaselineDirectory,
} from './webBaselineBundle.js';
import { loadMudWriteAllowlist } from './mudWriteInventory.js';
import {
  matchesSchemaPostcondition,
  schemaRows as rows,
  type SchemaDatabase,
} from './schemaPostconditions.js';

export type BaselineDatabase = SchemaDatabase;
type BaselineState = 'installing' | 'complete' | 'adopted' | 'removing';
interface Journal {
  completed: string[];
  pending: string | null;
  seeded: boolean;
}
interface Provenance {
  state: BaselineState;
  journal: Journal;
  mudSchemaSha256: string;
}
export class WebBaselineError extends Error {
  constructor(public readonly category: string) {
    super(`Website baseline refused: ${category}`);
  }
}
const PROVENANCE_TABLE = 'web_schema_baselines';
const METADATA_DDL = `CREATE TABLE web_schema_baselines (
  id VARCHAR(64) NOT NULL PRIMARY KEY,
  manifest_sha256 CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  mud_schema_sha256 CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  state VARCHAR(16) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  journal LONGTEXT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
async function objectNames(database: BaselineDatabase): Promise<string[]> {
  const result = await rows(
    database,
    'SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() ORDER BY TABLE_NAME',
  );
  return result.map((row) => String(row.TABLE_NAME));
}
async function family(database: BaselineDatabase): Promise<BaselineDatabaseFamily> {
  const result = await rows(database, 'SELECT VERSION() AS version');
  const version = String(result[0]?.version);
  if (/^11\.8\..*MariaDB/i.test(version)) return 'mariadb11';
  if (/^8\./.test(version) && !/MariaDB/i.test(version)) return 'mysql8';
  throw new WebBaselineError('unsupported_database_family');
}
async function createTable(database: BaselineDatabase, name: string): Promise<string> {
  const result = await rows(database, 'SHOW CREATE TABLE ??', [name]);
  if (typeof result[0]?.['Create Table'] !== 'string')
    throw new WebBaselineError('unsupported_schema_object');
  return result[0]['Create Table'];
}

/** Metadata only; never read game rows or guess that a name establishes ownership. */
export async function externalSchemaSha256(
  database: BaselineDatabase,
  bundle: WebBaselineBundle,
): Promise<string> {
  const webNames = new Set([
    ...bundle.tables.map(({ name }) => name),
    ...loadWebForwardSchemas(bundle).flatMap(({ tables }) => Object.keys(tables)),
    PROVENANCE_TABLE,
    'knex_migrations',
    'knex_migrations_lock',
  ]);
  const names = (await objectNames(database)).filter((name) => !webNames.has(name));
  const definitions: [string, string][] = [];
  for (const name of names)
    definitions.push([name, normalizedTableDefinition(await createTable(database, name))]);
  return sha256(JSON.stringify(definitions));
}

async function verifyMudTarget(
  database: BaselineDatabase,
  bundle: WebBaselineBundle,
  expected: string,
): Promise<void> {
  if (!/^[a-f0-9]{64}$/.test(expected))
    throw new WebBaselineError('missing_approved_mud_schema_identity');
  const ownership = loadMudWriteAllowlist(path.resolve(webBaselineDirectory(), '../..'));
  const names = new Set(await objectNames(database));
  if (
    [...ownership.mudOwnedTables, ...bundle.manifest.additionalMudOwnedTables].some(
      (name) => !names.has(name),
    )
  )
    throw new WebBaselineError('missing_mud_baseline_objects');
  if ((await externalSchemaSha256(database, bundle)) !== expected)
    throw new WebBaselineError('mud_schema_identity_mismatch');
}

async function verifyTable(
  database: BaselineDatabase,
  table: BaselineTable,
  product: BaselineDatabaseFamily,
): Promise<void> {
  if (!(await matchesSchemaPostcondition(database, table.name, product)))
    throw new WebBaselineError(`schema_drift_${table.name}`);
}

async function verifyNoWebTriggers(
  database: BaselineDatabase,
  bundle: WebBaselineBundle,
  forwardNames: string[] = [],
): Promise<void> {
  const triggers = await rows(
    database,
    'SELECT EVENT_OBJECT_TABLE FROM information_schema.TRIGGERS WHERE TRIGGER_SCHEMA=DATABASE()',
  );
  const webNames = new Set([
    ...bundle.tables.map(({ name }) => name),
    ...forwardNames,
    PROVENANCE_TABLE,
    'knex_migrations',
    'knex_migrations_lock',
  ]);
  if (triggers.some((row) => webNames.has(String(row.EVENT_OBJECT_TABLE))))
    throw new WebBaselineError('unexpected_web_trigger');
}

export async function readWebMigrationLedger(
  database: BaselineDatabase,
  availableNames?: readonly string[],
): Promise<string[]> {
  const names = await objectNames(database);
  if (!names.includes('knex_migrations')) {
    if (names.includes('knex_migrations_lock'))
      throw new WebBaselineError('unexpected_migration_lock');
    return [];
  }
  const product = await family(database);
  if (!(await matchesSchemaPostcondition(database, 'knex_migrations', product)))
    throw new WebBaselineError('unexpected_migration_ledger_shape');
  if (names.includes('knex_migrations_lock')) {
    if (!(await matchesSchemaPostcondition(database, 'knex_migrations_lock', product)))
      throw new WebBaselineError('unexpected_migration_lock_shape');
  }
  const ledger = (await rows(database, 'SELECT name FROM knex_migrations ORDER BY id')).map((row) =>
    String(row.name),
  );
  if (new Set(ledger).size !== ledger.length)
    throw new WebBaselineError('duplicate_migration_ledger_names');
  const available = new Set(
    availableNames ??
      fs
        .readdirSync(path.resolve(webBaselineDirectory(), '../../migrations'))
        .filter((name) => name.endsWith('.ts')),
  );
  if (ledger.some((name) => !available.has(name)))
    throw new WebBaselineError('unknown_migration_ledger_name');
  return ledger;
}

function parseJournal(value: unknown, bundle: WebBaselineBundle): Journal {
  const journal: unknown = typeof value === 'string' ? JSON.parse(value) : null;
  const names = bundle.tables.map(({ name }) => name);
  if (
    !isRecord(journal) ||
    !Array.isArray(journal.completed) ||
    journal.completed.some((name: unknown) => typeof name !== 'string' || !names.includes(name)) ||
    new Set(journal.completed).size !== journal.completed.length ||
    !(
      journal.pending === null ||
      (typeof journal.pending === 'string' && names.includes(journal.pending))
    ) ||
    typeof journal.seeded !== 'boolean'
  )
    throw new WebBaselineError('invalid_installation_journal');
  // All values have been validated above; construct a typed copy at the boundary.
  return {
    completed: journal.completed.filter((name): name is string => typeof name === 'string'),
    pending: journal.pending,
    seeded: journal.seeded,
  };
}

async function readProvenance(
  database: BaselineDatabase,
  bundle: WebBaselineBundle,
): Promise<Provenance | null> {
  if (!(await objectNames(database)).includes(PROVENANCE_TABLE)) return null;
  if (!(await matchesSchemaPostcondition(database, PROVENANCE_TABLE, await family(database))))
    throw new WebBaselineError('provenance_schema_drift');
  const records = await rows(
    database,
    'SELECT id, manifest_sha256, mud_schema_sha256, state, journal FROM web_schema_baselines',
  );
  if (records.length === 0) return null;
  if (
    records.length !== 1 ||
    records[0].id !== bundle.manifest.id ||
    records[0].manifest_sha256 !== bundle.manifestSha256 ||
    typeof records[0].mud_schema_sha256 !== 'string' ||
    !/^[a-f0-9]{64}$/.test(records[0].mud_schema_sha256)
  )
    throw new WebBaselineError('provenance_identity_mismatch');
  const state = records[0].state;
  if (state !== 'installing' && state !== 'complete' && state !== 'adopted' && state !== 'removing')
    throw new WebBaselineError('invalid_provenance_state');
  return {
    state,
    journal: parseJournal(records[0].journal, bundle),
    mudSchemaSha256: records[0].mud_schema_sha256,
  };
}

async function saveJournal(
  database: BaselineDatabase,
  bundle: WebBaselineBundle,
  state: BaselineState,
  journal: Journal,
): Promise<void> {
  await database.query('UPDATE web_schema_baselines SET state=?, journal=? WHERE id=?', [
    state,
    JSON.stringify(journal),
    bundle.manifest.id,
  ]);
}

function checkedBundle(): WebBaselineBundle {
  const bundle = loadWebBaselineBundle();
  verifyWebBaselineSources(bundle, path.resolve(webBaselineDirectory(), '../../migrations'));
  return bundle;
}

async function verifyWebSchema(
  database: BaselineDatabase,
  bundle: WebBaselineBundle,
  ledger: readonly string[],
  directory?: string,
): Promise<void> {
  const forward = loadWebForwardSchemas(bundle, directory);
  const expected = new Map<string, (typeof bundle.tables)[number]['installedSha256'] | null>(
    bundle.tables.map((table) => [table.name, table.installedSha256]),
  );
  for (const { tables } of forward)
    for (const name of Object.keys(tables)) if (!expected.has(name)) expected.set(name, null);
  for (const name of ledger) {
    const state = forward.find((migration) => migration.name === name);
    if (state)
      for (const [table, shape] of Object.entries(state.tables)) expected.set(table, shape);
  }
  await verifyNoWebTriggers(database, bundle, [...expected.keys()]);
  const product = await family(database);
  const present = new Set(await objectNames(database));
  for (const [name, shape] of expected) {
    if (
      shape === null
        ? present.has(name)
        : !present.has(name) ||
          installedTableSha256(await createTable(database, name)) !== shape[product]
    )
      throw new WebBaselineError(`schema_drift_${name}`);
  }
}

/** Returns coverage only for an installed and reverified fresh baseline. Existing history stays visible. */
export async function verifiedWebBaselineCoverage(
  database: BaselineDatabase,
  availableNames?: readonly string[],
  migrationsDirectory?: string,
): Promise<Set<string>> {
  const bundle = checkedBundle();
  await verifyNoWebTriggers(database, bundle);
  const applied = await readWebMigrationLedger(
    database,
    availableNames ??
      (migrationsDirectory
        ? fs.readdirSync(migrationsDirectory).filter((name) => name.endsWith('.ts'))
        : undefined),
  );
  const ledger = new Set(applied);
  const provenance = await readProvenance(database, bundle);
  if (!provenance) {
    if ((await objectNames(database)).includes(PROVENANCE_TABLE))
      throw new WebBaselineError('installation_incomplete');
    return new Set();
  }
  if (provenance.state !== 'complete' && provenance.state !== 'adopted')
    throw new WebBaselineError('installation_incomplete');
  if (
    provenance.journal.pending !== null ||
    !provenance.journal.seeded ||
    provenance.journal.completed.length !== bundle.tables.length
  )
    throw new WebBaselineError('installation_incomplete');
  await verifyWebSchema(database, bundle, applied, migrationsDirectory);
  if (provenance.state === 'adopted') {
    if (bundle.manifest.historicalMigrations.some(({ name }) => !ledger.has(name)))
      throw new WebBaselineError('adopted_history_missing');
    return new Set();
  }
  return new Set(
    bundle.manifest.historicalMigrations
      .filter(({ name }) => !ledger.has(name))
      .map(({ name }) => name),
  );
}

export type BaselineAction = 'bootstrap' | 'adopt' | 'verify' | 'teardown';

/** Offline operator action; the caller supplies an owner-approved external schema hash. */
export async function runWebBaseline(
  database: BaselineDatabase,
  action: BaselineAction,
  expectedMudSha256: string,
): Promise<void> {
  const bundle = checkedBundle();
  const product = await family(database);
  const invariants = await rows(
    database,
    'SELECT @@autocommit AS autocommit, @@foreign_key_checks AS foreign_key_checks, @@sql_mode AS sql_mode',
  );
  if (
    Number(invariants[0]?.autocommit) !== 1 ||
    Number(invariants[0]?.foreign_key_checks) !== 1 ||
    !/(?:^|,)STRICT_(?:TRANS|ALL)_TABLES(?:,|$)/.test(String(invariants[0]?.sql_mode))
  )
    throw new WebBaselineError('unsafe_database_session_invariants');
  const identity = await rows(database, 'SELECT DATABASE() AS name');
  const lock = `durisweb:baseline:${sha256(String(identity[0]?.name)).slice(0, 32)}`;
  const locked = await rows(database, 'SELECT GET_LOCK(?, 0) AS acquired', [lock]);
  if (Number(locked[0]?.acquired) !== 1) throw new WebBaselineError('installation_busy');
  try {
    await verifyMudTarget(database, bundle, expectedMudSha256);
    await verifyNoWebTriggers(database, bundle);
    const ledger = await readWebMigrationLedger(database);
    let provenance = await readProvenance(database, bundle);
    if (provenance && provenance.mudSchemaSha256 !== expectedMudSha256)
      throw new WebBaselineError('provenance_mud_identity_mismatch');

    if (action === 'verify') {
      if (!provenance) throw new WebBaselineError('missing_provenance');
      await verifiedWebBaselineCoverage(database);
      return;
    }
    if (action === 'teardown') {
      if (provenance?.state === 'adopted' || ledger.length > 0)
        throw new WebBaselineError('teardown_of_adopted_or_migrated_store');
      const names = new Set(await objectNames(database));
      const forwardNames = loadWebForwardSchemas(bundle).flatMap(({ tables }) =>
        Object.keys(tables),
      );
      if (!provenance) {
        // A lost acknowledgement for the final autocommitted DROP leaves no
        // journal. An entirely absent web store needs no destructive retry.
        if (
          names.has(PROVENANCE_TABLE) ||
          [...bundle.tables.map(({ name }) => name), ...forwardNames].some((name) =>
            names.has(name),
          )
        )
          throw new WebBaselineError('missing_provenance');
        return;
      }
      if (
        forwardNames.some(
          (name) => names.has(name) && !bundle.tables.some((table) => table.name === name),
        )
      )
        throw new WebBaselineError('teardown_unowned_object');
      await removeBaseline(database, bundle, provenance, product);
      await verifyMudTarget(database, bundle, expectedMudSha256);
      return;
    }
    if (provenance?.state === 'complete' || provenance?.state === 'adopted') {
      await verifiedWebBaselineCoverage(database);
      return;
    }
    if (provenance?.state === 'removing') throw new WebBaselineError('teardown_in_progress');
    if (action === 'adopt') {
      if (provenance) throw new WebBaselineError('installation_in_progress');
      if (bundle.manifest.historicalMigrations.some(({ name }) => !ledger.includes(name)))
        throw new WebBaselineError('existing_history_incomplete');
      await verifyWebSchema(database, bundle, ledger);
      provenance = {
        state: 'adopted',
        mudSchemaSha256: expectedMudSha256,
        journal: { completed: bundle.tables.map(({ name }) => name), pending: null, seeded: true },
      };
    } else {
      if (ledger.length !== 0) throw new WebBaselineError('bootstrap_has_existing_history');
      const existing = new Set(await objectNames(database));
      const allowed = new Set([
        ...(provenance?.journal.completed ?? []),
        ...(provenance?.journal.pending ? [provenance.journal.pending] : []),
      ]);
      const webNames = [
        ...bundle.tables.map(({ name }) => name),
        ...loadWebForwardSchemas(bundle).flatMap(({ tables }) => Object.keys(tables)),
      ];
      if (webNames.some((name) => existing.has(name) && !allowed.has(name)))
        throw new WebBaselineError('unrecorded_existing_web_schema');
      provenance ??= {
        state: 'installing',
        mudSchemaSha256: expectedMudSha256,
        journal: { completed: [], pending: null, seeded: false },
      };
    }
    if (!(await objectNames(database)).includes(PROVENANCE_TABLE))
      await database.query(METADATA_DDL);
    if (!(await readProvenance(database, bundle))) {
      await database.query(
        'INSERT INTO web_schema_baselines (id, manifest_sha256, mud_schema_sha256, state, journal) VALUES (?, ?, ?, ?, ?)',
        [
          bundle.manifest.id,
          bundle.manifestSha256,
          expectedMudSha256,
          provenance.state,
          JSON.stringify(provenance.journal),
        ],
      );
    }
    if (action === 'adopt') return;

    for (const table of bundle.tables) {
      const existing = new Set(await objectNames(database));
      if (!provenance.journal.completed.includes(table.name)) {
        // An existing object is resumable only if intent was durable before it
        // appeared, not merely because it matches after the initial inspection.
        if (existing.has(table.name) && provenance.journal.pending !== table.name) {
          throw new WebBaselineError('unrecorded_existing_web_schema');
        }
        provenance.journal.pending = table.name;
        await saveJournal(database, bundle, 'installing', provenance.journal);
        if (!existing.has(table.name)) await database.query(table.sql);
        await verifyTable(database, table, product);
        const count = await rows(database, 'SELECT COUNT(*) AS count FROM ??', [table.name]);
        if (Number(count[0]?.count) !== 0) throw new WebBaselineError('partial_install_has_data');
        provenance.journal.completed.push(table.name);
        provenance.journal.pending = null;
        await saveJournal(database, bundle, 'installing', provenance.journal);
      } else await verifyTable(database, table, product);
    }
    if (!provenance.journal.seeded) {
      for (const table of bundle.tables) {
        const count = await rows(database, 'SELECT COUNT(*) AS count FROM ??', [table.name]);
        if (Number(count[0]?.count) !== 0) throw new WebBaselineError('partial_install_has_data');
      }
      await database.query('START TRANSACTION');
      try {
        for (const seed of bundle.seeds) {
          for (const row of seed.rows) {
            const keys = Object.keys(row);
            await database.query(
              `INSERT INTO ?? (${keys.map(() => '??').join(',')}) VALUES (${keys.map(() => '?').join(',')})`,
              [seed.table, ...keys, ...Object.values(row)],
            );
          }
        }
        provenance.journal.seeded = true;
        await saveJournal(database, bundle, 'installing', provenance.journal);
        await database.query('COMMIT');
      } catch (error) {
        await database.query('ROLLBACK');
        throw error;
      }
    }
    await verifyMudTarget(database, bundle, expectedMudSha256);
    await saveJournal(database, bundle, 'complete', provenance.journal);
    await verifiedWebBaselineCoverage(database);
  } finally {
    await database.query('SELECT RELEASE_LOCK(?)', [lock]);
  }
}

async function removeBaseline(
  database: BaselineDatabase,
  bundle: WebBaselineBundle,
  provenance: Provenance,
  product: BaselineDatabaseFamily,
): Promise<void> {
  const names = new Set(await objectNames(database));
  const remaining = new Set([
    ...provenance.journal.completed,
    ...(provenance.journal.pending ? [provenance.journal.pending] : []),
  ]);
  for (const name of remaining) {
    if (!names.has(name) && provenance.journal.pending !== name)
      throw new WebBaselineError('teardown_object_missing');
  }
  for (const table of bundle.tables) {
    if (!names.has(table.name)) continue;
    if (!remaining.has(table.name)) throw new WebBaselineError('teardown_unowned_object');
    await verifyTable(database, table, product);
    const seed = bundle.seeds.find(({ table: seedTable }) => seedTable === table.name);
    const count = await rows(database, 'SELECT COUNT(*) AS count FROM ??', [table.name]);
    if (Number(count[0]?.count) !== (provenance.journal.seeded ? (seed?.rows.length ?? 0) : 0))
      throw new WebBaselineError('teardown_has_user_data');
    if (seed && provenance.journal.seeded) {
      const columns = Object.keys(seed.rows[0]);
      const records = await rows(database, `SELECT ${columns.map(() => '??').join(',')} FROM ??`, [
        ...columns,
        table.name,
      ]);
      const normalize = (record: Record<string, unknown>) =>
        JSON.stringify(columns.map((key) => record[key]));
      if (
        JSON.stringify(records.map(normalize).sort()) !==
        JSON.stringify(seed.rows.map(normalize).sort())
      )
        throw new WebBaselineError('teardown_seed_modified');
    }
  }
  await saveJournal(database, bundle, 'removing', provenance.journal);
  for (const table of [...bundle.tables].reverse()) {
    if (!remaining.has(table.name)) continue;
    if (!names.has(table.name) && provenance.journal.pending !== table.name)
      throw new WebBaselineError('teardown_object_missing');
    provenance.journal.pending = table.name;
    await saveJournal(database, bundle, 'removing', provenance.journal);
    if (names.has(table.name)) await database.query('DROP TABLE ??', [table.name]);
    provenance.journal.completed = provenance.journal.completed.filter(
      (name) => name !== table.name,
    );
    provenance.journal.pending = null;
    await saveJournal(database, bundle, 'removing', provenance.journal);
  }
  await database.query('DROP TABLE web_schema_baselines');
}
