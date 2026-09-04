import { describe, expect, it } from '@jest/globals';

import {
  parseWikiSourceIdentity,
  type WikiObjectGenerationRow,
  validateWikiObjectGeneration,
} from '../wikiGeneration.js';

const SOURCE_REVISION = 'a'.repeat(40);
const SOURCE_TREE = 'b'.repeat(40);

function validRow(): WikiObjectGenerationRow {
  return {
    source_revision: SOURCE_REVISION,
    source_tree: SOURCE_TREE,
    object_count: 25,
    actual_object_count: 25,
    orphan_affects: 0,
    orphan_slots: 0,
    orphan_spell_effects: 0,
    orphan_classes: 0,
    orphan_races: 0,
  } as WikiObjectGenerationRow;
}

describe('wiki object generation readiness', () => {
  it('accepts complete Git identities and rejects abbreviated prefixes', () => {
    expect(
      parseWikiSourceIdentity([
        '--source-revision',
        SOURCE_REVISION.toUpperCase(),
        '--source-tree',
        SOURCE_TREE.toUpperCase(),
      ]),
    ).toEqual({ revision: SOURCE_REVISION, tree: SOURCE_TREE });
    expect(() =>
      parseWikiSourceIdentity([
        '--source-revision',
        SOURCE_REVISION.slice(0, 7),
        '--source-tree',
        SOURCE_TREE.slice(0, 7),
      ]),
    ).toThrow('full-git-commit');
  });

  it('accepts a nonempty, identified, internally consistent generation', () => {
    expect(validateWikiObjectGeneration(validRow())).toEqual([]);
  });

  it('rejects an unpublished or empty generation', () => {
    expect(validateWikiObjectGeneration(null)).toContain(
      'wiki object reference generation has not been published',
    );
    expect(validateWikiObjectGeneration({ ...validRow(), object_count: 0 })).toContain(
      'wiki object reference generation is empty',
    );
  });

  it('rejects count drift, missing identity, and orphaned child rows', () => {
    const issues = validateWikiObjectGeneration({
      ...validRow(),
      source_tree: 'invalid',
      actual_object_count: 24,
      orphan_slots: 1,
    });

    expect(issues).toEqual([
      'wiki object reference generation has no source identity',
      'wiki object reference count drifted (published 25, current 24)',
      'wiki object reference generation has inconsistent child rows',
    ]);
  });
});
