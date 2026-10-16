import path from 'node:path';
import { fileURLToPath } from 'node:url';
import mysql from 'mysql2/promise';
import { getBackendConfiguration } from '../config/environment.js';
import { externalSchemaSha256, runWebBaseline, WebBaselineError } from '../db/webBaseline.js';
import type { BaselineAction } from '../db/webBaseline.js';
import { loadWebBaselineBundle } from '../db/webBaselineBundle.js';

interface BaselineArguments {
  action: BaselineAction | 'inspect';
  target: string;
  mudSchemaSha256: string;
}
export function parseBaselineArguments(args: string[]): BaselineArguments {
  const [action, ...flags] = args;
  if (
    action !== 'inspect' &&
    action !== 'bootstrap' &&
    action !== 'adopt' &&
    action !== 'verify' &&
    action !== 'teardown'
  )
    throw new WebBaselineError('invalid_action');
  const options = new Map<string, string>();
  for (let index = 0; index < flags.length; index += 2) {
    const name = flags[index];
    const value = flags[index + 1];
    if ((name !== '--target' && name !== '--mud-schema-sha256') || !value || options.has(name))
      throw new WebBaselineError('invalid_arguments');
    options.set(name, value);
  }
  const target = options.get('--target');
  const mudSchemaSha256 = options.get('--mud-schema-sha256') ?? '';
  if (
    !target ||
    /[\r\n]/.test(target) ||
    (action !== 'inspect' && !/^[a-f0-9]{64}$/.test(mudSchemaSha256))
  )
    throw new WebBaselineError('explicit_target_and_approved_hash_required');
  return { action, target, mudSchemaSha256 };
}

export async function runBaselineCommand(args: string[]): Promise<number> {
  try {
    const options = parseBaselineArguments(args);
    const environment = getBackendConfiguration();
    const configuration = environment.database;
    const target = `${configuration.host}:${configuration.port}/${configuration.database}`;
    if (options.target !== target) throw new WebBaselineError('configured_target_mismatch');
    if (environment.mudDatabase.mode !== 'shared')
      throw new WebBaselineError('shared_baseline_target_required');
    const database = await mysql.createConnection({
      ...configuration,
      connectTimeout: 5000,
      multipleStatements: false,
    });
    try {
      if (options.action === 'inspect') {
        const observed = await externalSchemaSha256(database, loadWebBaselineBundle());
        console.log(
          `Observed external schema SHA-256: ${observed}. This is inspection, not MUD-owner approval.`,
        );
      } else {
        await runWebBaseline(database, options.action, options.mudSchemaSha256);
        console.log(
          `Website baseline ${options.action} verified. Historical migration rows were not fabricated or rewritten.`,
        );
      }
      return 0;
    } finally {
      await database.end();
    }
  } catch (error) {
    console.error(
      error instanceof WebBaselineError
        ? error.message
        : 'Website baseline failed: dependency_or_input_failure. Preserve the journal and inspect the selected target; no raw SQL or provider error is logged.',
    );
    return 1;
  }
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url))
  process.exitCode = await runBaselineCommand(process.argv.slice(2));
