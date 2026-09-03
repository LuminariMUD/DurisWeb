import { describe, expect, it } from '@jest/globals';

import {
  parseWikiSourceIdentity,
  type WikiMobGenerationRow,
  type WikiObjectGenerationRow,
  validateWikiMobGeneration,
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
    object_type_count: 4,
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
      object_type_count: 0,
      orphan_slots: 1,
    });

    expect(issues).toEqual([
      'wiki object reference generation has no source identity',
      'wiki object reference count drifted (published 25, current 24)',
      'wiki object reference generation has no applicable type metadata',
      'wiki object reference generation has inconsistent child rows',
    ]);
  });
});

function validMobRow(): WikiMobGenerationRow {
  return {
    source_revision: SOURCE_REVISION,
    source_tree: SOURCE_TREE,
    mob_count: 12,
    actual_mob_count: 12,
    orphan_flags: 0,
  } as WikiMobGenerationRow;
}

describe('wiki mob generation readiness', () => {
  it('accepts a nonempty, identified, internally consistent generation', () => {
    expect(validateWikiMobGeneration(validMobRow())).toEqual([]);
  });

  it('rejects unpublished, empty, drifted, and inconsistent generations', () => {
    expect(validateWikiMobGeneration(null)).toContain(
      'wiki mob reference generation has not been published',
    );
    expect(validateWikiMobGeneration({ ...validMobRow(), mob_count: 0 })).toContain(
      'wiki mob reference generation is empty',
    );
    expect(
      validateWikiMobGeneration({
        ...validMobRow(),
        source_revision: '',
        actual_mob_count: 11,
        orphan_flags: 1,
      }),
    ).toEqual([
      'wiki mob reference generation has no source identity',
      'wiki mob reference count drifted (published 12, current 11)',
      'wiki mob reference generation has inconsistent flag rows',
    ]);
  });
});
