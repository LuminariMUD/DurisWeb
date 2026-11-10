import { describe, expect, it, jest } from '@jest/globals';
import type { WebSocketServer } from 'ws';
import { stubModule } from '../../test/stubModule.js';

// Every job body and integration is synthetic: only ownership of start/stop is exercised.
const calls: string[] = [];
const note =
  (name: string) =>
  async (..._args: unknown[]) => {
    calls.push(name);
  };
const stub = (specifier: string, overrides?: Record<string, unknown>) =>
  jest.unstable_mockModule(specifier, stubModule(new URL(specifier, import.meta.url), overrides));

stub('../../db/connection.js', { pool: {}, mudPool: {} });
stub('../../services/pvpPolling.js', {
  PVP_POLL_INTERVAL_MS: 15_000,
  createPvpPoller: () => async () => undefined,
});
stub('../../services/pvpService.js', { getLatestReleasedEvent: async () => null });
stub('../../services/pvpDiscordDelivery.js', { pollDiscordDeliveries: async () => undefined });
stub('../../services/guildSyncService.js', {
  startGuildSync: note('start guild'),
  stopGuildSync: note('stop guild'),
});
stub('../../services/serverHealthService.js', {
  startHealthMonitoring: note('start health'),
  stopHealthMonitoring: note('stop health'),
  updateWebSocketCount: () => undefined,
});
stub('../../utils/geoip.js', { initializeGeoIP: async () => undefined });
stub('../../services/backupService.js', {
  setProgressBroadcaster: () => undefined,
  startHourlyBackupScheduler: note('start backup cron'),
  stopHourlyBackupScheduler: note('stop backup cron'),
});
stub('../../services/mudControlService.js', {
  setStateBroadcaster: () => undefined,
  setOutputBroadcaster: () => undefined,
});
stub('../../services/mudAuctionClient.js', {
  setAuctionBroadcaster: () => undefined,
  startMudAuctionClient: note('start auction'),
  stopMudAuctionClient: note('stop auction'),
});
stub('../../services/playerEventSubscriber.js', {
  setPlayerEventBroadcaster: () => undefined,
  startPlayerEventSubscriber: note('start player events'),
  stopPlayerEventSubscriber: note('stop player events'),
});
stub('../../services/donationOutboxService.js', {
  startDonationOutboxPublisher: note('start donations'),
  stopDonationOutboxPublisher: note('stop donations'),
});
stub('../../hooks/hookToggleJournal.js', {
  startHookAuditWorker: note('start hook audit'),
  stopHookAuditWorker: note('stop hook audit'),
});
stub('../../services/unifiedNotificationService.js', {
  setNotificationBroadcaster: () => undefined,
  setNewsBroadcaster: () => undefined,
});
stub('../../services/postImageService.js');
stub('../../realtime/broadcasts.js');

const { startBackgroundJobs } = await import('../backgroundJobs.js');
type Jobs = import('../backgroundJobs.js').BackgroundJobs;
const wss = { clients: new Set() } as unknown as WebSocketServer;

describe('background jobs', () => {
  it('starts once, refuses a duplicate start, and clears every interval it owns', async () => {
    jest.useFakeTimers();
    const created = jest.spyOn(global, 'setInterval');
    const cleared = jest.spyOn(global, 'clearInterval');
    const intervals = () => created.mock.results.map((result) => result.value);
    try {
      let jobs: Jobs | undefined;
      await startBackgroundJobs(wss, (handle) => {
        jobs = handle;
      });
      // PvP events, frags, Discord delivery, socket count, orphan-image cleanup.
      expect(created.mock.calls.map(([, delay]) => delay)).toEqual([
        15_000, 15_000, 15_000, 10_000, 3_600_000,
      ]);
      await expect(startBackgroundJobs(wss, () => undefined)).rejects.toThrow(
        'Background jobs are already started',
      );
      expect(created).toHaveBeenCalledTimes(5);
      expect(calls.filter((call) => call === 'start health')).toHaveLength(1);

      calls.length = 0;
      await jobs?.stopProducers();
      await jobs?.stopProducers();
      expect(cleared.mock.calls.map(([interval]) => interval)).toEqual(intervals());
      expect(calls).toEqual(
        expect.arrayContaining(['stop health', 'stop backup cron', 'stop auction']),
      );
      expect(calls.filter((call) => call === 'stop backup cron')).toHaveLength(1);

      await jobs?.stopWorkers();
      expect(calls).toContain('stop hook audit');

      // Fully stopped jobs may be started again by a later startup.
      created.mockClear();
      cleared.mockClear();
      await startBackgroundJobs(wss, (handle) => {
        jobs = handle;
      });
      await jobs?.stopProducers();
      await jobs?.stopWorkers();
      expect(cleared.mock.calls.map(([interval]) => interval)).toEqual(intervals());
    } finally {
      created.mockRestore();
      cleared.mockRestore();
      jest.useRealTimers();
    }
  });
});
