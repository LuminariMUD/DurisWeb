import { WebSocket } from 'ws';
import logger from '../utils/logger.js';
import { clientState, type MessageHandler } from './clientState.js';
import { verifyWebSocketAuth } from './socketAuth.js';

/** Level-57 admin dashboard subscription to player login/logout events. */
export const subscriptionHandlers: Record<string, MessageHandler> = {
  SUBSCRIBE_PLAYER_EVENTS: async (ws, data) => {
    logger.info('[WebSocket] SUBSCRIBE_PLAYER_EVENTS received');
    const principal = await verifyWebSocketAuth(data.token, 57);
    if (!principal || ws.readyState !== WebSocket.OPEN) {
      logger.warn('[WebSocket] player events subscription auth failed');
      return;
    }
    clientState(ws).wsPrincipal = principal;
    clientState(ws).playerEventsSubscribed = true;
    logger.info('[WebSocket] client subscribed to player events');
  },
  UNSUBSCRIBE_PLAYER_EVENTS: async (ws, _data) => {
    clientState(ws).playerEventsSubscribed = false;
  },
};
