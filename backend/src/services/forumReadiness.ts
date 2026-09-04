import type { Pool, RowDataPacket } from 'mysql2/promise';

interface ForumReadinessRow extends RowDataPacket {
  active_categories: number | string;
  usable_root_categories: number | string;
}

export interface ForumReadiness {
  activeCategories: number;
  usableRootCategories: number;
}

/** Read only aggregate forum readiness; category names and ACL details stay private. */
export async function readForumReadiness(database: Pick<Pool, 'query'>): Promise<ForumReadiness> {
  const [rows] = await database.query<ForumReadinessRow[]>(`
    SELECT
      COUNT(*) AS active_categories,
      SUM(
        CASE
          WHEN parent_id IS NULL AND access_type IN ('public', 'authenticated') THEN 1
          ELSE 0
        END
      ) AS usable_root_categories
    FROM forum_categories
    WHERE is_archived = 0
  `);
  return {
    activeCategories: Number(rows[0]?.active_categories ?? 0),
    usableRootCategories: Number(rows[0]?.usable_root_categories ?? 0),
  };
}

/** A forum is ready only when ordinary users can enter a non-archived root category. */
export function validateForumReadiness(readiness: ForumReadiness): string[] {
  const active = readiness.activeCategories;
  const usable = readiness.usableRootCategories;
  if (!Number.isSafeInteger(active) || !Number.isSafeInteger(usable) || usable <= 0) {
    return [
      'forum has no usable public or authenticated root category; run pnpm forum:bootstrap or provision one in the admin UI',
    ];
  }
  return [];
}
