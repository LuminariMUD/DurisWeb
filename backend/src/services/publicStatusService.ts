import type { HealthStatus } from './serverHealthService.js';
import logger from '../utils/logger.js';

const SNAPSHOT_TTL_MS = 5000;
const REFRESH_TIMEOUT_MS = 2000;

interface PublicStatusSnapshot extends HealthStatus {
  httpStatus: 200 | 500;
  mudIsRunning: boolean;
  uptimeSeconds: number;
  lastUpdated: Date;
}

let cached: { value: PublicStatusSnapshot; expiresAt: number } | undefined;
let pending: Promise<PublicStatusSnapshot> | undefined;

async function readSnapshot(): Promise<PublicStatusSnapshot> {
  const { getServerHealth, getHealthStatus } = await import('./serverHealthService.js');
  const health = await getServerHealth();
  return {
    ...getHealthStatus(health),
    httpStatus: 200,
    mudIsRunning: health.mudIsRunning,
    uptimeSeconds: health.mudUptimeSeconds,
    lastUpdated: new Date(),
  };
}

/** Share host diagnostics without caching population or changing dependency health. */
export function getPublicStatusSnapshot(): Promise<PublicStatusSnapshot> {
  if (cached && performance.now() < cached.expiresAt) return Promise.resolve(cached.value);
  if (!pending) {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const read = readSnapshot().finally(() => {
      clearTimeout(timer);
      pending = undefined;
    });
    // Retain a timed-out result until the underlying read finishes: repeated
    // polls must not queue more diagnostics behind a stalled dependency.
    pending = Promise.race([
      read,
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(
          () => reject(new Error('Public status refresh timed out')),
          REFRESH_TIMEOUT_MS,
        );
      }),
    ])
      .catch((): PublicStatusSnapshot => {
        logger.warn('Public status refresh unavailable');
        return {
          httpStatus: 500,
          status: 'offline',
          message: 'Unable to determine server status',
          mudIsRunning: false,
          uptimeSeconds: 0,
          lastUpdated: new Date(),
        };
      })
      .then((value) => {
        cached = { value, expiresAt: performance.now() + SNAPSHOT_TTL_MS };
        return value;
      });
  }
  return pending;
}
