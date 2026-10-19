import { describe, expect, it } from '@jest/globals';
import { once } from 'node:events';
import { createServer } from 'node:http';
import { WebSocket, WebSocketServer } from 'ws';
import { closeWebServer } from '../serverShutdown.js';

async function connectedServer() {
  const server = createServer((_request, response) => response.end('ok'));
  const webSockets = new WebSocketServer({ server });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Missing test listener');
  const client = new WebSocket(`ws://127.0.0.1:${address.port}`);
  await once(client, 'open');
  return { server, webSockets, client };
}

describe('web server shutdown', () => {
  it('closes a connected WebSocket normally while draining the HTTP listener', async () => {
    const { server, webSockets, client } = await connectedServer();
    try {
      const closed = once(client, 'close');
      await closeWebServer(server, webSockets);
      const [code, reason] = await closed;
      expect(code).toBe(1000);
      expect(String(reason)).toBe('Server shutting down');
      expect(server.listening).toBe(false);
      expect(webSockets.clients.size).toBe(0);
    } finally {
      client.terminate();
      for (const peer of webSockets.clients) peer.terminate();
      server.closeAllConnections();
      server.close();
    }
  });

  it('finishes shutdown when a peer does not read or acknowledge the close frame', async () => {
    const { server, webSockets, client } = await connectedServer();
    try {
      client.pause();
      await closeWebServer(server, webSockets);
      expect(server.listening).toBe(false);
      expect(webSockets.clients.size).toBe(0);
    } finally {
      client.resume();
      client.terminate();
      for (const peer of webSockets.clients) peer.terminate();
      server.closeAllConnections();
      server.close();
    }
  });
});
