import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getBackendConfiguration } from '../config/environment.js';
import {
  LegacyCopyPreservationError,
  legacyPreservationSelection,
  preserveLegacyCopy,
  verifyPreservedLegacyCopy,
  type LegacyCopyPreservationOptions,
  type LegacyCopyVerificationOptions,
} from '../services/legacyCopyPreservation.js';

type Arguments =
  | { mode: 'copy'; options: LegacyCopyPreservationOptions }
  | { mode: 'verify'; options: LegacyCopyVerificationOptions };
function positive(value: string | undefined, fallback: number, maximum: number) {
  if (value === undefined) return fallback;
  const number = Number(value);
  if (!/^[1-9][0-9]*$/.test(value) || !Number.isSafeInteger(number) || number > maximum)
    throw new LegacyCopyPreservationError('invalid_arguments');
  return number;
}
export function parseLegacyPreservationArguments(args: string[]): Arguments {
  const mode = args[0];
  if (mode !== 'copy' && mode !== 'verify')
    throw new LegacyCopyPreservationError('invalid_arguments');
  const common = ['--protected-root', '--operation-id', '--time-budget-ms'];
  const allowed =
    mode === 'verify'
      ? common
      : [
          ...common,
          '--backup-root',
          '--legacy-upload-root',
          '--source-name',
          '--source-physical-sha256',
          '--python-bin',
          '--max-bytes',
        ];
  const values = new Map<string, string>();
  for (let index = 1; index < args.length; index += 2) {
    const name = args[index],
      value = args[index + 1];
    if (!allowed.includes(name) || !value || /[\0\r\n]/.test(value) || values.has(name))
      throw new LegacyCopyPreservationError('invalid_arguments');
    values.set(name, value);
  }
  const protectedRoot = values.get('--protected-root'),
    operationId = values.get('--operation-id');
  if (
    !protectedRoot ||
    !path.isAbsolute(protectedRoot) ||
    !operationId ||
    !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(operationId)
  )
    throw new LegacyCopyPreservationError('invalid_arguments');
  const base = {
    protectedRoot,
    operationId,
    timeBudgetMs: positive(values.get('--time-budget-ms'), 30000, 300000),
  };
  if (mode === 'verify') return { mode, options: base };
  const backupRoot = values.get('--backup-root'),
    uploadRoot = values.get('--legacy-upload-root'),
    sourceName = values.get('--source-name'),
    sourcePhysicalSha256 = values.get('--source-physical-sha256'),
    pythonBin = values.get('--python-bin'),
    maximum = values.get('--max-bytes');
  if (
    !backupRoot ||
    !path.isAbsolute(backupRoot) ||
    (uploadRoot !== undefined && !path.isAbsolute(uploadRoot)) ||
    !sourceName ||
    !sourcePhysicalSha256 ||
    !/^[a-f0-9]{64}$/.test(sourcePhysicalSha256) ||
    !pythonBin ||
    !path.isAbsolute(pythonBin) ||
    !maximum
  )
    throw new LegacyCopyPreservationError('invalid_arguments');
  const selected = legacyPreservationSelection(sourceName);
  if (!selected || (selected.scope === 'legacy_upload' && !uploadRoot))
    throw new LegacyCopyPreservationError('invalid_arguments');
  return {
    mode,
    options: {
      ...base,
      backupRoot,
      uploadRoot,
      sourceName,
      sourcePhysicalSha256,
      pythonBin,
      maxBytes: positive(maximum, 0, 2 ** 40),
    },
  };
}
export async function runLegacyPreservationCommand(args: string[]): Promise<number> {
  if (args.length === 1 && args[0] === '--help') {
    console.log(
      'Private per-file preservation; no source removal, service control or adoption. Linux and an explicit Python 3 interpreter are required for copying.\ncopy --backup-root <canonical-configured-root> [--legacy-upload-root <actual-old-root>] --source-name <legacy-relative-name> --source-physical-sha256 <inventory-file-hash> --protected-root <owner-only-persistent-local-directory> --operation-id <UUID-v4> --python-bin <absolute-python3> --max-bytes <1..1099511627776> [--time-budget-ms <1..300000>]\nverify --protected-root <same-directory> --operation-id <same-UUID> [--time-budget-ms <1..300000>]. Verification needs no original file, interpreter, application environment or SQL. Same-ID copy retries never overwrite an existing bundle. Unknown work remains review-required.',
    );
    return 0;
  }
  try {
    const parsed = parseLegacyPreservationArguments(args);
    if (parsed.mode === 'verify') {
      console.log(JSON.stringify(verifyPreservedLegacyCopy(parsed.options)));
      return 0;
    }
    if (
      fs.realpathSync.native(parsed.options.backupRoot) !==
      fs.realpathSync.native(getBackendConfiguration().backupDirectory)
    )
      throw new LegacyCopyPreservationError('root_unverified', parsed.options.operationId);
    console.log(JSON.stringify(await preserveLegacyCopy(parsed.options)));
    return 0;
  } catch (error) {
    const failure =
      error instanceof LegacyCopyPreservationError
        ? error
        : new LegacyCopyPreservationError('copy_unconfirmed');
    console.error(
      JSON.stringify({
        success: false,
        error: failure.message,
        reason: failure.reason,
        reference: failure.reference,
        sourceRemoved: false,
        adoptionAdmission: 'unavailable',
        deletionAdmission: 'unavailable',
      }),
    );
    return 1;
  }
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url))
  process.exitCode = await runLegacyPreservationCommand(process.argv.slice(2));
