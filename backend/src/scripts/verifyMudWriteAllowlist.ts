import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { MUTATION_GATES, type MutationGate } from '../middleware/mutationGate.js';

const ALLOWLIST_FILE = 'mud-write-allowlist.json';
const SKIPPED_DIRECTORIES = new Set(['__tests__', 'test']);
const WRITE_STATUSES = ['gated', 'allowed'] as const;

type WriteStatus = (typeof WRITE_STATUSES)[number];

export interface MudWriteEntry {
  /** The component that owns the transaction, ledger, and revision contract. */
  authoritativeWriter: string;
  /** How this direct write stays correct against concurrent MUD activity. */
  concurrency: string;
  /** `gated` writes are unreachable unless an operator opens `gate`. */
  status: WriteStatus;
  gate?: MutationGate;
  /** Backlog identifier in docs/ongoing-projects/ongoing.md. */
  ticket: string;
  note?: string;
}

export interface MudWriteAllowlist {
  baseline: { id: string; requiredTableFingerprint: string };
  mudOwnedTables: string[];
  writes: Record<string, MudWriteEntry>;
}

/**
 * A DurisWeb statement that writes a MUD-owned table, keyed as
 * `<path>|<operation>|<table>` so the manifest stays diff-readable.
 */
export interface MudWrite {
  file: string;
  operation: string;
  table: string;
}

/**
 * SQL write forms this repository actually uses. Each pattern requires the
 * structure that follows a real statement so prose and `ON DUPLICATE KEY
 * UPDATE` column names are not reported as table writes. Multi-table
 * `DELETE t FROM ...` and `UPDATE a JOIN b` forms are deliberately not matched;
 * no current call site uses them against a MUD-owned table.
 */
const WRITE_PATTERNS: { pattern: RegExp; operation: (match: RegExpExecArray) => string }[] = [
  {
    pattern: /\b(INSERT|REPLACE)\s+INTO\s+`?(\w+)`?\s*(?=\(|SET\b|SELECT\b|VALUES\b)/gi,
    operation: (match) => `${match[1].toUpperCase()} INTO`,
  },
  {
    pattern: /\bDELETE\s+FROM\s+`?(\w+)`?\s*(?=WHERE\b|USING\b|ORDER\b|LIMIT\b|[;`'"]|$)/gim,
    operation: () => 'DELETE FROM',
  },
  {
    pattern: /\bTRUNCATE\s+(?:TABLE\s+)?`?(\w+)`?\s*(?=[;`'"]|$)/gim,
    operation: () => 'TRUNCATE',
  },
  {
    pattern: /(?<!KEY\s)\bUPDATE\s+`?(\w+)`?(?=[^;'"`]{0,200}?\bSET\b)/gi,
    operation: () => 'UPDATE',
  },
];

/** Resolve the backend package root from source or compiled scripts. */
export function backendRoot(): string {
  const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
  return path.resolve(scriptDirectory, '../..');
}

/** Read the checked-in allowlist manifest. */
export function loadMudWriteAllowlist(root = backendRoot()): MudWriteAllowlist {
  const manifestPath = path.join(root, ALLOWLIST_FILE);
  try {
    return JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as MudWriteAllowlist;
  } catch {
    throw new Error(`${ALLOWLIST_FILE} is missing or unreadable at ${manifestPath}`);
  }
}

/** Collect every non-test TypeScript source file under `directory`. */
function sourceFiles(directory: string): string[] {
  const found: string[] = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      if (!SKIPPED_DIRECTORIES.has(entry.name)) found.push(...sourceFiles(entryPath));
    } else if (entry.name.endsWith('.ts')) {
      found.push(entryPath);
    }
  }
  return found;
}

/** Format one scanned write as its stable manifest key. */
export function writeKey(write: MudWrite): string {
  return `${write.file}|${write.operation}|${write.table}`;
}

/**
 * Report every write statement in non-test backend sources whose target is a
 * MUD-owned table. See docs/ongoing-projects/ongoing.md, DB-10.
 */
export function scanMudOwnedWrites(
  sourceRoot: string,
  mudOwnedTables: Iterable<string>,
): MudWrite[] {
  const owned = new Set(mudOwnedTables);
  const found = new Map<string, MudWrite>();

  for (const file of sourceFiles(sourceRoot)) {
    const source = fs.readFileSync(file, 'utf8');
    const relativePath = path.relative(sourceRoot, file).split(path.sep).join('/');
    for (const { pattern, operation } of WRITE_PATTERNS) {
      pattern.lastIndex = 0;
      let match = pattern.exec(source);
      while (match !== null) {
        const table = match[match.length - 1];
        if (owned.has(table)) {
          const write = { file: relativePath, operation: operation(match), table };
          found.set(writeKey(write), write);
        }
        match = pattern.exec(source);
      }
    }
  }

  return [...found.values()].sort((left, right) => writeKey(left).localeCompare(writeKey(right)));
}

/**
 * Fail when DurisWeb writes a MUD-owned table without a reviewed allowlist
 * entry, or when the manifest still lists a write that no longer exists.
 * Returns the checked write keys so callers can report coverage.
 */
export function verifyMudWriteAllowlist(root = backendRoot()): string[] {
  const allowlist = loadMudWriteAllowlist(root);
  const issues: string[] = [];

  const gates = new Set<string>(MUTATION_GATES);
  for (const [key, entry] of Object.entries(allowlist.writes)) {
    if (!entry.authoritativeWriter || !entry.concurrency || !entry.ticket) {
      issues.push(`${key} must declare authoritativeWriter, concurrency, and ticket`);
    }
    if (!WRITE_STATUSES.includes(entry.status)) {
      issues.push(`${key} has an unknown status: ${String(entry.status)}`);
    }
    if (entry.status === 'gated' && (entry.gate === undefined || !gates.has(entry.gate))) {
      issues.push(`${key} is gated but names no known mutation gate`);
    }
    if (entry.status === 'allowed' && entry.gate !== undefined) {
      issues.push(`${key} is allowed and must not name a mutation gate`);
    }
  }

  const scanned = scanMudOwnedWrites(path.join(root, 'src'), allowlist.mudOwnedTables);
  const scannedKeys = scanned.map(writeKey);
  const classified = new Set(Object.keys(allowlist.writes));

  const unclassified = scannedKeys.filter((key) => !classified.has(key));
  if (unclassified.length > 0) {
    issues.push(`unclassified writes to MUD-owned tables: ${unclassified.join(', ')}`);
  }

  const stale = [...classified].filter((key) => !scannedKeys.includes(key)).sort();
  if (stale.length > 0) {
    issues.push(`${ALLOWLIST_FILE} lists writes that no longer exist: ${stale.join(', ')}`);
  }

  if (issues.length > 0) {
    throw new Error(issues.join('; '));
  }

  return scannedKeys;
}

const isDirectExecution =
  process.argv[1] !== undefined && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isDirectExecution) {
  try {
    const checked = verifyMudWriteAllowlist();
    console.log(`MUD write allowlist verified (${checked.length} classified writes).`);
  } catch (error) {
    console.error(
      `MUD write allowlist error: ${error instanceof Error ? error.message : 'unknown error'}`,
    );
    process.exitCode = 1;
  }
}
