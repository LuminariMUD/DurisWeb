import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';
import path from 'path';
import { pool as db } from '../db/connection.js';
import { getDmsProcessStats } from './processMonitor.js';
import { broadcastCrashAlert } from '../index.js';
import { getOnlinePlayerCount } from './serverHealthService.js';
import logger from '../utils/logger.js';
import { sendCrashNotification } from './pushNotificationService.js';

const execAsync = promisify(exec);

interface CrashEvent {
  crashTimestamp: Date;
  detectedBy: 'exit_log' | 'process_monitor' | 'manual';
  exitCode?: number;
  signal?: string;
  shutdownReason?: string;
  pid?: number;
  uptimeSeconds?: number;
  memoryMb?: number;
  cpuPercent?: number;
  coreDumpPath?: string;
  coreDumpSizeBytes?: number;
  hasBacktrace: boolean;
  backtrace?: string;
  crashFunction?: string;
  crashFile?: string;
  crashLine?: number;
  exitLogExcerpt?: string;
  debugLogExcerpt?: string;
  onlinePlayers?: number;
  lastCommand?: string;
}

// Track previous process state
let previousProcessState: { isRunning: boolean; pid: number | null } = {
  isRunning: false,
  pid: null,
};

// Module-level interval ID for cleanup
let crashMonitorIntervalId: NodeJS.Timeout | null = null;

// Cache last known process stats (so we have them when process crashes)
let lastKnownProcessStats: {
  pid: number | null;
  uptime: number;
  memory: number;
  cpu: number;
  timestamp: Date;
} | null = null;

// Track last known boot time from server_reboots
let lastKnownBootTime: number | null = null;

const MUD_DIR = process.env.MUD_DIR!;
const EXIT_LOG_PATH = path.join(MUD_DIR, 'logs/log/exit');
const DEBUG_LOG_PATH = path.join(MUD_DIR, 'logs/log/debug');

interface ShutdownClassification {
  type: 'crash' | 'maintenance' | 'degraded' | 'shutdown' | 'reboot' | 'copyover';
  severity: 'critical' | 'major' | 'minor' | 'info';
  reason: string;
  shouldCreateIncident: boolean;
}

/**
 * Find core dump files
 */
async function findCoreDump(): Promise<{ path: string; size: number } | null> {
  try {
    // Check /var/lib/apport/coredump for Apport core dumps (primary location)
    try {
      const apportCoreDir = '/var/lib/apport/coredump';
      const coreFiles = await fs.readdir(apportCoreDir);
      const dmsCores = coreFiles.filter(f => f.includes('_dms.'));

      if (dmsCores.length > 0) {
        // Get the most recent core dump by sorting (includes timestamp in filename)
        const latestCore = dmsCores.sort().reverse()[0];
        const corePath = path.join(apportCoreDir, latestCore);
        const stats = await fs.stat(corePath);
        return { path: corePath, size: stats.size };
      }
    } catch {
      // /var/lib/apport/coredump might not be accessible
    }

    // Check for core dumps in MUD directory
    const files = await fs.readdir(MUD_DIR);
    const coreFiles = files.filter(f => f.startsWith('core.'));

    if (coreFiles.length > 0) {
      // Get the most recent core dump
      const latestCore = coreFiles.sort().reverse()[0];
      const corePath = path.join(MUD_DIR, latestCore);
      const stats = await fs.stat(corePath);
      return { path: corePath, size: stats.size };
    }

    // Check /var/crash for Apport crash files
    try {
      const crashFiles = await fs.readdir('/var/crash');
      const dmsCrashes = crashFiles.filter(f => f.includes('dms') && f.endsWith('.crash'));

      if (dmsCrashes.length > 0) {
        const latestCrash = dmsCrashes.sort().reverse()[0];
        const crashPath = path.join('/var/crash', latestCrash);
        const stats = await fs.stat(crashPath);
        return { path: crashPath, size: stats.size };
      }
    } catch {
      // /var/crash might not be accessible
    }

    return null;
  } catch (error) {
    logger.error('Error finding core dump:', error);
    return null;
  }
}

/**
 * Extract GDB backtrace from core dump
 */
async function extractGdbBacktrace(coreDumpPath: string): Promise<{
  backtrace: string;
  crashFunction?: string;
  crashFile?: string;
  crashLine?: number;
} | null> {
  try {
    const binaryPath = path.join(MUD_DIR, 'dms');

    // Check if this is an Apport crash file
    if (coreDumpPath.endsWith('.crash')) {
      // Extract core dump from Apport crash file
      const tmpDir = '/tmp/crash-extract';
      await execAsync(`mkdir -p ${tmpDir}`);
      await execAsync(`apport-unpack ${coreDumpPath} ${tmpDir}`);

      const coreDumpFile = path.join(tmpDir, 'CoreDump');
      const coreExists = await fs.access(coreDumpFile).then(() => true).catch(() => false);

      if (!coreExists) {
        logger.error('CoreDump not found in Apport crash file');
        return null;
      }

      coreDumpPath = coreDumpFile;
    }

    // Run GDB to get backtrace (raw core dumps can be read directly)
    const { stdout, stderr } = await execAsync(
      `gdb -batch -ex "thread apply all bt full" -ex "quit" "${binaryPath}" "${coreDumpPath}" 2>&1`,
      { maxBuffer: 10 * 1024 * 1024 } // 10MB buffer for large backtraces
    );

    const backtrace = stdout + '\n' + stderr;

    // Parse crash location from backtrace
    const frameMatch = backtrace.match(/#0\s+(?:0x[0-9a-f]+\s+in\s+)?([^\s(]+)\s*\(.*?\)\s+at\s+([^:]+):(\d+)/);

    let crashFunction: string | undefined;
    let crashFile: string | undefined;
    let crashLine: number | undefined;

    if (frameMatch) {
      crashFunction = frameMatch[1];
      crashFile = frameMatch[2];
      crashLine = parseInt(frameMatch[3], 10);
    }

    return {
      backtrace,
      crashFunction,
      crashFile,
      crashLine,
    };
  } catch (error) {
    logger.error('Error extracting GDB backtrace:', error);
    return null;
  }
}

/**
 * Read last N lines from a log file
 */
async function readLastLines(filePath: string, lines: number = 100): Promise<string> {
  try {
    const { stdout } = await execAsync(`tail -n ${lines} "${filePath}"`);
    return stdout;
  } catch {
    return '';
  }
}

/**
 * Get online player count
 */
// Removed: Now using shared getOnlinePlayerCount from serverHealthService

/**
 * Store crash event directly in server_incidents table
 */
async function storeIncident(
  event: CrashEvent,
  classification: ShutdownClassification
): Promise<number> {
  const titlePrefix =
    classification.type === 'crash'
      ? 'MUD Server Crashed'
      : classification.type === 'degraded'
      ? 'MUD Server Degraded'
      : 'MUD Server Maintenance';

  const description =
    classification.type === 'crash' && event.crashFunction
      ? `Crash in ${event.crashFunction} (${event.crashFile}:${event.crashLine})`
      : classification.type === 'degraded'
      ? 'Server automatically recovered from hung state'
      : event.shutdownReason || 'Server restart';

  const [result] = await db.query(
    `INSERT INTO server_incidents (
      started_at, incident_type, severity, title, description, resolved, public_visible,
      detected_by, exit_code, crash_signal, shutdown_reason,
      pid, uptime_seconds, memory_mb, cpu_percent,
      core_dump_path, core_dump_size_bytes, has_backtrace,
      backtrace, crash_function, crash_file, crash_line,
      exit_log_excerpt, debug_log_excerpt,
      online_players, last_command, analyzed
    ) VALUES (NOW(), ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      classification.type,
      classification.severity,
      `${titlePrefix}: ${classification.reason}`,
      description,
      0, // resolved = false
      0, // public_visible = false (admin must manually enable)
      event.detectedBy,
      event.exitCode,
      event.signal,
      event.shutdownReason,
      event.pid,
      event.uptimeSeconds,
      event.memoryMb,
      event.cpuPercent,
      event.coreDumpPath,
      event.coreDumpSizeBytes,
      event.hasBacktrace ? 1 : 0,
      event.backtrace,
      event.crashFunction,
      event.crashFile,
      event.crashLine,
      event.exitLogExcerpt,
      event.debugLogExcerpt,
      event.onlinePlayers,
      event.lastCommand,
      0 // analyzed = false
    ]
  );

  return (result as any).insertId;
}

/**
 * Create an incident for web-initiated stop/restart
 * These are planned actions, not crashes, so we create a simple incident with minimal data
 */
export async function createWebShutdownIncident(
  shutdownType: 'web_stop' | 'web_restart',
  initiatedBy: string,
  reason: string,
  uptimeSeconds: number
): Promise<number> {
  const incidentType = shutdownType === 'web_stop' ? 'shutdown' : 'reboot';
  const title = shutdownType === 'web_stop'
    ? `Web stop by ${initiatedBy}: ${reason}`
    : `Web restart by ${initiatedBy}: ${reason}`;

  const [result] = await db.query(
    `INSERT INTO server_incidents
      (incident_type, severity, title, description, started_at, ended_at,
       duration_seconds, resolved, public_visible, detected_by, uptime_seconds)
     VALUES (?, 'info', ?, ?, NOW(), NOW(), 0, 1, 0, 'web_admin', ?)`,
    [incidentType, title, reason, uptimeSeconds]
  );

  logger.info(`Created web shutdown incident: ${title}`);
  return (result as any).insertId;
}

/**
 * Detect and handle crash event
 */
export async function detectCrash(shutdownType: string | null): Promise<void> {
  logger.info(`Shutdown detected! Type: ${shutdownType || 'unknown (crash)'}`);

  // Try to get current stats (will be empty if process already dead)
  const processStats = await getDmsProcessStats();

  // Use cached stats if process is dead
  const pid = processStats.pid || lastKnownProcessStats?.pid || undefined;
  const uptime = processStats.uptime || lastKnownProcessStats?.uptime || undefined;
  const memory = processStats.memory || lastKnownProcessStats?.memory || undefined;
  const cpu = processStats.cpu || lastKnownProcessStats?.cpu || undefined;

  // Determine incident type and severity based on shutdown_type from cycle_mud.sh
  let incidentType: 'crash' | 'maintenance' | 'degraded' | 'shutdown' | 'reboot' | 'copyover';
  let severity: 'critical' | 'major' | 'minor' | 'info';
  let exitCode = 0;

  if (!shutdownType || shutdownType === 'crash' || shutdownType === 'unknown') {
    incidentType = 'crash';
    severity = 'critical';
    exitCode = 139;
  } else if (shutdownType === 'hung') {
    incidentType = 'degraded';
    severity = 'major';
    exitCode = 56;
  } else if (shutdownType === 'pwipe') {
    incidentType = 'maintenance';
    severity = 'info';
    exitCode = 55;
  } else if (shutdownType === 'copyover' || shutdownType === 'autoreboot_copyover') {
    incidentType = 'copyover';
    severity = 'info';
  } else if (shutdownType === 'reboot' || shutdownType === 'autoreboot') {
    incidentType = 'reboot';
    severity = 'info';
  } else {
    // shutdown or other types
    incidentType = 'shutdown';
    severity = 'info';
  }

  const coreDump = await findCoreDump();

  let backtraceData = null;
  if (coreDump && incidentType === 'crash') {
    logger.info(`Found core dump at ${coreDump.path}, extracting backtrace...`);
    backtraceData = await extractGdbBacktrace(coreDump.path);
  }

  const event: CrashEvent = {
    crashTimestamp: new Date(),
    detectedBy: 'process_monitor',
    exitCode,
    signal: incidentType === 'crash' ? 'SIGSEGV' : undefined,
    shutdownReason: shutdownType || 'crash',
    pid,
    uptimeSeconds: uptime,
    memoryMb: memory,
    cpuPercent: cpu,
    coreDumpPath: coreDump?.path,
    coreDumpSizeBytes: coreDump?.size,
    hasBacktrace: !!backtraceData,
    backtrace: backtraceData?.backtrace,
    crashFunction: backtraceData?.crashFunction,
    crashFile: backtraceData?.crashFile,
    crashLine: backtraceData?.crashLine,
    exitLogExcerpt: await readLastLines(EXIT_LOG_PATH, 100),
    debugLogExcerpt: await readLastLines(DEBUG_LOG_PATH, 100),
    onlinePlayers: await getOnlinePlayerCount(),
  };

  // Create classification object
  const classification = {
    type: incidentType,
    severity,
    reason: shutdownType || 'crash',
    shouldCreateIncident: true,
  };

  // Only create incidents for actual problems (not planned restarts)
  if (classification.shouldCreateIncident) {
    const incidentId = await storeIncident(event, classification);
    logger.info(`Created ${classification.severity} incident: ${classification.reason}`);

    // Fetch the incident from database to get accurate data for notification
    const [incidents] = await db.query<any[]>(
      `SELECT * FROM server_incidents WHERE id = ?`,
      [incidentId]
    );

    if (incidents.length > 0 && typeof broadcastCrashAlert === 'function') {
      const incident = incidents[0];
      broadcastCrashAlert({
        id: incident.id,
        incident_type: incident.incident_type,
        severity: incident.severity,
        exit_code: incident.exit_code,
        shutdown_reason: incident.shutdown_reason,
        crash_function: incident.crash_function,
        crash_file: incident.crash_file,
        crash_line: incident.crash_line,
        detected_by: incident.detected_by,
        started_at: incident.started_at,
      });

      // send push notification to all subscribers
      sendCrashNotification({
        incidentType: incident.incident_type,
        reason: incident.shutdown_reason,
      }).catch(err => logger.error('failed to send crash push notification:', err));
    }

    logger.info(`Incident logged with ID: ${incidentId}`);
  } else {
    logger.info(`Planned restart detected (${classification.reason}) - skipping incident creation`);
  }
}

/**
 * Resolve the most recent unresolved incident when MUD comes back online
 */
async function resolveLastIncident(): Promise<void> {
  try {
    // Find most recent unresolved incident
    const [incidents] = await db.query<any[]>(
      `SELECT id, started_at FROM server_incidents
       WHERE resolved = 0
       ORDER BY started_at DESC
       LIMIT 1`
    );

    if (incidents.length === 0) {
      return;
    }

    const incident = incidents[0];
    const endedAt = new Date();
    const durationSeconds = Math.floor(
      (endedAt.getTime() - new Date(incident.started_at).getTime()) / 1000
    );

    // Update incident end time (but keep resolved = 0 for manual review)
    await db.query(
      `UPDATE server_incidents
       SET ended_at = ?, duration_seconds = ?
       WHERE id = ?`,
      [endedAt, durationSeconds, incident.id]
    );

    logger.info(`Auto-closed incident ${incident.id} with duration ${durationSeconds}s (${Math.floor(durationSeconds / 60)} minutes) - awaiting manual resolution`);

    // Broadcast "MUD is Back UP!" notification
    if (typeof broadcastCrashAlert === 'function') {
      broadcastCrashAlert({
        id: incident.id,
        incident_type: 'recovery',
        severity: 'info',
        exit_code: null,
        shutdown_reason: 'Server is back online',
        crash_function: null,
        crash_file: null,
        crash_line: null,
        detected_by: 'process_monitor',
        started_at: endedAt.toISOString(),
      });

      // send push notification for recovery
      sendCrashNotification({
        incidentType: 'recovery',
      }).catch(err => logger.error('failed to send recovery push notification:', err));
    }
  } catch (error) {
    logger.error('Error resolving incident:', error);
  }
}

/**
 * Check for new boot in server_reboots table
 * Returns shutdown info if a new boot was detected
 */
async function checkForNewBoot(): Promise<{ bootTime: number; shutdownType: string; shutdownTime: number } | null> {
  try {
    // Get the most recent boot
    const [rows] = await db.query<any[]>(
      `SELECT boot_time, shutdown_type, shutdown_time FROM server_reboots
       ORDER BY boot_time DESC
       LIMIT 1`
    );

    if (rows.length === 0) {
      return null;
    }

    const currentBootTime = rows[0].boot_time;
    const shutdownType = rows[0].shutdown_type;
    const shutdownTime = rows[0].shutdown_time;

    // First time checking - initialize
    if (lastKnownBootTime === null) {
      lastKnownBootTime = currentBootTime;
      logger.info(`Initialized boot tracking: boot_time = ${currentBootTime}`);
      return null;
    }

    // Check if boot_time changed (new reboot happened)
    if (currentBootTime !== lastKnownBootTime) {
      logger.info(`NEW BOOT DETECTED! Previous: ${lastKnownBootTime}, Current: ${currentBootTime}, Type: ${shutdownType}`);

      // Update tracked boot time
      lastKnownBootTime = currentBootTime;

      // Return shutdown info for the PREVIOUS boot
      return {
        bootTime: currentBootTime,
        shutdownType: shutdownType || 'unknown',
        shutdownTime: shutdownTime
      };
    }

    return null;
  } catch (error) {
    logger.error('Error checking for new boot:', error);
    return null;
  }
}

/**
 * Monitor process state changes (polling)
 */
export async function monitorProcessState(): Promise<void> {
  const currentStats = await getDmsProcessStats();

  // Cache process stats if process is running (so we have them when it crashes)
  if (currentStats.isRunning && currentStats.pid) {
    lastKnownProcessStats = {
      pid: currentStats.pid,
      uptime: currentStats.uptime,
      memory: currentStats.memory,
      cpu: currentStats.cpu,
      timestamp: new Date(),
    };
  }

  // Check for new boot in server_reboots table
  const newBoot = await checkForNewBoot();
  if (newBoot) {
    // Skip web-initiated shutdowns - they already create their own incidents via createWebShutdownIncident()
    if (newBoot.shutdownType === 'web_stop' || newBoot.shutdownType === 'web_restart') {
      logger.info(`Web-initiated ${newBoot.shutdownType} detected - skipping duplicate incident creation`);
    } else {
      // Check if we already created an incident for this crash (via process death detection)
      const [existingIncidents] = await db.query<any[]>(
        `SELECT id, shutdown_reason FROM server_incidents
         WHERE resolved = 0
         AND started_at >= DATE_SUB(NOW(), INTERVAL 5 MINUTE)
         LIMIT 1`
      );

      if (existingIncidents.length > 0) {
        // Update the existing incident with the correct shutdown_type from server_reboots
        const incident = existingIncidents[0];
        if (incident.shutdown_reason === 'crash' || incident.shutdown_reason === null) {
          await db.query(
            `UPDATE server_incidents SET shutdown_reason = ? WHERE id = ?`,
            [newBoot.shutdownType, incident.id]
          );
          logger.info(`Updated existing incident ${incident.id} with shutdown_type: ${newBoot.shutdownType}`);
        }
      } else {
        logger.info(`Reboot detected from server_reboots table!`);
        await detectCrash(newBoot.shutdownType);
      }
    }
  }

  // Detect crash (process WAS running, now it's NOT running)
  // This provides immediate incident creation when process dies
  if (previousProcessState.isRunning && !currentStats.isRunning) {
    logger.info('Process died! Creating incident immediately...');

    // Check if we already have an unresolved incident (to avoid duplicates)
    const [existingIncidents] = await db.query<any[]>(
      `SELECT id FROM server_incidents
       WHERE resolved = 0
       AND started_at >= DATE_SUB(NOW(), INTERVAL 5 MINUTE)
       LIMIT 1`
    );

    if (existingIncidents.length === 0) {
      // Create incident immediately with cached process stats
      // The shutdown_type will be determined later when server_reboots is updated
      await detectCrash(null);
    } else {
      logger.info('Recent unresolved incident exists, skipping duplicate creation');
    }
  }

  // Detect recovery (process was NOT running, now it is)
  if (!previousProcessState.isRunning && currentStats.isRunning) {
    logger.info('Process recovered - MUD is back online');
    await resolveLastIncident();
  }

  // Update state
  previousProcessState = {
    isRunning: currentStats.isRunning,
    pid: currentStats.pid,
  };
}

/**
 * Start crash detection monitoring
 */
export async function startCrashMonitoring(): Promise<void> {
  logger.info('Starting crash detection monitoring...');

  // Initialize boot tracking immediately on backend startup
  await checkForNewBoot();

  // Initialize process state to current state (so we don't miss crashes that happened before monitoring started)
  const initialStats = await getDmsProcessStats();
  previousProcessState = {
    isRunning: initialStats.isRunning,
    pid: initialStats.pid,
  };
  logger.info(`Initial process state: ${initialStats.isRunning ? 'RUNNING' : 'NOT RUNNING'} (PID: ${initialStats.pid || 'N/A'})`);

  // Poll every 30 seconds - store interval ID for cleanup
  crashMonitorIntervalId = setInterval(async () => {
    try {
      await monitorProcessState();
    } catch (error) {
      logger.error('Error in crash monitoring:', error);
    }
  }, 30000);
}

/**
 * Stop crash detection monitoring (for graceful shutdown)
 */
export function stopCrashMonitoring(): void {
  if (crashMonitorIntervalId) {
    clearInterval(crashMonitorIntervalId);
    crashMonitorIntervalId = null;
    logger.info('Crash detection monitoring stopped');
  }
}
