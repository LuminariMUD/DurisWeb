import { WebSocket } from 'ws';
import logger from '../utils/logger.js';
import { verifyTerminalToken } from '../middleware/auth.js';
import { parseAccountFile } from '../services/accountService.js';
import { hasActiveWebSession } from '../services/sessionService.js';
import { getUserPermissions } from '../services/permissionService.js';
import {
  createSession as createTerminalSession,
  writeInput as writeTerminalInput,
  resizeTerminal,
  destroySession as destroyTerminalSession,
  getSessionByWebSocket,
  isTerminalOperationAuthorized,
} from '../services/terminalService.js';
import { sendApplicationMessage } from '../utils/applicationWebSocket.js';
import { clientState, type MessageHandler } from './clientState.js';

/** Re-check the terminal owner's live session before every terminal operation. */
async function ensureTerminalOperation(ws: WebSocket, sessionId: number): Promise<boolean> {
  const terminalAuth = clientState(ws).terminalAuth;
  const authorized =
    terminalAuth?.accountName && terminalAuth.webSessionId
      ? await isTerminalOperationAuthorized(
          sessionId,
          ws,
          terminalAuth.accountName,
          terminalAuth.webSessionId,
        )
      : false;

  if (authorized) return true;

  await destroyTerminalSession(sessionId);
  if (ws.readyState === WebSocket.OPEN) {
    sendApplicationMessage(
      ws,
      JSON.stringify({
        type: 'TERMINAL_ERROR',
        message: 'Terminal session is no longer active',
      }),
    );
  }
  delete clientState(ws).terminalAuth;
  return false;
}

/** Forget terminal ownership and destroy any terminal session held by this connection. */
export async function closeTerminal(ws: WebSocket): Promise<void> {
  delete clientState(ws).terminalAuth;
  // Cleanup terminal session if exists
  const sessionId = getSessionByWebSocket(ws);
  if (sessionId !== undefined) {
    await destroyTerminalSession(sessionId);
  }
}

/** Interactive terminal (requires `terminal_access` or overlord and a live web session). */
export const terminalHandlers: Record<string, MessageHandler> = {
  TERMINAL_CONNECT: async (ws, data) => {
    try {
      const { token, cols, rows } = data;

      // Verify the short-lived terminal capability
      const payload = verifyTerminalToken(token);
      if (!payload) {
        sendApplicationMessage(
          ws,
          JSON.stringify({
            type: 'TERMINAL_ERROR',
            message: 'Invalid or expired token',
          }),
        );
        return;
      }

      if (!payload.sid || !(await hasActiveWebSession(payload.accountName, payload.sid))) {
        sendApplicationMessage(
          ws,
          JSON.stringify({
            type: 'TERMINAL_ERROR',
            message: 'Session is no longer active',
          }),
        );
        return;
      }

      // Parse account and check permissions
      const accountData = await parseAccountFile(payload.accountName);
      if (!accountData) {
        sendApplicationMessage(
          ws,
          JSON.stringify({
            type: 'TERMINAL_ERROR',
            message: 'Account not found',
          }),
        );
        return;
      }

      const permissions = await getUserPermissions(payload.accountName, accountData.characters);

      // Require terminal_access permission OR Overlord role
      const hasTerminalAccess =
        permissions.role === 'overlord' ||
        permissions.adminPermissions?.includes('terminal_access');

      if (!hasTerminalAccess) {
        sendApplicationMessage(
          ws,
          JSON.stringify({
            type: 'TERMINAL_ERROR',
            message: 'Terminal access permission required',
          }),
        );
        return;
      }

      // Create terminal session
      const result = await createTerminalSession(payload.accountName, ws, cols || 80, rows || 24);

      if (result.error) {
        sendApplicationMessage(
          ws,
          JSON.stringify({
            type: 'TERMINAL_ERROR',
            message: result.error,
          }),
        );
        return;
      }

      clientState(ws).terminalAuth = {
        accountName: payload.accountName,
        webSessionId: payload.sid,
      };

      sendApplicationMessage(
        ws,
        JSON.stringify({
          type: 'TERMINAL_CONNECTED',
          sessionId: result.sessionId,
        }),
      );
    } catch (error) {
      logger.error('Terminal connect error:', error);
      sendApplicationMessage(
        ws,
        JSON.stringify({
          type: 'TERMINAL_ERROR',
          message: 'Failed to create terminal session',
        }),
      );
    }
  },
  TERMINAL_INPUT: async (ws, data) => {
    const sessionId = getSessionByWebSocket(ws);
    if (sessionId !== undefined && (await ensureTerminalOperation(ws, sessionId))) {
      await writeTerminalInput(sessionId, data.data);
    }
  },
  TERMINAL_RESIZE: async (ws, data) => {
    const sessionId = getSessionByWebSocket(ws);
    if (sessionId !== undefined && (await ensureTerminalOperation(ws, sessionId))) {
      resizeTerminal(sessionId, data.cols, data.rows);
    }
  },
  TERMINAL_DISCONNECT: async (ws, _data) => {
    const sessionId = getSessionByWebSocket(ws);
    if (sessionId !== undefined && (await ensureTerminalOperation(ws, sessionId))) {
      await destroyTerminalSession(sessionId);
    }
  },
};
