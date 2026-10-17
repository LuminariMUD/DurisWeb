import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  retentionPreviewClasses,
  retentionPreviewPolicy,
  type RetentionPreviewClass,
} from '../config/retentionPolicy.js';
import {
  previewRetention,
  RetentionPreviewError,
  type RetentionPreviewOptions,
} from '../services/retentionPreview.js';
import {
  readRetentionCheckpoint,
  writeRetentionCheckpoint,
} from '../services/retentionPreviewCheckpoint.js';

interface PreviewArguments {
  options: RetentionPreviewOptions;
  resume?: string;
  checkpointOut?: string;
}
function boundedInteger(value: string | undefined, fallback: number, maximum: number): number {
  if (value === undefined) return fallback;
  const number = Number(value);
  if (!/^[1-9][0-9]*$/.test(value) || !Number.isSafeInteger(number) || number > maximum)
    throw new RetentionPreviewError('invalid_arguments');
  return number;
}
export function parseRetentionPreviewArguments(args: string[]): PreviewArguments {
  if (args[0] === 'execute') throw new RetentionPreviewError('execution_unavailable');
  const flags = args[0] === 'dry-run' ? args.slice(1) : args;
  const allowed = [
    '--target',
    '--policy-version',
    '--class',
    '--batch-size',
    '--max-candidates',
    '--time-budget-ms',
    '--resume',
    '--checkpoint-out',
  ];
  const options = new Map<string, string>();
  for (let index = 0; index < flags.length; index += 2) {
    const name = flags[index],
      value = flags[index + 1];
    if (!allowed.includes(name) || !value || /[\r\n\0]/.test(value) || options.has(name))
      throw new RetentionPreviewError('invalid_arguments');
    options.set(name, value);
  }
  const target = options.get('--target'),
    policyVersion = options.get('--policy-version');
  if (!target || !policyVersion) throw new RetentionPreviewError('invalid_arguments');
  if (policyVersion !== retentionPreviewPolicy.version)
    throw new RetentionPreviewError('policy_version_mismatch');
  const names = options.get('--class')?.split(',') ?? [...retentionPreviewClasses];
  const classes: RetentionPreviewClass[] = [];
  for (const name of names) {
    const selected = retentionPreviewClasses.find((item) => item === name);
    if (!selected || classes.includes(selected))
      throw new RetentionPreviewError('invalid_arguments');
    classes.push(selected);
  }
  const resume = options.get('--resume'),
    checkpointOut = options.get('--checkpoint-out');
  if (
    (resume && !path.isAbsolute(resume)) ||
    (checkpointOut && !path.isAbsolute(checkpointOut)) ||
    (resume && checkpointOut && path.resolve(resume) === path.resolve(checkpointOut))
  )
    throw new RetentionPreviewError('invalid_arguments');
  return {
    options: {
      target,
      policyVersion,
      classes,
      batchSize: boundedInteger(options.get('--batch-size'), 100, 500),
      maxCandidates: boundedInteger(options.get('--max-candidates'), 1000, 10000),
      timeBudgetMs: boundedInteger(options.get('--time-budget-ms'), 2000, 10000),
    },
    resume,
    checkpointOut,
  };
}

/** Entry point for manual or externally scheduled read-only previews. No scheduler or delete mode is installed. */
export async function runRetentionPreviewCommand(args: string[]): Promise<number> {
  if (args.length === 1 && args[0] === '--help') {
    console.log(`Read-only proposed retention preview; deletion is unavailable.
Required: --target <configured-host:port/database> --policy-version ${retentionPreviewPolicy.version}
Optional: dry-run, --class analytics_events,login_history, --batch-size 1..500,
--max-candidates 1..10000, --time-budget-ms 1..10000,
--checkpoint-out <new-absolute-private-file>, --resume <previous-private-file>.
Results are unapproved age observations with held/unheld counts. Other exceptions and requests are not evaluated.`);
    return 0;
  }
  try {
    const { options, resume, checkpointOut } = parseRetentionPreviewArguments(args);
    const prior = resume ? await readRetentionCheckpoint(resume) : undefined;
    const { result, checkpoint } = await previewRetention(options, prior);
    if (checkpointOut) await writeRetentionCheckpoint(checkpointOut, checkpoint);
    console.log(JSON.stringify({ ...result, checkpointSaved: !!checkpointOut }, null, 2));
    return 0;
  } catch (error) {
    const failure =
      error instanceof RetentionPreviewError
        ? error
        : new RetentionPreviewError('database_unavailable');
    console.error(
      JSON.stringify({
        mode: 'dry-run',
        ok: false,
        reason: failure.reason,
        reference: failure.reference,
      }),
    );
    return 1;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url))
  process.exitCode = await runRetentionPreviewCommand(process.argv.slice(2));
