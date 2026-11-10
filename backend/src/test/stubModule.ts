import { readFileSync } from 'node:fs';
import { jest } from '@jest/globals';

/**
 * Build a `jest.unstable_mockModule` factory that stubs every runtime export declared in a
 * module's TypeScript source (`export function|function*|const|let|class`), then applies overrides.
 * Stubs reject when called, so an unexpected dependency fails loudly instead of touching
 * a real database, cache, filesystem or process.
 */
export function stubModule(moduleUrl: URL, overrides: Record<string, unknown> = {}) {
  const source = readFileSync(new URL(moduleUrl.href.replace(/\.js$/, '.ts')), 'utf8');
  const names = [...source.matchAll(/^export (?:async )?(?:function\*?|const|let|class) (\w+)/gm)];
  const unexpected = async () => {
    throw new Error(`unexpected call into stubbed ${moduleUrl.pathname}`);
  };
  const stubs = Object.fromEntries(names.map(([, name]) => [name, jest.fn(unexpected)]));
  return () => ({ default: {}, ...stubs, ...overrides });
}
