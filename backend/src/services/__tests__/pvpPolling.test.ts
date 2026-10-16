import { describe, expect, it, jest } from '@jest/globals';
import { createPvpPoller, PVP_POLL_BATCH_SIZE, PVP_POLL_INTERVAL_MS } from '../pvpPolling.js';
import type { PvPEventListItem } from '../../types/index.js';

const stamp = '2020-01-01T00:00:00.000Z';
const event = (id: number): PvPEventListItem => ({
  id,
  stamp,
  room_name: 'Fixture',
  room_vnum: 1,
  killers: [],
  victims: [],
  killer_count: 0,
  victim_count: 0,
  like_count: 0,
  comment_count: 0,
});

describe('released battle polling', () => {
  it('drains a burst beyond one page and advances across identical timestamps without replay', async () => {
    const events = Array.from({ length: PVP_POLL_BATCH_SIZE + 3 }, (_, i) => event(i + 1));
    const fetch = jest.fn(async (cursor: { id: number }, limit: number) =>
      events.filter((e) => e.id > cursor.id).slice(0, limit),
    );
    const publish = jest.fn(async (_event: PvPEventListItem) => {});
    const poll = createPvpPoller({ id: 0, stamp }, fetch, publish);
    await poll();
    await poll();
    expect(publish.mock.calls.map(([e]) => e.id)).toEqual(events.map((e) => e.id));
    expect(fetch.mock.calls).toHaveLength(3);
    // Restart/reconnect starts from the current visible cursor, not the first historical row.
    await createPvpPoller(events.at(-1)!, fetch, publish)();
    expect(publish).toHaveBeenCalledTimes(events.length);
  });

  it('ignores overlapping ticks and releases its lock after a query failure', async () => {
    let finish!: (events: PvPEventListItem[]) => void;
    const fetch = jest
      .fn<() => Promise<PvPEventListItem[]>>()
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            finish = resolve;
          }),
      )
      .mockRejectedValueOnce(new Error('temporary failure'))
      .mockResolvedValue([]);
    const publish = jest.fn(async (_event: PvPEventListItem) => {});
    const poll = createPvpPoller({ id: 0, stamp }, fetch, publish);
    const first = poll();
    await poll();
    expect(fetch).toHaveBeenCalledTimes(1);
    finish([event(1)]);
    await first;
    await expect(poll()).rejects.toThrow('temporary failure');
    await poll();
    expect(publish).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledTimes(3);
    expect(PVP_POLL_INTERVAL_MS).toBeGreaterThanOrEqual(1000);
  });
});
