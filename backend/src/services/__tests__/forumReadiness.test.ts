import { describe, expect, it, jest } from '@jest/globals';

import { readForumReadiness, validateForumReadiness } from '../forumReadiness.js';

describe('forum readiness', () => {
  it('rejects an empty forum', () => {
    expect(validateForumReadiness({ activeCategories: 0, usableRootCategories: 0 })).toEqual([
      expect.stringContaining('forum:bootstrap'),
    ]);
  });

  it('rejects active categories that ordinary users cannot enter', () => {
    expect(validateForumReadiness({ activeCategories: 3, usableRootCategories: 0 })).toEqual([
      expect.stringContaining('no usable public or authenticated root category'),
    ]);
  });

  it('accepts at least one usable root category', () => {
    expect(validateForumReadiness({ activeCategories: 4, usableRootCategories: 1 })).toEqual([]);
  });

  it('counts only non-archived public or authenticated root categories as usable', async () => {
    const query = jest
      .fn<(...args: unknown[]) => Promise<unknown>>()
      .mockResolvedValue([[{ active_categories: '4', usable_root_categories: '2' }], []]);

    await expect(readForumReadiness({ query } as never)).resolves.toEqual({
      activeCategories: 4,
      usableRootCategories: 2,
    });

    const sql = String(query.mock.calls[0]?.[0]);
    expect(sql).toContain("parent_id IS NULL AND access_type IN ('public', 'authenticated')");
    expect(sql).toContain('WHERE is_archived = 0');
  });
});
