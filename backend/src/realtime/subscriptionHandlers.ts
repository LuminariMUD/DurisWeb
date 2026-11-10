import logger from '../utils/logger.js';
import { clientState, type MessageHandler } from './clientState.js';
import { verifyWebSocketAuth } from './socketAuth.js';

/** Level-57 admin dashboard subscriptions (player events and WHO list). */
export const subscriptionHandlers: Record<string, MessageHandler> = {
  SUBSCRIBE_PLAYER_EVENTS: async (ws, data) => {
    logger.info('[WebSocket] SUBSCRIBE_PLAYER_EVENTS received');
    const principal = await verifyWebSocketAuth(data.token, 57);
    if (!principal) {
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
  SUBSCRIBE_WHOLIST: async (ws, data) => {
    const principal = await verifyWebSocketAuth(data.token, 57);
    if (!principal) return;
    clientState(ws).wsPrincipal = principal;
    clientState(ws).wholistSubscribed = true;
  },
  UNSUBSCRIBE_WHOLIST: async (ws, _data) => {
    clientState(ws).wholistSubscribed = false;
  },
};
