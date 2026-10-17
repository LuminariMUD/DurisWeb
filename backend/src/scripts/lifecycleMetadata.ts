import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import mysql, { type Connection } from 'mysql2/promise';
import { getBackendConfiguration } from '../config/environment.js';
import { installLifecycleMetadata, readLifecycleMetadata } from '../db/lifecycleMetadata.js';

export function parseLifecycleMetadataArguments(args: string[]): {
  install: boolean;
  target: string;
  runtimeUser?: string;
  runtimeHost?: string;
} {
  const install = args[0] === 'install';
  const flags = install ? args.slice(1) : args;
  const values = new Map<string, string>();
  for (let index = 0; index < flags.length; index += 2) {
    const name = flags[index],
      value = flags[index + 1];
    if (
      !['--target', '--runtime-user', '--runtime-host'].includes(name) ||
      !value ||
      /[\r\n\0]/.test(value) ||
      values.has(name)
    )
      throw new Error('invalid_arguments');
    values.set(name, value);
  }
  const target = values.get('--target');
  const runtimeUser = values.get('--runtime-user'),
    runtimeHost = values.get('--runtime-host');
  if (!target || (install ? !runtimeUser || !runtimeHost : !!runtimeUser || !!runtimeHost))
    throw new Error('invalid_arguments');
  return { install, target, runtimeUser, runtimeHost };
}

export async function runLifecycleMetadataCommand(args: string[]): Promise<number> {
  if (args.length === 1 && args[0] === '--help') {
    console.log(`Read-only lifecycle metadata check:
pnpm --dir backend schema:lifecycle --target <configured-host:port/database>
Explicit DBA installation using the configured DBA credentials:
pnpm --dir backend schema:lifecycle install --target <configured-host:port/database> --runtime-user <website-sql-user> --runtime-host <website-sql-account-host>
Creates only the absent reserved read-only function and grants only its EXECUTE capability.
An existing function must match exactly. No credentials belong in command arguments.`);
    return 0;
  }
  let connection: Connection | undefined;
  try {
    const options = parseLifecycleMetadataArguments(args);
    const configuration = getBackendConfiguration().database;
    if (options.target !== `${configuration.host}:${configuration.port}/${configuration.database}`)
      throw new Error('configured_target_mismatch');
    connection = await mysql.createConnection({ ...configuration, connectTimeout: 5000 });
    if (options.install && options.runtimeUser && options.runtimeHost)
      await installLifecycleMetadata(connection, options.runtimeUser, options.runtimeHost);
    else await readLifecycleMetadata(connection, 'web_settings');
    await connection.end();
    connection = undefined;
    console.log(
      `Lifecycle metadata ${options.install ? 'installation' : 'check'} passed; no application rows changed.`,
    );
    return 0;
  } catch {
    console.error(
      JSON.stringify({
        ok: false,
        reason: 'lifecycle_metadata_unverified',
        reference: randomUUID(),
      }),
    );
    return 1;
  } finally {
    connection?.destroy();
  }
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url))
  process.exitCode = await runLifecycleMetadataCommand(process.argv.slice(2));
