import { afterEach, describe, expect, it, jest } from '@jest/globals';
import {
  archiveWorkerIsGone,
  captureArchiveWorker,
  validArchiveWorkerIdentity,
} from '../archiveWorkerIdentity.js';
import { inspectManagedArchive } from '../managedArchiveTarget.js';

afterEach(() => {
  jest.restoreAllMocks();
});
(process.platform === 'linux' ? describe : describe.skip)(
  'local archive worker recovery identity',
  () => {
    it('recognizes its live process using only a zero-signal existence check', async () => {
      const identity = await captureArchiveWorker(process.pid);
      const signal = jest.spyOn(process, 'kill');
      expect(validArchiveWorkerIdentity(identity)).toBe(true);
      expect(await archiveWorkerIsGone(identity)).toBe(false);
      expect(signal.mock.calls).toEqual([[process.pid, 0]]);
    });
    it('distinguishes a reused process identifier by its original start ticks', async () => {
      const identity = await captureArchiveWorker(process.pid);
      const signal = jest.spyOn(process, 'kill');
      expect(
        await archiveWorkerIsGone({
          ...identity,
          startTicks: (BigInt(identity.startTicks) + 1n).toString(),
        }),
      ).toBe(true);
      expect(signal.mock.calls).toEqual([[process.pid, 0]]);
    });
    it('refuses an unknown boot/namespace without probing or signalling that PID', async () => {
      const identity = await captureArchiveWorker(process.pid);
      const signal = jest.spyOn(process, 'kill');
      await expect(
        archiveWorkerIsGone({ ...identity, domainSha256: '0'.repeat(64) }),
      ).rejects.toThrow('unverified');
      expect(signal).not.toHaveBeenCalled();
    });
    it('rejects process-group identities and unsupported filesystem semantics', async () => {
      const identity = await captureArchiveWorker(process.pid);
      expect(validArchiveWorkerIdentity({ ...identity, pid: 0 })).toBe(false);
      expect(validArchiveWorkerIdentity({ ...identity, pid: -1 })).toBe(false);
      expect(() => inspectManagedArchive('/proc', 'duris-mud-no-file.zip')).toThrow(
        expect.objectContaining({ reason: 'recovery_unverified' }),
      );
    });
  },
);
