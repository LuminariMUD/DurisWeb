import { Router, Request, Response, type IRouter } from 'express';
import logger, { getErrorMessage } from '../../utils/logger.js';
import { param, validationResult } from 'express-validator';
import { requireAuth, requirePermission } from '../../middleware/auth.js';
import { listLogs, readLogPaginated, tailLog, getLogFilePath } from '../../services/logService.js';
import { createReadStream } from 'fs';

export const adminLogRoutes: IRouter = Router();

// ============================================================================
// Server Logs Routes
// ============================================================================

/**
 * GET /api/admin/logs
 * List all available log files
 */
adminLogRoutes.get(
  '/logs',
  requireAuth,
  requirePermission('view_server_logs'),
  async (_req: Request, res: Response) => {
    try {
      const logs = await listLogs();
      return res.json({ logs });
    } catch (error) {
      logger.error('List logs error:', error);
      return res.status(500).json({ error: 'Failed to list log files' });
    }
  },
);

/**
 * GET /api/admin/logs/:category/:logName
 * Get paginated log content
 * Query params: page, pageSize, search, startDate, endDate
 */
adminLogRoutes.get(
  '/logs/:category/:logName',
  requireAuth,
  requirePermission('view_server_logs'),
  [
    param('category').isIn(['runtime', 'player']).withMessage('Category must be runtime or player'),
    param('logName').trim().isLength({ min: 1 }).withMessage('Log name is required'),
  ],
  async (req: Request, res: Response) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const category = req.params.category as 'runtime' | 'player';
      const logName = req.params.logName;
      const page = req.query.page ? parseInt(req.query.page as string) : 1;
      const pageSize = req.query.pageSize ? parseInt(req.query.pageSize as string) : 100;
      const searchText = req.query.search as string | undefined;
      const startDate = req.query.startDate ? new Date(req.query.startDate as string) : undefined;
      const endDate = req.query.endDate ? new Date(req.query.endDate as string) : undefined;

      const result = await readLogPaginated(
        category,
        logName,
        page,
        pageSize,
        searchText,
        startDate,
        endDate,
      );

      return res.json(result);
    } catch (error) {
      logger.error('Read log error:', error);
      return res.status(500).json({ error: getErrorMessage(error) || 'Failed to read log file' });
    }
  },
);

/**
 * GET /api/admin/logs/:category/:logName/tail
 * Get the last N lines of a log file
 * Query params: lines (default 100)
 */
adminLogRoutes.get(
  '/logs/:category/:logName/tail',
  requireAuth,
  requirePermission('view_server_logs'),
  [
    param('category').isIn(['runtime', 'player']).withMessage('Category must be runtime or player'),
    param('logName').trim().isLength({ min: 1 }).withMessage('Log name is required'),
  ],
  async (req: Request, res: Response) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const category = req.params.category as 'runtime' | 'player';
      const logName = req.params.logName;
      const lines = req.query.lines ? parseInt(req.query.lines as string) : 100;

      const result = await tailLog(category, logName, lines);

      return res.json({ lines: result });
    } catch (error) {
      logger.error('Tail log error:', error);
      return res.status(500).json({ error: getErrorMessage(error) || 'Failed to tail log file' });
    }
  },
);

/**
 * GET /api/admin/logs/:category/:logName/download
 * Download raw log file
 */
adminLogRoutes.get(
  '/logs/:category/:logName/download',
  requireAuth,
  requirePermission('view_server_logs'),
  [
    param('category').isIn(['runtime', 'player']).withMessage('Category must be runtime or player'),
    param('logName').trim().isLength({ min: 1 }).withMessage('Log name is required'),
  ],
  async (req: Request, res: Response): Promise<void> => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        res.status(400).json({ errors: errors.array() });
        return;
      }

      const category = req.params.category as 'runtime' | 'player';
      const logName = req.params.logName;
      const logPath = getLogFilePath(category, logName);

      // Set headers for file download
      res.setHeader('Content-Type', 'text/plain');
      res.setHeader('Content-Disposition', `attachment; filename="${category}-${logName}"`);

      // Stream the file
      const fileStream = createReadStream(logPath);
      fileStream.pipe(res);

      fileStream.on('error', (error) => {
        logger.error('Download log error:', error);
        if (!res.headersSent) {
          res.status(500).json({ error: 'Failed to download log file' });
        }
      });
    } catch (error) {
      logger.error('Download log error:', error);
      res.status(500).json({ error: getErrorMessage(error) || 'Failed to download log file' });
    }
  },
);
