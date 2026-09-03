import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { MUTATION_GATES, type MutationGate } from '../middleware/mutationGate.js';

/** Fingerprint of the MUD baseline table list, as published in the MUD manifest. */
export function tableFingerprint(tables: readonly string[]): string {
  return crypto
    .createHash('sha256')
    .update(`${[...tables].sort().join('\n')}\n`)
    .digest('hex');
}

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

/** Subset of the MUD repository's migrations/migration_manifest.json used here. */
export interface MudMigrationManifest {
  baseline: {
    id: string;
    required_table_fingerprint: string;
    required_tables: string[];
  };
}

/**
 * Locate the MUD migration manifest that validates the copied baseline.
 * Defaults to a checkout of the public LuminariMUD/DurisMUD repository next to
 * the backend package (CI layout) or next to the repository root (sibling
 * checkouts), overridable with `MUD_MANIFEST_PATH`.
 */
export function defaultMudManifestPath(root = backendRoot()): string {
  const candidates = [
    process.env.MUD_MANIFEST_PATH,
    path.join(root, '..', 'duris', 'migrations', 'migration_manifest.json'),
    path.join(root, '..', '..', 'duris', 'migrations', 'migration_manifest.json'),
  ].filter((candidate): candidate is string => Boolean(candidate));
  return candidates.find((candidate) => fs.existsSync(candidate)) ?? candidates[0];
}

/**
 * Compare the checked-in `mudOwnedTables` copy against the MUD repository's
 * own manifest so a table added by a later MUD baseline cannot pass the gate
 * with an out-of-date copy. Returns the problems found, if any.
 */
export function validateMudManifestBaseline(
  allowlist: MudWriteAllowlist,
  mudManifestPath: string,
): string[] {
  if (!fs.existsSync(mudManifestPath)) {
    return [
      `MUD manifest not found at ${mudManifestPath}: check out LuminariMUD/DurisMUD ` +
        'as a sibling directory or point MUD_MANIFEST_PATH at its migrations/migration_manifest.json',
    ];
  }

  let manifest: MudMigrationManifest;
  try {
    manifest = JSON.parse(fs.readFileSync(mudManifestPath, 'utf8')) as MudMigrationManifest;
  } catch {
    return [`MUD manifest at ${mudManifestPath} is not valid JSON`];
  }

  const issues: string[] = [];
  if (manifest.baseline.id !== allowlist.baseline.id) {
    issues.push(
      `baseline id mismatch: ${ALLOWLIST_FILE} pins "${allowlist.baseline.id}" ` +
        `but the MUD manifest declares "${manifest.baseline.id}"`,
    );
  }
  if (
    manifest.baseline.required_table_fingerprint !== allowlist.baseline.requiredTableFingerprint
  ) {
    issues.push(
      `baseline fingerprint mismatch: ${ALLOWLIST_FILE} pins ` +
        `${allowlist.baseline.requiredTableFingerprint} but the MUD manifest declares ` +
        `${manifest.baseline.required_table_fingerprint}; refresh mudOwnedTables from the MUD baseline`,
    );
  }
  const manifestTablesFingerprint = tableFingerprint(manifest.baseline.required_tables);
  if (manifestTablesFingerprint !== allowlist.baseline.requiredTableFingerprint) {
    issues.push(
      `mudOwnedTables no longer matches the MUD manifest table list ` +
        `(manifest tables fingerprint ${manifestTablesFingerprint})`,
    );
  }
  return issues;
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
 * UPDATE` column names are not reported as table writes. The multi-table
 * `DELETE t FROM a JOIN b` and `UPDATE a JOIN b` forms are covered too:
 * `DELETE` targets are resolved through the FROM-clause alias pairs, and
 * every identifier in an `UPDATE` clause is checked because MySQL may assign
 * to any listed table.
 */
const WRITE_PATTERNS: {
  pattern: RegExp;
  targets: (match: RegExpExecArray) => { operation: string; table: string }[];
}[] = [
  {
    pattern: /\b(INSERT|REPLACE)\s+INTO\s+`?(\w+)`?\s*(?=\(|SET\b|SELECT\b|VALUES\b)/gi,
    targets: (match) => [{ operation: `${match[1].toUpperCase()} INTO`, table: match[2] }],
  },
  {
    // Single- and multi-table `DELETE FROM t[, u] ...`: every listed table is
    // deleted in this MySQL form, so the comma list is classified in full.
    pattern:
      /\bDELETE\s+FROM\s+((?:`?\w+`?)(?:\s*,\s*`?\w+`?)*)\s*(?=WHERE\b|USING\b|ORDER\b|LIMIT\b|[;`'"]|$)/gim,
    targets: (match) =>
      splitTableList(match[1]).map((table) => ({ operation: 'DELETE FROM', table })),
  },
  {
    // Multi-table `DELETE t[.*][, u] FROM a JOIN b ...`: the delete targets may
    // be aliases, so each is resolved against the source table/alias pairs
    // declared in the FROM clause (see resolveMultiTableDeleteTargets).
    pattern:
      /\bDELETE\s+((?:`?\w+`?(?:\.\*)?)(?:\s*,\s*`?\w+`?(?:\.\*)?)*)\s+FROM\b([\w`.,=\s()]{0,300}?)(?=\bWHERE\b|\bUSING\b|\bORDER\b|\bLIMIT\b|[;`'"]|$)/gim,
    targets: (match) =>
      resolveMultiTableDeleteTargets(match[1], match[2]).map((table) => ({
        operation: 'DELETE FROM',
        table,
      })),
  },
  {
    pattern: /\bTRUNCATE\s+(?:TABLE\s+)?`?(\w+)`?\s*(?=[;`'"]|$)/gim,
    targets: (match) => [{ operation: 'TRUNCATE', table: match[1] }],
  },
  {
    pattern: /(?<!KEY\s)\bUPDATE\s+`?(\w+)`?(?=[^;'"`]{0,200}?\bSET\b)/gi,
    targets: (match) => [{ operation: 'UPDATE', table: match[1] }],
  },
  {
    // Multi-table `UPDATE a JOIN b ... SET` and `UPDATE a, b SET`: MySQL may
    // assign to any listed table, so every identifier between UPDATE and SET
    // is checked. The clause may only contain table/alias/join/ON tokens, so
    // prose and code cannot be mistaken for a statement.
    pattern: /(?<!KEY\s)\bUPDATE\s+([\w`.,=\s()]{0,300}?)\bSET\b/gi,
    targets: (match) =>
      statementIdentifiers(match[1]).map((table) => ({ operation: 'UPDATE', table })),
  },
];

/**
 * Dynamic write targets cannot be classified by a static scan, so any
 * template-literal interpolation or string concatenation in a table position
 * fails verification. Concatenation is flagged when a statement keyword is
 * immediately followed by the closing quote of its literal and then a plus
 * (or a concat call) — the forms that append a runtime-built table name.
 * Splitting the statement across string fragments also hides the table from
 * the static scan, so both static and dynamic fragments are rejected.
 */
const FORBIDDEN_PATTERNS: { pattern: RegExp; description: string }[] = [
  {
    pattern: /\b(?:INSERT|REPLACE)\s+INTO\s+`?\$\{/gi,
    description: 'interpolated INSERT/REPLACE target',
  },
  {
    pattern: /\b(?:INSERT|REPLACE)\s+INTO\s*['"`]\s*(?:\+|\.concat\s*\()/gi,
    description: 'concatenated INSERT/REPLACE target',
  },
  {
    pattern: /\bDELETE\s+FROM\s+`?\$\{/gi,
    description: 'interpolated DELETE target',
  },
  {
    pattern: /\bDELETE\s+FROM\s*['"`]\s*(?:\+|\.concat\s*\()/gi,
    description: 'concatenated DELETE target',
  },
  {
    pattern: /(?<!KEY\s)\bUPDATE\s+`?\$\{(?=[^;'"]{0,200}?\bSET\b)/gi,
    description: 'interpolated UPDATE target',
  },
  {
    pattern: /(?<!KEY\s)\bUPDATE\s*['"`]\s*(?:\+|\.concat\s*\()(?=[^;]{0,200}?\bSET\b)/gi,
    description: 'concatenated UPDATE target',
  },
  {
    pattern: /\bTRUNCATE\s+(?:TABLE\s+)?`?\$\{/gi,
    description: 'interpolated TRUNCATE target',
  },
  {
    pattern: /\bTRUNCATE\s+(?:TABLE\s+)?['"`]\s*(?:\+|\.concat\s*\()/gi,
    description: 'concatenated TRUNCATE target',
  },
];

/** Resolve the backend package root from source or compiled scripts. */
export function backendRoot(): string {
  const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
  return path.resolve(scriptDirectory, '../..');
}

/** Split a comma-separated table list like `` `a`, b.* `` into bare table names. */
export function splitTableList(fragment: string): string[] {
  return fragment
    .split(',')
    .map((entry) => entry.trim().replaceAll('`', '').replace(/\.\*$/, ''))
    .filter((table) => /^\w+$/.test(table));
}

/** Collect the distinct identifiers in a statement fragment. */
export function statementIdentifiers(fragment: string): string[] {
  return [...new Set([...fragment.matchAll(/\w+/g)].map((match) => match[0]))];
}

/**
 * Resolve the delete targets of a multi-table `DELETE t[.*][, u] FROM sources`
 * statement. Targets may be aliases, so each is mapped through the
 * `table [AS] alias` pairs declared in the FROM clause; a target that cannot
 * be resolved is reported verbatim rather than passing the gate unclassified.
 */
export function resolveMultiTableDeleteTargets(targetList: string, fromClause: string): string[] {
  const aliasToTable = new Map<string, string>();
  for (const match of fromClause.matchAll(
    /(?:^|\b(?:FROM|JOIN)\b)\s*`?(\w+)`?(?:\s+(?:AS\s+)?`?(\w+)`?)?/gi,
  )) {
    aliasToTable.set(match[2] ?? match[1], match[1]);
  }
  return splitTableList(targetList).map((target) => aliasToTable.get(target) ?? target);
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
  pathPrefix = '',
): MudWrite[] {
  const owned = new Set(mudOwnedTables);
  const found = new Map<string, MudWrite>();

  for (const file of sourceFiles(sourceRoot)) {
    const source = fs.readFileSync(file, 'utf8');
    const relative = path.relative(sourceRoot, file).split(path.sep).join('/');
    const relativePath = pathPrefix ? `${pathPrefix}/${relative}` : relative;
    for (const { pattern, targets } of WRITE_PATTERNS) {
      pattern.lastIndex = 0;
      let match = pattern.exec(source);
      while (match !== null) {
        for (const { operation, table } of targets(match)) {
          if (owned.has(table)) {
            const write = { file: relativePath, operation, table };
            found.set(writeKey(write), write);
          }
        }
        match = pattern.exec(source);
      }
    }
  }

  return [...found.values()].sort((left, right) => writeKey(left).localeCompare(writeKey(right)));
}

/**
 * Report every SQL write statement in the scanned sources whose table target
 * is assembled at runtime. A dynamically named table can never be classified
 * by the static scan, so it must fail verification instead of silently
 * passing the gate.
 */
export function findForbiddenWriteForms(sourceRoot: string, pathPrefix = ''): string[] {
  const found: string[] = [];
  for (const file of sourceFiles(sourceRoot)) {
    const source = fs.readFileSync(file, 'utf8');
    const relative = path.relative(sourceRoot, file).split(path.sep).join('/');
    const relativePath = pathPrefix ? `${pathPrefix}/${relative}` : relative;
    for (const { pattern, description } of FORBIDDEN_PATTERNS) {
      pattern.lastIndex = 0;
      if (pattern.test(source)) {
        found.push(`${relativePath}: ${description}`);
      }
    }
  }
  return found.sort();
}

/**
 * Fail when DurisWeb writes a MUD-owned table without a reviewed allowlist
 * entry, when the manifest still lists a write that no longer exists, when the
 * copied MUD baseline no longer matches the MUD repository's manifest, or when
 * a dynamic write target would bypass classification.
 * Returns the checked write keys so callers can report coverage.
 */
export function verifyMudWriteAllowlist(
  root = backendRoot(),
  mudManifestPath = defaultMudManifestPath(root),
): string[] {
  const allowlist = loadMudWriteAllowlist(root);
  const issues: string[] = [];

  const fingerprint = tableFingerprint(allowlist.mudOwnedTables);
  if (fingerprint !== allowlist.baseline.requiredTableFingerprint) {
    issues.push(
      `mudOwnedTables does not match baseline ${allowlist.baseline.id}: ` +
        `expected ${allowlist.baseline.requiredTableFingerprint}, computed ${fingerprint}`,
    );
  }

  issues.push(...validateMudManifestBaseline(allowlist, mudManifestPath));

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

  const rootsToScan: { dir: string; prefix: string }[] = [
    { dir: path.join(root, 'src'), prefix: '' },
  ];
  const scriptsDir = path.join(root, 'scripts');
  if (fs.existsSync(scriptsDir)) {
    rootsToScan.push({ dir: scriptsDir, prefix: 'scripts' });
  }

  for (const { dir, prefix } of rootsToScan) {
    for (const finding of findForbiddenWriteForms(dir, prefix)) {
      issues.push(`dynamic write target in ${finding}`);
    }
  }

  const scannedMap = new Map<string, MudWrite>();
  for (const { dir, prefix } of rootsToScan) {
    for (const write of scanMudOwnedWrites(dir, allowlist.mudOwnedTables, prefix)) {
      scannedMap.set(writeKey(write), write);
    }
  }
  const scanned = [...scannedMap.values()].sort((a, b) => writeKey(a).localeCompare(writeKey(b)));
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
