import { beforeEach, describe, expect, it } from '@jest/globals';

import {
  applyHookStateFrame,
  buildHookStateRequest,
  clearMudHookState,
  expectedMudGatedHookIds,
  hasMudReport,
  getMudReportReceivedAt,
  mudHookStateProvider,
  peekMudHookState,
} from '../mudHookStateClient.js';
import { requireHook } from '../registry.js';

const GATED = requireHook('auction_new');
const UNGATED = requireHook('flag_parsing');
const ALWAYS_ON = requireHook('terminal');
const EXPECTED_GATED_IDS = [
  'auction_new',
  'auction_bid',
  'auction_close',
  'player_presence',
  'mud_shutdown',
  'wholist',
  'admin_delete_character',
  'donation_delivery',
] as const;

function frame(hooks: Record<string, unknown>, schemaVersion: unknown = 1): unknown {
  return { type: 'hook_state', schema_version: schemaVersion, hooks };
}

function fullFrame(enabled: boolean): unknown {
  const hooks: Record<string, unknown> = {};
  for (const id of expectedMudGatedHookIds()) {
    hooks[id] = { enabled };
  }
  return frame(hooks);
}

beforeEach(() => {
  clearMudHookState();
});

describe('frame validation', () => {
  it('applies a well-formed frame', () => {
    expect(applyHookStateFrame(fullFrame(true))).toBe(true);
    expect(hasMudReport()).toBe(true);
    for (const id of EXPECTED_GATED_IDS) {
      expect(mudHookStateProvider.getState(requireHook(id))).toBe('enabled');
    }
    expect(getMudReportReceivedAt()).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('records disabled hooks as disabled, not merely absent', () => {
    applyHookStateFrame(fullFrame(false));
    for (const id of EXPECTED_GATED_IDS) {
      expect(mudHookStateProvider.getState(requireHook(id))).toBe('disabled');
    }
  });

  it('rejects an unsupported schema version wholesale', () => {
    expect(applyHookStateFrame(frame({ auction_new: { enabled: false } }, 2))).toBe(false);
    expect(hasMudReport()).toBe(false);
    expect(getMudReportReceivedAt()).toBeNull();
    expect(mudHookStateProvider.getState(GATED)).toBe('unknown');
  });

  it('rejects a missing schema version', () => {
    expect(applyHookStateFrame({ type: 'hook_state', hooks: {} })).toBe(false);
  });

  it.each([null, undefined, 42, 'nope', []])('rejects a non-object frame: %p', (bad) => {
    expect(applyHookStateFrame(bad)).toBe(false);
  });

  it.each([null, 'yes', 42, []])('rejects a malformed hooks map: %p', (bad) => {
    expect(applyHookStateFrame(frame(bad as never))).toBe(false);
  });

  it('rejects a non-boolean enabled rather than coercing it', () => {
    expect(applyHookStateFrame(frame({ auction_new: { enabled: 'true' } }))).toBe(false);
    expect(applyHookStateFrame(frame({ auction_new: { enabled: 1 } }))).toBe(false);
    expect(hasMudReport()).toBe(false);
  });

  it('applies nothing when any entry is malformed', () => {
    applyHookStateFrame(fullFrame(true));
    expect(mudHookStateProvider.getState(GATED)).toBe('enabled');

    // A frame that turns everything off but contains one bad entry must not
    // apply the good half.
    const mixed = frame({ auction_new: { enabled: false }, wholist: { enabled: 'no' } });
    expect(applyHookStateFrame(mixed)).toBe(false);
    expect(mudHookStateProvider.getState(GATED)).toBe('enabled');
  });

  it('ignores an unregistered hook id without failing the frame', () => {
    const withStray = frame({ auction_new: { enabled: true }, not_a_hook: { enabled: true } });
    expect(applyHookStateFrame(withStray)).toBe(true);
    expect(peekMudHookState().has('not_a_hook')).toBe(false);
    expect(mudHookStateProvider.getState(GATED)).toBe('enabled');
  });
});

describe('staleness', () => {
  it('reverts a hook omitted from a later frame to unknown', () => {
    applyHookStateFrame(fullFrame(true));
    expect(mudHookStateProvider.getState(GATED)).toBe('enabled');

    // A frame that no longer mentions auction_new must not leave it 'enabled'.
    applyHookStateFrame(frame({ wholist: { enabled: true } }));
    expect(mudHookStateProvider.getState(GATED)).toBe('unknown');
  });

  it('clears every hook to unknown on disconnect', () => {
    applyHookStateFrame(fullFrame(true));
    clearMudHookState();

    expect(hasMudReport()).toBe(false);
    for (const id of EXPECTED_GATED_IDS) {
      expect(mudHookStateProvider.getState(requireHook(id))).toBe('unknown');
    }
  });

  it('restores every reported state after a reconnect without retaining stale values', () => {
    applyHookStateFrame(fullFrame(true));
    clearMudHookState();

    const recovered: Record<string, unknown> = {};
    EXPECTED_GATED_IDS.forEach((id, index) => {
      recovered[id] = { enabled: index % 2 === 0 };
    });
    applyHookStateFrame(frame(recovered));

    EXPECTED_GATED_IDS.forEach((id, index) => {
      expect(mudHookStateProvider.getState(requireHook(id))).toBe(
        index % 2 === 0 ? 'enabled' : 'disabled',
      );
    });
  });
});

describe('hooks with no MUD-side gate', () => {
  it('always reports not_gated, never unknown', () => {
    expect(mudHookStateProvider.getState(UNGATED)).toBe('not_gated');
    applyHookStateFrame(fullFrame(true));
    expect(mudHookStateProvider.getState(UNGATED)).toBe('not_gated');
    clearMudHookState();
    expect(mudHookStateProvider.getState(UNGATED)).toBe('not_gated');
  });

  it('reports not_gated for the always-on terminal', () => {
    expect(mudHookStateProvider.getState(ALWAYS_ON)).toBe('not_gated');
  });
});

describe('request frame', () => {
  it('matches the command the MUD registers', () => {
    expect(JSON.parse(buildHookStateRequest())).toEqual({
      type: 'cmd',
      cmd: 'durisweb_hook_state',
      data: {},
    });
  });

  it('expects exactly the eight MUD-gated hooks', () => {
    expect(expectedMudGatedHookIds()).toEqual(EXPECTED_GATED_IDS);
  });
});
