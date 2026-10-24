import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { once } from 'node:events';
import { createServer, type Server } from 'node:http';
import { readFileSync } from 'node:fs';
import { WebSocket, type ClientOptions, type WebSocketServer } from 'ws';
import {
  APPLICATION_HEARTBEAT_MS,
  APPLICATION_MAX_BUFFERED_BYTES,
  APPLICATION_MAX_CONNECTIONS,
  APPLICATION_MAX_PAYLOAD_BYTES,
  createApplicationWebSocketServer,
  sendApplicationMessage,
} from '../applicationWebSocket.js';
import { closeWebServer } from '../serverShutdown.js';

async function gateway() {
  const server = createServer((_req, res) => res.end('ordinary HTTP'));
  const sockets = createApplicationWebSocketServer(server);
  const messages: string[] = [];
  sockets.on('connection', (socket) => {
    socket.on('error', () => {}); // Oversized-frame rejection is asserted through the peer close code.
    socket.on('message', (message) => {
      messages.push(message.toString());
      sendApplicationMessage(socket, message.toString());
    });
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Missing isolated listener');
  const clients: WebSocket[] = [];
  const connect = async (options?: ClientOptions) => {
    const client = new WebSocket(`ws://127.0.0.1:${address.port}/ws`, options);
    clients.push(client);
    client.on('error', () => {});
    await once(client, 'open');
    return client;
  };
  const result = { server, sockets, messages, clients, connect, address };
  fixtures.push(result);
  return result;
}
const fixtures: { server: Server; sockets: WebSocketServer; clients: WebSocket[] }[] = [];

afterEach(async () => {
  jest.useRealTimers();
  for (const fixture of fixtures.splice(0)) {
    for (const client of fixture.clients) client.terminate();
    for (const socket of fixture.sockets.clients) socket.terminate();
    await closeWebServer(fixture.server, fixture.sockets);
  }
});

describe('application WebSocket transport bounds', () => {
  it('accepts the exact byte bound and normal application/control traffic', async () => {
    const fixture = await gateway();
    const client = await fixture.connect();
    const echoed = once(client, 'message');
    client.send('é'.repeat(APPLICATION_MAX_PAYLOAD_BYTES / 2));
    expect((await echoed)[0]).toHaveLength(APPLICATION_MAX_PAYLOAD_BYTES);
    const pong = once(client, 'pong');
    client.ping('control-ping');
    expect(String((await pong)[0])).toBe('control-ping');
    const ordinary = once(client, 'message');
    client.send(JSON.stringify({ type: 'ping' }));
    expect(JSON.parse(String((await ordinary)[0]))).toEqual({ type: 'ping' });
    const response = await fetch(`http://127.0.0.1:${fixture.address.port}/health`);
    expect(await response.text()).toBe('ordinary HTTP');
  });

  it.each(['single', 'fragmented', 'multibyte'])(
    'rejects oversized %s input before any application message is emitted',
    async (kind) => {
      const fixture = await gateway();
      const client = await fixture.connect();
      const closed = once(client, 'close');
      if (kind === 'fragmented') {
        client.send('x'.repeat(6000), { fin: false });
        client.send('x'.repeat(6000), { fin: true });
      } else {
        client.send(
          kind === 'multibyte' ? 'é'.repeat(6000) : 'x'.repeat(APPLICATION_MAX_PAYLOAD_BYTES + 1),
        );
      }
      expect((await closed)[0]).toBe(1009);
      expect(fixture.messages).toEqual([]);
    },
  );

  it('refuses excess upgrades before allocation and admits a peer after a slot is released', async () => {
    const fixture = await gateway();
    for (let count = 0; count < APPLICATION_MAX_CONNECTIONS; count += 16) {
      await Promise.all(
        Array.from({ length: Math.min(16, APPLICATION_MAX_CONNECTIONS - count) }, () =>
          fixture.connect(),
        ),
      );
    }
    expect(fixture.sockets.clients.size).toBe(APPLICATION_MAX_CONNECTIONS);
    const denied = new WebSocket(`ws://127.0.0.1:${fixture.address.port}/ws`);
    fixture.clients.push(denied);
    denied.on('error', () => {});
    const [, response] = await once(denied, 'unexpected-response');
    expect(response.statusCode).toBe(503);
    expect(response.headers['retry-after']).toBe('5');
    response.resume();
    denied.terminate();
    const released = new Promise<void>((resolve) => {
      for (const peer of fixture.sockets.clients) peer.once('close', () => resolve());
    });
    fixture.clients[0].terminate();
    await released;
    await fixture.connect();
    expect(fixture.sockets.clients.size).toBe(APPLICATION_MAX_CONNECTIONS);
  });

  it('keeps responsive peers through multiple heartbeat periods', async () => {
    jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate'] });
    const fixture = await gateway();
    const client = await fixture.connect();
    const peer = [...fixture.sockets.clients][0];
    for (let tick = 0; tick < 3; tick++) {
      const replied = once(peer, 'pong');
      jest.advanceTimersByTime(APPLICATION_HEARTBEAT_MS);
      await replied;
    }
    expect(client.readyState).toBe(WebSocket.OPEN);
  });

  it('terminates a peer that misses a heartbeat and releases its admission slot', async () => {
    jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate'] });
    const fixture = await gateway();
    const client = await fixture.connect({ autoPong: false });
    const ping = once(client, 'ping');
    jest.advanceTimersByTime(APPLICATION_HEARTBEAT_MS);
    await ping;
    const closed = once(client, 'close');
    jest.advanceTimersByTime(APPLICATION_HEARTBEAT_MS);
    expect((await closed)[0]).toBe(1006);
    expect(fixture.sockets.clients.size).toBe(0);
  });

  it('terminates a real slow consumer instead of growing its application queue', async () => {
    const fixture = await gateway();
    const client = await fixture.connect();
    const peer = [...fixture.sockets.clients][0];
    client.pause();
    let accepted = true;
    for (let count = 0; count < 256 && accepted; count++) {
      accepted = sendApplicationMessage(peer, 'x'.repeat(64 * 1024));
    }
    expect(accepted).toBe(false);
    expect(peer.bufferedAmount).toBeLessThanOrEqual(APPLICATION_MAX_BUFFERED_BYTES);
    client.resume();
  });

  it('rejects a single excessive output before enqueueing it', async () => {
    const fixture = await gateway();
    await fixture.connect();
    const peer = [...fixture.sockets.clients][0];
    const send = jest.spyOn(peer, 'send');
    expect(sendApplicationMessage(peer, 'é'.repeat(APPLICATION_MAX_BUFFERED_BYTES / 2 + 1))).toBe(
      false,
    );
    expect(send).not.toHaveBeenCalled();
  });

  it('removes the heartbeat when its server shuts down', async () => {
    jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate'] });
    const fixture = await gateway();
    expect(jest.getTimerCount()).toBe(1);
    await closeWebServer(fixture.server, fixture.sockets);
    expect(jest.getTimerCount()).toBe(0);
  });

  it('wires all application producers through the guard without changing the MUD transport', () => {
    const source = readFileSync(new URL('../../index.ts', import.meta.url), 'utf8');
    expect(source).toContain('wss = createApplicationWebSocketServer(server)');
    for (const url of [
      '../../index.ts',
      '../../services/terminalService.ts',
      '../../services/deploymentService.ts',
    ]) {
      const producer = readFileSync(new URL(url, import.meta.url), 'utf8');
      expect(producer).toContain('sendApplicationMessage(');
      expect(producer).not.toMatch(/\b(?:ws|client)\.send\(/);
    }
    expect(
      readFileSync(new URL('../../services/mudAuctionClient.ts', import.meta.url), 'utf8'),
    ).not.toContain('sendApplicationMessage');
  });
});
