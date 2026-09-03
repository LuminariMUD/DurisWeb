import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from '@jest/globals';

const testDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(testDirectory, '../../../..');

describe('wiki mob API readiness contract', () => {
  it('returns a stable unavailable response instead of a successful empty search', () => {
    const routes = fs.readFileSync(path.join(repositoryRoot, 'backend/src/routes/wiki.ts'), 'utf8');
    const mobList = routes.slice(routes.indexOf("'/mobs'"), routes.indexOf("'/mobs/:zoneNumber"));

    expect(mobList).toContain('getWikiMobReferenceIssues');
    expect(mobList).toContain('res.status(503)');
    expect(mobList).toContain("code: 'WIKI_MOB_REFERENCE_UNAVAILABLE'");
  });
});
