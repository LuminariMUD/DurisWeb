import { WebSocket } from 'ws';
import { watchLog, unwatchLog, type LogWatchCallback } from '../services/logWatchService.js';
import { hasWebSocketPermission } from '../utils/websocketAccess.js';
import { sendApplicationMessage } from '../utils/applicationWebSocket.js';
import { clientState, type MessageHandler } from './clientState.js';
import { verifyWebSocketAuth } from './socketAuth.js';
import { randomUUID } from 'node:crypto';
import logger from '../utils/logger.js';
import { safeFailureCode } from '../utils/safeFailureCode.js';

const pendingSubscriptions = new WeakMap<WebSocket, Map<string, symbol>>();

/** Unwatch every log this connection subscribed to. */
export function clearLogSubscriptions(ws: WebSocket): void {
  pendingSubscriptions.get(ws)?.clear();
  pendingSubscriptions.delete(ws);
  // Unsubscribe from all logs on disconnect with proper callback cleanup
  clientState(ws).logSubscriptions!.forEach(
    (callback: LogWatchCallback, subscriptionKey: string) => {
      const separator = subscriptionKey.indexOf(':');
      const category = subscriptionKey.slice(0, separator);
      const logName = subscriptionKey.slice(separator + 1);
      try {
        unwatchLog(category as 'runtime' | 'player', logName, callback);
      } catch (error) {
        logger.error('Log watcher cleanup failed', { code: safeFailureCode(error) });
      }
    },
  );
  clientState(ws).logSubscriptions!.clear();
}

/** Release denied subscriptions and tell the client its Live acknowledgement no longer holds. */
export function revokeLogSubscriptions(ws: WebSocket): void {
  const keys = [...(clientState(ws).logSubscriptions?.keys() ?? [])];
  clearLogSubscriptions(ws);
  for (const key of keys) {
    const separator = key.indexOf(':');
    sendApplicationMessage(
      ws,
      JSON.stringify({
        type: 'ERROR',
        category: key.slice(0, separator),
        logName: key.slice(separator + 1),
        message: 'Server log permission required',
      }),
    );
  }
}

/** Server log tail subscriptions (requires `view_server_logs`). */
export const logStreamHandlers: Record<string, MessageHandler> = {
  SUBSCRIBE_LOG: async (ws, data) => {
    const { category, logName } = data;
    if (
      !['runtime', 'player'].includes(category) ||
      typeof logName !== 'string' ||
      !logName.trim() ||
      logName.length > 255
    ) {
      sendApplicationMessage(
        ws,
        JSON.stringify({ type: 'ERROR', message: 'Invalid log subscription' }),
      );
      return;
    }
    const subscriptionKey = `${category}:${logName}`;
    const pending = pendingSubscriptions.get(ws) ?? new Map<string, symbol>();
    pendingSubscriptions.set(ws, pending);
    const request = Symbol();
    pending.set(subscriptionKey, request);
    try {
      const principal = await verifyWebSocketAuth(data.token, 0);
      if (pending.get(subscriptionKey) !== request) return;
      if (!principal || !hasWebSocketPermission(principal, 'view_server_logs')) {
        sendApplicationMessage(
          ws,
          JSON.stringify({
            type: 'ERROR',
            category,
            logName,
            message: 'Server log permission required',
          }),
        );
        return;
      }
      // The socket can close while auth is checked; its close cleanup has already run, so a
      // watcher registered now would never be removed.
      if (ws.readyState !== WebSocket.OPEN) return;
      clientState(ws).wsPrincipal = principal;

      const confirm = () =>
        sendApplicationMessage(ws, JSON.stringify({ type: 'LOG_SUBSCRIBED', category, logName }));

      // Check if already subscribed
      if (clientState(ws).logSubscriptions!.has(subscriptionKey)) {
        confirm();
        return;
      }

      // Create and store callback for proper cleanup later
      const callback: LogWatchCallback = (newLines, unavailable) => {
        // Only send if still subscribed and connection open
        if (
          clientState(ws).logSubscriptions!.get(subscriptionKey) === callback &&
          ws.readyState === WebSocket.OPEN
        ) {
          if (unavailable) {
            clientState(ws).logSubscriptions!.delete(subscriptionKey);
            sendApplicationMessage(
              ws,
              JSON.stringify({ type: 'ERROR', category, logName, message: 'Log unavailable' }),
            );
            return;
          }
          if (!hasWebSocketPermission(clientState(ws).wsPrincipal, 'view_server_logs')) return;
          sendApplicationMessage(
            ws,
            JSON.stringify({
              type: 'LOG_UPDATE',
              category,
              logName,
              newLines,
            }),
          );
        }
      };

      // Start watching the log file; an unknown or unreadable log is not a subscription.
      if (!watchLog(category, logName, callback)) {
        sendApplicationMessage(
          ws,
          JSON.stringify({ type: 'ERROR', category, logName, message: 'Log unavailable' }),
        );
        return;
      }

      // Store callback in Map for cleanup
      clientState(ws).logSubscriptions!.set(subscriptionKey, callback);

      // Confirm subscription
      confirm();
    } catch (error) {
      const reference = randomUUID();
      logger.error('Log subscription failed', { reference, code: safeFailureCode(error) });
      if (pending.get(subscriptionKey) !== request || ws.readyState !== WebSocket.OPEN) return;
      sendApplicationMessage(
        ws,
        JSON.stringify({
          type: 'ERROR',
          category,
          logName,
          message: 'Log subscription unavailable',
          reference,
        }),
      );
    } finally {
      if (pending.get(subscriptionKey) === request) pending.delete(subscriptionKey);
      if (!pending.size && pendingSubscriptions.get(ws) === pending)
        pendingSubscriptions.delete(ws);
    }
  },
  UNSUBSCRIBE_LOG: async (ws, data) => {
    const { category, logName } = data;
    const subscriptionKey = `${category}:${logName}`;
    const pending = pendingSubscriptions.get(ws);
    pending?.delete(subscriptionKey);
    if (pending && !pending.size) pendingSubscriptions.delete(ws);

    // Get the callback before removing
    const callback = clientState(ws).logSubscriptions!.get(subscriptionKey);

    // Remove from client's subscriptions
    clientState(ws).logSubscriptions!.delete(subscriptionKey);

    // Stop watching with the specific callback
    if (callback) {
      try {
        unwatchLog(category, logName, callback);
      } catch (error) {
        logger.error('Log watcher cleanup failed', { code: safeFailureCode(error) });
      }
    }

    // Confirm unsubscription
    sendApplicationMessage(
      ws,
      JSON.stringify({
        type: 'LOG_UNSUBSCRIBED',
        category,
        logName,
      }),
    );
  },
};
