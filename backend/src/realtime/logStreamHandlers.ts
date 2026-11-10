import type { WebSocket } from 'ws';
import { watchLog, unwatchLog } from '../services/logWatchService.js';
import { hasWebSocketPermission } from '../utils/websocketAccess.js';
import { sendApplicationMessage } from '../utils/applicationWebSocket.js';
import { clientState, type MessageHandler } from './clientState.js';
import { verifyWebSocketAuth } from './socketAuth.js';

/** Unwatch every log this connection subscribed to. */
export function clearLogSubscriptions(ws: WebSocket): void {
  // Unsubscribe from all logs on disconnect with proper callback cleanup
  clientState(ws).logSubscriptions!.forEach(
    (callback: (newLines: string[]) => void, subscriptionKey: string) => {
      const [category, logName] = subscriptionKey.split(':');
      unwatchLog(category as 'runtime' | 'player', logName, callback);
    },
  );
  clientState(ws).logSubscriptions!.clear();
}

/** Server log tail subscriptions (requires `view_server_logs`). */
export const logStreamHandlers: Record<string, MessageHandler> = {
  SUBSCRIBE_LOG: async (ws, data) => {
    const principal = await verifyWebSocketAuth(data.token, 0);
    if (!principal || !hasWebSocketPermission(principal, 'view_server_logs')) {
      sendApplicationMessage(
        ws,
        JSON.stringify({ type: 'ERROR', message: 'Server log permission required' }),
      );
      return;
    }
    clientState(ws).wsPrincipal = principal;

    const { category, logName } = data;
    const subscriptionKey = `${category}:${logName}`;

    // Check if already subscribed
    if (clientState(ws).logSubscriptions!.has(subscriptionKey)) {
      return;
    }

    // Create and store callback for proper cleanup later
    const callback = (newLines: string[]) => {
      // Only send if still subscribed and connection open
      if (clientState(ws).logSubscriptions!.has(subscriptionKey) && ws.readyState === ws.OPEN) {
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

    // Store callback in Map for cleanup
    clientState(ws).logSubscriptions!.set(subscriptionKey, callback);

    // Start watching the log file
    watchLog(category, logName, callback);

    // Confirm subscription
    sendApplicationMessage(
      ws,
      JSON.stringify({
        type: 'LOG_SUBSCRIBED',
        category,
        logName,
      }),
    );
  },
  UNSUBSCRIBE_LOG: async (ws, data) => {
    const { category, logName } = data;
    const subscriptionKey = `${category}:${logName}`;

    // Get the callback before removing
    const callback = clientState(ws).logSubscriptions!.get(subscriptionKey);

    // Remove from client's subscriptions
    clientState(ws).logSubscriptions!.delete(subscriptionKey);

    // Stop watching with the specific callback
    if (callback) {
      unwatchLog(category, logName, callback);
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
