import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeEach, describe, expect, it, jest } from '@jest/globals';

import type { HookId } from '../types.js';

const peekWebState = jest.fn<() => ReadonlyMap<string, boolean> | null>();

jest.unstable_mockModule('../hookSettingsService.js', () => ({
  peekWebState,
}));
jest.unstable_mockModule('../../utils/logger.js', () => ({
  default: {
    debug: jest.fn(),
    warn: jest.fn(),
  },
}));

const { isHookEnabledSync, withHookGate } = await import('../hookGate.js');
const { getAllHooks, getMudGatedHooks, getToggleableHooks, requireHook } = await import(
  '../registry.js'
);
const { resolveHookState } = await import('../hookResolution.js');

const TEST_DIRECTORY = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(TEST_DIRECTORY, '../../../..');
type ToggleableHookId = Exclude<HookId, 'terminal'>;

function toggleableId(id: HookId): ToggleableHookId {
  if (id === 'terminal') {
    throw new Error('The terminal is not a toggleable hook.');
  }
  return id;
}

function readProject(relativePath: string): string {
  return fs.readFileSync(path.join(PROJECT_ROOT, relativePath), 'utf8');
}

beforeEach(() => {
  peekWebState.mockReset();
});

describe('website delivery gate contract', () => {
  it.each(getToggleableHooks().map((hook) => [hook.id] as const))(
    '%s delivers only while its website gate is enabled',
    (id) => {
      const deliver = jest.fn(() => `${id}:delivered`);

      peekWebState.mockReturnValue(new Map([[id, true]]));
      expect(withHookGate(id, deliver)).toBe(`${id}:delivered`);
      expect(deliver).toHaveBeenCalledTimes(1);

      peekWebState.mockReturnValue(new Map([[id, false]]));
      expect(withHookGate(id, deliver)).toBeUndefined();
      expect(deliver).toHaveBeenCalledTimes(1);
    },
  );

  it('fails closed for an unregistered id', () => {
    peekWebState.mockReturnValue(new Map());
    const deliver = jest.fn();

    expect(withHookGate('not_a_hook', deliver)).toBeUndefined();
    expect(deliver).not.toHaveBeenCalled();
  });

  it('keeps terminal enabled independently of the website cache', () => {
    peekWebState.mockReturnValue(new Map([['terminal', false]]));
    expect(isHookEnabledSync('terminal')).toBe(true);
  });
});

describe('owned-end resolution contract', () => {
  it.each(getMudGatedHooks().map((hook) => [hook.id] as const))(
    '%s is active only while both owned ends are enabled',
    (id) => {
      const hook = requireHook(id);

      expect(resolveHookState({ hook, webEnabled: true, mudState: 'enabled' })).toMatchObject({
        effective: 'on',
        active: true,
      });
      expect(resolveHookState({ hook, webEnabled: false, mudState: 'enabled' })).toMatchObject({
        effective: 'off',
        active: false,
      });
      expect(resolveHookState({ hook, webEnabled: true, mudState: 'disabled' })).toMatchObject({
        effective: 'mismatch',
        active: false,
      });
      expect(resolveHookState({ hook, webEnabled: true, mudState: 'unknown' })).toMatchObject({
        effective: 'unknown',
        active: false,
      });
    },
  );

  it.each(
    getToggleableHooks()
      .filter((hook) => hook.mudPropertyKey === null)
      .map((hook) => [hook.id] as const),
  )('%s is explicitly website-only rather than MUD-unknown', (id) => {
    const hook = requireHook(id);

    expect(hook.mudPropertyKey).toBeNull();
    expect(resolveHookState({ hook, webEnabled: true, mudState: 'not_gated' })).toMatchObject({
      effective: 'on',
      active: true,
    });
    expect(resolveHookState({ hook, webEnabled: false, mudState: 'not_gated' })).toMatchObject({
      effective: 'off',
      active: false,
    });
  });

  it('covers every toggleable hook at exactly one ownership shape', () => {
    const mudGated = getMudGatedHooks().map((hook) => hook.id);
    const websiteOnly = getToggleableHooks()
      .filter((hook) => hook.mudPropertyKey === null)
      .map((hook) => hook.id);

    expect(mudGated).toHaveLength(8);
    expect(websiteOnly).toHaveLength(5);
    expect([...mudGated, ...websiteOnly].sort()).toEqual(
      getToggleableHooks()
        .map((hook) => hook.id)
        .sort(),
    );
  });
});

describe('registered owner enforcement sites', () => {
  const expectedEnforcement: Readonly<
    Record<ToggleableHookId, { readonly gate: string; readonly boundary: string }>
  > = {
    auction_new: {
      gate: "if (!acceptInboundHook('auction_new')) break;",
      boundary: "broadcast('AUCTION_NEW'",
    },
    auction_bid: {
      gate: "if (!acceptInboundHook('auction_bid')) break;",
      boundary: "broadcast('AUCTION_BID'",
    },
    auction_close: {
      gate: "if (!acceptInboundHook('auction_close')) break;",
      boundary: "broadcast('AUCTION_CLOSE'",
    },
    player_presence: {
      gate: "if (!isHookEnabledSync('player_presence')) return;",
      boundary: "broadcaster('PLAYER_LOGIN'",
    },
    mud_shutdown: {
      gate: "if (!acceptInboundHook('mud_shutdown')) break;",
      boundary: 'handleMudShutdown(msg.data);',
    },
    wholist: {
      gate: "if (!acceptInboundHook('wholist')) break;",
      boundary: 'handleWhoList(msg.data.players || [])',
    },
    admin_delete_character: {
      gate: "if (!isHookEnabledSync('admin_delete_character')) {",
      boundary: 'if (!isMudConnected()) {',
    },
    donation_delivery: {
      gate: "if (!isHookEnabledSync('donation_delivery')) return;",
      boundary: 'const row = await claimNextOutboxRow();',
    },
    connection_log: {
      gate: "if (!isHookEnabledSync('connection_log')) {",
      boundary: 'const logContent = await readMudTextFile(',
    },
    flag_parsing: {
      gate: "if (!isHookEnabledSync('flag_parsing')) {",
      boundary: 'const results: ParseResult[] = [];',
    },
    guild_parsing: {
      gate: "if (!isHookEnabledSync('guild_parsing')) return null;",
      boundary: 'const result = await guildService.getGuild(guildId);',
    },
    zone_builder_parsing: {
      gate: "if (!isHookEnabledSync('zone_builder_parsing')) {",
      boundary: 'return getMudAreasRoot();',
    },
    process_control: {
      gate: "if (!isHookEnabledSync('process_control')) {",
      boundary: 'const state = await getMudState();',
    },
  };

  it.each(getToggleableHooks().map((hook) => [toggleableId(hook.id), hook.owner] as const))(
    '%s is gated in its registered owner before delivery or application',
    (id, owner) => {
      const source = readProject(owner);
      const { gate, boundary } = expectedEnforcement[id];
      const gateOffset = source.indexOf(gate);
      const boundaryOffset = source.indexOf(boundary);

      expect(gateOffset).toBeGreaterThanOrEqual(0);
      expect(boundaryOffset).toBeGreaterThanOrEqual(0);
      expect(gateOffset).toBeLessThan(boundaryOffset);
    },
  );

  it('keeps bridge presence gated on both accepted inbound paths', () => {
    const bridge = readProject('backend/src/services/mudAuctionClient.ts');
    expect(bridge.match(/acceptInboundHook\('player_presence'\)/g)).toHaveLength(2);
  });

  it('keeps the always-on terminal behind permission and live-session checks', () => {
    const terminal = requireHook('terminal');
    const entrypoint = readProject('backend/src/index.ts');
    const service = readProject(terminal.owner);

    expect(terminal).toMatchObject({ alwaysOn: true, webSettingKey: null });
    expect(entrypoint).toContain("includes('terminal_access')");
    expect(service).toContain('isTerminalOperationAuthorized');
    expect(service).not.toContain("isHookEnabledSync('terminal')");
  });

  it('keeps the source matrix synchronized with every registry row', () => {
    expect(Object.keys(expectedEnforcement).sort()).toEqual(
      getAllHooks()
        .filter((hook) => !hook.alwaysOn)
        .map((hook) => hook.id)
        .sort(),
    );
  });
});
