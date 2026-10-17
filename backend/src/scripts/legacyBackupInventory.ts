import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getBackendConfiguration } from '../config/environment.js';
import {
  inventoryLegacyBackupCopies,
  writeLegacyBackupInventory,
  LegacyBackupInventoryError,
} from '../services/legacyBackupInventory.js';

export function parseLegacyInventoryArguments(args: string[]) {
  const flags = new Map<string, string>();
  for (let index = 0; index < args.length; index += 2) {
    const name = args[index],
      value = args[index + 1];
    if (
      !['--backup-root', '--legacy-upload-root', '--private-out'].includes(name) ||
      !value ||
      !path.isAbsolute(value) ||
      /[\r\n\0]/.test(value) ||
      flags.has(name)
    )
      throw new LegacyBackupInventoryError('invalid_arguments');
    flags.set(name, value);
  }
  const backupRoot = flags.get('--backup-root'),
    output = flags.get('--private-out');
  if (!backupRoot || !output) throw new LegacyBackupInventoryError('invalid_arguments');
  return { backupRoot, uploadRoot: flags.get('--legacy-upload-root'), output };
}
/** Only a private file receives per-copy metadata. Ordinary output is aggregate and authorizes no action. */
export async function runLegacyBackupInventoryCommand(args: string[]): Promise<number> {
  if (args.length === 1 && args[0] === '--help') {
    console.log(
      'Read-only legacy backup-copy inventory. Required: --backup-root <configured-absolute-root> --private-out <new-file-in-owner-only-persistent-directory>. Optional: --legacy-upload-root <explicit-actual-old-namespace-root>. No default temporary root, SQL connection, content read, writer fence, adoption or removal. Bounds: 10,000 entries and 1,000 copies per root; 5-second cooperative scan budget. Exit 2 means incomplete or unsafe observations; a successful scan never authorizes cleanup.',
    );
    return 0;
  }
  try {
    const options = parseLegacyInventoryArguments(args);
    const configured = getBackendConfiguration().backupDirectory;
    const canonical = fs.realpathSync.native(configured);
    if (
      path.resolve(configured) !== canonical ||
      fs.realpathSync.native(options.backupRoot) !== canonical
    )
      throw new LegacyBackupInventoryError('invalid_arguments');
    const inventory = await inventoryLegacyBackupCopies(options.backupRoot, options.uploadRoot);
    writeLegacyBackupInventory(options.output, inventory, [
      options.backupRoot,
      ...(options.uploadRoot ? [options.uploadRoot] : []),
    ]);
    const roots = inventory.roots.map((root) => ({
      scope: root.scope,
      scanComplete: root.scanComplete,
      stoppedBecause: root.stoppedBecause,
      entriesSeen: root.entriesSeen,
      otherEntries: root.otherEntries,
      unknownLegacyEntries: root.unknownLegacyEntries,
      copies: root.copies.length,
      writerUnverified: root.copies.filter((copy) => copy.outcome === 'writer_unverified').length,
      unconfirmed: root.copies.filter((copy) => copy.outcome !== 'writer_unverified').length,
    }));
    console.log(
      JSON.stringify(
        {
          observationId: inventory.observationId,
          coverage: inventory.coverage,
          snapshotConsistent: false,
          legacyUploadScope: inventory.legacyUploadScope,
          writerFenceVerified: false,
          deletionAdmission: 'unavailable',
          privateOutputSaved: true,
          roots,
        },
        null,
        2,
      ),
    );
    return roots.some(
      (root) => !root.scanComplete || root.unknownLegacyEntries > 0 || root.unconfirmed > 0,
    )
      ? 2
      : 0;
  } catch (error) {
    const failure =
      error instanceof LegacyBackupInventoryError
        ? error
        : new LegacyBackupInventoryError('inventory_unconfirmed');
    console.error(
      JSON.stringify({
        ok: false,
        reason: failure.reason,
        reference: failure.reference,
        deletionAdmission: 'unavailable',
      }),
    );
    return 1;
  }
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url))
  process.exitCode = await runLegacyBackupInventoryCommand(process.argv.slice(2));
