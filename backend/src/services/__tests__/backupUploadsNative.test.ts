import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from '@jest/globals';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import express from 'express';
import multer from 'multer';
import { request as httpRequest } from 'node:http';
import { once } from 'node:events';
import request from 'supertest';
import { ZipArchive } from 'archiver';
import mysql, { type Connection, type RowDataPacket } from 'mysql2/promise';
import {
  BACKUP_UPLOAD_PREFIX,
  ARCHIVE_REMOVAL_PREFIX,
  RETENTION_CONTROL_KEY,
} from '../../db/internalWebSettings.js';
import * as uploads from '../backupUploads.js';
import { backupUploadStorage, requestBackupUploadReference } from '../backupUploadStorage.js';
import {
  receiveBackupUpload,
  cancelRegisteredBackupUpload,
  recoverRegisteredBackupUpload,
} from '../backupUploadHandlers.js';
import { createDataHold, releaseDataHold } from '../dataHoldService.js';

const port = Number(process.env.TEST_ARCHIVE_REMOVAL_DB_PORT),
  database = process.env.DB_NAME ?? '',
  rootPath = process.env.BACKUP_DIR ?? '';
if (
  process.env.TEST_ARCHIVE_REMOVAL_DB_PORT &&
  (![23436, 23437].includes(port) ||
    database !== 'durisweb_qualification_archive_removal_suite' ||
    !rootPath.startsWith('/tmp/durisweb-archive-qualification-'))
)
  throw new Error('Upload qualification needs the explicitly owned full archive fixture');
let root: Connection,
  app: express.Express,
  actor = 'UploaderAlpha';
const realConnect = mysql.createConnection.bind(mysql);
const SQL =
  "CREATE TABLE `player_data` (`pid` int);\nCREATE TABLE `account_characters` (\n`account_name` varchar(50),\n`char_name` varchar(50),\n`pid` int\n);\nINSERT INTO `account_characters` VALUES ('Alpha','One',1);\n";
async function zip(text: string, name = 'database/database.sql') {
  const archive = new ZipArchive();
  const chunks: Buffer[] = [];
  archive.on('data', (chunk: unknown) => {
    if (Buffer.isBuffer(chunk)) chunks.push(chunk);
  });
  archive.append(text, { name });
  await archive.finalize();
  return Buffer.concat(chunks);
}
async function count(table: 'mud_backups' | 'web_data_holds') {
  return Number(
    (await root.query<RowDataPacket[]>('SELECT COUNT(*) AS count FROM ' + table))[0][0].count,
  );
}
async function protection(scope: unknown = { kind: 'global' }) {
  const [clock] = await root.query<RowDataPacket[]>('SELECT UNIX_TIMESTAMP() AS epoch');
  return createDataHold('SyntheticOperator', {
    id: randomUUID(),
    scope,
    reason: 'Synthetic upload preservation',
    reviewAtEpoch: Number(clock[0].epoch) + 1000,
    expiresAtEpoch: null,
  });
}
const post = async (bytes: Buffer) =>
  request(app).post('/upload').attach('backup', bytes, 'fixture.zip');
(port ? describe : describe.skip)('durable multipart uploads on actual SQL/filesystem', () => {
  beforeAll(async () => {
    if (fs.readFileSync(path.join(rootPath, '.archive-qualification-owner'), 'utf8') !== database)
      throw Error('Upload root ownership is unverified');
    root = await mysql.createConnection({ host: '127.0.0.1', port, database, user: 'root' });
    app = express();
    app.use(express.json());
    // Only account/permission identity is a fixture; multipart, storage, SQL, inspector and remover are real.
    app.use((req, _res, next) => {
      Object.defineProperty(req, 'user', {
        value: { accountName: actor, permissions: { role: 'player' } },
      });
      next();
    });
    app.post('/upload', receiveBackupUpload);
    app.delete('/cancel', cancelRegisteredBackupUpload);
    app.post('/recover', recoverRegisteredBackupUpload);
    const limited = multer({ storage: backupUploadStorage, limits: { fileSize: 128 } });
    app.post('/limited-storage', (req, res) => {
      limited.single('backup')(req, res, (error) => {
        res.status(error ? 400 : 200).json({ reference: requestBackupUploadReference(req) });
      });
    });
  });
  beforeEach(async () => {
    actor = 'UploaderAlpha';
    await root.query('DELETE FROM mud_backups');
    await root.query('DELETE FROM web_data_holds');
    await root.query(
      'DELETE FROM web_settings WHERE setting_key LIKE ? OR setting_key LIKE ? OR setting_key=?',
      [BACKUP_UPLOAD_PREFIX + '%', ARCHIVE_REMOVAL_PREFIX + '%', RETENTION_CONTROL_KEY],
    );
    for (const name of fs.readdirSync(rootPath))
      if (/^duris-mud-upload-[a-f0-9-]+\.zip$/.test(name)) fs.unlinkSync(path.join(rootPath, name));
  });
  afterEach(() => {
    jest.restoreAllMocks();
  });
  afterAll(async () => {
    await root?.end();
    await (await import('../../db/connection.js')).pool.end();
    (await import('../../db/redis.js')).default.disconnect();
  });
  it('registers a private persistent upload, inspects outside the server and checks actor ownership', async () => {
    const result = await post(await zip(SQL));
    expect(result.status).toBe(200);
    const id = result.body.tempPath;
    expect(id).toMatch(/^[a-f0-9-]{36}$/);
    expect(JSON.stringify(result.body)).not.toContain(rootPath);
    expect(result.body.contents).toEqual({
      accounts: ['Alpha'],
      characters: [{ pid: 1, name: 'One' }],
    });
    const record = await uploads.readBackupUpload(id, actor);
    expect(record.phase).toBe('closed');
    expect(record.verdict).toBe('valid');
    const file = await uploads.registeredUploadFile(id, actor);
    expect(fs.statSync(file).mode & 0o777).toBe(0o600);
    actor = 'UploaderBeta';
    expect((await request(app).delete('/cancel').send({ tempPath: id })).status).toBe(404);
    expect(fs.existsSync(file)).toBe(true);
    actor = 'UploaderAlpha';
    for (const scope of [
      { kind: 'global' },
      { kind: 'class', classId: 'analytics_events' },
      { kind: 'account', accountName: 'OtherAccount' },
      { kind: 'account_class', accountName: 'OtherAccount', classId: 'login_history' },
    ]) {
      const hold = await protection(scope);
      const refused = await request(app).delete('/cancel').send({ tempPath: id });
      expect(refused.status).toBe(409);
      expect(refused.body.reason).toBe('preserved');
      expect(fs.existsSync(file)).toBe(true);
      await releaseDataHold('SyntheticOperator', hold.id, { reason: 'Synthetic review complete' });
    }
    const removed = await request(app).delete('/cancel').send({ tempPath: id });
    expect(removed.status).toBe(200);
    const replay = await request(app).delete('/cancel').send({ tempPath: id });
    expect(replay.status).toBe(200);
    expect(replay.body.reference).toBe(removed.body.reference);
    expect(fs.existsSync(file)).toBe(false);
    expect(await count('mud_backups')).toBe(0);
  });
  it('cleans an explicitly invalid archive only through the managed remover', async () => {
    const result = await post(await zip('synthetic readme', 'readme.txt'));
    expect(result.status).toBe(400);
    expect(result.body.cleanup).toBe('removed');
    expect(await count('mud_backups')).toBe(0);
    expect(fs.existsSync(path.join(rootPath, uploads.uploadFilename(result.body.reference)))).toBe(
      false,
    );
  });
  it('retains rejected bytes when a hold is already acknowledged', async () => {
    const hold = await protection();
    const result = await post(await zip('synthetic readme', 'readme.txt'));
    expect(result.status).toBe(409);
    expect(result.body.reason).toBe('preserved');
    expect(result.body.cleanup).toBe('retained');
    const record = await uploads.readBackupUpload(result.body.reference, actor);
    expect(record.verdict).toBe('invalid');
    expect(fs.existsSync(uploads.backupUploadPath(record))).toBe(true);
    await releaseDataHold('SyntheticOperator', hold.id, { reason: 'Synthetic review finished' });
    expect((await request(app).delete('/cancel').send({ tempPath: record.id })).status).toBe(200);
  });
  it('keeps malformed/uncertain inspection recoverable without returning parser details', async () => {
    const result = await post(Buffer.from('private-malformed-archive-sentinel'));
    expect(result.status).toBe(409);
    expect(result.body.reason).toBe('inspection_unconfirmed');
    expect(result.body.cleanup).toBe('retained');
    expect(JSON.stringify(result.body)).not.toContain('private-malformed-archive-sentinel');
    const record = await uploads.readBackupUpload(result.body.reference, actor);
    expect(record.phase).toBe('closed');
    expect(record.verdict).toBe('unconfirmed');
    expect((await request(app).delete('/cancel').send({ tempPath: record.id })).status).toBe(200);
  });
  it('refuses old filesystem references before access and never acknowledges unregistered cleanup', async () => {
    const file = path.join(rootPath, 'backup-upload-123-456.zip');
    fs.writeFileSync(file, 'preserve legacy evidence');
    try {
      const result = await request(app).delete('/cancel').send({ tempPath: file });
      expect(result.status).toBe(400);
      expect(result.body.uploadReference).toBeUndefined();
      expect(fs.readFileSync(file, 'utf8')).toBe('preserve legacy evidence');
    } finally {
      fs.unlinkSync(file);
    }
  });
  it('does not infer a live writer stopped from age and recovers an exited writer in a fresh process', async () => {
    const live = await uploads.beginBackupUpload(actor);
    expect(await count('mud_backups')).toBe(1);
    await expect(uploads.recoverBackupUpload(live.id, actor)).rejects.toMatchObject({
      reason: 'receiving',
    });
    const moduleUrl = new URL('../backupUploads.ts', import.meta.url).href;
    const script = `import fs from 'node:fs';const u=await import(${JSON.stringify(moduleUrl)});const row=await u.beginBackupUpload('UploaderAlpha');fs.writeFileSync(u.backupUploadPath(row),'synthetic interrupted upload');process.stdout.write(row.id);`;
    const child = spawnSync(
      process.execPath,
      [
        '--import',
        fileURLToPath(new URL('../../../node_modules/tsx/dist/loader.mjs', import.meta.url)),
        '--input-type=module',
        '--eval',
        script,
      ],
      {
        cwd: process.cwd(),
        env: { ...process.env, DOTENV_CONFIG_QUIET: 'true' },
        encoding: 'utf8',
        timeout: 30000,
      },
    );
    expect(child.status).toBe(0);
    const id = child.stdout.trim();
    expect(id).toMatch(/^[a-f0-9-]{36}$/);
    const recovered = await uploads.recoverBackupUpload(id, actor);
    expect(recovered.phase).toBe('closed');
    expect(recovered.verdict).toBe('unconfirmed');
    const hold = await protection();
    await expect(uploads.cancelBackupUpload(id, actor)).rejects.toMatchObject({
      reason: 'preserved',
    });
    await releaseDataHold('SyntheticOperator', hold.id, {
      reason: 'Synthetic crash review complete',
    });
    await uploads.cancelBackupUpload(id, actor);
  });
  it('hides durable upload and replay metadata from generic settings, including collation aliases', async () => {
    const result = await post(await zip(SQL));
    expect(result.status).toBe(200);
    const settings = await import('../webSettingsService.js');
    expect(await settings.getWebSetting(BACKUP_UPLOAD_PREFIX + result.body.tempPath)).toBeNull();
    expect(await settings.getWebSetting('báckup-upload-v1:' + result.body.tempPath)).toBeNull();
    expect(
      (await settings.getWebSettingsRaw()).some((row) =>
        row.setting_key.startsWith(BACKUP_UPLOAD_PREFIX),
      ),
    ).toBe(false);
  });
  it('retains multipart implicit-error cleanup under a hold', async () => {
    const hold = await protection();
    const bytes = await zip(SQL);
    const result = await request(app)
      .post('/upload')
      .attach('backup', bytes, 'one.zip')
      .attach('backup', bytes, 'two.zip');
    expect(result.status).toBe(409);
    expect(result.body.reason).toBe('preserved');
    const record = await uploads.readBackupUpload(result.body.uploadReference, actor);
    expect(record.verdict).toBe('invalid');
    expect(fs.existsSync(uploads.backupUploadPath(record))).toBe(true);
    await releaseDataHold('SyntheticOperator', hold.id, {
      reason: 'Synthetic multipart review complete',
    });
    await uploads.cancelBackupUpload(record.id, actor);
  });
  it('keeps inspection budget exhaustion for explicit review rather than invalid cleanup', async () => {
    const result = await post(await zip(' '.repeat(64 * 1024 * 1024 + 1)));
    expect(result.status).toBe(409);
    expect(result.body.reason).toBe('inspection_unconfirmed');
    expect(result.body.cleanup).toBe('retained');
    expect(await count('mud_backups')).toBe(1);
    await uploads.cancelBackupUpload(result.body.uploadReference, actor);
  });
  it('does not count registered uploads toward ordinary manual backup pruning', async () => {
    const references: string[] = [];
    const bytes = await zip(SQL);
    for (let index = 0; index < 6; index++) {
      const result = await post(bytes);
      expect(result.status).toBe(200);
      references.push(result.body.tempPath);
    }
    const { default: logger } = await import('../../utils/logger.js');
    let finish!: (value: string) => void;
    const finished = new Promise<string>((resolve) => {
      finish = resolve;
    });
    jest.spyOn(logger, 'info').mockImplementation((message) => {
      if (String(message).includes('completed successfully')) finish('completed');
      return logger;
    });
    jest.spyOn(logger, 'error').mockImplementation((message) => {
      if (/^Backup [0-9]+ failed/.test(String(message))) finish('failed');
      return logger;
    });
    const service = await import('../backupService.js');
    const fresh = await service.createBackup(actor, 'unused');
    expect(await finished).toBe('completed');
    expect((await service.getBackupById(fresh.id))?.status).toBe('completed');
    expect(await count('mud_backups')).toBe(7);
    for (const id of references)
      expect(fs.existsSync(await uploads.registeredUploadFile(id, actor))).toBe(true);
  }, 60000);
  it('fences truncated multipart bytes and never lets Multer unlink them under a hold', async () => {
    const hold = await protection();
    const result = await request(app)
      .post('/limited-storage')
      .attach('backup', Buffer.alloc(1024, 65), 'large.zip');
    expect(result.status).toBe(400);
    const record = await uploads.readBackupUpload(result.body.reference, actor);
    expect(record.phase).toBe('closed');
    expect(record.failure).toBe('too_large');
    expect(record.size).toBe(129);
    const file = uploads.backupUploadPath(record);
    expect(fs.statSync(file).size).toBe(129);
    await expect(uploads.cancelBackupUpload(record.id, actor)).rejects.toMatchObject({
      reason: 'preserved',
    });
    await releaseDataHold('SyntheticOperator', hold.id, {
      reason: 'Synthetic truncated upload reviewed',
    });
    await uploads.cancelBackupUpload(record.id, actor);
  });
  it('closes an aborted real HTTP writer and keeps its partial bytes for review', async () => {
    const server = app.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const address = server.address();
    if (!address || typeof address === 'string')
      throw new Error('Synthetic listener is unavailable');
    const boundary = 'durisweb-synthetic-upload-boundary';
    const client = httpRequest({
      hostname: '127.0.0.1',
      port: address.port,
      path: '/upload',
      method: 'POST',
      headers: {
        'content-type': 'multipart/form-data; boundary=' + boundary,
        'content-length': 1024 * 1024,
      },
    });
    client.on('error', () => {});
    client.write(
      `--${boundary}\r\nContent-Disposition: form-data; name="backup"; filename="partial.zip"\r\nContent-Type: application/zip\r\n\r\n`,
    );
    client.write(Buffer.alloc(4096, 65));
    try {
      let id: string | undefined;
      for (let attempt = 0; attempt < 100; attempt++) {
        const [rows] = await root.query<RowDataPacket[]>(
          'SELECT setting_key FROM web_settings WHERE setting_key LIKE ?',
          [BACKUP_UPLOAD_PREFIX + '%'],
        );
        if (rows.length) {
          const candidate = String(rows[0].setting_key).slice(BACKUP_UPLOAD_PREFIX.length);
          const record = await uploads.readBackupUpload(candidate, actor);
          if (fs.existsSync(uploads.backupUploadPath(record))) {
            id = candidate;
            break;
          }
        }
        await new Promise((resolve) => setTimeout(resolve, 30));
      }
      expect(id).toBeDefined();
      client.destroy();
      let record = await uploads.readBackupUpload(id ?? '', actor);
      for (let attempt = 0; attempt < 100 && record.phase !== 'closed'; attempt++) {
        await new Promise((resolve) => setTimeout(resolve, 30));
        record = await uploads.readBackupUpload(record.id, actor);
      }
      expect(record.phase).toBe('closed');
      expect(record.verdict).toBe('unconfirmed');
      expect(fs.statSync(uploads.backupUploadPath(record)).size).toBeGreaterThan(0);
      await uploads.cancelBackupUpload(record.id, actor);
    } finally {
      client.destroy();
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });
  it('refuses a replaced file after the writer checkpoint and before inspection acknowledgement', async () => {
    const record = await uploads.beginBackupUpload(actor);
    const file = uploads.backupUploadPath(record);
    fs.writeFileSync(file, await zip(SQL));
    await uploads.checkpointBackupUpload(record.id, actor, 'inspection');
    fs.writeFileSync(file, 'changed synthetic evidence');
    await expect(uploads.checkpointBackupUpload(record.id, actor, 'closed')).rejects.toMatchObject({
      reason: 'recovery_unverified',
    });
    await expect(uploads.recoverBackupUpload(record.id, actor)).rejects.toMatchObject({
      reason: 'recovery_unverified',
    });
    expect(fs.readFileSync(file, 'utf8')).toBe('changed synthetic evidence');
  });
  it('refuses a dangling per-backup removal link without unlink or false cleanup', async () => {
    const result = await post(await zip(SQL));
    const record = await uploads.readBackupUpload(result.body.tempPath, actor);
    const key = ARCHIVE_REMOVAL_PREFIX + 'backup:' + record.backupId;
    await root.execute(
      'INSERT INTO web_settings(setting_key,setting_value,description,updated_by) VALUES(?,?,?,NULL)',
      [
        key,
        JSON.stringify({
          format: 1,
          operationId: randomUUID(),
          filename: uploads.uploadFilename(record.id),
        }),
        'archive removal v1',
      ],
    );
    const refused = await request(app).delete('/cancel').send({ tempPath: record.id });
    expect(refused.status).toBe(409);
    expect(refused.body.reason).toBe('recovery_unverified');
    expect(fs.existsSync(uploads.backupUploadPath(record))).toBe(true);
    expect(await count('mud_backups')).toBe(1);
  });
  it('never receives bytes after an unknown registration commit and refuses a fabricated cleanup receipt', async () => {
    let lost = false;
    jest.spyOn(mysql, 'createConnection').mockImplementation(async (config) => {
      const connection = await realConnect(config);
      return new Proxy(connection, {
        get(target, key) {
          const value: unknown = Reflect.get(target, key, target);
          if (key === 'query' && typeof value === 'function')
            return async (...args: unknown[]) => {
              const result: unknown = await value.apply(target, args);
              const sql: unknown =
                typeof args[0] === 'object' && args[0] !== null && 'sql' in args[0]
                  ? args[0].sql
                  : args[0];
              if (sql === 'COMMIT' && !lost) {
                lost = true;
                throw new Error('private-upload-commit-sentinel');
              }
              return result;
            };
          return typeof value === 'function' ? value.bind(target) : value;
        },
      });
    });
    const result = await post(await zip(SQL));
    expect(result.status).toBe(503);
    expect(result.body.reason).toBe('storage_unconfirmed');
    expect(JSON.stringify(result.body)).not.toContain('private-upload-commit-sentinel');
    const record = await uploads.readBackupUpload(result.body.reference, actor);
    expect(record.phase).toBe('writing');
    expect(await count('mud_backups')).toBe(1);
    expect(fs.existsSync(uploads.backupUploadPath(record))).toBe(false);
    await expect(uploads.recoverBackupUpload(record.id, actor)).rejects.toMatchObject({
      reason: 'receiving',
    });
    // A different closed record without a removal receipt cannot acquire a false success by losing its row.
    const valid = await post(await zip(SQL));
    const closed = await uploads.readBackupUpload(valid.body.tempPath, actor);
    fs.unlinkSync(uploads.backupUploadPath(closed));
    await root.execute('DELETE FROM mud_backups WHERE id=?', [closed.backupId]);
    const cancel = await request(app).delete('/cancel').send({ tempPath: closed.id });
    expect(cancel.status).toBe(409);
    expect(cancel.body.reason).toBe('recovery_unverified');
    expect(cancel.body.success).toBeUndefined();
  });
});
