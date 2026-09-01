import fs from 'fs';
import { getLogFilePath } from './logService.js';
import logger from '../utils/logger.js';

interface LogWatcher {
  category: 'runtime' | 'player';
  logName: string;
  lastSize: number;
  watcher: fs.FSWatcher;
  callbacks: Set<(newLines: string[]) => void>;
}

// Map of active log watchers: "category:logName" => LogWatcher
const activeWatchers = new Map<string, LogWatcher>();

/**
 * Start watching a log file for new content
 */
export function watchLog(
  category: 'runtime' | 'player',
  logName: string,
  callback: (newLines: string[]) => void,
): void {
  const key = `${category}:${logName}`;

  // If already watching, just add the callback
  if (activeWatchers.has(key)) {
    const watcher = activeWatchers.get(key)!;
    watcher.callbacks.add(callback);
    return;
  }

  try {
    const logPath = getLogFilePath(category, logName);

    // Get initial file size
    const stats = fs.statSync(logPath);
    const initialSize = stats.size;

    // Create file watcher
    const watcher = fs.watch(logPath, { persistent: false }, (eventType) => {
      if (eventType === 'change') {
        handleLogChange(key).catch((err) =>
          logger.error(`Log change handler error for ${key}:`, err),
        );
      }
    });

    // Create and store the log watcher
    const logWatcher: LogWatcher = {
      category,
      logName,
      lastSize: initialSize,
      watcher,
      callbacks: new Set([callback]),
    };

    activeWatchers.set(key, logWatcher);
  } catch (error) {
    logger.error(`Error starting log watcher for ${key}:`, error);
  }
}

/**
 * Stop watching a log file for a specific callback
 */
export function unwatchLog(
  category: 'runtime' | 'player',
  logName: string,
  callback: (newLines: string[]) => void,
): void {
  const key = `${category}:${logName}`;
  const logWatcher = activeWatchers.get(key);

  if (!logWatcher) {
    return;
  }

  // Remove this specific callback
  logWatcher.callbacks.delete(callback);

  // If there are still other callbacks, don't stop watching yet
  if (logWatcher.callbacks.size > 0) {
    return;
  }

  // No more callbacks, close the watcher
  logWatcher.watcher.close();
  activeWatchers.delete(key);
}

/**
 * Handle log file change event
 */
async function handleLogChange(key: string): Promise<void> {
  const logWatcher = activeWatchers.get(key);
  if (!logWatcher) return;

  try {
    const logPath = getLogFilePath(logWatcher.category, logWatcher.logName);
    const stats = fs.statSync(logPath);
    const currentSize = stats.size;

    // If file shrunk (was rotated/truncated), reset position
    if (currentSize < logWatcher.lastSize) {
      logWatcher.lastSize = 0;
    }

    // If no new content, skip
    if (currentSize === logWatcher.lastSize) {
      return;
    }

    // Read new content using createReadStream to avoid large buffer allocations
    const bytesToRead = currentSize - logWatcher.lastSize;
    const startPos = logWatcher.lastSize;

    // Update last size first to avoid re-reading on rapid changes
    logWatcher.lastSize = currentSize;

    // Use streams for large reads, direct buffer for small reads
    let newContent: string;
    if (bytesToRead > 64 * 1024) {
      // For large reads (>64KB), use streaming
      const chunks: Buffer[] = [];
      const stream = fs.createReadStream(logPath, {
        start: startPos,
        end: currentSize - 1,
        highWaterMark: 64 * 1024,
      });
      for await (const chunk of stream) {
        chunks.push(chunk as Buffer);
      }
      newContent = Buffer.concat(chunks).toString('utf-8');
    } else {
      // For small reads, use direct buffer (already optimized by V8)
      const buffer = Buffer.allocUnsafe(bytesToRead);
      const fd = fs.openSync(logPath, 'r');
      fs.readSync(fd, buffer, 0, bytesToRead, startPos);
      fs.closeSync(fd);
      newContent = buffer.toString('utf-8');
    }
    const newLines = newContent.split('\n').filter((line) => line.trim().length > 0);

    if (newLines.length > 0) {
      // Notify all callbacks
      logWatcher.callbacks.forEach((callback) => {
        try {
          callback(newLines);
        } catch (error) {
          logger.error(`Error in log watcher callback for ${key}:`, error);
        }
      });
    }
  } catch (error) {
    logger.error(`Error handling log change for ${key}:`, error);
  }
}

/**
 * Get statistics about active log watchers
 */
export function getLogWatchStats(): {
  activeWatchers: number;
  watchers: Array<{ key: string; callbacks: number; lastSize: number }>;
} {
  return {
    activeWatchers: activeWatchers.size,
    watchers: Array.from(activeWatchers.entries()).map(([key, watcher]) => ({
      key,
      callbacks: watcher.callbacks.size,
      lastSize: watcher.lastSize,
    })),
  };
}

/**
 * Cleanup all watchers (for graceful shutdown)
 */
export function cleanupLogWatchers(): void {
  activeWatchers.forEach((watcher) => {
    watcher.watcher.close();
  });
  activeWatchers.clear();
}
