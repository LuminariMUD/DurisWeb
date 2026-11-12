import { WebSocket } from 'ws';
import type { IncomingMessage } from 'node:http';
import logger from '../utils/logger.js';
import { sendApplicationMessage } from '../utils/applicationWebSocket.js';
import { clientState, type ClientMessage, type MessageHandler } from './clientState.js';
import { hydrateWebSocketPrincipal } from './socketAuth.js';
import { subscriptionHandlers } from './subscriptionHandlers.js';
import { clearLogSubscriptions, logStreamHandlers } from './logStreamHandlers.js';
import { closeTerminal, terminalHandlers } from './terminalHandlers.js';
import { clearZoneStreams, zoneStreamHandlers } from './zoneStreamHandlers.js';
import { deployHandlers } from './deployHandler.js';

/** One handler per client message type; types are disjoint, so lookup replaces the old if-chain. */
const handlers: Readonly<Record<string, MessageHandler>> = {
  ...logStreamHandlers,
  ...subscriptionHandlers,
  ...terminalHandlers,
  ...zoneStreamHandlers,
  ...deployHandlers,
};

/** Rate-limit, parse and dispatch one client message. */
async function handleMessage(ws: WebSocket, message: string | Buffer): Promise<void> {
  const state = clientState(ws);
  // Security: Rate limiting (20 messages per second burst)
  const now = Date.now();
  if (now - state.lastReset! > 1000) {
    state.messageCount = 0;
    state.lastReset = now;
  }
  state.messageCount!++;

  if (state.messageCount! > 20) {
    sendApplicationMessage(ws, JSON.stringify({ type: 'ERROR', message: 'Rate limit exceeded' }));
    return;
  }

  // Security: Safe JSON parsing
  let data: ClientMessage;
  try {
    data = JSON.parse(message.toString());
  } catch {
    sendApplicationMessage(ws, JSON.stringify({ type: 'ERROR', message: 'Invalid JSON' }));
    return;
  }

  try {
    // Fast ping/pong for latency measurement
    if (data.type === 'ping') {
      sendApplicationMessage(ws, '{"type":"pong"}');
      return;
    }

    // Strict string match, as the former if-chain compared with ===.
    const handler =
      typeof data.type === 'string' && Object.hasOwn(handlers, data.type)
        ? handlers[data.type]
        : undefined;
    await handler?.(ws, data);
  } catch (error) {
    logger.error('Error processing WebSocket message:', error);
  }
}

/** Connection lifecycle for the application socket: state, message dispatch and cleanup. */
export function handleApplicationConnection(ws: WebSocket, request: IncomingMessage): void {
  const state = clientState(ws);
  state.messageCount = 0;
  state.lastReset = Date.now();
  state.logSubscriptions = new Map<string, (newLines: string[]) => void>();
  state.playerEventsSubscribed = false;
  state.wholistSubscribed = false;
  void hydrateWebSocketPrincipal(ws, request.headers.cookie);

  // Handle incoming messages
  ws.on('message', (message: string | Buffer) => handleMessage(ws, message));

  ws.on('close', async () => {
    // Each step runs even if another fails; a rejected close listener would be an
    // unhandled rejection, which ends the process.
    const steps: Array<() => unknown> = [
      () => clearZoneStreams(ws),
      () => clearLogSubscriptions(ws),
      () => closeTerminal(ws),
    ];
    for (const step of steps) {
      try {
        await step();
      } catch (error) {
        logger.error('Application WebSocket close cleanup failed:', error);
      }
    }
  });

  ws.on('error', () => {
    logger.warn('Application WebSocket transport error');
  });

  // Send welcome message
  sendApplicationMessage(
    ws,
    JSON.stringify({
      type: 'CONNECTED',
      message: 'Connected to DurisMUD PvP WebSocket',
    }),
  );
}
