import { describe, expect, it, jest } from '@jest/globals';

import {
  runWikiPublicationCommand,
  type WikiPublicationCommandDependencies,
} from '../wikiPublicationCommand.js';
import { createWikiPublicationRows } from '../wikiPublication.js';

const SOURCE_REVISION = 'a'.repeat(40);
const SOURCE_TREE = 'b'.repeat(40);

describe('wiki publication command', () => {
  it('passes normalized source identity from the command through staging and publication', async () => {
    const staged = createWikiPublicationRows();
    staged.wiki_objects.push([101]);
    staged.wiki_mobs.push([7, 201]);
    const stage = jest.fn<WikiPublicationCommandDependencies['stage']>().mockResolvedValue(staged);
    const publish = jest.fn<WikiPublicationCommandDependencies['publish']>().mockResolvedValue();
    const dependencies = {
      sourceDirectory: '/synthetic/mud',
      stage,
      publish,
    } satisfies WikiPublicationCommandDependencies;

    const result = await runWikiPublicationCommand(
      [
        '--source-revision',
        SOURCE_REVISION.toUpperCase(),
        '--source-tree',
        SOURCE_TREE.toUpperCase(),
      ],
      dependencies,
    );

    const identity = { revision: SOURCE_REVISION, tree: SOURCE_TREE };
    expect(result).toBe(staged);
    expect(stage).toHaveBeenCalledWith(identity, '/synthetic/mud');
    expect(publish).toHaveBeenCalledWith(identity, staged);
  });
});
