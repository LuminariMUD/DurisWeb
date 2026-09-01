/**
 * @jest-environment node
 */
import { afterAll, afterEach, beforeAll, describe, expect, it } from '@jest/globals';

import { pool } from '../../db/connection.js';
import { getToggleableHooks, requireHook } from '../registry.js';
import {
  getHookStatus,
  getHookStatuses,
  peekWebState,
  refreshHookState,
  resetMudHookStateProvider,
  setHookEnabled,
  setMudHookStateProvider,
  HookToggleError,
} from '../hookSettingsService.js';

const ACTOR = 'Cwial';
const SUBJECT = 'auction_new';
const SUBJECT_KEY = requireHook(SUBJECT).webSettingKey as string;

async function seedRows(): Promise<void> {
  for (const hook of getToggleableHooks()) {
    await pool.query(
      `INSERT INTO web_settings (setting_key, setting_value)
       VALUES (?, 'true')
       ON DUPLICATE KEY UPDATE setting_value = 'true'`,
      [hook.webSettingKey],
    );
  }
  await refreshHookState();
}

beforeAll(async () => {
  await seedRows();
});

afterEach(async () => {
  resetMudHookStateProvider();
  await seedRows();
});

afterAll(async () => {
  await pool.query('DELETE FROM admin_action_log WHERE target LIKE ?', ['hook:%']);
  // Match the project convention: release the pool so Jest exits cleanly.
  await pool.end();
});

describe('hook settings store', () => {
  it('reports every registered hook, including the always-on terminal', async () => {
    const statuses = await getHookStatuses();
    expect(statuses).toHaveLength(14);
    expect(statuses.find((s) => s.hook.id === 'terminal')?.active).toBe(true);
  });

  it('defaults an absent row to enabled rather than disabled', async () => {
    await pool.query('DELETE FROM web_settings WHERE setting_key = ?', [SUBJECT_KEY]);
    await refreshHookState();

    const status = await getHookStatus(SUBJECT);
    expect(status.webEnabled).toBe(true);
  });

  it('treats an unparseable value as enabled rather than guessing disabled', async () => {
    await pool.query('UPDATE web_settings SET setting_value = ? WHERE setting_key = ?', [
      'not-a-boolean',
      SUBJECT_KEY,
    ]);
    await refreshHookState();

    const status = await getHookStatus(SUBJECT);
    expect(status.webEnabled).toBe(true);
  });

  it('accepts both boolean spellings used in web_settings', async () => {
    for (const [raw, expected] of [
      ['true', true],
      ['1', true],
      ['false', false],
      ['0', false],
      ['TRUE', true],
    ] as const) {
      await pool.query('UPDATE web_settings SET setting_value = ? WHERE setting_key = ?', [
        raw,
        SUBJECT_KEY,
      ]);
      await refreshHookState();
      expect((await getHookStatus(SUBJECT)).webEnabled).toBe(expected);
    }
  });
});

describe('toggling', () => {
  it('persists a change and invalidates the cache before returning', async () => {
    const status = await setHookEnabled(SUBJECT, false, ACTOR);
    expect(status.webEnabled).toBe(false);

    // Cache was cleared on write, so a fresh read must see the new value
    // without waiting for a TTL.
    expect((await getHookStatus(SUBJECT)).webEnabled).toBe(false);

    const [rows] = (await pool.query(
      'SELECT setting_value, updated_by FROM web_settings WHERE setting_key = ?',
      [SUBJECT_KEY],
    )) as [Array<{ setting_value: string; updated_by: string }>, unknown];
    expect(rows[0].setting_value).toBe('false');
    expect(rows[0].updated_by).toBe(ACTOR);
  });

  it('records the change in the admin action log with the actor and both values', async () => {
    await setHookEnabled(SUBJECT, false, ACTOR);

    const [rows] = (await pool.query(
      `SELECT account_name, old_value, new_value FROM admin_action_log
       WHERE target = ? ORDER BY id DESC LIMIT 1`,
      [`hook:${SUBJECT}`],
    )) as [Array<{ account_name: string; old_value: string; new_value: string }>, unknown];

    expect(rows).toHaveLength(1);
    expect(rows[0].account_name).toBe(ACTOR);
    expect(rows[0].old_value).toBe('enabled');
    expect(rows[0].new_value).toBe('disabled');
  });

  it('refuses to toggle an always-on hook', async () => {
    await expect(setHookEnabled('terminal', false, ACTOR)).rejects.toBeInstanceOf(
      HookToggleError,
    );
    await expect(setHookEnabled('terminal', false, ACTOR)).rejects.toMatchObject({
      code: 'always_on',
    });
  });

  it('refuses an unregistered hook id', async () => {
    await expect(setHookEnabled('not_a_hook', false, ACTOR)).rejects.toMatchObject({
      code: 'unknown_hook',
    });
  });
});

describe('effective state against MUD reports', () => {
  it('reports mismatch when the website is on and the MUD is off', async () => {
    setMudHookStateProvider({ getState: () => 'disabled' });
    const status = await getHookStatus(SUBJECT);
    expect(status.effective).toBe('mismatch');
    expect(status.active).toBe(false);
  });

  it('reports off, not mismatch, when the website is the one disabling', async () => {
    setMudHookStateProvider({ getState: () => 'disabled' });
    await setHookEnabled(SUBJECT, false, ACTOR);
    const status = await getHookStatus(SUBJECT);
    expect(status.effective).toBe('off');
  });

  it('defaults to unknown for MUD-gated hooks before a bridge exists', async () => {
    const status = await getHookStatus(SUBJECT);
    expect(status.mudState).toBe('unknown');
    expect(status.active).toBe(false);
  });

  it('treats hooks with no MUD gate as website-decided', async () => {
    const status = await getHookStatus('flag_parsing');
    expect(status.mudState).toBe('not_gated');
    expect(status.effective).toBe('on');
  });
});

describe('event-path cache', () => {
  it('exposes a synchronous view after loading', async () => {
    await refreshHookState();
    const state = peekWebState();
    expect(state).not.toBeNull();
    expect(state?.get(SUBJECT)).toBe(true);
  });
});
