import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from '@jest/globals';

import {
  findForbiddenWriteForms,
  loadMudWriteAllowlist,
  resolveMultiTableDeleteTargets,
  scanMudOwnedWrites,
  splitTableList,
  tableFingerprint,
  verifyMudWriteAllowlist,
} from '../verifyMudWriteAllowlist.js';

const temporaryRoots: string[] = [];

/** Path of the MUD manifest fixture written alongside each fixture root. */
function mudManifestFor(root: string): string {
  return path.join(root, 'mud-manifest.json');
}

/**
 * Build a disposable backend root with one source file, one allowlist
 * manifest, and a matching MUD migration manifest.
 */
function fixtureRoot(
  source: string,
  writes: Record<string, unknown>,
  baselineTables: readonly string[] = ['player_data', 'accounts'],
): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mud-write-allowlist-'));
  temporaryRoots.push(root);
  fs.mkdirSync(path.join(root, 'src', 'services'), { recursive: true });
  fs.writeFileSync(path.join(root, 'src', 'services', 'sample.ts'), source);
  fs.writeFileSync(
    path.join(root, 'mud-write-allowlist.json'),
    JSON.stringify({
      baseline: { id: 'fixture', requiredTableFingerprint: tableFingerprint(baselineTables) },
      mudOwnedTables: [...baselineTables],
      writes,
    }),
  );
  writeMudManifest(root, 'fixture', baselineTables);
  return root;
}

/** Write the MUD-side migration manifest fixture for a fixture root. */
function writeMudManifest(
  root: string,
  baselineId: string,
  tables: readonly string[],
  fingerprint: string = tableFingerprint(tables),
): void {
  fs.writeFileSync(
    mudManifestFor(root),
    JSON.stringify({
      baseline: {
        id: baselineId,
        required_table_count: tables.length,
        required_table_fingerprint: fingerprint,
        required_tables: [...tables],
      },
    }),
  );
}

const allowedEntry = {
  authoritativeWriter: 'fixture',
  concurrency: 'fixture',
  status: 'allowed',
  ticket: 'DB-10',
};

afterEach(() => {
  while (temporaryRoots.length > 0) {
    fs.rmSync(temporaryRoots.pop()!, { recursive: true, force: true });
  }
});

describe('MUD write allowlist', () => {
  it('classifies every checked-in write to a MUD-owned table', () => {
    const checked = verifyMudWriteAllowlist();
    expect(checked.length).toBeGreaterThan(0);
    expect(new Set(checked).size).toBe(checked.length);
  });

  it('keeps the manifest bound to a published MUD baseline', () => {
    const allowlist = loadMudWriteAllowlist();
    expect(allowlist.baseline.id).toMatch(/\S/);
    expect(allowlist.baseline.requiredTableFingerprint).toMatch(/^[0-9a-f]{64}$/);
    expect(allowlist.mudOwnedTables).toContain('player_data');
  });

  it('reports only real statements against MUD-owned tables', () => {
    const root = fixtureRoot(
      [
        '// Update accounts eventually',
        "await pool.query('UPDATE player_data SET gold = ? WHERE pid = ?', [gold, pid]);",
        "await pool.query('INSERT INTO accounts (name) VALUES (?) ON DUPLICATE KEY UPDATE name = VALUES(name)', [name]);",
        "await pool.query('SELECT * FROM player_data WHERE pid = ?', [pid]);",
      ].join('\n'),
      {},
    );

    expect(scanMudOwnedWrites(path.join(root, 'src'), ['player_data', 'accounts'])).toEqual([
      { file: 'services/sample.ts', operation: 'INSERT INTO', table: 'accounts' },
      { file: 'services/sample.ts', operation: 'UPDATE', table: 'player_data' },
    ]);
  });

  it('classifies multi-table DELETE and UPDATE statements', () => {
    const root = fixtureRoot(
      [
        'await pool.query(`DELETE pd FROM player_data pd JOIN sessions s ON pd.pid = s.pid WHERE s.id = ?`);',
        'await pool.query(`DELETE accounts, player_data FROM accounts JOIN player_data ON accounts.id = player_data.account_id`);',
        'await pool.query(`UPDATE player_data pd JOIN accounts a ON pd.pid = a.id SET pd.gold = 0`);',
        'await pool.query(`UPDATE player_data, accounts SET player_data.gold = 0`);',
      ].join('\n'),
      {
        'services/sample.ts|DELETE FROM|player_data': allowedEntry,
        'services/sample.ts|UPDATE|player_data': allowedEntry,
        'services/sample.ts|UPDATE|accounts': allowedEntry,
      },
    );

    expect(scanMudOwnedWrites(path.join(root, 'src'), ['player_data', 'accounts'])).toEqual([
      { file: 'services/sample.ts', operation: 'DELETE FROM', table: 'accounts' },
      { file: 'services/sample.ts', operation: 'DELETE FROM', table: 'player_data' },
      { file: 'services/sample.ts', operation: 'UPDATE', table: 'accounts' },
      { file: 'services/sample.ts', operation: 'UPDATE', table: 'player_data' },
    ]);
  });

  it('fails on an unclassified cross-boundary write', () => {
    const root = fixtureRoot(
      "await pool.query('DELETE FROM player_data WHERE pid = ?', [pid]);",
      {},
    );
    expect(() => verifyMudWriteAllowlist(root, mudManifestFor(root))).toThrow(
      /unclassified writes/,
    );
  });

  it('fails when the manifest keeps an entry that no longer exists', () => {
    const root = fixtureRoot("await pool.query('SELECT 1');", {
      'services/sample.ts|DELETE FROM|player_data': allowedEntry,
    });
    expect(() => verifyMudWriteAllowlist(root, mudManifestFor(root))).toThrow(/no longer exist/);
  });

  it('requires a gated write to name a known mutation gate', () => {
    const root = fixtureRoot("await pool.query('DELETE FROM player_data WHERE pid = ?', [pid]);", {
      'services/sample.ts|DELETE FROM|player_data': {
        ...allowedEntry,
        status: 'gated',
        gate: 'notAGate',
      },
    });
    expect(() => verifyMudWriteAllowlist(root, mudManifestFor(root))).toThrow(
      /names no known mutation gate/,
    );
  });

  it('requires every entry to record its owner, concurrency contract, and ticket', () => {
    const root = fixtureRoot("await pool.query('DELETE FROM player_data WHERE pid = ?', [pid]);", {
      'services/sample.ts|DELETE FROM|player_data': { ...allowedEntry, concurrency: '' },
    });
    expect(() => verifyMudWriteAllowlist(root, mudManifestFor(root))).toThrow(
      /authoritativeWriter, concurrency, and ticket/,
    );
  });

  it('fails when mudOwnedTables does not match the baseline fingerprint', () => {
    const root = fixtureRoot("await pool.query('SELECT 1');", {});
    const manifestPath = path.join(root, 'mud-write-allowlist.json');
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    manifest.baseline.requiredTableFingerprint =
      '0000000000000000000000000000000000000000000000000000000000000000';
    fs.writeFileSync(manifestPath, JSON.stringify(manifest));
    expect(() => verifyMudWriteAllowlist(root, mudManifestFor(root))).toThrow(
      /does not match baseline/,
    );
  });

  it('fails when the MUD manifest is missing', () => {
    const root = fixtureRoot("await pool.query('SELECT 1');", {});
    expect(() =>
      verifyMudWriteAllowlist(root, path.join(root, 'missing', 'migration_manifest.json')),
    ).toThrow(/MUD manifest not found/);
  });

  it('fails when the MUD manifest declares a different baseline', () => {
    const root = fixtureRoot("await pool.query('SELECT 1');", {});
    writeMudManifest(root, 'duris-schema-2999-01-01-newer', ['player_data', 'accounts']);
    expect(() => verifyMudWriteAllowlist(root, mudManifestFor(root))).toThrow(
      /baseline id mismatch/,
    );
  });

  it('fails when the MUD manifest pins a different fingerprint', () => {
    const root = fixtureRoot("await pool.query('SELECT 1');", {});
    writeMudManifest(root, 'fixture', ['player_data', 'accounts'], tableFingerprint(['zones']));
    expect(() => verifyMudWriteAllowlist(root, mudManifestFor(root))).toThrow(
      /baseline fingerprint mismatch/,
    );
  });

  it('fails when the copied mudOwnedTables list diverges from the MUD manifest', () => {
    const root = fixtureRoot("await pool.query('SELECT 1');", {});
    // The manifest still declares the pinned fingerprint string, but its table
    // list no longer hashes to it: exactly what a stale hand-edited copy or a
    // MUD-side table addition looks like.
    writeMudManifest(root, 'fixture', ['zones'], tableFingerprint(['player_data', 'accounts']));
    expect(() => verifyMudWriteAllowlist(root, mudManifestFor(root))).toThrow(
      /no longer matches the MUD manifest table list/,
    );
  });

  it('rejects dynamic table interpolation in SQL write statements', () => {
    const root = fixtureRoot(
      [
        'await pool.query(`INSERT INTO ${table} (name) VALUES (?)`, [name]);',
        'await pool.query(`DELETE FROM ${table} WHERE id = ?`, [id]);',
        'await pool.query(`UPDATE ${table} SET gold = 0 WHERE pid = ?`, [pid]);',
        'await pool.query(`TRUNCATE ${table}`);',
      ].join('\n'),
      {},
    );
    expect(() => verifyMudWriteAllowlist(root, mudManifestFor(root))).toThrow(
      /dynamic write target/,
    );
  });

  it('rejects concatenated SQL table targets for every write statement form', () => {
    const root = fixtureRoot(
      [
        "await pool.query('INSERT INTO ' + table + ' (name) VALUES (?)', [name]);",
        "await pool.query('REPLACE INTO ' + table + ' (name) VALUES (?)', [name]);",
        "await pool.query('DELETE FROM ' + table + ' WHERE id = ?', [id]);",
        "await pool.query('UPDATE ' + table + ' SET gold = 0 WHERE pid = ?', [pid]);",
        "await pool.query('TRUNCATE ' + table);",
        "await pool.query('TRUNCATE TABLE ' + table);",
      ].join('\n'),
      {},
    );

    expect(findForbiddenWriteForms(path.join(root, 'src'), '')).toEqual(
      expect.arrayContaining([
        'services/sample.ts: concatenated INSERT/REPLACE target',
        'services/sample.ts: concatenated DELETE target',
        'services/sample.ts: concatenated UPDATE target',
        'services/sample.ts: concatenated TRUNCATE target',
      ]),
    );
    expect(() => verifyMudWriteAllowlist(root, mudManifestFor(root))).toThrow(
      /dynamic write target/,
    );
  });

  it('rejects runtime assembly helpers such as .concat and multiline fragments', () => {
    const root = fixtureRoot(
      [
        "await pool.query('DELETE FROM '.concat(table, ' WHERE id = ?'), [id]);",
        ['await pool.query(', "  'UPDATE '", '  + table', "  + ' SET gold = 0',", ');'].join('\n'),
      ].join('\n'),
      {},
    );
    expect(findForbiddenWriteForms(path.join(root, 'src'), '')).toEqual(
      expect.arrayContaining([
        'services/sample.ts: concatenated DELETE target',
        'services/sample.ts: concatenated UPDATE target',
      ]),
    );
  });

  it('scans backend scripts outside src and requires classification', () => {
    const root = fixtureRoot("await pool.query('SELECT 1');", {});
    fs.mkdirSync(path.join(root, 'scripts'), { recursive: true });
    fs.writeFileSync(
      path.join(root, 'scripts', 'custom.ts'),
      "await pool.query('UPDATE accounts SET gold = 0');",
    );
    expect(() => verifyMudWriteAllowlist(root, mudManifestFor(root))).toThrow(
      /unclassified writes to MUD-owned tables: scripts\/custom\.ts\|UPDATE\|accounts/,
    );
  });
});

describe('multi-table delete target resolution', () => {
  it('maps alias targets to their source tables', () => {
    expect(
      resolveMultiTableDeleteTargets('pd', ' player_data pd JOIN accounts a ON pd.pid = a.id '),
    ).toEqual(['player_data']);
  });

  it('maps alias.* targets and keeps bare table names', () => {
    expect(
      resolveMultiTableDeleteTargets('pd.*, accounts', ' player_data AS pd JOIN accounts a '),
    ).toEqual(['player_data', 'accounts']);
  });

  it('reports unresolvable targets verbatim instead of dropping them', () => {
    expect(resolveMultiTableDeleteTargets('player_data', ' web_sessions s ')).toEqual([
      'player_data',
    ]);
  });

  it('splits comma lists and strips .* and backticks', () => {
    expect(splitTableList('`a`.*, b,  c')).toEqual(['a', 'b', 'c']);
  });
});
