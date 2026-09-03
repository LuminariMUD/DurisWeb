import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from '@jest/globals';

const testDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(testDirectory, '../../../..');

function read(relativePath: string): string {
  return fs.readFileSync(path.join(repositoryRoot, relativePath), 'utf8');
}

describe('wiki object publication contract', () => {
  it('exposes a supported package command with required source identity', () => {
    const packageJson = JSON.parse(read('backend/package.json')) as {
      scripts: Record<string, string>;
    };
    const importer = read('backend/scripts/import-wiki-data.ts');

    expect(packageJson.scripts['wiki:publish']).toContain('scripts/import-wiki-data.ts');
    expect(importer).toContain('--source-revision');
    expect(importer).toContain('--source-tree');
  });

  it('publishes the source marker before committing the same transaction', () => {
    const importer = read('backend/scripts/import-wiki-data.ts');
    const publish = importer.indexOf('connection.query(PUBLISH_GENERATION_SQL');
    const commit = importer.indexOf('connection.commit()', publish);

    expect(publish).toBeGreaterThanOrEqual(0);
    expect(commit).toBeGreaterThan(publish);
    expect(importer).toContain('refusing to publish an empty generation');
    expect(importer).toContain('await connection.rollback()');
  });

  it('returns a stable unavailable response instead of a successful empty search', () => {
    const routes = read('backend/src/routes/wiki.ts');
    const objectList = routes.slice(
      routes.indexOf("'/objects'"),
      routes.indexOf("'/objects/:vnum'"),
    );

    expect(objectList).toContain('getWikiObjectReferenceIssues');
    expect(objectList).toContain('res.status(503)');
    expect(objectList).toContain("code: 'WIKI_OBJECT_REFERENCE_UNAVAILABLE'");
  });
});
