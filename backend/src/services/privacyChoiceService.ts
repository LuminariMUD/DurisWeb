import crypto from 'node:crypto';
import type { PoolConnection, RowDataPacket, ResultSetHeader } from 'mysql2/promise';
import { pool } from '../db/connection.js';
import { PRIVACY_CHOICE_PREFIX } from '../db/internalWebSettings.js';
import { getBackendConfiguration } from '../config/environment.js';
import { getPrivacyPolicy, privacyCollectionEnabled } from '../config/privacyPolicy.js';
import logger from '../utils/logger.js';

const HEX = /^[a-f0-9]{64}$/;
const DESCRIPTION = 'privacy choice v1';
const LIMIT_BYTES = 2048;
const MAX_REVISION = 4294967294;
const environment = getBackendConfiguration();
export const PRIVACY_COOKIE =
  environment.environment === 'production' ? '__Host-privacy_choice' : 'privacy_choice';

export class PrivacyChoiceError extends Error {
  constructor(
    readonly status: 400 | 403 | 409 | 503,
    message: string,
  ) {
    super(message);
    this.name = 'PrivacyChoiceError';
  }
}
export interface PrivacyBrowserContext {
  readonly csrfToken: unknown;
  readonly receipt: unknown;
}
export interface PrivacyChoiceStatus {
  readonly noticeVersion: string;
  readonly choiceVersion: string;
  readonly choicesAvailable: boolean;
  readonly collectionAvailable: boolean;
  readonly decision: 'unknown' | 'accepted' | 'refused' | 'withdrawn';
  readonly revision: number;
  readonly expiresAtEpoch: number | null;
  readonly receiptValid: boolean;
}
interface Choice {
  format: 1;
  choiceVersion: string;
  noticeVersion: string;
  decision: PrivacyChoiceStatus['decision'];
  revision: number;
  credentialDigest: string | null;
  changedAtEpoch: number;
  expiresAtEpoch: number;
}
interface Credential {
  key: string;
  secret: string;
}
type Bindings = (string | number | Buffer | null)[];

function parseCredential(value: unknown): Credential | null {
  if (typeof value !== 'string' || value.length !== 129) return null;
  const [key, secret] = value.split('.');
  return HEX.test(key ?? '') && HEX.test(secret ?? '') ? { key, secret } : null;
}
function browserKey(context: PrivacyBrowserContext): string | null {
  const credential = parseCredential(context.receipt);
  if (credential) return credential.key;
  if (typeof context.csrfToken !== 'string' || !HEX.test(context.csrfToken)) return null;
  return crypto
    .createHmac('sha256', environment.jwtSecret)
    .update('privacy-choice-browser-v1\0')
    .update(context.csrfToken)
    .digest('hex');
}
function digest(secret: string): string {
  return crypto
    .createHash('sha256')
    .update('privacy-choice-credential-v1\0')
    .update(secret)
    .digest('hex');
}
function credentialMatches(choice: Choice, credential: Credential | null): boolean {
  return (
    !!credential &&
    !!choice.credentialDigest &&
    crypto.timingSafeEqual(
      Buffer.from(choice.credentialDigest, 'hex'),
      Buffer.from(digest(credential.secret), 'hex'),
    )
  );
}
function integer(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}
function parseChoice(row: RowDataPacket, key: string): Choice {
  if (
    row.setting_key !== PRIVACY_CHOICE_PREFIX + key ||
    row.description !== DESCRIPTION ||
    row.updated_by !== null ||
    typeof row.value !== 'string' ||
    Number(row.bytes) > LIMIT_BYTES ||
    Buffer.byteLength(row.value, 'utf8') > LIMIT_BYTES
  )
    throw new Error('invalid_choice');
  const parsed: unknown = JSON.parse(row.value);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed))
    throw new Error('invalid_choice');
  const value = parsed as Record<string, unknown>;
  if (
    Object.keys(value).sort().join(',') !==
      'changedAtEpoch,choiceVersion,credentialDigest,decision,expiresAtEpoch,format,noticeVersion,revision' ||
    value.format !== 1 ||
    typeof value.choiceVersion !== 'string' ||
    !/^[a-zA-Z0-9.-]{1,64}$/.test(value.choiceVersion) ||
    typeof value.noticeVersion !== 'string' ||
    !/^[a-zA-Z0-9.-]{1,64}$/.test(value.noticeVersion) ||
    typeof value.decision !== 'string' ||
    !['unknown', 'accepted', 'refused', 'withdrawn'].includes(value.decision) ||
    !integer(value.revision) ||
    value.revision > MAX_REVISION ||
    !integer(value.changedAtEpoch) ||
    !integer(value.expiresAtEpoch) ||
    (value.credentialDigest !== null &&
      (typeof value.credentialDigest !== 'string' || !HEX.test(value.credentialDigest))) ||
    (value.decision === 'unknown'
      ? value.revision !== 0 || value.credentialDigest !== null
      : value.revision === 0 ||
        value.credentialDigest === null ||
        value.expiresAtEpoch <= value.changedAtEpoch)
  )
    throw new Error('invalid_choice');
  return value as unknown as Choice;
}
async function query<T extends RowDataPacket[] | ResultSetHeader = RowDataPacket[]>(
  connection: PoolConnection,
  sql: string,
  values: Bindings = [],
) {
  return values.length
    ? connection.execute<T>({ sql, timeout: 5000 }, values)
    : connection.query<T>({ sql, timeout: 5000 });
}
async function readChoice(
  connection: PoolConnection,
  key: string,
  lock: boolean,
): Promise<Choice | null> {
  const [rows] = await query(
    connection,
    `SELECT setting_key,description,updated_by,LEFT(setting_value,${LIMIT_BYTES + 1}) AS value,OCTET_LENGTH(setting_value) AS bytes
     FROM web_settings WHERE setting_key=?${lock ? ' FOR UPDATE' : ''}`,
    [PRIVACY_CHOICE_PREFIX + key],
  );
  return rows.length ? parseChoice(rows[0], key) : null;
}
async function databaseEpoch(connection: PoolConnection): Promise<number> {
  const [rows] = await query(connection, 'SELECT UNIX_TIMESTAMP() AS epoch');
  const epoch = Number(rows[0]?.epoch);
  if (!integer(epoch)) throw new Error('invalid_clock');
  return epoch;
}
async function checkTransactionalStorage(
  connection: PoolConnection,
  collection: boolean,
): Promise<void> {
  await query(connection, 'SELECT setting_key FROM web_settings LIMIT 0');
  if (collection) {
    await query(connection, 'SELECT id FROM page_views LIMIT 0');
    await query(connection, 'SELECT id FROM visitor_sessions LIMIT 0');
  }
  const [rows] = await query(
    connection,
    "SELECT TABLE_NAME,ENGINE FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME IN ('web_settings','page_views','visitor_sessions')",
  );
  const required = collection
    ? ['web_settings', 'page_views', 'visitor_sessions']
    : ['web_settings'];
  if (
    required.some((name) => !rows.some((row) => row.TABLE_NAME === name && row.ENGINE === 'InnoDB'))
  )
    throw new Error('nontransactional_privacy_storage');
}
async function withConnection<T>(
  transactional: boolean,
  collection: boolean,
  action: (connection: PoolConnection) => Promise<T>,
): Promise<T> {
  let connection: PoolConnection | undefined;
  let reusable = true;
  try {
    connection = await pool.getConnection();
    if (transactional) {
      await connection.beginTransaction();
      await checkTransactionalStorage(connection, collection);
    }
    const result = await action(connection);
    if (transactional) await connection.commit();
    return result;
  } catch (error) {
    if (connection && transactional) {
      try {
        await connection.rollback();
      } catch {
        reusable = false;
      }
    }
    if (error instanceof PrivacyChoiceError) throw error;
    logger.warn('privacy_choice_storage_unavailable', { reference: crypto.randomUUID() });
    throw new PrivacyChoiceError(503, 'Privacy choices are temporarily unavailable');
  } finally {
    if (connection) {
      if (reusable) connection.release();
      else connection.destroy();
    }
  }
}
function status(
  choice: Choice | null,
  context: PrivacyBrowserContext,
  now: number,
): PrivacyChoiceStatus {
  const policy = getPrivacyPolicy();
  const valid =
    !!choice &&
    choice.choiceVersion === policy.choiceVersion &&
    choice.noticeVersion === policy.noticeVersion &&
    choice.expiresAtEpoch > now &&
    credentialMatches(choice, parseCredential(context.receipt));
  return {
    noticeVersion: policy.noticeVersion,
    choiceVersion: policy.choiceVersion,
    choicesAvailable: policy.approved,
    collectionAvailable: privacyCollectionEnabled(),
    decision: valid ? choice.decision : 'unknown',
    revision: choice?.revision ?? 0,
    expiresAtEpoch: valid ? choice.expiresAtEpoch : null,
    receiptValid: valid,
  };
}

export async function getPrivacyChoice(
  context: PrivacyBrowserContext,
): Promise<PrivacyChoiceStatus> {
  const key = browserKey(context);
  if (!getPrivacyPolicy().approved || !key) return status(null, context, 0);
  return withConnection(false, false, async (connection) =>
    status(await readChoice(connection, key, false), context, await databaseEpoch(connection)),
  );
}

/** Only an explicit same-origin CSRF action may call this mutation boundary. */
export async function recordPrivacyChoice(
  context: PrivacyBrowserContext,
  input: unknown,
): Promise<{ status: PrivacyChoiceStatus; receipt: string }> {
  const policy = getPrivacyPolicy();
  if (!policy.approved) throw new PrivacyChoiceError(503, 'Privacy choices are not available yet');
  if (!input || typeof input !== 'object' || Array.isArray(input))
    throw new PrivacyChoiceError(400, 'Invalid privacy choice');
  const value = input as Record<string, unknown>;
  if (
    Object.keys(value).sort().join(',') !== 'choiceVersion,decision,noticeVersion,revision' ||
    value.choiceVersion !== policy.choiceVersion ||
    value.noticeVersion !== policy.noticeVersion ||
    !integer(value.revision) ||
    value.revision >= MAX_REVISION ||
    typeof value.decision !== 'string' ||
    !['accepted', 'refused', 'withdrawn'].includes(value.decision)
  )
    throw new PrivacyChoiceError(400, 'Invalid privacy choice');
  if (value.decision === 'accepted' && !privacyCollectionEnabled())
    throw new PrivacyChoiceError(409, 'Optional analytics is unavailable');
  const key = browserKey(context);
  if (!key || typeof context.csrfToken !== 'string' || !HEX.test(context.csrfToken))
    throw new PrivacyChoiceError(403, 'Invalid privacy browser context');
  return withConnection(true, false, async (connection) => {
    const now = await databaseEpoch(connection);
    const initial: Choice = {
      format: 1,
      choiceVersion: policy.choiceVersion,
      noticeVersion: policy.noticeVersion,
      decision: 'unknown',
      revision: 0,
      credentialDigest: null,
      changedAtEpoch: now,
      expiresAtEpoch: 0,
    };
    // The insert/upsert claims the row without shared-lock upgrade races on first choices.
    await query(
      connection,
      'INSERT INTO web_settings (setting_key,setting_value,description,updated_by) VALUES (?,?,?,NULL) ON DUPLICATE KEY UPDATE setting_key=setting_key',
      [PRIVACY_CHOICE_PREFIX + key, JSON.stringify(initial), DESCRIPTION],
    );
    const previous = await readChoice(connection, key, true);
    if (!previous) throw new Error('choice_missing');
    const credential = parseCredential(context.receipt);
    if (credential && !credentialMatches(previous, credential))
      throw new PrivacyChoiceError(403, 'Invalid privacy receipt');
    if (previous.revision !== value.revision)
      throw new PrivacyChoiceError(409, 'Privacy choice changed; refresh and try again');
    const secret = crypto.randomBytes(32).toString('hex');
    const choice: Choice = {
      ...initial,
      decision: value.decision as Choice['decision'],
      revision: previous.revision + 1,
      credentialDigest: digest(secret),
      expiresAtEpoch: now + policy.preferenceLifetimeSeconds,
    };
    await query(
      connection,
      'UPDATE web_settings SET setting_value=?,description=?,updated_by=NULL,updated_at=FROM_UNIXTIME(?) WHERE setting_key=?',
      [JSON.stringify(choice), DESCRIPTION, now, PRIVACY_CHOICE_PREFIX + key],
    );
    const receipt = key + '.' + secret;
    return { receipt, status: status(choice, { ...context, receipt }, now) };
  });
}

const ROUTES: Readonly<Record<string, string>> = Object.freeze({
  home: '/',
  news: '/news',
  pvp: '/pvp',
  battle: '/pvp/:id',
  stats: '/pvp/stats',
  forum: '/forum',
  thread: '/forum/thread/:id',
  wiki: '/wiki',
  guide: '/guide',
  status: '/status',
});

/** The common boundary validates authorization before any optional persistence. No enrichment occurs. */
export async function collectPrivacyPageView(receipt: unknown, input: unknown): Promise<void> {
  if (!privacyCollectionEnabled())
    throw new PrivacyChoiceError(403, 'Optional analytics is unavailable');
  if (!input || typeof input !== 'object' || Array.isArray(input))
    throw new PrivacyChoiceError(400, 'Invalid analytics event');
  const value = input as Record<string, unknown>;
  const credential = parseCredential(receipt);
  if (
    Object.keys(value).sort().join(',') !== 'choiceVersion,revision,route,visitNonce' ||
    typeof value.route !== 'string' ||
    !Object.hasOwn(ROUTES, value.route) ||
    typeof value.visitNonce !== 'string' ||
    !HEX.test(value.visitNonce) ||
    !integer(value.revision) ||
    !credential
  )
    throw new PrivacyChoiceError(403, 'Invalid analytics authorization');
  const route = ROUTES[value.route];
  await withConnection(true, true, async (connection) => {
    const choice = await readChoice(connection, credential.key, true);
    const now = await databaseEpoch(connection);
    const current = getPrivacyPolicy();
    if (
      !privacyCollectionEnabled() ||
      !choice ||
      !credentialMatches(choice, credential) ||
      choice.decision !== 'accepted' ||
      choice.choiceVersion !== current.choiceVersion ||
      choice.noticeVersion !== current.noticeVersion ||
      value.choiceVersion !== current.choiceVersion ||
      choice.revision !== value.revision ||
      choice.expiresAtEpoch <= now
    )
      throw new PrivacyChoiceError(403, 'Invalid analytics authorization');
    const session = crypto
      .createHash('sha256')
      .update('privacy-visit-v1\0')
      .update(credential.key)
      .update(':' + choice.revision + ':' + value.visitNonce)
      .digest('hex');
    await query(
      connection,
      'INSERT INTO page_views (session_id,path,created_at) VALUES (?,?,FROM_UNIXTIME(?))',
      [session, route, now],
    );
    await query(
      connection,
      `INSERT INTO visitor_sessions (session_id,entry_page,exit_page,first_seen,last_seen) VALUES (?,?,?,FROM_UNIXTIME(?),FROM_UNIXTIME(?))
      ON DUPLICATE KEY UPDATE exit_page=VALUES(exit_page),last_seen=VALUES(last_seen),page_views=page_views+1,is_bounce=FALSE`,
      [session, route, route, now, now],
    );
  });
}
