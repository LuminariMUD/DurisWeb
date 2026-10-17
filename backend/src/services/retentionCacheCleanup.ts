import { performance } from 'node:perf_hooks';

let activeClient: typeof import('../db/redis.js')['default'] | undefined;

/** The standalone CLI owns shutdown; application callers keep their shared client. */
export function closeRetentionCacheClient(): void {
  activeClient?.disconnect();
  activeClient = undefined;
}

export class RetentionCacheError extends Error {
  constructor() {
    super('Analytics cache removal could not be confirmed');
    this.name = 'RetentionCacheError';
  }
}
function bounded<T>(operation: Promise<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new RetentionCacheError()), 5000);
    operation.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      () => {
        clearTimeout(timer);
        reject(new RetentionCacheError());
      },
    );
  });
}
/** Analytics cache writers are retired; a complete SCAN confirms the remaining old namespace is clear. */
export async function cleanupRetiredAnalyticsCache(
  cursor: string,
  budgetMs: number,
  priorServerId: string | null = null,
): Promise<{ cursor: string; complete: boolean; removed: number; serverId: string }> {
  if (!/^(0|[1-9][0-9]{0,19})$/.test(cursor) || BigInt(cursor) > 18446744073709551615n)
    throw new RetentionCacheError();
  if (!Number.isFinite(budgetMs) || budgetMs <= 0 || budgetMs > 10000)
    throw new RetentionCacheError();
  const deadline = performance.now() + budgetMs;
  let current = cursor,
    removed = 0;
  try {
    const redis = (await import('../db/redis.js')).default;
    activeClient = redis;
    const serverId = /^run_id:([a-f0-9]{40})\r?$/m.exec(await bounded(redis.info('server')))?.[1];
    if (!serverId || (priorServerId !== null && !/^[a-f0-9]{40}$/.test(priorServerId)))
      throw new RetentionCacheError();
    if (priorServerId !== serverId) current = '0';
    if (performance.now() >= deadline)
      return { cursor: current, complete: false, removed, serverId };
    do {
      const [next, keys] = await bounded(
        redis.scan(current, 'MATCH', 'web_analytics:*', 'COUNT', 100),
      );
      if (
        !/^(0|[1-9][0-9]{0,19})$/.test(next) ||
        BigInt(next) > 18446744073709551615n ||
        keys.length > 1000 ||
        keys.some((key) => !key.startsWith('web_analytics:') || Buffer.byteLength(key) > 65536)
      )
        throw new RetentionCacheError();
      // SCAN COUNT is a hint, so bound each mutation independently.
      for (let index = 0; index < keys.length; index += 100) {
        if (performance.now() >= deadline)
          return { cursor: '0', complete: false, removed, serverId };
        removed += await bounded(redis.del(...keys.slice(index, index + 100)));
      }
      current = next;
      if (current === '0') return { cursor: current, complete: true, removed, serverId };
    } while (performance.now() < deadline);
    return { cursor: current, complete: false, removed, serverId };
  } catch {
    throw new RetentionCacheError();
  }
}
