import { parseWikiSourceIdentity, type WikiSourceIdentity } from './wikiGeneration.js';
import type { WikiPublicationRows } from './wikiPublication.js';

export interface WikiPublicationCommandDependencies {
  readonly sourceDirectory: string;
  readonly stage: (
    sourceIdentity: WikiSourceIdentity,
    sourceDirectory: string,
  ) => Promise<WikiPublicationRows>;
  readonly publish: (
    sourceIdentity: WikiSourceIdentity,
    staged: WikiPublicationRows,
  ) => Promise<void>;
}

/** Parse command identity, stage its immutable snapshot, and pass both to the writer. */
export async function runWikiPublicationCommand(
  args: string[],
  dependencies: WikiPublicationCommandDependencies,
): Promise<WikiPublicationRows> {
  const sourceIdentity = parseWikiSourceIdentity(args);
  const staged = await dependencies.stage(sourceIdentity, dependencies.sourceDirectory);
  await dependencies.publish(sourceIdentity, staged);
  return staged;
}
