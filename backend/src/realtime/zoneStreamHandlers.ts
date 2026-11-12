import { safeFailureCode } from '../utils/safeFailureCode.js';
import { WebSocket } from 'ws';
import logger from '../utils/logger.js';
import {
  countZoneItems,
  streamRooms,
  streamMobs,
  streamObjects,
  streamResets,
  countResets,
} from '../services/zoneBuilderStreamer.js';
import { WebSocketStreamLimiter } from '../utils/websocketAccess.js';
import { sendApplicationMessage } from '../utils/applicationWebSocket.js';
import type { MessageHandler } from './clientState.js';
import { authorizeZoneStream } from './socketAuth.js';
import { isPublicError } from '../utils/routeError.js';
import { randomUUID } from 'node:crypto';

const wsStreamLimiter = new WebSocketStreamLimiter<WebSocket>(2);

/** Release every zone stream slot held by a closed connection. */
export function clearZoneStreams(ws: WebSocket): void {
  wsStreamLimiter.clear(ws);
}

/** Builder zone data streams, bounded per connection. */
export const zoneStreamHandlers: Record<string, MessageHandler> = {
  ZONE_STREAM_START: async (ws, data) => {
    const { zoneId, streamType } = data;

    if (!zoneId || !['rooms', 'mobs', 'objects'].includes(streamType)) {
      sendApplicationMessage(
        ws,
        JSON.stringify({
          type: 'ZONE_STREAM_ERROR',
          zoneId,
          streamType,
          message: 'Invalid zone ID or stream type',
        }),
      );
      return;
    }

    const principal = await authorizeZoneStream(ws, data.token, zoneId);
    if (!principal) {
      sendApplicationMessage(
        ws,
        JSON.stringify({
          type: 'ZONE_STREAM_ERROR',
          zoneId,
          streamType,
          message: 'Authentication or zone view permission required',
        }),
      );
      return;
    }

    const streamKey = `zone:${zoneId}:${streamType}`;
    if (!wsStreamLimiter.acquire(ws, streamKey)) {
      sendApplicationMessage(
        ws,
        JSON.stringify({
          type: 'ZONE_STREAM_ERROR',
          zoneId,
          streamType,
          message: 'Too many active zone streams',
        }),
      );
      return;
    }

    try {
      // Get total count first
      const counts = await countZoneItems(zoneId);
      const total = counts[streamType as 'rooms' | 'mobs' | 'objects'];

      // Send start event
      sendApplicationMessage(
        ws,
        JSON.stringify({
          type: 'ZONE_STREAM_START',
          zoneId,
          streamType,
          total,
        }),
      );

      // Select streamer
      const streamer =
        streamType === 'rooms' ? streamRooms : streamType === 'mobs' ? streamMobs : streamObjects;

      let loaded = 0;

      // Stream chunks
      for await (const chunk of streamer(zoneId)) {
        // Check if WebSocket is still open
        if (ws.readyState !== WebSocket.OPEN) {
          break;
        }

        loaded += chunk.length;
        sendApplicationMessage(
          ws,
          JSON.stringify({
            type: 'ZONE_STREAM_PROGRESS',
            zoneId,
            streamType,
            loaded,
            total,
            items: chunk,
          }),
        );
      }

      // Send complete event
      if (ws.readyState === WebSocket.OPEN) {
        sendApplicationMessage(
          ws,
          JSON.stringify({
            type: 'ZONE_STREAM_COMPLETE',
            zoneId,
            streamType,
            total: loaded,
          }),
        );
      }
    } catch (error) {
      const reference = randomUUID();
      logger.error('Zone WebSocket stream failed', { reference, code: safeFailureCode(error) });
      if (ws.readyState === WebSocket.OPEN) {
        sendApplicationMessage(
          ws,
          JSON.stringify({
            type: 'ZONE_STREAM_ERROR',
            zoneId,
            streamType,
            message: isPublicError(error)
              ? error.message
              : `Failed to load zone data (reference ${reference})`,
          }),
        );
      }
    } finally {
      wsStreamLimiter.release(ws, streamKey);
    }
  },
  ZONE_RESETS_STREAM_START: async (ws, data) => {
    const { zoneId } = data;

    if (!zoneId) {
      sendApplicationMessage(
        ws,
        JSON.stringify({
          type: 'ZONE_RESETS_STREAM_ERROR',
          zoneId,
          message: 'Invalid zone ID',
        }),
      );
      return;
    }

    const principal = await authorizeZoneStream(ws, data.token, zoneId);
    if (!principal) {
      sendApplicationMessage(
        ws,
        JSON.stringify({
          type: 'ZONE_RESETS_STREAM_ERROR',
          zoneId,
          message: 'Authentication or zone view permission required',
        }),
      );
      return;
    }

    const streamKey = `resets:${zoneId}`;
    if (!wsStreamLimiter.acquire(ws, streamKey)) {
      sendApplicationMessage(
        ws,
        JSON.stringify({
          type: 'ZONE_RESETS_STREAM_ERROR',
          zoneId,
          message: 'Too many active zone streams',
        }),
      );
      return;
    }

    try {
      // Get total count first
      const total = await countResets(zoneId);

      // Send start event
      sendApplicationMessage(
        ws,
        JSON.stringify({
          type: 'ZONE_RESETS_STREAM_START',
          zoneId,
          total,
        }),
      );

      let loaded = 0;

      // Stream chunks
      for await (const chunk of streamResets(zoneId)) {
        // Check if WebSocket is still open
        if (ws.readyState !== WebSocket.OPEN) {
          break;
        }

        loaded += chunk.length;
        sendApplicationMessage(
          ws,
          JSON.stringify({
            type: 'ZONE_RESETS_STREAM_PROGRESS',
            zoneId,
            loaded,
            total,
            items: chunk,
          }),
        );
      }

      // Send complete event
      if (ws.readyState === WebSocket.OPEN) {
        sendApplicationMessage(
          ws,
          JSON.stringify({
            type: 'ZONE_RESETS_STREAM_COMPLETE',
            zoneId,
            total: loaded,
          }),
        );
      }
    } catch (error) {
      const reference = randomUUID();
      logger.error('Zone reset WebSocket stream failed', {
        reference,
        code: safeFailureCode(error),
      });
      if (ws.readyState === WebSocket.OPEN) {
        sendApplicationMessage(
          ws,
          JSON.stringify({
            type: 'ZONE_RESETS_STREAM_ERROR',
            zoneId,
            message: isPublicError(error)
              ? error.message
              : `Failed to load zone data (reference ${reference})`,
          }),
        );
      }
    } finally {
      wsStreamLimiter.release(ws, streamKey);
    }
  },
};
