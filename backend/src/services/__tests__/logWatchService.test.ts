import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { EventEmitter } from 'node:events';
import type { LogWatchCallback } from '../logWatchService.js';

let content = Buffer.alloc(0);
let reportedSize = 0;
const listeners: Array<(event: string) => void> = [];
class Watcher extends EventEmitter {
  close = jest.fn();
}
const watchers: Watcher[] = [];
const close = jest.fn(async () => undefined);
const closeSync = jest.fn();
function copyRead(buffer: Buffer, offset: number, length: number, position: number): number {
  // Seed every unread byte; this models unsafe memory without sampling real process memory.
  buffer.fill('FAKE_PRIVATE_SENTINEL');
  const part = content.subarray(position, position + length);
  part.copy(buffer, offset);
  return part.length;
}
const read = jest.fn(async (buffer: Buffer, offset: number, length: number, position: number) => ({
  bytesRead: copyRead(buffer, offset, length, position),
}));
const open = jest.fn(async () => ({ stat: async () => ({ size: reportedSize }), read, close }));
jest.unstable_mockModule('node:fs/promises', () => ({ open }));
jest.unstable_mockModule('fs', () => ({
  default: {
    statSync: () => ({ size: reportedSize }),
    watch: (_path: unknown, _options: unknown, listener: (event: string) => void) => {
      listeners.push(listener);
      const watcher = new Watcher();
      watchers.push(watcher);
      return watcher;
    },
    openSync: () => 1,
    readSync: (_fd: number, buffer: Buffer, offset: number, length: number, position: number) =>
      copyRead(buffer, offset, length, position),
    closeSync,
  },
}));
jest.unstable_mockModule('../logService.js', () => ({ getLogFilePath: () => '/synthetic/log' }));
jest.unstable_mockModule('../../utils/logger.js', () => ({
  default: { error: jest.fn(), warn: jest.fn() },
}));
const service = await import('../logWatchService.js');
const { default: logger } = await import('../../utils/logger.js');
const flush = async () => {
  for (let i = 0; i < 20; i++) await new Promise((resolve) => setImmediate(resolve));
};
beforeEach(() => {
  service.cleanupLogWatchers();
  listeners.length = 0;
  watchers.length = 0;
  content = Buffer.alloc(0);
  reportedSize = 0;
  jest.clearAllMocks();
  read.mockReset().mockImplementation(async (buffer, offset, length, position) => ({
    bytesRead: copyRead(buffer, offset, length, position),
  }));
  close.mockReset().mockResolvedValue(undefined);
  open
    .mockReset()
    .mockImplementation(async () => ({ stat: async () => ({ size: reportedSize }), read, close }));
});
afterEach(() => {
  service.cleanupLogWatchers();
});

describe('bounded live-log reader ownership', () => {
  it('sends only actual bytes after a short read, never seeded unwritten bytes', async () => {
    const callback = jest.fn<LogWatchCallback>();
    expect(service.watchLog('runtime', 'synthetic.log', callback)).toBe(true);
    content = Buffer.from('OK\n');
    reportedSize = 32;
    listeners[0]('change');
    await flush();
    expect(callback.mock.calls).toEqual([[['OK']]]);
    expect(service.getLogWatchStats().watchers[0].lastSize).toBe(3);
    expect(close).toHaveBeenCalledTimes(1);
  });
  it('bounds a large append and preserves UTF-8 across chunk boundaries', async () => {
    const callback = jest.fn<LogWatchCallback>();
    service.watchLog('runtime', 'synthetic.log', callback);
    const line = 'x'.repeat(65535) + '€';
    content = Buffer.from(line + '\n' + 'line\n'.repeat(50000));
    reportedSize = content.length;
    listeners[0]('change');
    await flush();
    expect(read.mock.calls.every(([, , length]) => length <= 65536)).toBe(true);
    const lines = callback.mock.calls.flatMap(([lines]) => lines);
    expect(lines[0]).toBe(line);
    expect(lines.slice(1)).toHaveLength(50000);
    expect(lines.every((line) => !line.includes('�'))).toBe(true);
    expect(
      callback.mock.calls.every(
        ([lines]) => Buffer.byteLength(JSON.stringify(lines)) < 1024 * 1024,
      ),
    ).toBe(true);
    expect(service.getLogWatchStats().watchers[0].lastSize).toBe(content.length);
    expect(close).toHaveBeenCalledTimes(1);
  });
  it('closes a failed read and explicitly invalidates the watcher without exposing the error', async () => {
    const callback = jest.fn<LogWatchCallback>();
    service.watchLog('runtime', 'synthetic.log', callback);
    content = Buffer.from('line\n');
    reportedSize = content.length;
    read.mockRejectedValueOnce(new Error('READ_PRIVATE_SENTINEL'));
    listeners[0]('change');
    await flush();
    expect(close).toHaveBeenCalledTimes(1);
    expect(callback.mock.calls).toEqual([[[], 'unavailable']]);
    expect(service.getLogWatchStats().activeWatchers).toBe(0);
    expect(JSON.stringify(jest.mocked(logger.error).mock.calls)).not.toContain(
      'READ_PRIVATE_SENTINEL',
    );
  });
  it('serializes overlapping notifications and reads the queued append once', async () => {
    const callback = jest.fn<LogWatchCallback>();
    service.watchLog('runtime', 'synthetic.log', callback);
    let start: () => void = () => {};
    let release: () => void = () => {};
    const started = new Promise<void>((resolve) => {
      start = resolve;
    });
    const allowed = new Promise<void>((resolve) => {
      release = resolve;
    });
    read.mockImplementationOnce(async (buffer, offset, length, position) => {
      start();
      await allowed;
      return { bytesRead: copyRead(buffer, offset, length, position) };
    });
    content = Buffer.from('first\n');
    reportedSize = content.length;
    listeners[0]('change');
    await started;
    content = Buffer.from('first\nsecond\n');
    reportedSize = content.length;
    listeners[0]('change');
    expect(open).toHaveBeenCalledTimes(1);
    release();
    await flush();
    expect(callback.mock.calls.flatMap(([lines]) => lines)).toEqual(['first', 'second']);
    expect(service.getLogWatchStats().watchers[0].lastSize).toBe(content.length);
    expect(close).toHaveBeenCalledTimes(2);
  });
  it('contains filesystem watcher errors and notifies clients that the log is unavailable', () => {
    const callback = jest.fn<LogWatchCallback>();
    service.watchLog('runtime', 'synthetic.log', callback);
    watchers[0].emit('error', new Error('WATCH_PRIVATE_SENTINEL'));
    expect(callback.mock.calls).toEqual([[[], 'unavailable']]);
    expect(service.getLogWatchStats().activeWatchers).toBe(0);
    expect(watchers[0].close).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(jest.mocked(logger.error).mock.calls)).not.toContain(
      'WATCH_PRIVATE_SENTINEL',
    );
  });
  it('removes a watcher owner even when close throws and attempts every shutdown close', () => {
    const callback = jest.fn<LogWatchCallback>();
    service.watchLog('runtime', 'one', callback);
    watchers[0].close.mockImplementationOnce(() => {
      throw new Error('Synthetic close failure');
    });
    expect(() => service.unwatchLog('runtime', 'one', callback)).toThrow();
    expect(service.getLogWatchStats().activeWatchers).toBe(0);
    service.watchLog('runtime', 'one', callback);
    service.watchLog('runtime', 'two', callback);
    watchers[1].close.mockImplementationOnce(() => {
      throw new Error('Synthetic close failure');
    });
    service.cleanupLogWatchers();
    expect(watchers[2].close).toHaveBeenCalledTimes(1);
    expect(service.getLogWatchStats().activeWatchers).toBe(0);
  });
});
