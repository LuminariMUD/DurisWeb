import { Router, Request, Response, type IRouter } from 'express';
import logger, { getErrorMessage } from '../../utils/logger.js';
import * as fs from 'fs';
import * as path from 'path';
import { ZipArchive } from 'archiver';
import { UnsafeZonePathError, resolveSafeZoneFilePath } from '../../utils/safeZonePath.js';
import { getBackendConfiguration } from '../../config/environment.js';
import {
  countZoneItems,
  streamRooms,
  streamMobs,
  streamObjects,
} from '../../services/zoneBuilderStreamer.js';
import { logBuilderActivity } from './shared.js';

export const builderStreamExportRoutes: IRouter = Router();

const MUD_DIR = getBackendConfiguration().mud.directory;
const AREAS_DIR = path.join(MUD_DIR, 'areas');

// GET /api/builder/zones/:id/counts - Get item counts for progress estimation
builderStreamExportRoutes.get('/zones/:id/counts', async (req: Request, res: Response) => {
  try {
    const zoneId = req.params.id;
    if (!zoneId || zoneId.trim() === '') {
      res.status(400).json({ error: 'Invalid zone ID' });
      return;
    }

    const counts = await countZoneItems(zoneId);
    res.json(counts);
  } catch (error) {
    logger.error('Error getting zone counts:', error);
    res.status(500).json({ error: 'Failed to get zone counts', message: getErrorMessage(error) });
  }
});

// GET /api/builder/zones/:id/stream/:type - SSE streaming endpoint for zone data
// type = 'rooms' | 'mobs' | 'objects'
builderStreamExportRoutes.get('/zones/:id/stream/:type', async (req: Request, res: Response) => {
  const zoneId = req.params.id;
  const type = req.params.type as 'rooms' | 'mobs' | 'objects';

  if (!zoneId || zoneId.trim() === '') {
    res.status(400).json({ error: 'Invalid zone ID' });
    return;
  }

  if (!['rooms', 'mobs', 'objects'].includes(type)) {
    res.status(400).json({ error: 'Invalid type. Must be rooms, mobs, or objects' });
    return;
  }

  // Set SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no'); // Disable nginx buffering

  // Flush headers immediately
  res.flushHeaders();

  try {
    // Get counts for progress tracking
    const counts = await countZoneItems(zoneId);
    const total = counts[type];

    // Helper to flush response buffer
    const flush = () => {
      if (typeof (res as any).flush === 'function') {
        (res as any).flush();
      }
    };

    // Send start event
    res.write(`event: start\ndata: ${JSON.stringify({ type, total })}\n\n`);
    flush();

    // Select the appropriate streamer
    const streamer = type === 'rooms' ? streamRooms : type === 'mobs' ? streamMobs : streamObjects;
    let loaded = 0;

    // Stream data in chunks
    for await (const chunk of streamer(zoneId)) {
      loaded += chunk.length;
      res.write(`event: progress\ndata: ${JSON.stringify({ type, loaded, items: chunk })}\n\n`);
      flush();
    }

    // Send complete event
    res.write(`event: complete\ndata: ${JSON.stringify({ type, total: loaded })}\n\n`);
    flush();
    res.end();
  } catch (error) {
    logger.error(`Error streaming ${type} for zone ${zoneId}:`, error);
    res.write(
      `event: error\ndata: ${JSON.stringify({ type, message: getErrorMessage(error) })}\n\n`,
    );
    res.end();
  }
});

// =============================================================================
// DOWNLOAD/EXPORT ZONE FILES
// =============================================================================

// GET /api/builder/zones/:id/download/:type - Download zone file(s)
// type = wld | mob | obj | zon | all (zip)
builderStreamExportRoutes.get('/zones/:id/download/:type', async (req: Request, res: Response) => {
  try {
    const zoneId = req.params.id;
    const downloadType = req.params.type as 'wld' | 'mob' | 'obj' | 'zon' | 'all';

    if (!zoneId || zoneId.trim() === '') {
      res.status(400).json({ error: 'Invalid zone ID' });
      return;
    }

    const validTypes = ['wld', 'mob', 'obj', 'zon', 'all'];
    if (!validTypes.includes(downloadType)) {
      res.status(400).json({ error: 'Invalid download type. Must be wld, mob, obj, zon, or all' });
      return;
    }

    // File type to extension mapping
    const fileExtensions: Record<string, string> = {
      wld: 'wld',
      mob: 'mob',
      obj: 'obj',
      zon: 'zon',
    };

    if (downloadType === 'all') {
      // Resolve all paths before opening the response stream.
      const zoneFiles = Object.values(fileExtensions).map((ext) => ({
        ext,
        filePath: resolveSafeZoneFilePath(AREAS_DIR, zoneId, ext),
      }));

      // Create zip archive with all zone files
      const archive = new ZipArchive({ zlib: { level: 9 } });

      res.setHeader('Content-Type', 'application/zip');
      res.setHeader('Content-Disposition', `attachment; filename="${zoneId}.zip"`);

      archive.pipe(res);

      // Add each file type to the archive
      for (const { ext, filePath } of zoneFiles) {
        if (fs.existsSync(filePath)) {
          archive.file(filePath, { name: `${zoneId}.${ext}` });
        }
      }

      await archive.finalize();

      await logBuilderActivity(
        req.user?.accountName || 'unknown',
        'zone_download',
        zoneId,
        null,
        'zone',
        null,
        'all (zip)',
        req.ip || req.socket.remoteAddress || null,
      );
    } else {
      // Download single file
      const ext = fileExtensions[downloadType];
      const filePath = resolveSafeZoneFilePath(AREAS_DIR, zoneId, ext);

      if (!fs.existsSync(filePath)) {
        res.status(404).json({ error: `File ${zoneId}.${ext} not found` });
        return;
      }

      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${zoneId}.${ext}"`);

      const fileStream = fs.createReadStream(filePath);
      fileStream.pipe(res);

      await logBuilderActivity(
        req.user?.accountName || 'unknown',
        'zone_download',
        zoneId,
        null,
        'zone',
        null,
        ext,
        req.ip || req.socket.remoteAddress || null,
      );
    }
  } catch (error) {
    if (error instanceof UnsafeZonePathError) {
      res.status(400).json({ error: 'Invalid or unsafe zone path' });
      return;
    }
    logger.error('Error downloading zone file:', error);
    res
      .status(500)
      .json({ error: 'Failed to download zone file', message: getErrorMessage(error) });
  }
});
