import * as pty from 'node-pty';
import { WebSocket } from 'ws';
import { pool } from '../db/connection.js';
import { hasActiveWebSession } from './sessionService.js';
import logger from '../utils/logger.js';

// MUD folder path - set via MUD_DIR environment variable
const MUD_FOLDER = process.env.MUD_DIR || '/home/resakse/Coding/DurisMUD';

interface TerminalSession {
  pty: pty.IPty;
  sessionId: number;
  accountName: string;
  ws: WebSocket;
  outputBuffer: string;
  outputTimer: NodeJS.Timeout | null;
}

// Active terminal sessions
const activeSessions = new Map<number, TerminalSession>();
const sessionsByAccount = new Map<string, Set<number>>();
const sessionsByWebSocket = new Map<WebSocket, number>();

// Output buffer settings (batch writes to reduce DB load)
const OUTPUT_BUFFER_INTERVAL = 500; // ms
const OUTPUT_BUFFER_MAX_SIZE = 4096; // bytes

/**
 * Create a new terminal session with bwrap sandboxing
 */
export async function createSession(
  accountName: string,
  ws: WebSocket,
  cols: number = 80,
  rows: number = 24
): Promise<{ sessionId: number; error?: string }> {
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
          return { sessionId: existingSessionIdValue };
        }
      }
    }

    // Create database record
    const [result] = await pool.execute(
      'INSERT INTO terminal_sessions (account_name, status) VALUES (?, ?)',
      [accountName, 'active']
    );
    const sessionId = (result as any).insertId;

    // Spawn PTY with bubblewrap sandboxing
    const shell = pty.spawn('bwrap', [
      // Mount MUD folder as root
      '--bind', MUD_FOLDER, '/',
      // Required system mounts for full shell
      '--dev', '/dev',
      '--proc', '/proc',
      '--ro-bind', '/usr', '/usr',
      '--ro-bind', '/lib', '/lib',
      '--ro-bind', '/lib64', '/lib64',
      '--ro-bind', '/bin', '/bin',
      '--ro-bind', '/sbin', '/sbin',
      '--ro-bind', '/etc/passwd', '/etc/passwd',
      '--ro-bind', '/etc/group', '/etc/group',
      '--ro-bind', '/etc/resolv.conf', '/etc/resolv.conf',
      '--ro-bind', '/etc/terminfo', '/etc/terminfo',
      // Bind tmp for tmux sockets and various utilities
      '--bind', '/tmp', '/tmp',
      // Security options - share PID namespace so tmux can persist between connections
      '--unshare-user',
      '--unshare-ipc',
      '--unshare-uts',
      '--unshare-cgroup',
      '--share-net',
      // Set working directory
      '--chdir', '/',
      // Run tmux with colored prompt - attach to existing session or create new one
      // All overlords share the same tmux session (can see each other's keystrokes)
      '/bin/bash', '-c', `
        # Create a bashrc for the tmux session
        cat > /tmp/.duris_bashrc << 'BASHRC'
export PS1='\\[\\033[1;32m\\]duris\\[\\033[0m\\]:\\[\\033[1;34m\\]\\w\\[\\033[0m\\]\\$ '
export LS_COLORS='di=1;34:ln=1;36:so=1;35:pi=33:ex=1;32:bd=1;33:cd=1;33:su=1;31:sg=1;31:tw=1;34:ow=1;34'
alias ls='ls --color=auto'
alias ll='ls -la --color=auto'
alias grep='grep --color=auto'
BASHRC
        # Check if tmux session exists
        if tmux has-session -t duris 2>/dev/null; then
          tmux attach -t duris
        else
          tmux new-session -s duris "bash --rcfile /tmp/.duris_bashrc"
        fi
      `
    ], {
      name: 'xterm-256color',
      cols,
      rows,
      env: {
        TERM: 'xterm-256color',
        HOME: '/',
        PATH: '/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin',
        SHELL: '/bin/bash',
        USER: process.env.USER || 'duris',
        LANG: 'en_US.UTF-8'
      }
    });

    // Update database with PID
    await pool.execute(
      'UPDATE terminal_sessions SET pid = ? WHERE id = ?',
      [shell.pid, sessionId]
    );

    // Create session object
    const session: TerminalSession = {
      pty: shell,
      sessionId,
      accountName,
      ws,
      outputBuffer: '',
      outputTimer: null
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

    logger.info(`Terminal session ${sessionId} created for ${accountName} (PID: ${shell.pid})`);
    return { sessionId };

  } catch (error) {
    logger.error('Error creating terminal session:', error);
    return { sessionId: -1, error: (error as Error).message };
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
    session.ws.send(JSON.stringify({
      type: 'TERMINAL_OUTPUT',
      data
    }));
  }

  // Buffer output for database logging
  session.outputBuffer += data;

  // Flush buffer if it exceeds max size
  if (session.outputBuffer.length >= OUTPUT_BUFFER_MAX_SIZE) {
    flushOutputBuffer(sessionId);
  } else if (!session.outputTimer) {
    // Set timer to flush buffer
    session.outputTimer = setTimeout(() => {
      flushOutputBuffer(sessionId);
    }, OUTPUT_BUFFER_INTERVAL);
  }
}

/**
 * Flush output buffer to database
 */
async function flushOutputBuffer(sessionId: number): Promise<void> {
  const session = activeSessions.get(sessionId);
  if (!session || !session.outputBuffer) return;

  const data = session.outputBuffer;
  session.outputBuffer = '';

  if (session.outputTimer) {
    clearTimeout(session.outputTimer);
    session.outputTimer = null;
  }

  try {
    await pool.execute(
      'INSERT INTO terminal_logs (session_id, direction, data) VALUES (?, ?, ?)',
      [sessionId, 'output', data]
    );
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
    await pool.execute(
      'INSERT INTO terminal_logs (session_id, direction, data) VALUES (?, ?, ?)',
      [sessionId, 'input', data]
    );

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
async function cleanupSession(sessionId: number, status: 'ended' | 'error'): Promise<void> {
  const session = activeSessions.get(sessionId);
  if (!session) return;

  // Flush any remaining output
  await flushOutputBuffer(sessionId);

  // Kill PTY process
  try {
    session.pty.kill();
  } catch {
    // Process may already be dead
  }

  // Update database
  try {
    await pool.execute(
      'UPDATE terminal_sessions SET ended_at = NOW(), status = ? WHERE id = ?',
      [status, sessionId]
    );
  } catch (error) {
    logger.error('Error updating terminal session status:', error);
  }

  // Notify client
  if (session.ws.readyState === WebSocket.OPEN) {
    session.ws.send(JSON.stringify({
      type: 'TERMINAL_CLOSED'
    }));
  }

  // Remove from maps
  activeSessions.delete(sessionId);
  sessionsByWebSocket.delete(session.ws);

  const accountSessions = sessionsByAccount.get(session.accountName);
  if (accountSessions) {
    accountSessions.delete(sessionId);
    if (accountSessions.size === 0) {
      sessionsByAccount.delete(session.accountName);
    }
  }

  logger.info(`Terminal session ${sessionId} cleaned up`);
}

/**
 * Cleanup all sessions (for server shutdown)
 */
export async function cleanupAllSessions(): Promise<void> {
  for (const sessionId of activeSessions.keys()) {
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
