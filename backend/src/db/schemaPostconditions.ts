import fs from 'node:fs';
import path from 'node:path';
import {
  type BaselineDatabaseFamily,
  loadWebBaselineBundle,
  sha256,
  webBaselineDirectory,
} from './webBaselineBundle.js';

export type SchemaBinding = string | number | boolean | null;
export interface SchemaDatabase {
  query(sql: string, bindings?: SchemaBinding[]): Promise<unknown>;
}
export interface TableMetadata {
  table: Record<string, unknown>[];
  columns: Record<string, unknown>[];
  indexes: Record<string, unknown>[];
  foreignKeys: Record<string, unknown>[];
  checks: Record<string, unknown>[];
}
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
export async function schemaRows(
  database: SchemaDatabase,
  sql: string,
  bindings: SchemaBinding[] = [],
): Promise<Record<string, unknown>[]> {
  const result = await database.query(sql, bindings);
  if (!Array.isArray(result) || !Array.isArray(result[0]) || !result[0].every(isRecord))
    throw new Error('Invalid schema metadata response');
  return result[0];
}

/** Compare stored semantics, avoiding SHOW CREATE's client/session-dependent rendering. */
export async function readTableMetadata(
  database: SchemaDatabase,
  name: string,
  product: BaselineDatabaseFamily,
): Promise<TableMetadata> {
  if (!/^[a-z][a-z0-9_]{0,63}$/.test(name)) throw new Error('Invalid metadata table identifier');
  const table = await schemaRows(
    database,
    "SELECT ENGINE,TABLE_COLLATION,ROW_FORMAT,TABLE_COMMENT FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=? AND TABLE_TYPE='BASE TABLE'",
    [name],
  );
  if (table.length !== 1) throw new Error('Required schema table is absent');
  const columns = await schemaRows(
    database,
    'SELECT COLUMN_NAME,ORDINAL_POSITION,COLUMN_TYPE,IS_NULLABLE,COLUMN_DEFAULT,CHARACTER_SET_NAME,COLLATION_NAME,EXTRA,GENERATION_EXPRESSION,COLUMN_COMMENT FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=? ORDER BY ORDINAL_POSITION',
    [name],
  );
  const visibility = product === 'mysql8' ? 'IS_VISIBLE' : 'IGNORED';
  const indexes = await schemaRows(
    database,
    `SELECT INDEX_NAME,NON_UNIQUE,SEQ_IN_INDEX,COLUMN_NAME,COLLATION,SUB_PART,INDEX_TYPE,${visibility} AS VISIBILITY FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=? ORDER BY INDEX_NAME,SEQ_IN_INDEX`,
    [name],
  );
  const foreignKeys = await schemaRows(
    database,
    `SELECT k.CONSTRAINT_NAME,k.COLUMN_NAME,k.ORDINAL_POSITION,IF(k.REFERENCED_TABLE_SCHEMA=DATABASE(),'<LOCAL>',k.REFERENCED_TABLE_SCHEMA) AS REFERENCED_SCHEMA,k.REFERENCED_TABLE_NAME,k.REFERENCED_COLUMN_NAME,r.UPDATE_RULE,r.DELETE_RULE,r.MATCH_OPTION FROM information_schema.KEY_COLUMN_USAGE k JOIN information_schema.REFERENTIAL_CONSTRAINTS r ON r.CONSTRAINT_SCHEMA=k.CONSTRAINT_SCHEMA AND r.CONSTRAINT_NAME=k.CONSTRAINT_NAME AND r.TABLE_NAME=k.TABLE_NAME WHERE k.CONSTRAINT_SCHEMA=DATABASE() AND k.TABLE_NAME=? AND k.REFERENCED_TABLE_NAME IS NOT NULL ORDER BY k.CONSTRAINT_NAME,k.ORDINAL_POSITION`,
    [name],
  );
  // CHECK names may be assigned by the engine. The exact clauses and enforcement
  // still participate; only reviewed source-equivalent variants are accepted.
  const enforcement = product === 'mysql8' ? 't.ENFORCED' : "'YES'";
  const checkTable = product === 'mariadb11' ? 'AND c.TABLE_NAME=t.TABLE_NAME' : '';
  const checks = await schemaRows(
    database,
    `SELECT c.CHECK_CLAUSE,${enforcement} AS ENFORCED FROM information_schema.TABLE_CONSTRAINTS t JOIN information_schema.CHECK_CONSTRAINTS c ON c.CONSTRAINT_SCHEMA=t.CONSTRAINT_SCHEMA AND c.CONSTRAINT_NAME=t.CONSTRAINT_NAME ${checkTable} WHERE t.CONSTRAINT_SCHEMA=DATABASE() AND t.TABLE_NAME=? AND t.CONSTRAINT_TYPE='CHECK' ORDER BY c.CHECK_CLAUSE`,
    [name],
  );
  if (name === 'knex_migrations' || name === 'knex_migrations_lock') {
    // These stores contain only allowlisted ASCII migration names and integers.
    const equivalent = new Set(['utf8mb4_general_ci', 'utf8mb4_0900_ai_ci', 'utf8mb4_unicode_ci']);
    for (const row of table)
      if (equivalent.has(String(row.TABLE_COLLATION))) row.TABLE_COLLATION = 'utf8mb4_unicode_ci';
    for (const row of columns)
      if (equivalent.has(String(row.COLLATION_NAME))) row.COLLATION_NAME = 'utf8mb4_unicode_ci';
  }
  return { table, columns, indexes, foreignKeys, checks };
}
export function tableMetadataSha256(metadata: TableMetadata): string {
  return sha256(JSON.stringify(metadata));
}

interface SchemaPostconditions {
  baselineManifestSha256: string;
  tables: Record<string, Record<BaselineDatabaseFamily, string[]>>;
}
const POSTCONDITION_SHA256 = 'c04d5baac8c30298f5a37c973e522809e55c2ca6717c560efa7b98cdf8eca843';
export function loadSchemaPostconditions(): SchemaPostconditions {
  const text = fs.readFileSync(
    path.resolve(webBaselineDirectory(), '../../schema-contracts/web-baseline-v1.json'),
    'utf8',
  );
  if (sha256(text) !== POSTCONDITION_SHA256)
    throw new Error('Website schema postcondition checksum mismatch');
  const value: unknown = JSON.parse(text);
  if (
    !isRecord(value) ||
    value.formatVersion !== 1 ||
    typeof value.baselineManifestSha256 !== 'string' ||
    !isRecord(value.tables)
  )
    throw new Error('Invalid schema postcondition contract');
  const bundle = loadWebBaselineBundle();
  if (value.baselineManifestSha256 !== bundle.manifestSha256)
    throw new Error('Schema postconditions name another baseline');
  const names = [
    ...bundle.tables.map(({ name }) => name),
    'web_schema_baselines',
    'knex_migrations',
    'knex_migrations_lock',
  ].sort();
  if (JSON.stringify(Object.keys(value.tables).sort()) !== JSON.stringify(names))
    throw new Error('Schema postcondition coverage differs');
  const tables: SchemaPostconditions['tables'] = {};
  for (const [name, entry] of Object.entries(value.tables)) {
    if (!isRecord(entry) || !Array.isArray(entry.mysql8) || !Array.isArray(entry.mariadb11))
      throw new Error('Invalid schema postcondition entry');
    const mysql8 = entry.mysql8.filter(
      (hash): hash is string => typeof hash === 'string' && /^[a-f0-9]{64}$/.test(hash),
    );
    const mariadb11 = entry.mariadb11.filter(
      (hash): hash is string => typeof hash === 'string' && /^[a-f0-9]{64}$/.test(hash),
    );
    if (
      mysql8.length === 0 ||
      mariadb11.length === 0 ||
      mysql8.length !== entry.mysql8.length ||
      mariadb11.length !== entry.mariadb11.length
    )
      throw new Error('Invalid schema postcondition digest');
    tables[name] = { mysql8, mariadb11 };
  }
  return { baselineManifestSha256: value.baselineManifestSha256, tables };
}
export async function matchesSchemaPostcondition(
  database: SchemaDatabase,
  name: string,
  product: BaselineDatabaseFamily,
): Promise<boolean> {
  const contract = loadSchemaPostconditions();
  const expected = contract.tables[name]?.[product];
  if (!expected) throw new Error('Unclassified web schema table');
  return expected.includes(tableMetadataSha256(await readTableMetadata(database, name, product)));
}
