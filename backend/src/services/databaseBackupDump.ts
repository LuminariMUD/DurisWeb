import { open } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import type { DatabaseConfiguration } from '../config/environment.js';

/** Stream a backup without session rows, shell interpolation, or password arguments. */
export async function writeDatabaseBackupDump(
  configuration: DatabaseConfiguration,
  destination: string,
  views: readonly string[],
  hasWebSessions: boolean,
): Promise<void> {
  const output = await open(destination, 'wx', 0o600);
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
  const dump = (args: string[]): Promise<void> =>
    new Promise((resolve, reject) => {
      const child = spawn('mysqldump', args, {
        stdio: ['ignore', output.fd, 'ignore'],
        windowsHide: true,
        env: { ...process.env, MYSQL_PWD: configuration.password },
      });
      child.once('error', () => reject(new Error('Database backup dump command could not start')));
      child.once('close', (code) =>
        code === 0 ? resolve() : reject(new Error('Database backup dump command failed')),
      );
    });
  try {
    // Always exclude sessions, even if the metadata probe observed no table.
    await dump([...common, `--ignore-table=${database}.web_sessions`, '--', database]);
    // A separate schema-only pass is portable across MySQL/MariaDB clients.
    // Revoked credentials must never be resurrected by a backup restore.
    if (hasWebSessions) await dump([...common, '--no-data', '--', database, 'web_sessions']);
  } finally {
    await output.close();
  }
}
