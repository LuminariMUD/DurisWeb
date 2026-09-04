import { describe, expect, it, jest } from '@jest/globals';

import {
  readCombatFragBaselineReadiness,
  validateCombatFragBaselineReadiness,
  type CombatFragBaselineReadiness,
} from '../combatFragBaselineReadiness.js';

/** Build one aggregate combat-baseline readiness fixture. */
function readiness(
  overrides: Partial<CombatFragBaselineReadiness> = {},
): CombatFragBaselineReadiness {
  return {
    activeMappedCharacters: 795,
    missingCombatBaselines: 0,
    reconstructableCombatBaselines: 0,
    ambiguousCombatBaselines: 0,
    missingWalletBaselines: 0,
    missingEpicBaselines: 0,
    existingCombatMismatches: 0,
    ledgerResultMismatches: 0,
    ...overrides,
  };
}

describe('combat frag baseline readiness', () => {
  it('accepts complete opening baselines and immutable ledger state', () => {
    expect(validateCombatFragBaselineReadiness(readiness())).toEqual([]);
  });

  it('fails when a newly accepted character lacks any required opening baseline', () => {
    expect(
      validateCombatFragBaselineReadiness(
        readiness({
          missingCombatBaselines: 1,
          reconstructableCombatBaselines: 1,
          missingWalletBaselines: 1,
          missingEpicBaselines: 1,
        }),
      ),
    ).toEqual([
      '1 active mapped characters lack combat baselines',
      '1 active mapped characters lack wallet baselines',
      '1 active mapped characters lack epic baselines',
    ]);
  });

  it('keeps ambiguous missing rows distinct from ledger-reconstructable rows', () => {
    const result = validateCombatFragBaselineReadiness(
      readiness({
        missingCombatBaselines: 12,
        reconstructableCombatBaselines: 10,
        ambiguousCombatBaselines: 2,
      }),
    );

    expect(result).toEqual(['12 active mapped characters lack combat baselines']);
  });

  it('fails closed when repair classifications do not cover every missing row', () => {
    expect(
      validateCombatFragBaselineReadiness(
        readiness({ missingCombatBaselines: 12, reconstructableCombatBaselines: 11 }),
      ),
    ).toContain('missing combat baseline classifications do not reconcile');
  });

  it('maps only aggregate database output', async () => {
    const query = jest
      .fn<(...args: unknown[]) => Promise<[unknown[], unknown]>>()
      .mockResolvedValue([
        [
          {
            active_mapped_characters: '795',
            missing_combat_baselines: '12',
            reconstructable_combat_baselines: '12',
            ambiguous_combat_baselines: '0',
            missing_wallet_baselines: '0',
            missing_epic_baselines: '0',
            existing_combat_mismatches: '0',
            ledger_result_mismatches: '0',
          },
        ],
        [],
      ]);

    await expect(readCombatFragBaselineReadiness({ query } as never)).resolves.toEqual(
      readiness({ missingCombatBaselines: 12, reconstructableCombatBaselines: 12 }),
    );
    expect(query).toHaveBeenCalledTimes(1);
    const readinessQuery = String(query.mock.calls[0]?.[0]);
    expect(readinessQuery).toContain('COUNT(*) AS active_mapped_characters');
    expect(readinessQuery).toMatch(
      /combat_baseline_pid IS NOT NULL[\s\S]*distinct_revisions = ledger_count[\s\S]*minimum_revision = opening_revision \+ 1[\s\S]*maximum_revision = frag_revision[\s\S]*maximum_revision - minimum_revision \+ 1 = ledger_count/,
    );
  });
});
