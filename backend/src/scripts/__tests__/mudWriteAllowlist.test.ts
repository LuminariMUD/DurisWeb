import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from '@jest/globals';

import {
  loadMudWriteAllowlist,
  scanMudOwnedWrites,
  verifyMudWriteAllowlist,
} from '../verifyMudWriteAllowlist.js';

const temporaryRoots: string[] = [];

/** Build a disposable backend root with one source file and one manifest. */
function fixtureRoot(source: string, writes: Record<string, unknown>): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mud-write-allowlist-'));
  temporaryRoots.push(root);
  fs.mkdirSync(path.join(root, 'src', 'services'), { recursive: true });
  fs.writeFileSync(path.join(root, 'src', 'services', 'sample.ts'), source);
  fs.writeFileSync(
    path.join(root, 'mud-write-allowlist.json'),
    JSON.stringify({
      baseline: { id: 'fixture', requiredTableFingerprint: 'fixture' },
      mudOwnedTables: ['player_data', 'accounts'],
      writes,
    }),
  );
  return root;
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

  it('fails on an unclassified cross-boundary write', () => {
    const root = fixtureRoot(
      "await pool.query('DELETE FROM player_data WHERE pid = ?', [pid]);",
      {},
    );
    expect(() => verifyMudWriteAllowlist(root)).toThrow(/unclassified writes/);
  });

  it('fails when the manifest keeps an entry that no longer exists', () => {
    const root = fixtureRoot("await pool.query('SELECT 1');", {
      'services/sample.ts|DELETE FROM|player_data': allowedEntry,
    });
    expect(() => verifyMudWriteAllowlist(root)).toThrow(/no longer exist/);
  });

  it('requires a gated write to name a known mutation gate', () => {
    const root = fixtureRoot("await pool.query('DELETE FROM player_data WHERE pid = ?', [pid]);", {
      'services/sample.ts|DELETE FROM|player_data': {
        ...allowedEntry,
        status: 'gated',
        gate: 'notAGate',
      },
    });
    expect(() => verifyMudWriteAllowlist(root)).toThrow(/names no known mutation gate/);
  });

  it('requires every entry to record its owner, concurrency contract, and ticket', () => {
    const root = fixtureRoot("await pool.query('DELETE FROM player_data WHERE pid = ?', [pid]);", {
      'services/sample.ts|DELETE FROM|player_data': { ...allowedEntry, concurrency: '' },
    });
    expect(() => verifyMudWriteAllowlist(root)).toThrow(
      /authoritativeWriter, concurrency, and ticket/,
    );
  });
});
