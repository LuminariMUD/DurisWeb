import { describe, expect, it } from '@jest/globals';

import { resolveHookState, isHookActive } from '../hookResolution.js';
import type { MudHookState } from '../hookResolution.js';
import { getAllHooks, requireHook } from '../registry.js';
import type { HookDefinition } from '../types.js';

const MUD_STATES: readonly MudHookState[] = [
  'enabled',
  'disabled',
  'not_gated',
  'unknown',
  'unavailable',
];

const gated: HookDefinition = requireHook('auction_new');
const ungated: HookDefinition = requireHook('flag_parsing');
const alwaysOn: HookDefinition = requireHook('terminal');

describe('hook resolution: the full state matrix', () => {
  it.each`
    webEnabled | mudState          | effective         | active
    ${true}    | ${'enabled'}      | ${'on'}           | ${true}
    ${true}    | ${'disabled'}     | ${'mismatch'}     | ${false}
    ${true}    | ${'not_gated'}    | ${'on'}           | ${true}
    ${true}    | ${'unknown'}      | ${'unknown'}      | ${false}
    ${true}    | ${'unavailable'}  | ${'unavailable'}  | ${false}
    ${false}   | ${'enabled'}      | ${'off'}          | ${false}
    ${false}   | ${'disabled'}     | ${'off'}          | ${false}
    ${false}   | ${'not_gated'}    | ${'off'}          | ${false}
    ${false}   | ${'unknown'}      | ${'off'}          | ${false}
    ${false}   | ${'unavailable'}  | ${'off'}          | ${false}
  `(
    'web=$webEnabled mud=$mudState -> $effective (active=$active)',
    ({ webEnabled, mudState, effective, active }) => {
      const result = resolveHookState({
        hook: gated,
        webEnabled: webEnabled as boolean,
        mudState: mudState as MudHookState,
      });
      expect(result.effective).toBe(effective);
      expect(result.active).toBe(active);
      expect(result.reason.length).toBeGreaterThan(0);
    },
  );
});

describe('fail-closed guarantees', () => {
  it('never activates when the website has the hook disabled', () => {
    for (const mudState of MUD_STATES) {
      expect(isHookActive({ hook: gated, webEnabled: false, mudState })).toBe(false);
    }
  });

  it('activates only when the MUD is enabled or has no gate', () => {
    const active = MUD_STATES.filter((mudState) =>
      isHookActive({ hook: gated, webEnabled: true, mudState }),
    );
    expect(active).toEqual(['enabled', 'not_gated']);
  });

  it('keeps mismatch distinguishable from a plain off', () => {
    const mismatch = resolveHookState({
      hook: gated,
      webEnabled: true,
      mudState: 'disabled',
    });
    const off = resolveHookState({
      hook: gated,
      webEnabled: false,
      mudState: 'disabled',
    });

    expect(mismatch.effective).toBe('mismatch');
    expect(off.effective).toBe('off');
    expect(mismatch.effective).not.toBe(off.effective);
    // Both inactive, but an operator must be able to tell them apart.
    expect(mismatch.active).toBe(false);
    expect(off.active).toBe(false);
    expect(mismatch.reason).not.toBe(off.reason);
  });

  it('keeps unknown and unavailable distinguishable from each other and from off', () => {
    const states = MUD_STATES.map(
      (mudState) =>
        resolveHookState({ hook: gated, webEnabled: true, mudState }).effective,
    );
    expect(new Set(states).size).toBe(4);
  });
});

describe('hooks with no MUD-side gate', () => {
  it('is decided by the website alone, not treated as MUD-off', () => {
    const result = resolveHookState({
      hook: ungated,
      webEnabled: true,
      mudState: 'not_gated',
    });
    expect(result.effective).toBe('on');
    expect(result.active).toBe(true);
  });

  it('still turns off when the website disables it', () => {
    expect(
      isHookActive({ hook: ungated, webEnabled: false, mudState: 'not_gated' }),
    ).toBe(false);
  });
});

describe('always-on hooks', () => {
  it('resolves on regardless of any input', () => {
    for (const mudState of MUD_STATES) {
      for (const webEnabled of [true, false]) {
        const result = resolveHookState({ hook: alwaysOn, webEnabled, mudState });
        expect(result.effective).toBe('on');
        expect(result.active).toBe(true);
      }
    }
  });
});

describe('every registered hook resolves', () => {
  it('produces a state and a reason for all hooks in every MUD state', () => {
    for (const hook of getAllHooks()) {
      for (const mudState of MUD_STATES) {
        for (const webEnabled of [true, false]) {
          const result = resolveHookState({ hook, webEnabled, mudState });
          expect(typeof result.active).toBe('boolean');
          expect(result.reason.length).toBeGreaterThan(0);
          expect(['on', 'off', 'mismatch', 'unknown', 'unavailable']).toContain(
            result.effective,
          );
        }
      }
    }
  });
});
