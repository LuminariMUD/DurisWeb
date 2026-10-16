import type { PvPEventListItem } from '../types/index.js';

export const PVP_POLL_INTERVAL_MS = 30_000;
export const PVP_POLL_BATCH_SIZE = 100;

export interface PvpCursor {
  stamp: string;
  id: number;
}

/** Drain released battles serially; a concurrent timer tick cannot repeat a batch. */
export function createPvpPoller(
  initialCursor: PvpCursor,
  fetchEvents: (cursor: PvpCursor, limit: number) => Promise<PvPEventListItem[]>,
  publish: (event: PvPEventListItem) => Promise<void>,
): () => Promise<void> {
  let cursor = initialCursor;
  let running = false;
  return async () => {
    if (running) return;
    running = true;
    try {
      while (true) {
        const events = await fetchEvents(cursor, PVP_POLL_BATCH_SIZE);
        for (const event of events) {
          await publish(event);
          cursor = { stamp: event.stamp, id: event.id };
        }
        if (events.length < PVP_POLL_BATCH_SIZE) break;
      }
    } finally {
      running = false;
    }
  };
}
