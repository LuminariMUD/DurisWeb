import fs from 'fs';
import * as fsPromises from 'node:fs/promises';
import { StringDecoder } from 'node:string_decoder';
import { setImmediate } from 'node:timers/promises';
import { getLogFilePath } from './logService.js';
import logger from '../utils/logger.js';
import { safeFailureCode } from '../utils/safeFailureCode.js';

export type LogWatchCallback = (newLines: string[], unavailable?: 'unavailable') => void;

interface LogWatcher {
  category: 'runtime' | 'player';
  logName: string;
  lastSize: number;
  watcher: fs.FSWatcher;
  callbacks: Set<LogWatchCallback>;
  reading: boolean;
  pending: boolean;
  decoder: StringDecoder;
  remainder: string;
}

const READ_CHUNK_BYTES = 64 * 1024;
const activeWatchers = new Map<string, LogWatcher>();

/** Remove this owner before notifying clients, so late work cannot revive it. */
function invalidateWatcher(key: string, entry: LogWatcher): void {
  if (activeWatchers.get(key) !== entry) return;
  activeWatchers.delete(key);
  for (const callback of entry.callbacks) {
    try {
      callback([], 'unavailable');
    } catch (error) {
      logger.error('Log watcher callback failed', { code: safeFailureCode(error) });
    }
  }
  entry.callbacks.clear();
  try {
    entry.watcher.close();
  } catch (error) {
    logger.error('Log watcher close failed', { code: safeFailureCode(error) });
  }
}

/** Start at the current file end; later changes are read in bounded chunks. */
export function watchLog(
  category: 'runtime' | 'player',
  logName: string,
  callback: LogWatchCallback,
): boolean {
  const key = category + ':' + logName;
  const existing = activeWatchers.get(key);
  if (existing) {
    existing.callbacks.add(callback);
    return true;
  }
  try {
    const logPath = getLogFilePath(category, logName);
    const initialSize = fs.statSync(logPath).size;
    const watcher = fs.watch(logPath, { persistent: false }, (eventType) => {
      const entry = activeWatchers.get(key);
      if (entry?.watcher !== watcher) return;
      if (eventType === 'change') void handleLogChange(key);
      else if (eventType === 'rename') invalidateWatcher(key, entry);
    });
    const entry: LogWatcher = {
      category,
      logName,
      lastSize: initialSize,
      watcher,
      callbacks: new Set([callback]),
      reading: false,
      pending: false,
      decoder: new StringDecoder('utf8'),
      remainder: '',
    };
    activeWatchers.set(key, entry);
    watcher.on('error', (error) => {
      logger.error('Log filesystem watcher failed', { code: safeFailureCode(error) });
      invalidateWatcher(key, entry);
    });
    return true;
  } catch (error) {
    logger.error('Log watcher start failed', { code: safeFailureCode(error) });
    return false;
  }
}

export function unwatchLog(
  category: 'runtime' | 'player',
  logName: string,
  callback: LogWatchCallback,
): void {
  const key = category + ':' + logName;
  const entry = activeWatchers.get(key);
  if (!entry) return;
  entry.callbacks.delete(callback);
  if (entry.callbacks.size) return;
  activeWatchers.delete(key);
  entry.watcher.close();
}

/** Keep UTF-8 and ordinary lines intact across read chunks, without unbounded long-line storage. */
function deliver(entry: LogWatcher, content: string, flush = false): void {
  const parts = (entry.remainder + content).split('\n');
  let remainder = parts.pop() ?? '';
  while (remainder.length > READ_CHUNK_BYTES) {
    parts.push(remainder.slice(0, READ_CHUNK_BYTES));
    remainder = remainder.slice(READ_CHUNK_BYTES);
  }
  if (flush && remainder) {
    parts.push(remainder);
    remainder = '';
  }
  entry.remainder = remainder;
  const lines = parts.filter((line) => line.trim().length > 0);
  if (!lines.length) return;
  for (const callback of entry.callbacks) {
    try {
      callback(lines);
    } catch (error) {
      logger.error('Log watcher callback failed', { code: safeFailureCode(error) });
    }
  }
}

async function handleLogChange(key: string): Promise<void> {
  const entry = activeWatchers.get(key);
  if (!entry) return;
  if (entry.reading) {
    entry.pending = true;
    return;
  }
  entry.reading = true;
  try {
    do {
      entry.pending = false;
      const logPath = getLogFilePath(entry.category, entry.logName);
      const handle = await fsPromises.open(logPath, 'r');
      try {
        const size = (await handle.stat()).size;
        if (!Number.isSafeInteger(size) || size < 0) throw new Error('Invalid log size');
        if (size < entry.lastSize) {
          entry.lastSize = 0;
          entry.decoder = new StringDecoder('utf8');
          entry.remainder = '';
        }
        while (entry.lastSize < size && activeWatchers.get(key) === entry && entry.callbacks.size) {
          const length = Math.min(READ_CHUNK_BYTES, size - entry.lastSize);
          const buffer = Buffer.alloc(length);
          const { bytesRead } = await handle.read(buffer, 0, length, entry.lastSize);
          if (bytesRead === 0) break;
          entry.lastSize += bytesRead;
          if (activeWatchers.get(key) !== entry) break;
          deliver(entry, entry.decoder.write(buffer.subarray(0, bytesRead)));
          if (entry.lastSize < size) await setImmediate();
        }
        if (activeWatchers.get(key) === entry) deliver(entry, '', true);
      } finally {
        await handle.close();
      }
    } while (entry.pending && activeWatchers.get(key) === entry && entry.callbacks.size);
  } catch (error) {
    logger.error('Log change read failed', { code: safeFailureCode(error) });
    invalidateWatcher(key, entry);
  } finally {
    entry.reading = false;
  }
}

export function getLogWatchStats(): {
  activeWatchers: number;
  watchers: Array<{ key: string; callbacks: number; lastSize: number }>;
} {
  return {
    activeWatchers: activeWatchers.size,
    watchers: Array.from(activeWatchers.entries()).map(([key, entry]) => ({
      key,
      callbacks: entry.callbacks.size,
      lastSize: entry.lastSize,
    })),
  };
}

export function cleanupLogWatchers(): void {
  const entries = [...activeWatchers.values()];
  activeWatchers.clear();
  for (const entry of entries) {
    entry.callbacks.clear();
    try {
      entry.watcher.close();
    } catch (error) {
      logger.error('Log watcher close failed', { code: safeFailureCode(error) });
    }
  }
}
