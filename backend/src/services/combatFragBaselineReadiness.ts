import type { Pool, RowDataPacket } from 'mysql2/promise';

interface CombatFragBaselineRow extends RowDataPacket {
  active_mapped_characters: number | string;
  missing_combat_baselines: number | string;
  reconstructable_combat_baselines: number | string;
  ambiguous_combat_baselines: number | string;
  missing_wallet_baselines: number | string;
  missing_epic_baselines: number | string;
  existing_combat_mismatches: number | string;
  ledger_result_mismatches: number | string;
}

export interface CombatFragBaselineReadiness {
  activeMappedCharacters: number;
  missingCombatBaselines: number;
  reconstructableCombatBaselines: number;
  ambiguousCombatBaselines: number;
  missingWalletBaselines: number;
  missingEpicBaselines: number;
  existingCombatMismatches: number;
  ledgerResultMismatches: number;
}

/** Parse one non-negative aggregate returned by the readiness query. */
function aggregate(value: number | string | undefined, label: string): number {
  const parsed = Number(value ?? 0);
  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    throw new Error(`combat baseline aggregate ${label} is invalid`);
  }
  return parsed;
}

/**
 * Inspect active account-mapped characters without returning a PID, account,
 * character, frag total, or proposed opening value.
 */
export async function readCombatFragBaselineReadiness(
  database: Pick<Pool, 'query'>,
): Promise<CombatFragBaselineReadiness> {
  const [rows] = await database.query<CombatFragBaselineRow[]>(`
    WITH active_players AS (
      SELECT DISTINCT pd.pid, pd.frags, pd.frag_revision
      FROM player_data pd
      INNER JOIN account_characters ac
        ON ac.pid = pd.pid AND ac.deleted_at IS NULL
      INNER JOIN accounts account_row ON account_row.account_name = ac.account_name
    ),
    ordered_ledger AS (
      SELECT
        ledger.pid,
        ledger.frag_revision,
        ledger.delta,
        ledger.frags_after,
        COALESCE(
          SUM(ledger.delta) OVER (
            PARTITION BY ledger.pid
            ORDER BY ledger.frag_revision
            ROWS BETWEEN 1 FOLLOWING AND UNBOUNDED FOLLOWING
          ),
          0
        ) AS later_delta
      FROM combat_frag_ledger ledger
      INNER JOIN active_players player ON player.pid = ledger.pid
    ),
    ledger_summary AS (
      SELECT
        ledger.pid,
        COUNT(*) AS ledger_count,
        COUNT(DISTINCT ledger.frag_revision) AS distinct_revisions,
        MIN(ledger.frag_revision) AS minimum_revision,
        MAX(ledger.frag_revision) AS maximum_revision,
        SUM(ledger.delta) AS ledger_delta,
        SUM(ledger.frags_after <> player.frags - ledger.later_delta) AS result_mismatches
      FROM ordered_ledger ledger
      INNER JOIN active_players player ON player.pid = ledger.pid
      GROUP BY ledger.pid
    ),
    classified AS (
      SELECT
        player.pid,
        player.frags,
        player.frag_revision,
        combat.pid AS combat_baseline_pid,
        combat.opening_frags,
        combat.opening_revision,
        wallet.pid AS wallet_baseline_pid,
        epic.pid AS epic_baseline_pid,
        COALESCE(summary.ledger_count, 0) AS ledger_count,
        COALESCE(summary.distinct_revisions, 0) AS distinct_revisions,
        COALESCE(summary.minimum_revision, 0) AS minimum_revision,
        COALESCE(summary.maximum_revision, 0) AS maximum_revision,
        COALESCE(summary.ledger_delta, 0) AS ledger_delta,
        COALESCE(summary.result_mismatches, 0) AS result_mismatches,
        CASE
          WHEN COALESCE(summary.ledger_count, 0) = 0 THEN 1
          WHEN summary.distinct_revisions = summary.ledger_count
            AND summary.maximum_revision = player.frag_revision
            AND summary.maximum_revision - summary.minimum_revision + 1 = summary.ledger_count
            AND summary.result_mismatches = 0
          THEN 1
          ELSE 0
        END AS reconstructable
      FROM active_players player
      LEFT JOIN combat_frag_baseline combat ON combat.pid = player.pid
      LEFT JOIN currency_wallet_baseline wallet ON wallet.pid = player.pid
      LEFT JOIN epic_balance_baseline epic ON epic.pid = player.pid
      LEFT JOIN ledger_summary summary ON summary.pid = player.pid
    )
    SELECT
      COUNT(*) AS active_mapped_characters,
      COALESCE(SUM(combat_baseline_pid IS NULL), 0) AS missing_combat_baselines,
      COALESCE(SUM(combat_baseline_pid IS NULL AND reconstructable = 1), 0)
        AS reconstructable_combat_baselines,
      COALESCE(SUM(combat_baseline_pid IS NULL AND reconstructable = 0), 0)
        AS ambiguous_combat_baselines,
      COALESCE(SUM(wallet_baseline_pid IS NULL), 0) AS missing_wallet_baselines,
      COALESCE(SUM(epic_baseline_pid IS NULL), 0) AS missing_epic_baselines,
      COALESCE(SUM(
        combat_baseline_pid IS NOT NULL AND (
          opening_frags + ledger_delta <> frags
          OR opening_revision + ledger_count <> frag_revision
          OR (
            ledger_count > 0 AND NOT (
              distinct_revisions = ledger_count
              AND minimum_revision = opening_revision + 1
              AND maximum_revision = frag_revision
              AND maximum_revision - minimum_revision + 1 = ledger_count
            )
          )
        )
      ), 0) AS existing_combat_mismatches,
      COALESCE(SUM(result_mismatches), 0) AS ledger_result_mismatches
    FROM classified
  `);
  const row = rows[0];
  return {
    activeMappedCharacters: aggregate(row?.active_mapped_characters, 'activeMappedCharacters'),
    missingCombatBaselines: aggregate(row?.missing_combat_baselines, 'missingCombatBaselines'),
    reconstructableCombatBaselines: aggregate(
      row?.reconstructable_combat_baselines,
      'reconstructableCombatBaselines',
    ),
    ambiguousCombatBaselines: aggregate(
      row?.ambiguous_combat_baselines,
      'ambiguousCombatBaselines',
    ),
    missingWalletBaselines: aggregate(row?.missing_wallet_baselines, 'missingWalletBaselines'),
    missingEpicBaselines: aggregate(row?.missing_epic_baselines, 'missingEpicBaselines'),
    existingCombatMismatches: aggregate(
      row?.existing_combat_mismatches,
      'existingCombatMismatches',
    ),
    ledgerResultMismatches: aggregate(row?.ledger_result_mismatches, 'ledgerResultMismatches'),
  };
}

/** Fail every baseline or immutable-ledger completeness gap. */
export function validateCombatFragBaselineReadiness(
  readiness: CombatFragBaselineReadiness,
): string[] {
  const issues: string[] = [];
  if (
    readiness.reconstructableCombatBaselines + readiness.ambiguousCombatBaselines !==
    readiness.missingCombatBaselines
  ) {
    issues.push('missing combat baseline classifications do not reconcile');
  }
  const checks: [number, string][] = [
    [readiness.missingCombatBaselines, 'active mapped characters lack combat baselines'],
    [readiness.missingWalletBaselines, 'active mapped characters lack wallet baselines'],
    [readiness.missingEpicBaselines, 'active mapped characters lack epic baselines'],
    [readiness.existingCombatMismatches, 'existing combat baselines do not reconcile'],
    [readiness.ledgerResultMismatches, 'combat ledger results do not reconcile'],
  ];
  for (const [count, label] of checks) {
    if (count !== 0) issues.push(`${count} ${label}`);
  }
  return issues;
}
