import { getNamedEquipment } from '../../services/onlinePlayersService.js';
import logger from '../../utils/logger.js';
import { parseNamedReport, type NamedSetReport } from './parser.js';

/** The MUD rebuilds the report at boot and on demand; it changes only with a MUD release. */
const AVAILABLE_TTL_MS = 5 * 60_000;
/** Recheck soon after a miss: a player running `namedreport` repopulates the cache. */
const UNAVAILABLE_TTL_MS = 15_000;

export type NamedSetLookup =
  | { status: 'available'; report: NamedSetReport; fetchedAt: string }
  | { status: 'unavailable' };

let cached: { value: NamedSetLookup; expiresAt: number } | undefined;
let pending: Promise<NamedSetLookup> | undefined;

async function readReport(): Promise<NamedSetLookup> {
  const raw = await getNamedEquipment();
  if (!raw) return { status: 'unavailable' };
  const report = parseNamedReport(raw);
  if (!report) {
    logger.warn('[NamedSets] cached namedreport did not match the expected format');
    return { status: 'unavailable' };
  }
  return { status: 'available', report, fetchedAt: new Date().toISOString() };
}

/** Read the MUD's cached named-set report, shared across concurrent public requests. */
export function getNamedSetReport(): Promise<NamedSetLookup> {
  if (cached && performance.now() < cached.expiresAt) return Promise.resolve(cached.value);
  pending ??= readReport()
    .catch((error: unknown): NamedSetLookup => {
      logger.error('[NamedSets] failed to read cached namedreport:', error);
      return { status: 'unavailable' };
    })
    .then((value) => {
      const ttl = value.status === 'available' ? AVAILABLE_TTL_MS : UNAVAILABLE_TTL_MS;
      cached = { value, expiresAt: performance.now() + ttl };
      return value;
    })
    .finally(() => {
      pending = undefined;
    });
  return pending;
}
