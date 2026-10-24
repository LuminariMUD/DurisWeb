import * as pty from 'node-pty';
import type { ResultSetHeader } from 'mysql2';
import { WebSocket } from 'ws';
import { sendApplicationMessage } from '../utils/applicationWebSocket.js';
import { unlink } from 'node:fs/promises';
import { pool } from '../db/connection.js';
import { hasActiveWebSession } from './sessionService.js';
import logger from '../utils/logger.js';
import { recordHookActivity } from '../hooks/hookActivity.js';
import { getBackendConfiguration } from '../config/environment.js';

// MUD folder path - set via MUD_DIR environment variable
const environment = getBackendConfiguration();
const MUD_FOLDER = environment.mud.directory;

interface TerminalSession {
  pty: pty.IPty;
  sessionId: number;
  accountName: string;
  ws: WebSocket;
  bashrcPath: string;
  outputBuffer: string;
  outputTimer: NodeJS.Timeout | null;
}

// Active terminal sessions
const activeSessions = new Map<number, TerminalSession>();
const sessionsByAccount = new Map<string, Set<number>>();
const sessionsByWebSocket = new Map<WebSocket, number>();
const pendingSessions = new Map<
  string,
  {
    ws: WebSocket;
    cancel: () => void;
    promise: Promise<{ sessionId: number; error?: string }>;
  }
>();
const closingSessions = new Map<number, Promise<void>>();

// Output buffer settings (batch writes to reduce DB load)
const OUTPUT_BUFFER_INTERVAL = 500; // ms
const OUTPUT_BUFFER_MAX_SIZE = 4096; // bytes

/** Quotes an operator-controlled path for the tmux shell-command parser. */
function shellQuote(value: string): string {
  return `'${value.replaceAll("'", "'\\''")}'`;
}

/** Builds a collision-resistant tmux namespace from an account and database id. */
export function getTerminalSessionName(accountName: string, sessionId: number): string {
  const safeAccountName = accountName.replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 40) || 'account';
  return `duris-${safeAccountName}-${sessionId}`;
}

/**
 * Create a new terminal session with bwrap sandboxing
 */
export async function createSession(
  accountName: string,
  ws: WebSocket,
  cols: number = 80,
  rows: number = 24,
): Promise<{ sessionId: number; error?: string }> {
  if (ws.readyState !== WebSocket.OPEN) return { sessionId: -1, error: 'Connection closed' };
  const pending = pendingSessions.get(accountName);
  if (pending) {
    return pending.ws === ws
      ? pending.promise
      : { sessionId: -1, error: 'Terminal connection in progress' };
  }
  let cancelled = false;
  const cancel = () => {
    cancelled = true;
    const id = sessionsByWebSocket.get(ws);
    if (id !== undefined) void cleanupSession(id, 'ended');
  };
  ws.once('close', cancel);
  const promise = createSessionInternal(accountName, ws, cols, rows, () => cancelled).finally(
    () => {
      ws.removeListener('close', cancel);
      pendingSessions.delete(accountName);
    },
  );
  pendingSessions.set(accountName, { ws, cancel, promise });
  return promise;
}

async function createSessionInternal(
  accountName: string,
  ws: WebSocket,
  cols: number,
  rows: number,
  cancelled: () => boolean,
): Promise<{ sessionId: number; error?: string }> {
  let createdId: number | undefined;
  try {
    // Check if user already has an active session
    const existingSessions = sessionsByAccount.get(accountName);
    if (existingSessions && existingSessions.size > 0) {
      // Allow reconnection to existing session instead of creating new
      const existingSessionIdValue = existingSessions.values().next().value;
      if (existingSessionIdValue !== undefined) {
        const existingSession = activeSessions.get(existingSessionIdValue);
        if (existingSession) {
          // A reconnect creates a new socket generation. The old socket must
          // lose its reverse mapping before the session is rebound.
          if (existingSession.ws !== ws) {
            sessionsByWebSocket.delete(existingSession.ws);
          }
          existingSession.ws = ws;
          sessionsByWebSocket.set(ws, existingSessionIdValue);
          recordHookActivity('terminal');
          return { sessionId: existingSessionIdValue };
        }
      }
    }

    // Create database record
    const [result] = await pool.execute<ResultSetHeader>(
      'INSERT INTO terminal_sessions (account_name, status) VALUES (?, ?)',
      [accountName, 'active'],
    );
    const sessionId = result.insertId;
    if (!Number.isSafeInteger(sessionId) || sessionId < 1)
      throw new Error('Invalid terminal session id');
    createdId = sessionId;
    if (cancelled() || ws.readyState !== WebSocket.OPEN) throw new Error('Connection closed');
    const tmuxSessionName = getTerminalSessionName(accountName, sessionId);
    const bashrcPath = `/tmp/.duris_bashrc-${sessionId}`;
    const tmuxShellCommand = `${shellQuote(environment.mud.processShell)} --rcfile ${shellQuote(bashrcPath)}`;

    // Spawn PTY with bubblewrap sandboxing
    const shell = pty.spawn(
      environment.mud.terminalSandboxBinary,
      [
        // Mount MUD folder as root
        '--bind',
        MUD_FOLDER,
        '/',
        // Required system mounts for full shell
        '--dev',
        '/dev',
        '--proc',
        '/proc',
        '--ro-bind',
        '/usr',
        '/usr',
        '--ro-bind',
        '/lib',
        '/lib',
        '--ro-bind',
        '/lib64',
        '/lib64',
        '--ro-bind',
        '/bin',
        '/bin',
        '--ro-bind',
        '/sbin',
        '/sbin',
        '--ro-bind',
        '/etc/passwd',
        '/etc/passwd',
        '--ro-bind',
        '/etc/group',
        '/etc/group',
        '--ro-bind',
        '/etc/resolv.conf',
        '/etc/resolv.conf',
        '--ro-bind',
        '/etc/terminfo',
        '/etc/terminfo',
        // Bind tmp for tmux sockets and various utilities
        '--bind',
        '/tmp',
        '/tmp',
        // Security options - share PID namespace so tmux can persist between connections
        '--unshare-user',
        '--unshare-ipc',
        '--unshare-uts',
        '--unshare-cgroup',
        '--share-net',
        // Set working directory
        '--chdir',
        '/',
        // Run tmux with colored prompt - attach to this account/session only
        environment.mud.processShell,
        '-c',
        `
        # Create a session-specific bashrc for the tmux session
        cat > "$DURIS_BASHRC_PATH" << 'BASHRC'
export PS1='\\[\\033[1;32m\\]duris\\[\\033[0m\\]:\\[\\033[1;34m\\]\\w\\[\\033[0m\\]\\$ '
export LS_COLORS='di=1;34:ln=1;36:so=1;35:pi=33:ex=1;32:bd=1;33:cd=1;33:su=1;31:sg=1;31:tw=1;34:ow=1;34'
alias ls='ls --color=auto'
alias ll='ls -la --color=auto'
alias grep='grep --color=auto'
BASHRC
        # Check if this account/session tmux session exists
        if tmux has-session -t "$DURIS_TMUX_SESSION" 2>/dev/null; then
          tmux attach -t "$DURIS_TMUX_SESSION"
        else
          tmux new-session -s "$DURIS_TMUX_SESSION" "$DURIS_TMUX_SHELL_COMMAND"
        fi
      `,
      ],
      {
        name: 'xterm-256color',
        cols,
        rows,
        env: {
          TERM: 'xterm-256color',
          HOME: '/',
          PATH: environment.mud.processPath,
          SHELL: environment.mud.processShell,
          USER: environment.mud.processUser,
          LANG: environment.mud.processLocale,
          DURIS_TMUX_SESSION: tmuxSessionName,
          DURIS_BASHRC_PATH: bashrcPath,
          DURIS_TMUX_SHELL_COMMAND: tmuxShellCommand,
        },
      },
    );

    // Create session object
    const session: TerminalSession = {
      pty: shell,
      sessionId,
      accountName,
      ws,
      bashrcPath,
      outputBuffer: '',
      outputTimer: null,
    };

    // Store session
    activeSessions.set(sessionId, session);
    sessionsByWebSocket.set(ws, sessionId);

    if (!sessionsByAccount.has(accountName)) {
      sessionsByAccount.set(accountName, new Set());
    }
    sessionsByAccount.get(accountName)!.add(sessionId);

    // Handle PTY output
    shell.onData((data: string) => {
      handleOutput(sessionId, data);
    });

    // Handle PTY exit
    shell.onExit(({ exitCode, signal }) => {
      logger.info(`Terminal session ${sessionId} exited with code ${exitCode}, signal ${signal}`);
      cleanupSession(sessionId, 'ended');
    });

    // Register cleanup before the next await: close/exit can race the PID write.
    await pool.execute('UPDATE terminal_sessions SET pid = ? WHERE id = ?', [shell.pid, sessionId]);
    if (cancelled() || ws.readyState !== WebSocket.OPEN || !activeSessions.has(sessionId)) {
      await cleanupSession(sessionId, 'ended');
      return { sessionId: -1, error: 'Connection closed' };
    }

    logger.info(`Terminal session ${sessionId} created for ${accountName} (PID: ${shell.pid})`);
    recordHookActivity('terminal');
    return { sessionId };
  } catch (error) {
    if (createdId !== undefined) {
      if (activeSessions.has(createdId) || closingSessions.has(createdId)) {
        await cleanupSession(createdId, 'error');
      } else {
        try {
          await pool.execute(
            'UPDATE terminal_sessions SET ended_at = NOW(), status = ? WHERE id = ?',
            ['error', createdId],
          );
        } catch {
          logger.error('Failed to record terminal creation failure');
        }
      }
    }
    logger.error('Error creating terminal session:', error);
    return { sessionId: -1, error: 'Failed to create terminal session' };
  }
}

/**
 * Handle output from PTY (with buffering for database logging)
 */
function handleOutput(sessionId: number, data: string): void {
  const session = activeSessions.get(sessionId);
  if (!session) return;

  // Send to WebSocket immediately
  if (session.ws.readyState === WebSocket.OPEN) {
    sendApplicationMessage(
      session.ws,
      JSON.stringify({
        type: 'TERMINAL_OUTPUT',
        data,
      }),
    );
  }

  // Buffer output for database logging
  session.outputBuffer += data;

  // Flush buffer if it exceeds max size
  if (session.outputBuffer.length >= OUTPUT_BUFFER_MAX_SIZE) {
    void flushOutputBuffer(session);
  } else if (!session.outputTimer) {
    // Set timer to flush buffer
    session.outputTimer = setTimeout(() => {
      void flushOutputBuffer(session);
    }, OUTPUT_BUFFER_INTERVAL);
  }
}

/**
 * Flush output buffer to database
 */
async function flushOutputBuffer(session: TerminalSession): Promise<void> {
  if (!session.outputBuffer) return;

  const data = session.outputBuffer;
  session.outputBuffer = '';

  if (session.outputTimer) {
    clearTimeout(session.outputTimer);
    session.outputTimer = null;
  }

  try {
    await pool.execute('INSERT INTO terminal_logs (session_id, direction, data) VALUES (?, ?, ?)', [
      session.sessionId,
      'output',
      data,
    ]);
  } catch (error) {
    logger.error('Error logging terminal output:', error);
  }
}

/**
 * Write input to PTY
 */
export async function writeInput(sessionId: number, data: string): Promise<boolean> {
  const session = activeSessions.get(sessionId);
  if (!session) {
    logger.error(`Session ${sessionId} not found`);
    return false;
  }

  try {
    // Write to PTY
    session.pty.write(data);

    // Log input to database
    await pool.execute('INSERT INTO terminal_logs (session_id, direction, data) VALUES (?, ?, ?)', [
      sessionId,
      'input',
      data,
    ]);

    return true;
  } catch (error) {
    logger.error('Error writing to terminal:', error);
    return false;
  }
}

/**
 * Resize terminal
 */
export function resizeTerminal(sessionId: number, cols: number, rows: number): boolean {
  const session = activeSessions.get(sessionId);
  if (!session) {
    logger.error(`Session ${sessionId} not found for resize`);
    return false;
  }

  try {
    session.pty.resize(cols, rows);
    return true;
  } catch (error) {
    logger.error('Error resizing terminal:', error);
    return false;
  }
}

/**
 * Get session by WebSocket
 */
export function getSessionByWebSocket(ws: WebSocket): number | undefined {
  return sessionsByWebSocket.get(ws);
}

/**
 * Verify that a terminal operation still belongs to the current socket
 * generation and an active web session. This is intentionally checked for
 * every input/resize/disconnect operation, not only at initial connect.
 */
export async function isTerminalOperationAuthorized(
  sessionId: number,
  ws: WebSocket,
  accountName: string,
  webSessionId: string,
): Promise<boolean> {
  const session = activeSessions.get(sessionId);
  if (!session || session.ws !== ws || session.accountName !== accountName || !webSessionId) {
    return false;
  }

  return hasActiveWebSession(accountName, webSessionId);
}

/**
 * Destroy terminal session
 */
export async function destroySession(sessionId: number): Promise<void> {
  await cleanupSession(sessionId, 'ended');
}

/**
 * Cleanup session (internal)
 */
function cleanupSession(sessionId: number, status: 'ended' | 'error'): Promise<void> {
  const closing = closingSessions.get(sessionId);
  if (closing) return closing;
  const session = activeSessions.get(sessionId);
  if (!session) return Promise.resolve();

  // Revoke ownership and stop the child before waiting on any database I/O.
  activeSessions.delete(sessionId);
  if (sessionsByWebSocket.get(session.ws) === sessionId) sessionsByWebSocket.delete(session.ws);
  const accountSessions = sessionsByAccount.get(session.accountName);
  accountSessions?.delete(sessionId);
  if (accountSessions?.size === 0) sessionsByAccount.delete(session.accountName);

  // Kill PTY process
  try {
    session.pty.kill();
  } catch {
    // Process may already be dead
  }

  const completion = finishCleanup(session, status).finally(() =>
    closingSessions.delete(sessionId),
  );
  closingSessions.set(sessionId, completion);
  return completion;
}

async function finishCleanup(session: TerminalSession, status: 'ended' | 'error'): Promise<void> {
  const { sessionId } = session;
  await flushOutputBuffer(session);

  // Remove the session-specific shell configuration after the PTY exits.
  try {
    await unlink(session.bashrcPath);
  } catch {
    // The file may already have been removed by the sandbox/process.
  }

  // Update database
  try {
    await pool.execute('UPDATE terminal_sessions SET ended_at = NOW(), status = ? WHERE id = ?', [
      status,
      sessionId,
    ]);
  } catch (error) {
    logger.error('Error updating terminal session status:', error);
  }

  // Notify client
  if (session.ws.readyState === WebSocket.OPEN) {
    sendApplicationMessage(
      session.ws,
      JSON.stringify({
        type: 'TERMINAL_CLOSED',
      }),
    );
  }

  logger.info(`Terminal session ${sessionId} cleaned up`);
}

/**
 * Cleanup all sessions (for server shutdown)
 */
export async function cleanupAllSessions(): Promise<void> {
  const pending = [...pendingSessions.values()];
  pending.forEach((creation) => creation.cancel());
  await Promise.all(pending.map((creation) => creation.promise));
  for (const sessionId of activeSessions.keys()) {
    await cleanupSession(sessionId, 'ended');
  }
  await Promise.all(closingSessions.values());
}

/**
 * Destroy every active terminal session owned by an account.
 */
export async function cleanupAccountSessions(accountName: string): Promise<void> {
  const pending = pendingSessions.get(accountName);
  pending?.cancel();
  await pending?.promise;
  for (const sessionId of getAccountSessions(accountName)) {
    await cleanupSession(sessionId, 'ended');
  }
}

/**
 * Get active session count
 */
export function getActiveSessionCount(): number {
  return activeSessions.size;
}

/**
 * Get sessions for account
 */
export function getAccountSessions(accountName: string): number[] {
  const sessions = sessionsByAccount.get(accountName);
  return sessions ? Array.from(sessions) : [];
}
