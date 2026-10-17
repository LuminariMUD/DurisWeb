import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseRetentionPreviewArguments, runRetentionPreviewCommand } from './retentionPreview.js';
import {
  executeRetention,
  RetentionExecutionError,
  type RetentionExecutionOptions,
} from '../services/retentionExecution.js';

export function parseRetentionExecutionArguments(args: string[]): RetentionExecutionOptions {
  const common: string[] = [];
  let runId: string | undefined;
  let cacheTarget: string | undefined;
  for (let index = 0; index < args.length; index += 2) {
    const name = args[index],
      value = args[index + 1];
    if (!value || name === '--resume' || name === '--checkpoint-out')
      throw new RetentionExecutionError('invalid_arguments');
    if (name === '--run-id') {
      if (runId) throw new RetentionExecutionError('invalid_arguments');
      runId = value;
    } else if (name === '--cache-target') {
      if (cacheTarget) throw new RetentionExecutionError('invalid_arguments');
      cacheTarget = value;
    } else common.push(name, value);
  }
  if (!runId || !cacheTarget) throw new RetentionExecutionError('invalid_arguments');
  const { options } = parseRetentionPreviewArguments(common);
  return { ...options, runId, cacheTarget };
}
/** Default remains the existing read-only preview; policy approval is compiled source, never a flag. */
export async function runRetentionCommand(args: string[]): Promise<number> {
  if (args.length === 1 && args[0] === '--help') {
    console.log(
      'Retention defaults to read-only preview. Use retention:preview --help for target/version and bounded preview flags.\nExecution: retention execute --target <host:port/database> --cache-target <host:port/db-number> --policy-version <reviewed-version> --run-id <UUID-v4>, with the same class/batch/time bounds.\nExecution is unavailable until the source policy and selected classes are explicitly approved and enabled. File checkpoints cannot authorize execution.',
    );
    return 0;
  }
  if (args[0] !== 'execute') return runRetentionPreviewCommand(args);
  try {
    const options = parseRetentionExecutionArguments(args.slice(1));
    const result = await executeRetention(options);
    console.log(JSON.stringify(result, null, 2));
    return result.lastFailure ? 2 : 0;
  } catch (error) {
    const failure =
      error instanceof RetentionExecutionError
        ? error
        : new RetentionExecutionError('invalid_arguments');
    console.error(
      JSON.stringify({
        mode: 'execute',
        ok: false,
        reason: failure.reason,
        reference: failure.reference,
      }),
    );
    return 1;
  }
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url))
  process.exitCode = await runRetentionCommand(process.argv.slice(2));
