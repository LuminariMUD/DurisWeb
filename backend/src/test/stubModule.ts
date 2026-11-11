import { readFileSync } from 'node:fs';
import { jest } from '@jest/globals';

/**
 * Build a `jest.unstable_mockModule` factory that stubs every runtime export declared in a
 * module's TypeScript source (`export function|function*|const|let|class` and value
 * `export { … }` lists), then applies overrides.
 * Stubs reject when called, so an unexpected dependency fails loudly instead of touching
 * a real database, cache, filesystem or process.
 */
export function stubModule(moduleUrl: URL, overrides: Record<string, unknown> = {}) {
  const source = readFileSync(new URL(moduleUrl.href.replace(/\.js$/, '.ts')), 'utf8');
  const declared = [
    ...source.matchAll(/^export (?:async )?(?:function\*?|const|let|class) (\w+)/gm),
  ];
  // Value re-exports (`export { a, b as c } from './x.js'`); type-only lists carry no runtime name.
  const reexported = [...source.matchAll(/^export \{([^}]*)\}/gm)].flatMap(([, list]) =>
    list
      .split(',')
      .map((entry) => entry.trim())
      .filter((entry) => entry && !entry.startsWith('type '))
      .map((entry) => [entry, entry.split(/\s+as\s+/).pop()!]),
  );
  const names = [...declared, ...reexported];
  const unexpected = async () => {
    throw new Error(`unexpected call into stubbed ${moduleUrl.pathname}`);
  };
  const stubs = Object.fromEntries(names.map(([, name]) => [name, jest.fn(unexpected)]));
  return () => ({ default: {}, ...stubs, ...overrides });
}
