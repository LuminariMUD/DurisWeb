import { createHash } from 'node:crypto';
import type { Connection, RowDataPacket } from 'mysql2/promise';
import {
  schemaDatabaseFamily,
  schemaRows,
  type SchemaDatabase,
  type SchemaBinding,
} from './schemaPostconditions.js';
import type { BaselineDatabaseFamily } from './webBaselineBundle.js';

export const LIFECYCLE_METADATA_FUNCTION = 'web_lifecycle_metadata_v2';
type Database = Pick<Connection, 'query'>;
type ReadRows = (sql: string, values?: SchemaBinding[]) => Promise<Record<string, unknown>[]>;
const TIMEOUT = 5000;
const definerPattern = /^[A-Za-z0-9_.-]+@[A-Za-z0-9_.:%-]+$/;
export class LifecycleMetadataError extends Error {
  constructor() {
    super('Lifecycle metadata authority or contract is unavailable');
    this.name = 'LifecycleMetadataError';
  }
}

/** No application data, caller SQL or external object names leave this routine. */
export function lifecycleMetadataBody(family: BaselineDatabaseFamily): string {
  return `BEGIN
  DECLARE authority_count INT;
  DECLARE body_sha256 VARCHAR(64) CHARACTER SET ascii;
  IF target_table IS NULL OR target_table NOT REGEXP '^[a-z][a-z0-9_]{0,63}$'
    OR target_table REGEXP '[^a-z0-9_]' OR BINARY target_table<>BINARY LOWER(target_table) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Lifecycle metadata target unavailable';
  END IF;
  IF CURRENT_USER() NOT REGEXP '^[A-Za-z0-9_.-]+@[A-Za-z0-9_.:%-]+$' THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Lifecycle metadata authority unavailable';
  END IF;
  ${family === 'mysql8' ? "IF @@partial_revokes <> 0 THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Lifecycle metadata authority unavailable'; END IF;" : ''}
  SELECT COUNT(*) INTO authority_count FROM information_schema.USER_PRIVILEGES
    WHERE GRANTEE=CONCAT(CHAR(39),SUBSTRING_INDEX(CURRENT_USER(),'@',1),CHAR(39,64,39),SUBSTRING_INDEX(CURRENT_USER(),'@',-1),CHAR(39))
      AND PRIVILEGE_TYPE IN ('SELECT','TRIGGER');
  IF authority_count <> 2 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Lifecycle metadata authority unavailable';
  END IF;
  SELECT SHA2(ROUTINE_DEFINITION,256) INTO body_sha256 FROM information_schema.ROUTINES
    WHERE ROUTINE_SCHEMA=DATABASE() AND ROUTINE_NAME='${LIFECYCLE_METADATA_FUNCTION}' AND ROUTINE_TYPE='FUNCTION';
  RETURN JSON_OBJECT('format',1,'table',target_table,'definitionSha256',body_sha256,
    'triggers',(SELECT COUNT(*) FROM information_schema.TRIGGERS WHERE EVENT_OBJECT_SCHEMA=DATABASE() AND EVENT_OBJECT_TABLE=target_table),
    'incoming',(SELECT COUNT(*) FROM information_schema.KEY_COLUMN_USAGE WHERE REFERENCED_TABLE_SCHEMA=DATABASE() AND REFERENCED_TABLE_NAME=target_table));
END`;
}
function mysqlRows(database: Database): ReadRows {
  return async (sql, values = []) =>
    (await database.query<RowDataPacket[]>({ sql, timeout: TIMEOUT }, values))[0];
}
async function familyOf(read: ReadRows): Promise<BaselineDatabaseFamily> {
  return schemaDatabaseFamily({
    query: async (sql, values = []) => [await read(sql, values)],
  });
}
async function routine(read: ReadRows): Promise<Record<string, unknown>> {
  const rows =
    await read(`SELECT ROUTINE_TYPE,ROUTINE_DEFINITION,SECURITY_TYPE,DEFINER,SQL_DATA_ACCESS,
      IS_DETERMINISTIC,DTD_IDENTIFIER,CHARACTER_SET_NAME FROM information_schema.ROUTINES
      WHERE ROUTINE_SCHEMA=DATABASE() AND ROUTINE_NAME='${LIFECYCLE_METADATA_FUNCTION}'`);
  if (
    rows.length !== 1 ||
    rows[0].ROUTINE_TYPE !== 'FUNCTION' ||
    rows[0].SECURITY_TYPE !== 'DEFINER' ||
    !definerPattern.test(String(rows[0].DEFINER)) ||
    rows[0].SQL_DATA_ACCESS !== 'READS SQL DATA' ||
    rows[0].IS_DETERMINISTIC !== 'NO' ||
    rows[0].DTD_IDENTIFIER !== 'longtext' ||
    rows[0].CHARACTER_SET_NAME !== 'ascii'
  )
    throw new LifecycleMetadataError();
  const parameters =
    await read(`SELECT PARAMETER_NAME,DATA_TYPE,CHARACTER_MAXIMUM_LENGTH,CHARACTER_SET_NAME
      FROM information_schema.PARAMETERS WHERE SPECIFIC_SCHEMA=DATABASE()
      AND SPECIFIC_NAME='${LIFECYCLE_METADATA_FUNCTION}' AND ORDINAL_POSITION>0 ORDER BY ORDINAL_POSITION`);
  if (
    parameters.length !== 1 ||
    parameters[0].PARAMETER_NAME !== 'target_table' ||
    parameters[0].DATA_TYPE !== 'varchar' ||
    Number(parameters[0].CHARACTER_MAXIMUM_LENGTH) !== 64 ||
    parameters[0].CHARACTER_SET_NAME !== 'ascii'
  )
    throw new LifecycleMetadataError();
  return rows[0];
}

export interface LifecycleMetadata {
  triggers: number;
  incoming: number;
}
/** Use the caller's transaction: the function's metadata lock then survives through its writes. */
export async function readLifecycleMetadata(
  database: Database,
  target: string,
): Promise<LifecycleMetadata> {
  return readMetadata(mysqlRows(database), target);
}
/** Existing schema/Knex adapters retain their own query execution and offline migration boundary. */
export async function readSchemaLifecycleMetadata(
  database: SchemaDatabase,
  target: string,
): Promise<LifecycleMetadata> {
  return readMetadata((sql, values = []) => schemaRows(database, sql, values), target);
}
async function readMetadata(read: ReadRows, target: string): Promise<LifecycleMetadata> {
  try {
    if (!/^[a-z][a-z0-9_]{0,63}$/.test(target) || target.trim() !== target) throw new Error();
    const family = await familyOf(read);
    await routine(read);
    const rows = await read(`SELECT ${LIFECYCLE_METADATA_FUNCTION}(?) AS metadata`, [target]);
    if (rows.length !== 1 || typeof rows[0].metadata !== 'string' || rows[0].metadata.length > 512)
      throw new Error();
    const value: unknown = JSON.parse(rows[0].metadata);
    if (
      !value ||
      typeof value !== 'object' ||
      Array.isArray(value) ||
      Object.keys(value).sort().join(',') !== 'definitionSha256,format,incoming,table,triggers' ||
      !('format' in value) ||
      value.format !== 1 ||
      !('table' in value) ||
      value.table !== target ||
      !('definitionSha256' in value) ||
      value.definitionSha256 !==
        createHash('sha256').update(lifecycleMetadataBody(family)).digest('hex') ||
      !('triggers' in value) ||
      typeof value.triggers !== 'number' ||
      !Number.isSafeInteger(value.triggers) ||
      value.triggers < 0 ||
      !('incoming' in value) ||
      typeof value.incoming !== 'number' ||
      !Number.isSafeInteger(value.incoming) ||
      value.incoming < 0
    )
      throw new Error();
    // Check attributes again under the routine lock, including replacement races.
    await routine(read);
    return { triggers: value.triggers, incoming: value.incoming };
  } catch {
    throw new LifecycleMetadataError();
  }
}
export async function assertLifecycleMetadata(database: Database, target: string): Promise<void> {
  const metadata = await readLifecycleMetadata(database, target);
  if (metadata.triggers !== 0 || metadata.incoming !== 0) throw new LifecycleMetadataError();
}

/** Explicit DBA setup only. Never replace an unknown routine, create users, or grant global rights. */
export async function installLifecycleMetadata(
  database: Database,
  runtimeUser: string,
  runtimeHost: string,
): Promise<void> {
  try {
    if (!/^[A-Za-z0-9_.-]+$/.test(runtimeUser) || !/^[A-Za-z0-9_.:%-]+$/.test(runtimeHost))
      throw new Error();
    const read = mysqlRows(database);
    const family = await familyOf(read);
    const [identity] = await database.query<RowDataPacket[]>({
      sql: 'SELECT CURRENT_USER() AS identity',
      timeout: TIMEOUT,
    });
    if (!definerPattern.test(String(identity[0]?.identity))) throw new Error();
    const [runtime] = await database.query<RowDataPacket[]>(
      { sql: 'SELECT User FROM mysql.user WHERE User=? AND Host=?', timeout: TIMEOUT },
      [runtimeUser, runtimeHost],
    );
    if (runtime.length !== 1) throw new Error();
    const [authority] = await database.query<RowDataPacket[]>({
      sql: `SELECT COUNT(*) AS count FROM information_schema.USER_PRIVILEGES
        WHERE GRANTEE=CONCAT(CHAR(39),SUBSTRING_INDEX(CURRENT_USER(),'@',1),CHAR(39,64,39),SUBSTRING_INDEX(CURRENT_USER(),'@',-1),CHAR(39))
        AND PRIVILEGE_TYPE IN ('SELECT','TRIGGER')`,
      timeout: TIMEOUT,
    });
    if (Number(authority[0]?.count) !== 2) throw new Error();
    if (family === 'mysql8') {
      const [settings] = await database.query<RowDataPacket[]>({
        sql: 'SELECT @@global.partial_revokes AS partial_revokes',
        timeout: TIMEOUT,
      });
      if (Number(settings[0]?.partial_revokes) !== 0) throw new Error();
    } else {
      const [settings] = await database.query<RowDataPacket[]>({
        sql: 'SELECT @@sql_mode AS sql_mode',
        timeout: TIMEOUT,
      });
      // MariaDB GRANT must not implicitly create an account if it disappears concurrently.
      if (!/(?:^|,)NO_AUTO_CREATE_USER(?:,|$)/.test(String(settings[0]?.sql_mode)))
        throw new Error();
    }
    const [existing] = await database.query<RowDataPacket[]>({
      sql: `SELECT ROUTINE_TYPE FROM information_schema.ROUTINES WHERE ROUTINE_SCHEMA=DATABASE() AND ROUTINE_NAME='${LIFECYCLE_METADATA_FUNCTION}'`,
      timeout: TIMEOUT,
    });
    if (!existing.length)
      await database.query({
        sql: `CREATE FUNCTION ${LIFECYCLE_METADATA_FUNCTION}(target_table VARCHAR(64) CHARACTER SET ascii)
          RETURNS LONGTEXT CHARACTER SET ascii NOT DETERMINISTIC READS SQL DATA SQL SECURITY DEFINER
          ${lifecycleMetadataBody(family)}`,
        timeout: TIMEOUT,
      });
    const installed = await routine(read);
    if (installed.ROUTINE_DEFINITION !== lifecycleMetadataBody(family)) throw new Error();
    await readLifecycleMetadata(database, 'web_settings');
    // Account placeholders are quoted by mysql2's query formatter, never interpolated.
    await database.query(
      {
        sql: `GRANT EXECUTE ON FUNCTION ${LIFECYCLE_METADATA_FUNCTION} TO ?@?`,
        timeout: TIMEOUT,
      },
      [runtimeUser, runtimeHost],
    );
  } catch {
    throw new LifecycleMetadataError();
  }
}
