import { pool } from '../db/connection.js';
import { RowDataPacket } from 'mysql2';
import { exec, spawn } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';
import path from 'path';
import { getDmsProcessStats } from './processMonitor.js';
import { recordMudShutdown } from './serverRebootService.js';
import { createWebShutdownIncident } from './crashDetectionService.js';

const execAsync = promisify(exec);

// Configuration - MUD_DIR is validated at startup in index.ts
const MUD_BASE = process.env.MUD_DIR!;
const PID_FILE = path.join(MUD_BASE, 'cycle_mud.pid');
const IS_DEV_MODE = process.env.NODE_ENV !== 'production';

export interface MudState {
  cycleMudPid: number | null;
  dmsPid: number | null;
  state: 'running' | 'stopped' | 'starting' | 'stopping' | 'unknown';
  lastStartTime: Date | null;
  lastStopTime: Date | null;
  startedBy: string | null;
  uptime: number;
  cpu: number;
  memory: number;
}

export interface ControlResult {
  success: boolean;
  message: string;
}

interface StateRow extends RowDataPacket {
  id: number;
  cycle_mud_pid: number | null;
  dms_pid: number | null;
  state: string;
  last_start_time: string | null;
  last_stop_time: string | null;
  started_by: string | null;
  updated_at: string;
}

// Broadcast data interface
export interface MudControlBroadcast {
  state: MudState['state'];
  action?: string;
  by?: string;
  reason?: string;
}

// Output broadcast interface
export interface MudControlOutput {
  operationId: string;  // Timestamp-based ID for tracking output streams
  chunk: string;
  isComplete: boolean;
}

// State broadcast function (will be set by index.ts)
let stateBroadcaster: ((data: MudControlBroadcast) => void) | null = null;
let outputBroadcaster: ((data: MudControlOutput) => void) | null = null;

export function setStateBroadcaster(fn: typeof stateBroadcaster) {
  stateBroadcaster = fn;
}

export function setOutputBroadcaster(fn: typeof outputBroadcaster) {
  outputBroadcaster = fn;
}

function broadcastState(data: MudControlBroadcast) {
  if (stateBroadcaster) {
    stateBroadcaster(data);
  }
}

function broadcastOutput(operationId: string, chunk: string, isComplete: boolean = false) {
  if (outputBroadcaster) {
    outputBroadcaster({ operationId, chunk, isComplete });
  }
}

/**
 * Sleep helper
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Detect cycle_mud.sh PID from PID file or pgrep
 */
export async function detectCycleMudPid(): Promise<number | null> {
  // First try to read PID file
  try {
    const pidContent = await fs.readFile(PID_FILE, 'utf-8');
    const pid = parseInt(pidContent.trim(), 10);

    // Verify the process is actually running
    try {
      await execAsync(`ps -p ${pid} -o comm=`);
      return pid;
    } catch {
      // PID file exists but process is not running - stale file
      await fs.unlink(PID_FILE).catch(() => {});
    }
  } catch {
    // PID file doesn't exist
  }

  // Fall back to pgrep - use pgrep -x for exact match on process name
  // or check the actual command to avoid matching grep/editor processes
  try {
    const { stdout } = await execAsync("pgrep -f './cycle_mud.sh' 2>/dev/null || pgrep -x cycle_mud.sh 2>/dev/null | head -1");
    const pids = stdout.trim().split('\n').filter(p => p);
    for (const pidStr of pids) {
      const pid = parseInt(pidStr.trim(), 10);
      if (!isNaN(pid) && pid > 0) {
        // Verify this is actually cycle_mud.sh by checking the command
        try {
          const { stdout: cmdOut } = await execAsync(`ps -p ${pid} -o args= 2>/dev/null`);
          if (cmdOut.includes('cycle_mud.sh') && !cmdOut.includes('pgrep') && !cmdOut.includes('grep')) {
            return pid;
          }
        } catch {
          // Process might have exited
        }
      }
    }
  } catch {
    // pgrep found nothing
  }

  return null;
}

/**
 * Detect dms process PID
 */
export async function detectDmsPid(): Promise<number | null> {
  const stats = await getDmsProcessStats();
  return stats.pid;
}

/**
 * Get current MUD state
 */
export async function getMudState(): Promise<MudState> {
  const cycleMudPid = await detectCycleMudPid();
  const dmsStats = await getDmsProcessStats();

  // Get stored state info from database
  const [rows] = await pool.execute<StateRow[]>(
    'SELECT * FROM mud_process_state WHERE id = 1'
  );
  const dbState = rows[0];

  // Determine actual state based on processes
  let state: MudState['state'] = 'unknown';
  if (cycleMudPid && dmsStats.isRunning) {
    state = 'running';
  } else if (cycleMudPid && !dmsStats.isRunning) {
    // cycle_mud is running but dms is not - probably in restart cycle
    state = 'starting';
  } else if (!cycleMudPid) {
    state = 'stopped';
  }

  // Update database if state changed
  if (dbState && dbState.state !== state) {
    await pool.execute(
      'UPDATE mud_process_state SET state = ?, cycle_mud_pid = ?, dms_pid = ?, updated_at = NOW() WHERE id = 1',
      [state, cycleMudPid, dmsStats.pid]
    );
  }

  // Helper to convert MySQL datetime string to ISO format with Z suffix (UTC)
  const toIsoUtc = (dateStr: string | null | undefined): Date | null => {
    if (!dateStr) return null;
    // MySQL returns "YYYY-MM-DD HH:MM:SS" in UTC, convert to proper Date
    return new Date(dateStr.replace(' ', 'T') + 'Z');
  };

  return {
    cycleMudPid,
    dmsPid: dmsStats.pid,
    state,
    lastStartTime: toIsoUtc(dbState?.last_start_time),
    lastStopTime: toIsoUtc(dbState?.last_stop_time),
    startedBy: dbState?.started_by || null,
    uptime: dmsStats.uptime,
    cpu: dmsStats.cpu,
    memory: dmsStats.memory,
  };
}

/**
 * Generate a unique operation ID based on timestamp
 */
function generateOperationId(): string {
  return `op_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
}

/**
 * Get the most recent MUD boot time from mud_process_state
 * Falls back to an estimate based on uptime if not available
 */
async function getMudBootTime(): Promise<number> {
  try {
    // First try to get from mud_process_state
    const [rows] = await pool.execute<RowDataPacket[]>(
      'SELECT UNIX_TIMESTAMP(last_start_time) as boot_time FROM mud_process_state WHERE id = 1'
    );
    if (rows[0]?.boot_time) {
      return rows[0].boot_time;
    }
  } catch {
    // Fall through to estimate
  }

  // Fall back to current time minus uptime
  const stats = await getDmsProcessStats();
  if (stats.uptime > 0) {
    return Math.floor(Date.now() / 1000) - stats.uptime;
  }

  // Last resort: use current time (uptime = 0)
  return Math.floor(Date.now() / 1000);
}

/**
 * Update the MUD process state in database
 */
async function updateMudStateDb(
  cycleMudPid: number | null,
  dmsPid: number | null,
  state: MudState['state'],
  startedBy: string | null,
  isStart: boolean
): Promise<void> {
  if (isStart) {
    await pool.execute(
      `UPDATE mud_process_state
       SET cycle_mud_pid = ?, dms_pid = ?, state = ?, started_by = ?, last_start_time = NOW(), updated_at = NOW()
       WHERE id = 1`,
      [cycleMudPid, dmsPid, state, startedBy]
    );
  } else {
    await pool.execute(
      `UPDATE mud_process_state
       SET cycle_mud_pid = ?, dms_pid = ?, state = ?, last_stop_time = NOW(), updated_at = NOW()
       WHERE id = 1`,
      [cycleMudPid, dmsPid, state]
    );
  }
}

/**
 * Wait for a process to exit
 */
async function waitForProcessExit(pid: number, timeoutMs: number): Promise<boolean> {
  const startTime = Date.now();

  while (Date.now() - startTime < timeoutMs) {
    try {
      await execAsync(`ps -p ${pid} -o pid=`);
      // Process still running
      await sleep(500);
    } catch {
      // Process exited
      return true;
    }
  }

  return false;
}

/**
 * Start the MUD
 */
export async function startMud(accountName: string, _ipAddress: string): Promise<ControlResult> {
  // Check if already running
  const state = await getMudState();
  if (state.state === 'running' || state.state === 'starting') {
    return { success: false, message: 'MUD is already running' };
  }

  const operationId = generateOperationId();

  // Helper to broadcast output
  const output = (text: string, complete: boolean = false) => {
    broadcastOutput(operationId, text, complete);
  };

  output(`Starting MUD server...\n`);

  // Broadcast starting state
  broadcastState({ state: 'starting', action: 'start', by: accountName });

  try {
    // Start cycle_mud.sh in background
    const args = IS_DEV_MODE ? ['./cycle_mud.sh', '--dev'] : ['./cycle_mud.sh'];
    output(`Launching: ${args.join(' ')}\n`);

    // Use setsid to create a new session, fully isolating the MUD process
    // from the backend's terminal. This prevents SIGINT (Ctrl+C) from killing
    // the MUD when the backend is restarted.
    const child = spawn('setsid', args, {
      cwd: MUD_BASE,
      detached: true,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env }
    });

    // Capture stdout/stderr and broadcast live
    child.stdout?.on('data', (data) => {
      output(data.toString());
    });
    child.stderr?.on('data', (data) => {
      output(data.toString());
    });

    child.unref();

    // Wait briefly and verify process started
    output(`Waiting for cycle_mud.sh to start...\n`);
    await sleep(2000);
    const cyclePid = await detectCycleMudPid();

    if (!cyclePid) {
      output('Failed to start cycle_mud.sh\n', true);
      broadcastState({ state: 'stopped', action: 'start', by: accountName });
      return { success: false, message: 'Failed to start MUD' };
    }

    output(`cycle_mud.sh started (PID: ${cyclePid})\n`);

    // Update state
    await updateMudStateDb(cyclePid, null, 'starting', accountName, true);

    // Wait a bit more for dms to start
    output(`Waiting for dms to start...\n`);
    await sleep(3000);
    const dmsPid = await detectDmsPid();

    // Signal output completion
    if (dmsPid) {
      output(`dms started (PID: ${dmsPid})\n`);
    }
    output(`MUD started successfully\n`, true);

    if (dmsPid) {
      await updateMudStateDb(cyclePid, dmsPid, 'running', accountName, true);
      broadcastState({ state: 'running', action: 'start', by: accountName });
    } else {
      broadcastState({ state: 'starting', action: 'start', by: accountName });
    }

    return { success: true, message: 'MUD started successfully' };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    output(`Error: ${errorMessage}\n`, true);
    broadcastState({ state: 'stopped', action: 'start', by: accountName });
    return { success: false, message: `Failed to start MUD: ${errorMessage}` };
  }
}

/**
 * Stop the MUD
 */
export async function stopMud(accountName: string, _ipAddress: string, reason: string): Promise<ControlResult> {
  // Check if running
  const state = await getMudState();
  if (state.state !== 'running' && state.state !== 'starting') {
    return { success: false, message: 'MUD is not running' };
  }

  const operationId = generateOperationId();

  // Broadcast stopping state
  broadcastState({ state: 'stopping', action: 'stop', by: accountName, reason });

  // Helper to broadcast output
  const output = (text: string, complete: boolean = false) => {
    broadcastOutput(operationId, text, complete);
  };

  output(`Stopping MUD server...\n`);
  output(`Reason: ${reason}\n`);

  try {
    // Record the shutdown to server_reboots BEFORE killing the process
    const bootTime = await getMudBootTime();
    await recordMudShutdown(bootTime, 'web_stop', accountName, reason);
    output(`Shutdown recorded to database\n`);

    // Create incident for tracking in Incidents tab
    await createWebShutdownIncident('web_stop', accountName, reason, state.uptime);
    output(`Incident created\n`);

    // Get cycle_mud.sh PID
    const cyclePid = state.cycleMudPid || await detectCycleMudPid();

    if (cyclePid) {
      // Send SIGTERM to cycle_mud.sh
      output(`Sending SIGTERM to cycle_mud.sh (PID: ${cyclePid})\n`);
      process.kill(cyclePid, 'SIGTERM');

      // Wait for process to terminate (max 30 seconds)
      const stopped = await waitForProcessExit(cyclePid, 30000);

      if (!stopped) {
        // Force kill if graceful shutdown failed
        output(`Graceful shutdown timed out, sending SIGKILL\n`);
        try {
          process.kill(cyclePid, 'SIGKILL');
        } catch {
          // Ignore if process already exited
        }
        await sleep(2000);
      } else {
        output(`cycle_mud.sh terminated gracefully\n`);
      }
    }

    // Also kill dms if it's still running
    const dmsPid = state.dmsPid || await detectDmsPid();
    if (dmsPid) {
      output(`Sending SIGTERM to dms (PID: ${dmsPid})\n`);
      try {
        process.kill(dmsPid, 'SIGTERM');
        await sleep(2000);
      } catch {
        // Ignore if process already exited
      }
    }

    // Update state
    await updateMudStateDb(null, null, 'stopped', null, false);

    output(`MUD stopped successfully\n`, true);
    broadcastState({ state: 'stopped', action: 'stop', by: accountName, reason });

    return { success: true, message: 'MUD stopped successfully' };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    output(`Error: ${errorMessage}\n`, true);
    broadcastState({ state: 'stopped', action: 'stop', by: accountName, reason });
    return { success: false, message: `Failed to stop MUD: ${errorMessage}` };
  }
}

/**
 * Restart the MUD
 */
export async function restartMud(accountName: string, _ipAddress: string, reason: string): Promise<ControlResult> {
  const operationId = generateOperationId();

  // Helper to broadcast output
  const output = (text: string, complete: boolean = false) => {
    broadcastOutput(operationId, text, complete);
  };

  output(`Restarting MUD server...\n`);
  output(`Reason: ${reason}\n`);

  try {
    // Stop if running
    const state = await getMudState();
    if (state.state === 'running' || state.state === 'starting') {
      broadcastState({ state: 'stopping', action: 'restart', by: accountName, reason });

      // Record the shutdown to server_reboots BEFORE killing the process
      const bootTime = await getMudBootTime();
      await recordMudShutdown(bootTime, 'web_restart', accountName, reason);
      output(`Shutdown recorded to database\n`);

      // Create incident for tracking in Incidents tab
      await createWebShutdownIncident('web_restart', accountName, reason, state.uptime);
      output(`Incident created\n`);

      // Get cycle_mud.sh PID
      const cyclePid = state.cycleMudPid || await detectCycleMudPid();

      if (cyclePid) {
        output(`Sending SIGTERM to cycle_mud.sh (PID: ${cyclePid})\n`);
        process.kill(cyclePid, 'SIGTERM');
        const stopped = await waitForProcessExit(cyclePid, 30000);

        if (!stopped) {
          output(`Graceful shutdown timed out, sending SIGKILL\n`);
          try {
            process.kill(cyclePid, 'SIGKILL');
          } catch {
            // Ignore
          }
          await sleep(2000);
        } else {
          output(`cycle_mud.sh terminated gracefully\n`);
        }
      }

      // Also kill dms if still running
      const dmsPid = state.dmsPid || await detectDmsPid();
      if (dmsPid) {
        output(`Sending SIGTERM to dms (PID: ${dmsPid})\n`);
        try {
          process.kill(dmsPid, 'SIGTERM');
          await sleep(2000);
        } catch {
          // Ignore
        }
      }

      // Wait for cycle_mud.sh 10-second restart delay to pass
      output(`Waiting for restart delay...\n`);
      await sleep(12000);
    }

    // Now start
    output(`Starting MUD server...\n`);
    broadcastState({ state: 'starting', action: 'restart', by: accountName, reason });

    const args = IS_DEV_MODE ? ['./cycle_mud.sh', '--dev'] : ['./cycle_mud.sh'];
    // Use setsid to create a new session, fully isolating the MUD process
    // from the backend's terminal. This prevents SIGINT (Ctrl+C) from killing
    // the MUD when the backend is restarted.
    const child = spawn('setsid', args, {
      cwd: MUD_BASE,
      detached: true,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env }
    });

    // Capture output from new process and broadcast live
    child.stdout?.on('data', (data) => {
      broadcastOutput(operationId, data.toString());
    });
    child.stderr?.on('data', (data) => {
      broadcastOutput(operationId, data.toString());
    });

    child.unref();

    await sleep(2000);
    const newCyclePid = await detectCycleMudPid();

    if (!newCyclePid) {
      output(`Failed to start cycle_mud.sh\n`, true);
      broadcastState({ state: 'stopped', action: 'restart', by: accountName, reason });
      return { success: false, message: 'Failed to restart MUD' };
    }

    output(`cycle_mud.sh started (PID: ${newCyclePid})\n`);
    await updateMudStateDb(newCyclePid, null, 'starting', accountName, true);

    // Wait for dms to start
    await sleep(3000);
    const newDmsPid = await detectDmsPid();
    if (newDmsPid) {
      output(`dms started (PID: ${newDmsPid})\n`);
      await updateMudStateDb(newCyclePid, newDmsPid, 'running', accountName, true);
    }

    output(`MUD restarted successfully\n`, true);

    if (newDmsPid) {
      broadcastState({ state: 'running', action: 'restart', by: accountName, reason });
    } else {
      broadcastState({ state: 'starting', action: 'restart', by: accountName, reason });
    }

    return { success: true, message: 'MUD restarted successfully' };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    output(`Error: ${errorMessage}\n`, true);
    broadcastState({ state: 'stopped', action: 'restart', by: accountName, reason });
    return { success: false, message: `Failed to restart MUD: ${errorMessage}` };
  }
}

