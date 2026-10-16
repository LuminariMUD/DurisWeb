import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import type { Connection, RowDataPacket } from 'mysql2/promise';
import { loadMudWriteAllowlist } from '../db/mudWriteInventory.js';
import { sha256 } from '../db/webBaselineBundle.js';

interface OwnerFixtureInputs {
  sql: string;
  inputSha256: string;
  manifestSha256: string;
  runtimeManifestSha256: string;
  headId: string;
  tableList: string;
  tableCount: number;
  expected: { mysql8: string; mariadb10_11: string };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function isDigest(value: unknown): value is string {
  return typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
}

/** Read owner-published SQL as test inputs. No MUD repository command or server is run. */
export function readOwnerSchemaFixture(directory: string): OwnerFixtureInputs {
  const manifestText = fs.readFileSync(path.join(directory, 'migration_manifest.json'), 'utf8');
  const runtimeText = fs.readFileSync(
    path.join(directory, 'runtime_compatibility_manifest.json'),
    'utf8',
  );
  const manifest: unknown = JSON.parse(manifestText);
  const runtime: unknown = JSON.parse(runtimeText);
  const ownership = loadMudWriteAllowlist();
  if (
    !isRecord(manifest) ||
    !isRecord(manifest.baseline) ||
    manifest.baseline.id !== ownership.baseline.id ||
    manifest.baseline.required_table_fingerprint !== ownership.baseline.requiredTableFingerprint ||
    !Array.isArray(manifest.migrations) ||
    manifest.migrations.length === 0
  )
    throw new Error('Owner fixture migration contract is invalid');
  if (
    !isRecord(runtime) ||
    runtime.baseline_id !== ownership.baseline.id ||
    runtime.baseline_table_fingerprint !== ownership.baseline.requiredTableFingerprint ||
    !isRecord(runtime.migration_head) ||
    typeof runtime.migration_head.id !== 'string' ||
    typeof runtime.current_table_count !== 'number' ||
    !Number.isInteger(runtime.current_table_count) ||
    runtime.current_table_count <= 0 ||
    typeof runtime.runtime_table_sql_list !== 'string' ||
    !/^'[a-z0-9_]+'(?:,'[a-z0-9_]+')*$/.test(runtime.runtime_table_sql_list) ||
    !isRecord(runtime.normalized_metadata_fingerprints) ||
    !isDigest(runtime.normalized_metadata_fingerprints.mysql8) ||
    !isDigest(runtime.normalized_metadata_fingerprints.mariadb10_11)
  )
    throw new Error('Owner fixture runtime contract is invalid');
  const parts = [fs.readFileSync(path.join(directory, 'bootstrap_multithread_safe.sql'), 'utf8')];
  let head = '';
  for (const item of manifest.migrations) {
    if (
      !isRecord(item) ||
      typeof item.id !== 'string' ||
      typeof item.apply !== 'string' ||
      !/^immutable\/[0-9]{4}_[a-z0-9_]+\.sql$/.test(item.apply) ||
      !isDigest(item.apply_checksum)
    )
      throw new Error('Owner fixture apply input is invalid');
    const sql = fs.readFileSync(path.join(directory, item.apply), 'utf8');
    if (sha256(sql) !== item.apply_checksum)
      throw new Error('Owner fixture apply checksum differs');
    parts.push(sql);
    head = item.id;
  }
  if (head !== runtime.migration_head.id) throw new Error('Owner fixture head differs');
  const sql = parts.join('\n\n') + '\n';
  if (
    /^\s*(?:USE\s+|CREATE\s+DATABASE|DROP\s+DATABASE|SET\s+GLOBAL|CREATE\s+USER|GRANT\s+|LOAD\s+DATA)|\bINTO\s+OUTFILE/im.test(
      sql,
    )
  )
    throw new Error('Owner fixture SQL escapes its selected database');
  if (
    fs.readFileSync(path.join(directory, 'migration_manifest.json'), 'utf8') !== manifestText ||
    fs.readFileSync(path.join(directory, 'runtime_compatibility_manifest.json'), 'utf8') !==
      runtimeText
  )
    throw new Error('Owner fixture contract changed while reading');
  return {
    sql,
    inputSha256: sha256(sql),
    manifestSha256: sha256(manifestText),
    runtimeManifestSha256: sha256(runtimeText),
    headId: head,
    tableList: runtime.runtime_table_sql_list,
    tableCount: runtime.current_table_count,
    expected: {
      mysql8: runtime.normalized_metadata_fingerprints.mysql8,
      mariadb10_11: runtime.normalized_metadata_fingerprints.mariadb10_11,
    },
  };
}

/** Only newly created disposable test databases may receive these source-only inputs. */
export async function applyOwnerSchemaFixture(
  database: Connection,
  port: number,
  name: string,
  inputs: OwnerFixtureInputs,
): Promise<void> {
  if (
    !Number.isInteger(port) ||
    port < 1024 ||
    port > 65535 ||
    [3306, 3307, 13306].includes(port) ||
    !/^durisweb_qualification_[a-z0-9_]+$/.test(name)
  )
    throw new Error('Owner fixture target is not an isolated test target');
  const [identity] = await database.query<RowDataPacket[]>('SELECT DATABASE() AS name');
  const [existing] = await database.query<RowDataPacket[]>(
    'SELECT COUNT(*) AS count FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE()',
  );
  if (identity[0]?.name !== name || Number(existing[0]?.count) !== 0)
    throw new Error('Owner fixture requires a newly created empty target');
  const result = spawnSync(
    'mysql',
    [
      '--no-defaults',
      '--protocol=TCP',
      '--host=127.0.0.1',
      `--port=${port}`,
      '--user=root',
      '--default-character-set=utf8mb4',
      name,
    ],
    { input: inputs.sql, encoding: 'utf8', timeout: 45000, maxBuffer: 1024 * 1024 },
  );
  if (result.status !== 0) throw new Error('Owner fixture SQL application failed');
}

/** The owner's normalized metadata contract includes incoming foreign keys too. */
export async function ownerMetadataFingerprint(
  database: Connection,
  inputs: OwnerFixtureInputs,
): Promise<string> {
  const list = inputs.tableList;
  const query = `SELECT CONCAT('T',CHAR(9),table_name,CHAR(9),engine,CHAR(9),table_collation) AS entry FROM information_schema.tables WHERE table_schema=DATABASE() AND table_type='BASE TABLE' AND table_name IN (${list})
    UNION ALL SELECT CONCAT('C',CHAR(9),c.table_name,CHAR(9),c.column_name,CHAR(9),c.ordinal_position,CHAR(9),c.data_type,CHAR(9),c.is_nullable,CHAR(9),COALESCE(c.character_maximum_length,0),CHAR(9),COALESCE(c.numeric_precision,0),CHAR(9),COALESCE(c.numeric_scale,0),CHAR(9),COALESCE(c.datetime_precision,0),CHAR(9),CASE WHEN c.column_default IS NULL THEN '<NULL>' WHEN UPPER(c.column_default) LIKE 'CURRENT_TIMESTAMP%' THEN 'CURRENT_TIMESTAMP' ELSE TRIM(BOTH CHAR(39) FROM c.column_default) END,CHAR(9),CONCAT(IF(LOWER(c.extra) LIKE '%auto_increment%','A',''),IF(LOWER(c.extra) LIKE '%on update%','U',''),IF(LOWER(c.extra) LIKE '%generated%','G',''))) FROM information_schema.columns c JOIN information_schema.tables t ON t.table_schema=c.table_schema AND t.table_name=c.table_name AND t.table_type='BASE TABLE' WHERE c.table_schema=DATABASE() AND c.table_name IN (${list})
    UNION ALL SELECT CONCAT('I',CHAR(9),table_name,CHAR(9),index_name,CHAR(9),non_unique,CHAR(9),seq_in_index,CHAR(9),column_name,CHAR(9),COALESCE(sub_part,0)) FROM information_schema.statistics WHERE table_schema=DATABASE() AND table_name IN (${list})
    UNION ALL SELECT CONCAT('F',CHAR(9),k.table_name,CHAR(9),k.constraint_name,CHAR(9),k.column_name,CHAR(9),k.referenced_table_name,CHAR(9),k.referenced_column_name,CHAR(9),k.ordinal_position,CHAR(9),r.update_rule,CHAR(9),r.delete_rule) FROM information_schema.key_column_usage k JOIN information_schema.referential_constraints r ON r.constraint_schema=k.constraint_schema AND r.constraint_name=k.constraint_name WHERE k.constraint_schema=DATABASE() AND (k.table_name IN (${list}) OR k.referenced_table_name IN (${list})) AND k.referenced_table_name IS NOT NULL ORDER BY 1`;
  const [records] = await database.query<RowDataPacket[]>(query);
  if (records.some((record) => typeof record.entry !== 'string'))
    throw new Error('Invalid owner fixture metadata response');
  const fingerprint = sha256(records.map((record) => String(record.entry)).join('\n') + '\n');
  const [version] = await database.query<RowDataPacket[]>('SELECT VERSION() AS version');
  const expected = String(version[0]?.version).includes('MariaDB')
    ? inputs.expected.mariadb10_11
    : inputs.expected.mysql8;
  const [count] = await database.query<RowDataPacket[]>(
    `SELECT COUNT(*) AS count FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_TYPE='BASE TABLE' AND TABLE_NAME IN (${list})`,
  );
  if (fingerprint !== expected || Number(count[0]?.count) !== inputs.tableCount)
    throw new Error('Owner fixture does not match published metadata');
  return fingerprint;
}
