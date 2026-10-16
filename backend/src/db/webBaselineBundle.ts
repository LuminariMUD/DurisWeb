import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadMudWriteAllowlist } from '../scripts/verifyMudWriteAllowlist.js';

export interface BaselineSource {
  name: string;
  sha256: string;
}

export type BaselineDatabaseFamily = 'mysql8' | 'mariadb11';
export interface BaselineTableSource extends BaselineSource {
  installedSha256: Record<BaselineDatabaseFamily, string>;
}

export interface BaselineManifest {
  formatVersion: 1;
  id: string;
  migrationCutoff: string;
  mudBaseline: { id: string; requiredTableFingerprint: string };
  additionalMudOwnedTables: string[];
  schemaSha256: string;
  seedsSha256: string;
  historicalMigrations: BaselineSource[];
  legacySql: (BaselineSource & { coverage: 'schema' | 'excluded' })[];
  tables: BaselineTableSource[];
}

export interface BaselineTable extends BaselineTableSource {
  sql: string;
}

export interface BaselineSeed {
  table: string;
  rows: Record<string, string | number | boolean | null>[];
}

export interface WebBaselineBundle {
  manifest: BaselineManifest;
  manifestSha256: string;
  tables: BaselineTable[];
  seeds: BaselineSeed[];
}

export function sha256(value: string | Buffer): string {
  return createHash('sha256').update(value).digest('hex');
}

/** AUTO_INCREMENT's current counter is row state, not schema identity. */
export function installedTableSha256(createTable: string): string {
  return sha256(createTable.replace(/ AUTO_INCREMENT=\d+/g, ''));
}

export function webBaselineDirectory(): string {
  return path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    '../../schema-baselines/2026-10-16',
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isDigest(value: unknown): value is string {
  return typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
}

function isIdentifier(value: unknown): value is string {
  return typeof value === 'string' && /^[a-z][a-z0-9_]{0,63}$/.test(value);
}

function isSource(value: unknown): value is BaselineSource {
  return isRecord(value) && typeof value.name === 'string' && isDigest(value.sha256);
}

function isManifest(value: unknown): value is BaselineManifest {
  return (
    isRecord(value) &&
    value.formatVersion === 1 &&
    value.id === 'durisweb-2026-10-16' &&
    typeof value.migrationCutoff === 'string' &&
    isRecord(value.mudBaseline) &&
    typeof value.mudBaseline.id === 'string' &&
    isDigest(value.mudBaseline.requiredTableFingerprint) &&
    Array.isArray(value.additionalMudOwnedTables) &&
    value.additionalMudOwnedTables.every(isIdentifier) &&
    isDigest(value.schemaSha256) &&
    isDigest(value.seedsSha256) &&
    Array.isArray(value.historicalMigrations) &&
    value.historicalMigrations.length > 0 &&
    value.historicalMigrations.every(isSource) &&
    Array.isArray(value.legacySql) &&
    value.legacySql.every(
      (source: unknown) =>
        isSource(source) &&
        'coverage' in source &&
        (source.coverage === 'schema' || source.coverage === 'excluded'),
    ) &&
    Array.isArray(value.tables) &&
    value.tables.length > 0 &&
    value.tables.every(
      (source: unknown) =>
        isSource(source) &&
        'installedSha256' in source &&
        isRecord(source.installedSha256) &&
        isDigest(source.installedSha256.mysql8) &&
        isDigest(source.installedSha256.mariadb11),
    )
  );
}

function isSeed(value: unknown): value is BaselineSeed {
  return (
    isRecord(value) &&
    isIdentifier(value.table) &&
    Array.isArray(value.rows) &&
    value.rows.length > 0 &&
    value.rows.every(
      (row: unknown) =>
        isRecord(row) &&
        Object.keys(row).length > 0 &&
        Object.entries(row).every(
          ([key, field]) =>
            isIdentifier(key) &&
            (field === null ||
              typeof field === 'string' ||
              typeof field === 'boolean' ||
              (typeof field === 'number' && Number.isFinite(field))),
        ),
    )
  );
}

function assertUnique(names: string[], category: string): void {
  if (new Set(names).size !== names.length) throw new Error(`baseline has duplicate ${category}`);
}

/** Validate immutable inputs without opening a connection or changing migration discovery. */
export function loadWebBaselineBundle(directory = webBaselineDirectory()): WebBaselineBundle {
  const manifestText = fs.readFileSync(path.join(directory, 'manifest.json'), 'utf8');
  const manifest: unknown = JSON.parse(manifestText);
  if (!isManifest(manifest)) throw new Error('invalid website baseline manifest');
  const schemaText = fs.readFileSync(path.join(directory, 'schema.sql'), 'utf8');
  const seedText = fs.readFileSync(path.join(directory, 'seeds.json'), 'utf8');
  if (sha256(schemaText) !== manifest.schemaSha256 || sha256(seedText) !== manifest.seedsSha256) {
    throw new Error('website baseline artifact checksum mismatch');
  }

  const backendRoot = path.resolve(webBaselineDirectory(), '../..');
  const ownership = loadMudWriteAllowlist(backendRoot);
  if (
    ownership.baseline.id !== manifest.mudBaseline.id ||
    ownership.baseline.requiredTableFingerprint !== manifest.mudBaseline.requiredTableFingerprint
  ) {
    throw new Error('website baseline MUD identity differs from the ownership inventory');
  }
  const externalTables = new Set([
    ...ownership.mudOwnedTables,
    ...manifest.additionalMudOwnedTables,
    'server_reboots',
  ]);
  const tableNames = manifest.tables.map(({ name }) => name);
  assertUnique(tableNames, 'tables');
  for (const name of tableNames) {
    if (!isIdentifier(name) || externalTables.has(name))
      throw new Error('baseline table ownership violation');
  }

  const blocks = schemaText.split(/^-- Table: /m);
  if (blocks.shift() !== '' || blocks.length !== manifest.tables.length)
    throw new Error('invalid baseline schema framing');
  const installed = new Set<string>();
  const tables = manifest.tables.map((table, index) => {
    const block = blocks[index];
    const sql = block
      .slice(block.indexOf('\n') + 1)
      .trim()
      .replace(/;$/, '');
    if (
      block.slice(0, block.indexOf('\n')) !== table.name ||
      sha256(sql) !== table.sha256 ||
      !sql.startsWith(`CREATE TABLE \`${table.name}\` (`) ||
      !sql.includes('ENGINE=InnoDB')
    ) {
      throw new Error(`invalid baseline definition: ${table.name}`);
    }
    for (const reference of sql.matchAll(/REFERENCES `([^`]+)`/g)) {
      if (reference[1] !== table.name && !installed.has(reference[1])) {
        throw new Error(`baseline foreign key crosses ownership or creation order: ${table.name}`);
      }
    }
    installed.add(table.name);
    return { ...table, sql };
  });

  const seeds: unknown = JSON.parse(seedText);
  if (
    !Array.isArray(seeds) ||
    !seeds.every(isSeed) ||
    seeds.some(({ table }) => !installed.has(table))
  ) {
    throw new Error('invalid baseline seed inventory');
  }
  assertUnique(
    seeds.map(({ table }) => table),
    'seed tables',
  );
  return { manifest, manifestSha256: sha256(manifestText), tables, seeds };
}

/** No absent/applied names are invented: this pins only the source files covered by the bundle. */
export function verifyWebBaselineSources(
  bundle: WebBaselineBundle,
  migrationsDirectory: string,
): void {
  const { manifest } = bundle;
  const historicalNames = manifest.historicalMigrations.map(({ name }) => name);
  assertUnique(historicalNames, 'historical migration names');
  assertUnique(
    manifest.legacySql.map(({ name }) => name),
    'SQL artifact names',
  );
  const actual = fs
    .readdirSync(migrationsDirectory)
    .filter((name) => name.endsWith('.ts') && name <= manifest.migrationCutoff)
    .sort();
  if (
    JSON.stringify([...historicalNames].sort()) !== JSON.stringify(actual) ||
    historicalNames.at(-1) !== manifest.migrationCutoff
  ) {
    throw new Error('website baseline historical migration coverage mismatch');
  }
  for (const source of [...manifest.historicalMigrations, ...manifest.legacySql]) {
    if (
      !/^[a-zA-Z0-9_]+\.(ts|sql)$/.test(source.name) ||
      sha256(fs.readFileSync(path.join(migrationsDirectory, source.name))) !== source.sha256
    ) {
      throw new Error('website baseline historical source checksum mismatch');
    }
  }
  const actualSql = fs
    .readdirSync(migrationsDirectory)
    .filter((name) => name.endsWith('.sql'))
    .sort();
  if (
    JSON.stringify(actualSql) !== JSON.stringify(manifest.legacySql.map(({ name }) => name).sort())
  ) {
    throw new Error('website baseline SQL artifact inventory mismatch');
  }
}
