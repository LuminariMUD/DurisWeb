/**
 * Resolution of a hook's effective state from both ends.
 *
 * This is the phase's central rule in one place: a hook is active only when
 * both ends enable it. Either end disabled means off. The two ends disagreeing
 * is its own state, not "off", so an operator can tell a deliberate shutdown
 * apart from a misconfiguration.
 *
 * Pure: no I/O, no dependencies, no clock. Every combination is cheap to test,
 * which matters because a bug here disables the entire integration surface.
 */

import type { HookDefinition } from './types.js';

/** What the MUD reports about a hook, or why we cannot say. */
export type MudHookState =
  /** MUD reports the hook enabled. */
  | 'enabled'
  /** MUD reports the hook disabled. */
  | 'disabled'
  /** No MUD-side gate exists for this hook; the website decides alone. */
  | 'not_gated'
  /** The bridge is down, so the MUD's state is genuinely unknown. */
  | 'unknown'
  /** The MUD-side resource is unreachable (for example a split-host filesystem). */
  | 'unavailable';

/**
 * The resolved state an operator sees.
 *
 * Only `on` is active. The other four are all inactive - fail closed - but stay
 * distinguishable so the console can explain why a hook is not running.
 */
export type EffectiveHookState =
  | 'on'
  | 'off'
  | 'mismatch'
  | 'unknown'
  | 'unavailable';

export interface HookStateInputs {
  readonly hook: HookDefinition;
  /** The website-side toggle. */
  readonly webEnabled: boolean;
  readonly mudState: MudHookState;
}

export interface ResolvedHookState {
  readonly effective: EffectiveHookState;
  /** True only when the hook should actually carry data. */
  readonly active: boolean;
  /** Short, operator-facing explanation. Always populated. */
  readonly reason: string;
}

function resolved(
  effective: EffectiveHookState,
  active: boolean,
  reason: string,
): ResolvedHookState {
  return { effective, active, reason };
}

/**
 * Resolve one hook's effective state.
 *
 * Note the asymmetry: a hook with no MUD-side gate is decided by the website
 * alone. Treating "not gated" as "MUD says off" would permanently disable the
 * five website-side hooks.
 */
export function resolveHookState(inputs: HookStateInputs): ResolvedHookState {
  const { hook, webEnabled, mudState } = inputs;

  // An always-on hook has no toggle on either end. It is the operator's
  // recovery path, so nothing here may switch it off.
  if (hook.alwaysOn) {
    return resolved('on', true, 'Always on; not toggleable.');
  }

  // Website off is decisive regardless of what the MUD says. Checked first so a
  // deliberate local shutdown never reads as a mismatch.
  if (!webEnabled) {
    return resolved('off', false, 'Disabled on the website.');
  }

  switch (mudState) {
    case 'enabled':
      return resolved('on', true, 'Enabled on both ends.');

    case 'disabled':
      // Both ends were reachable and they disagree. This is the state the
      // console must never render as a plain "off".
      return resolved(
        'mismatch',
        false,
        'Enabled on the website but disabled on the MUD.',
      );

    case 'not_gated':
      return resolved(
        'on',
        true,
        'Enabled on the website; this hook has no MUD-side gate.',
      );

    case 'unknown':
      return resolved(
        'unknown',
        false,
        'Enabled on the website; the MUD state is unknown because the bridge is down.',
      );

    case 'unavailable':
      return resolved(
        'unavailable',
        false,
        'Enabled on the website; the MUD-side resource is unreachable.',
      );

    default: {
      // Exhaustiveness guard. If MudHookState gains a member and this switch is
      // not updated, this fails to compile rather than silently activating a
      // hook whose state nobody has reasoned about.
      const unreachable: never = mudState;
      return resolved(
        'unknown',
        false,
        `Unrecognised MUD state: ${String(unreachable)}`,
      );
    }
  }
}

/** Convenience for event paths that only need the yes/no. */
export function isHookActive(inputs: HookStateInputs): boolean {
  return resolveHookState(inputs).active;
}
