import { describe, expect, it } from '@jest/globals';

import type { HookChannel, HookDefinition } from '../types.js';
import {
  getAllHooks,
  getHook,
  getHooksByChannel,
  getMudGatedHooks,
  getToggleableHooks,
  isHookId,
  requireHook,
} from '../index.js';

const ALL_CHANNELS: readonly HookChannel[] = [
  'bridge',
  'pubsub',
  'flatfile',
  'process',
  'terminal',
];

function duplicates(values: readonly string[]): string[] {
  const seen = new Set<string>();
  const dupes = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) dupes.add(value);
    seen.add(value);
  }
  return [...dupes];
}

describe('hook registry composition', () => {
  it('registers 14 hooks: 13 toggleable and 1 always-on', () => {
    expect(getAllHooks()).toHaveLength(14);
    expect(getToggleableHooks()).toHaveLength(13);
    expect(getAllHooks().filter((hook) => hook.alwaysOn)).toHaveLength(1);
  });

  it('includes the two streams discovered late in planning', () => {
    expect(getHook('wholist')).toBeDefined();
    expect(getHook('admin_delete_character')).toBeDefined();
  });

  it('registers the terminal as always-on with no toggle on either end', () => {
    const terminal = requireHook('terminal');
    expect(terminal.alwaysOn).toBe(true);
    expect(terminal.webSettingKey).toBeNull();
    expect(terminal.mudPropertyKey).toBeNull();
  });

  it('gates exactly 9 hooks on the MUD side', () => {
    expect(getMudGatedHooks()).toHaveLength(9);
  });

  it('populates every declared channel', () => {
    for (const channel of ALL_CHANNELS) {
      expect(getHooksByChannel(channel).length).toBeGreaterThan(0);
    }
  });

  it('assigns every hook to a declared channel', () => {
    for (const hook of getAllHooks()) {
      expect(ALL_CHANNELS).toContain(hook.channel);
    }
  });
});

describe('hook registry invariants', () => {
  it('has no duplicate ids', () => {
    expect(duplicates(getAllHooks().map((hook) => hook.id))).toEqual([]);
  });

  it('has no duplicate web setting keys', () => {
    const keys = getAllHooks()
      .map((hook) => hook.webSettingKey)
      .filter((key): key is string => key !== null);
    expect(duplicates(keys)).toEqual([]);
  });

  it('has no duplicate MUD property keys', () => {
    const keys = getMudGatedHooks().map((hook) => hook.mudPropertyKey as string);
    expect(duplicates(keys)).toEqual([]);
  });

  it('derives every MUD property key as durisweb.hook.<id>', () => {
    for (const hook of getMudGatedHooks()) {
      expect(hook.mudPropertyKey).toBe(`durisweb.hook.${hook.id}`);
    }
  });

  it('derives every web setting key as hook_enabled_<id>', () => {
    for (const hook of getToggleableHooks()) {
      expect(hook.webSettingKey).toBe(`hook_enabled_${hook.id}`);
    }
  });

  it('gives every toggleable hook a web setting key', () => {
    for (const hook of getToggleableHooks()) {
      expect(hook.webSettingKey).not.toBeNull();
    }
  });

  it('uses null rather than an empty string for absent keys', () => {
    for (const hook of getAllHooks()) {
      expect(hook.webSettingKey).not.toBe('');
      expect(hook.mudPropertyKey).not.toBe('');
      expect(hook.mudSite).not.toBe('');
    }
  });

  it('records a MUD site for every MUD-gated hook', () => {
    for (const hook of getMudGatedHooks()) {
      expect(hook.mudSite).not.toBeNull();
    }
  });

  it('gives every hook an owner and a description', () => {
    for (const hook of getAllHooks()) {
      expect(hook.owner).toMatch(/^backend\/src\/services\/.+\.ts$/);
      expect(hook.description.length).toBeGreaterThan(0);
    }
  });

  it('uses snake_case ids', () => {
    for (const hook of getAllHooks()) {
      expect(hook.id).toMatch(/^[a-z][a-z0-9_]*$/);
    }
  });
});

describe('hook registry lookups', () => {
  it('resolves a known id', () => {
    const hook = getHook('auction_new');
    expect(hook?.id).toBe('auction_new');
    expect(requireHook('auction_new')).toBe(hook);
  });

  it('returns undefined for an unregistered id', () => {
    expect(getHook('not_a_hook')).toBeUndefined();
  });

  it('returns undefined for an empty id', () => {
    expect(getHook('')).toBeUndefined();
  });

  it('does not resolve a case-mismatched id', () => {
    expect(getHook('Auction_New')).toBeUndefined();
    expect(getHook('AUCTION_NEW')).toBeUndefined();
  });

  it('throws with the offending id rather than reading as an open gate', () => {
    expect(() => requireHook('not_a_hook')).toThrow(/not_a_hook/);
    expect(() => requireHook('')).toThrow(/Unregistered hook id/);
  });

  it('narrows untrusted input', () => {
    expect(isHookId('auction_new')).toBe(true);
    expect(isHookId('not_a_hook')).toBe(false);
    expect(isHookId('')).toBe(false);
    expect(isHookId(null)).toBe(false);
    expect(isHookId(undefined)).toBe(false);
    expect(isHookId(42)).toBe(false);
    expect(isHookId({ id: 'auction_new' })).toBe(false);
  });

  it('returns an empty list for a channel with no hooks', () => {
    expect(getHooksByChannel('nope' as HookChannel)).toEqual([]);
  });

  it('exposes frozen data that callers cannot mutate', () => {
    const hooks = getAllHooks() as HookDefinition[];
    expect(Object.isFrozen(hooks)).toBe(true);
    expect(() => hooks.push({ ...hooks[0] })).toThrow();
  });
});
