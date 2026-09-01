import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';
import os from 'os';
import logger from '../utils/logger.js';

const execAsync = promisify(exec);

export interface ProcessStats {
  cpu: number; // CPU usage percentage
  memory: number; // Memory usage in MB
  memoryPercent: number; // Memory usage percentage
  uptime: number; // Process uptime in seconds
  pid: number | null; // Process ID
  isRunning: boolean;
}

// Cache for CPU calculation
let lastCpuStats: { pid: number; utime: number; stime: number; timestamp: number } | null = null;
const numCpus = os.cpus().length;

/**
 * Get CPU and memory usage for the DMS process
 */
export async function getDmsProcessStats(): Promise<ProcessStats> {
  try {
    // Find the DMS process
    const { stdout } = await execAsync(
      "ps aux | grep './dms' | grep -v grep | awk '{print $2, $4, $6}'",
    );

    if (!stdout.trim()) {
      return {
        cpu: 0,
        memory: 0,
        memoryPercent: 0,
        uptime: 0,
        pid: null,
        isRunning: false,
      };
    }

    const parts = stdout.trim().split(/\s+/);
    const pid = parseInt(parts[0], 10);
    const memoryPercent = parseFloat(parts[1]);
    const rss = parseInt(parts[2], 10); // RSS in KB
    const memoryMiB = rss / 1024; // Convert to MiB

    // Get real-time CPU usage from /proc/[pid]/stat
    let cpu = 0;
    try {
      const statContent = await fs.readFile(`/proc/${pid}/stat`, 'utf-8');
      const statParts = statContent.split(' ');
      const utime = parseInt(statParts[13], 10); // User mode time
      const stime = parseInt(statParts[14], 10); // Kernel mode time
      const totalTime = utime + stime;

      // Calculate CPU percentage if we have previous stats
      if (lastCpuStats && lastCpuStats.pid === pid) {
        const timeDiffMs = Date.now() - lastCpuStats.timestamp;
        const cpuTimeDiff = totalTime - (lastCpuStats.utime + lastCpuStats.stime);

        // CPU usage calculation:
        // cpuTimeDiff is in clock ticks (HZ=100 per second on Linux)
        // timeDiffMs is in milliseconds
        const clockTicks = 100; // Linux HZ (ticks per second)
        const timeDiffSec = timeDiffMs / 1000;

        // CPU % = (ticks_used / ticks_per_second) / seconds_elapsed * 100 / num_cpus
        // cpu_seconds = ticks / ticks_per_second
        // cpu_percent_per_core = (cpu_seconds / elapsed_seconds) * 100
        // cpu_percent_total = cpu_percent_per_core / num_cpus
        cpu = ((cpuTimeDiff / clockTicks / timeDiffSec) * 100) / numCpus;
        cpu = Math.max(0, Math.min(100, cpu)); // Clamp between 0 and 100
      }

      // Update cache
      lastCpuStats = { pid, utime, stime, timestamp: Date.now() };
    } catch {
      // If we can't read /proc, fall back to 0
      cpu = 0;
    }

    // Get process uptime using ps -p PID -o etimes
    let uptime = 0;
    try {
      const { stdout: uptimeOut } = await execAsync(`ps -p ${pid} -o etimes= | tr -d ' '`);
      uptime = parseInt(uptimeOut.trim(), 10);
    } catch {
      // If we can't get uptime, just use 0
    }

    return {
      cpu: Math.round(cpu * 10) / 10, // Round to 1 decimal place
      memory: memoryMiB, // Keep full precision, let frontend handle rounding
      memoryPercent,
      uptime,
      pid,
      isRunning: true,
    };
  } catch (error) {
    logger.error('Error getting DMS process stats:', error);
    return {
      cpu: 0,
      memory: 0,
      memoryPercent: 0,
      uptime: 0,
      pid: null,
      isRunning: false,
    };
  }
}
