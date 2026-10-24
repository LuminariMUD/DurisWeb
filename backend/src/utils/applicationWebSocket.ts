import type { Server } from 'node:http';
import { WebSocket, WebSocketServer } from 'ws';

export const APPLICATION_MAX_PAYLOAD_BYTES = 10 * 1024;
export const APPLICATION_MAX_CONNECTIONS = 256;
export const APPLICATION_MAX_BUFFERED_BYTES = 1024 * 1024;
export const APPLICATION_HEARTBEAT_MS = 30_000;

function canWrite(socket: WebSocket, bytes: number): boolean {
  if (socket.readyState !== WebSocket.OPEN) return false;
  // Reserve the largest WebSocket frame header as well as its payload bytes.
  if (socket.bufferedAmount + bytes + 14 > APPLICATION_MAX_BUFFERED_BYTES) {
    // A close frame can itself wait behind the stalled output. Termination
    // releases admission and triggers the normal subscription/session cleanup.
    socket.terminate();
    return false;
  }
  return true;
}

/** Every application producer shares the same queue bound, including terminals. */
export function sendApplicationMessage(socket: WebSocket, message: string): boolean {
  if (!canWrite(socket, Buffer.byteLength(message))) return false;
  socket.send(message, (error) => {
    if (error) socket.terminate();
  });
  return true;
}

/** Application notification/admin sockets; the MUD transport has another owner. */
export function createApplicationWebSocketServer(server: Server): WebSocketServer {
  const alive = new WeakSet<WebSocket>();
  const sockets = new WebSocketServer({
    server,
    path: '/ws',
    maxPayload: APPLICATION_MAX_PAYLOAD_BYTES,
    autoPong: false,
    verifyClient: (_info, done) => {
      done(sockets.clients.size < APPLICATION_MAX_CONNECTIONS, 503, 'Server busy', {
        'Retry-After': '5',
      });
    },
  });

  sockets.on('connection', (socket) => {
    alive.add(socket);
    socket.on('pong', () => alive.add(socket));
    socket.on('ping', (data) => {
      if (canWrite(socket, data.length)) {
        socket.pong(data, false, (error) => {
          if (error) socket.terminate();
        });
      }
    });
    socket.once('close', () => alive.delete(socket));
  });

  const heartbeat = setInterval(() => {
    for (const socket of sockets.clients) {
      if (socket.readyState !== WebSocket.OPEN) continue;
      if (!alive.has(socket) || !canWrite(socket, 0)) {
        socket.terminate();
        continue;
      }
      alive.delete(socket);
      socket.ping(undefined, false, (error) => {
        if (error) socket.terminate();
      });
    }
  }, APPLICATION_HEARTBEAT_MS);
  heartbeat.unref();
  sockets.once('close', () => clearInterval(heartbeat));
  return sockets;
}
