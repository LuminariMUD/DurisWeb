import type { Pool, RowDataPacket } from 'mysql2/promise';

const FULL_GIT_OBJECT_ID = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/i;

export interface WikiSourceIdentity {
  revision: string;
  tree: string;
}

/** Parse only complete SHA-1 or SHA-256 identities so exact checkout comparison is meaningful. */
export function parseWikiSourceIdentity(args: readonly string[]): WikiSourceIdentity {
  if (
    args.length !== 4 ||
    args[0] !== '--source-revision' ||
    args[2] !== '--source-tree' ||
    !FULL_GIT_OBJECT_ID.test(args[1] ?? '') ||
    !FULL_GIT_OBJECT_ID.test(args[3] ?? '')
  ) {
    throw new Error(
      'expected --source-revision <full-git-commit> --source-tree <full-git-tree>; obtain both from the selected clean MUD checkout',
    );
  }
  return { revision: args[1].toLowerCase(), tree: args[3].toLowerCase() };
}

export interface WikiObjectGenerationRow extends RowDataPacket {
  source_revision: string;
  source_tree: string;
  object_count: number | string;
  actual_object_count: number | string;
  object_type_count: number | string;
  orphan_affects: number | string;
  orphan_slots: number | string;
  orphan_spell_effects: number | string;
  orphan_classes: number | string;
  orphan_races: number | string;
}

export interface WikiMobGenerationRow extends RowDataPacket {
  source_revision: string;
  source_tree: string;
  mob_count: number | string;
  actual_mob_count: number | string;
  orphan_flags: number | string;
}

/** Return aggregate-only object generation evidence without exposing source paths or content. */
export async function readWikiObjectGeneration(
  database: Pick<Pool, 'query'>,
): Promise<WikiObjectGenerationRow | null> {
  const [rows] = await database.query<WikiObjectGenerationRow[]>(`
    SELECT
      g.source_revision,
      g.source_tree,
      g.object_count,
      (SELECT COUNT(*) FROM wiki_objects) AS actual_object_count,
      (SELECT COUNT(DISTINCT type) FROM wiki_objects) AS object_type_count,
      (SELECT COUNT(*) FROM wiki_object_affects a LEFT JOIN wiki_objects o ON o.vnum = a.object_vnum WHERE o.vnum IS NULL) AS orphan_affects,
      (SELECT COUNT(*) FROM wiki_object_slots s LEFT JOIN wiki_objects o ON o.vnum = s.object_vnum WHERE o.vnum IS NULL) AS orphan_slots,
      (SELECT COUNT(*) FROM wiki_object_spell_effects e LEFT JOIN wiki_objects o ON o.vnum = e.object_vnum WHERE o.vnum IS NULL) AS orphan_spell_effects,
      (SELECT COUNT(*) FROM wiki_object_classes c LEFT JOIN wiki_objects o ON o.vnum = c.object_vnum WHERE o.vnum IS NULL) AS orphan_classes,
      (SELECT COUNT(*) FROM wiki_object_races r LEFT JOIN wiki_objects o ON o.vnum = r.object_vnum WHERE o.vnum IS NULL) AS orphan_races
    FROM wiki_reference_generations g
    WHERE g.id = 1
  `);
  return rows[0] ?? null;
}

/** Explain every object-generation readiness failure using aggregate evidence only. */
export function validateWikiObjectGeneration(row: WikiObjectGenerationRow | null): string[] {
  if (!row) return ['wiki object reference generation has not been published'];

  const issues: string[] = [];
  if (!FULL_GIT_OBJECT_ID.test(row.source_revision) || !FULL_GIT_OBJECT_ID.test(row.source_tree)) {
    issues.push('wiki object reference generation has no source identity');
  }
  const expected = Number(row.object_count);
  const actual = Number(row.actual_object_count);
  if (!Number.isSafeInteger(expected) || expected <= 0) {
    issues.push('wiki object reference generation is empty');
  } else if (actual !== expected) {
    issues.push(`wiki object reference count drifted (published ${expected}, current ${actual})`);
  }
  if (!Number.isSafeInteger(Number(row.object_type_count)) || Number(row.object_type_count) <= 0) {
    issues.push('wiki object reference generation has no applicable type metadata');
  }

  const orphanCount =
    Number(row.orphan_affects) +
    Number(row.orphan_slots) +
    Number(row.orphan_spell_effects) +
    Number(row.orphan_classes) +
    Number(row.orphan_races);
  if (!Number.isSafeInteger(orphanCount) || orphanCount !== 0) {
    issues.push('wiki object reference generation has inconsistent child rows');
  }
  return issues;
}

/** Return aggregate-only mob generation evidence without exposing source paths or content. */
export async function readWikiMobGeneration(
  database: Pick<Pool, 'query'>,
): Promise<WikiMobGenerationRow | null> {
  const [rows] = await database.query<WikiMobGenerationRow[]>(`
    SELECT
      g.source_revision,
      g.source_tree,
      g.mob_count,
      (SELECT COUNT(*) FROM wiki_mobs) AS actual_mob_count,
      (SELECT COUNT(*) FROM wiki_mob_flags f LEFT JOIN wiki_mobs m ON m.zone_number = f.zone_number AND m.vnum = f.mob_vnum WHERE m.vnum IS NULL) AS orphan_flags
    FROM wiki_reference_generations g
    WHERE g.id = 1
  `);
  return rows[0] ?? null;
}

/** Explain every mob-generation readiness failure using aggregate evidence only. */
export function validateWikiMobGeneration(row: WikiMobGenerationRow | null): string[] {
  if (!row) return ['wiki mob reference generation has not been published'];

  const issues: string[] = [];
  if (row.source_revision.trim() === '' || row.source_tree.trim() === '') {
    issues.push('wiki mob reference generation has no source identity');
  }
  const expected = Number(row.mob_count);
  const actual = Number(row.actual_mob_count);
  if (!Number.isSafeInteger(expected) || expected <= 0) {
    issues.push('wiki mob reference generation is empty');
  } else if (actual !== expected) {
    issues.push(`wiki mob reference count drifted (published ${expected}, current ${actual})`);
  }
  if (!Number.isSafeInteger(Number(row.orphan_flags)) || Number(row.orphan_flags) !== 0) {
    issues.push('wiki mob reference generation has inconsistent flag rows');
  }
  return issues;
}
