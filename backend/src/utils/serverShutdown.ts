import type { Server } from 'node:http';
import type { WebSocketServer } from 'ws';

const WEBSOCKET_SHUTDOWN_GRACE_MS = 5_000;

/** HTTP shutdown must not wait for upgraded sockets before asking them to close. */
export async function closeWebServer(
  server: Server | null,
  webSockets: WebSocketServer | undefined,
): Promise<void> {
  const httpClosed = new Promise<void>((resolve) => {
    if (server) server.close(() => resolve());
    else resolve();
  });
  const webSocketsClosed = new Promise<void>((resolve) => {
    if (!webSockets) {
      resolve();
      return;
    }
    const deadline = setTimeout(() => {
      for (const client of webSockets.clients) client.terminate();
    }, WEBSOCKET_SHUTDOWN_GRACE_MS);
    deadline.unref();
    for (const client of webSockets.clients) client.close(1000, 'Server shutting down');
    webSockets.close(() => {
      clearTimeout(deadline);
      resolve();
    });
  });
  await Promise.all([httpClosed, webSocketsClosed]);
}
