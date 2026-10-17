import { createWriteStream } from 'node:fs';
import { open } from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { randomUUID } from 'node:crypto';
import { PassThrough } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { ZipArchive } from 'archiver';
import type { DatabaseConfiguration } from '../config/environment.js';

export class BackupCreationError extends Error {
  readonly reference: string;
  constructor(
    readonly reason:
      | 'registration_unconfirmed'
      | 'creation_unconfirmed'
      | 'dump_unavailable'
      | 'dump_failed'
      | 'archive_open_failed'
      | 'archive_write_failed'
      | 'archive_stream_failed'
      | 'archive_sync_failed' = 'creation_unconfirmed',
  ) {
    const reference = randomUUID();
    super(
      `Backup creation was not confirmed. Refresh the list and check retained work. Reference: ${reference}`,
    );
    this.name = 'BackupCreationError';
    this.reference = reference;
  }
}

/** The child receives no archive file descriptor; stdout is the only data path. */
async function dump(
  configuration: DatabaseConfiguration,
  args: string[],
  destination: PassThrough,
  signal: AbortSignal,
): Promise<void> {
  const child = spawn('mysqldump', args, {
    stdio: ['ignore', 'pipe', 'ignore'],
    windowsHide: true,
    shell: false,
    env: { ...process.env, MYSQL_PWD: configuration.password },
  });
  let failed = false;
  child.once('error', () => {
    failed = true;
  });
  const exited = new Promise<void>((resolve, reject) => {
    child.once('close', (code) =>
      code === 0 && !failed
        ? resolve()
        : reject(new BackupCreationError(failed ? 'dump_unavailable' : 'dump_failed')),
    );
  });
  const copied = pipeline(child.stdout, destination, { end: false, signal });
  try {
    await Promise.all([copied, exited]);
  } catch (error) {
    child.stdout.destroy();
    // This is the freshly spawned owned child, never a PID recovered from durable state.
    if (child.exitCode === null && child.signalCode === null) child.kill('SIGTERM');
    await Promise.allSettled([copied, exited]);
    throw error instanceof BackupCreationError ? error : new BackupCreationError('dump_failed');
  }
}

/** Stream into one exclusive private ZIP; no SQL or staging file is ever created. */
export async function writeDatabaseBackupArchive(
  configuration: DatabaseConfiguration,
  destination: string,
  views: readonly string[],
  hasWebSessions: boolean,
): Promise<void> {
  const failure = new BackupCreationError('archive_stream_failed');
  const archive = new ZipArchive({ zlib: { level: 6 } });
  const sql = new PassThrough();
  const stop = new AbortController();
  const output = createWriteStream(destination, { flags: 'wx', mode: 0o600, flush: true });
  const opened = once(output, 'open');
  sql.on('error', () => archive.destroy(failure));
  archive.on('warning', () => archive.destroy(failure));
  archive.append(sql, { name: 'database/database.sql' });
  const written = pipeline(archive, output).catch((error: unknown) => {
    throw error instanceof BackupCreationError
      ? error
      : new BackupCreationError('archive_write_failed');
  });
  const database = configuration.database;
  const common = [
    '--no-defaults',
    '--single-transaction',
    '--no-tablespaces',
    '--host',
    configuration.host,
    '--port',
    String(configuration.port),
    '--user',
    configuration.user,
    ...views.map((table) => `--ignore-table=${database}.${table}`),
  ];
  const produced = (async () => {
    await opened.catch(() => {
      throw new BackupCreationError('archive_open_failed');
    });
    await dump(
      configuration,
      [...common, `--ignore-table=${database}.web_sessions`, '--', database],
      sql,
      stop.signal,
    );
    if (hasWebSessions)
      await dump(
        configuration,
        [...common, '--no-data', '--', database, 'web_sessions'],
        sql,
        stop.signal,
      );
    sql.end();
    // Output pipeline completion proves the ZIP footer and file close. Finalize errors feed it.
    void archive.finalize().catch(() => archive.destroy(failure));
  })();
  try {
    await Promise.all([produced, written]);
    const directory = await open(path.dirname(destination), 'r');
    try {
      await directory.sync();
    } finally {
      await directory.close();
    }
  } catch (error) {
    stop.abort();
    sql.destroy();
    archive.abort();
    archive.destroy();
    output.destroy();
    await Promise.allSettled([produced, written]);
    // Preserve any partial ZIP for the registered, hold-aware managed removal path.
    throw error instanceof BackupCreationError
      ? error
      : new BackupCreationError('archive_sync_failed');
  }
}
