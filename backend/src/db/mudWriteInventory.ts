import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { MutationGate } from '../middleware/mutationGate.js';

export interface MudWriteEntry {
  authoritativeWriter: string;
  concurrency: string;
  status: 'gated' | 'allowed';
  gate?: MutationGate;
  ticket: string;
  note?: string;
}

export interface MudWriteAllowlist {
  baseline: { id: string; requiredTableFingerprint: string };
  mudOwnedTables: string[];
  writes: Record<string, MudWriteEntry>;
}

/** Shared by the source verifier and web-only baseline boundary. */
export function loadMudWriteAllowlist(
  root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..'),
): MudWriteAllowlist {
  try {
    return JSON.parse(
      fs.readFileSync(path.join(root, 'mud-write-allowlist.json'), 'utf8'),
    ) as MudWriteAllowlist;
  } catch {
    throw new Error('mud-write-allowlist.json is missing or unreadable');
  }
}
