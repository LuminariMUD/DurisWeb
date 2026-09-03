import { describe, expect, it } from '@jest/globals';

import { validateForumReadiness } from '../forumReadiness.js';

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
});
