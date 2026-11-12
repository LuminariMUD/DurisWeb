import type { WebSocket } from 'ws';
import type { WebSocketPrincipal } from '../utils/websocketAccess.js';

/** Per-connection fields set by the application socket handlers; some are read by broadcasts. */
export interface ApplicationClientState {
  wsPrincipal?: WebSocketPrincipal;
  playerEventsSubscribed?: boolean;
  /** Burst rate-limit window. */
  messageCount?: number;
  lastReset?: number;
  /** `category:logName` to the callback registered with the log watcher. */
  logSubscriptions?: Map<string, (newLines: string[]) => void>;
  terminalAuth?: { accountName?: string; webSessionId?: string };
}

/** Typed view of the state stored on an application socket. */
export function clientState(client: WebSocket): ApplicationClientState {
  return client as WebSocket & ApplicationClientState;
}

/**
 * Parsed client JSON. Nothing validates these field types: they describe what the browser
 * sends, as the former untyped handlers assumed. Handlers still verify every token, the
 * zone-id/hash patterns and permissions their safety depends on.
 */
export interface ClientMessage {
  type?: unknown;
  token: string;
  category: 'runtime' | 'player';
  logName: string;
  cols: number;
  rows: number;
  data: string;
  zoneId: string;
  streamType: string;
  targetHash: string;
}

/** Handles one client message type on an application socket. */
export type MessageHandler = (ws: WebSocket, data: ClientMessage) => Promise<void>;
