import { spawn } from 'child_process';
import { EventEmitter } from 'events';
import logger from '../utils/logger.js';

/**
 * Event-driven netstat watcher that monitors TCP connections on port 7777
 * Uses watch loop that only emits on actual connection changes
 * Low resource: single bash loop instead of spawning 30 processes/min
 */
export class NetstatWatcher extends EventEmitter {
  private watchProcess: ReturnType<typeof spawn> | null = null;
  private lastCount: number = -1;

  start() {
    // Single long-running bash process that watches netstat in a loop
    // Only emits when count changes
    const script = `
      last_count=-1
      while true; do
        count=$(netstat -tn 2>/dev/null | awk '$4 ~ /:7777$/ && /ESTABLISHED/ {print}' | wc -l)
        if [ "$count" != "$last_count" ]; then
          echo "$count"
          last_count=$count
        fi
        sleep 2
      done
    `;

    this.watchProcess = spawn('bash', ['-c', script]);

    this.watchProcess.stdout?.on('data', (data) => {
      const count = parseInt(data.toString().trim(), 10);
      if (!isNaN(count) && count !== this.lastCount) {
        this.lastCount = count;
        this.emit('change', count);
      }
    });

    this.watchProcess.stderr?.on('data', (data) => {
      logger.error('Netstat watcher error:', data.toString());
    });

    this.watchProcess.on('close', (code) => {
      if (code !== null && code !== 0) {
        logger.error(`Netstat watcher exited with code ${code}`);
      }
    });

    logger.info('Netstat watcher started');
  }

  stop() {
    if (this.watchProcess) {
      this.watchProcess.kill();
      this.watchProcess = null;
    }
  }
}
