import type { WebSocket } from 'ws';
import type { WebSocketPrincipal } from '../utils/websocketAccess.js';

/** Per-connection fields the application socket handlers set and broadcasters read. */
export interface ApplicationClientState {
  wsPrincipal?: WebSocketPrincipal;
  playerEventsSubscribed?: boolean;
  wholistSubscribed?: boolean;
}

/** Typed view of the state stored on an application socket. */
export function clientState(client: WebSocket): ApplicationClientState {
  return client as WebSocket & ApplicationClientState;
}
