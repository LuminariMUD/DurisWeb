import { Router, Request, Response, type IRouter } from 'express';
import logger, { getErrorMessage } from '../../utils/logger.js';
import { createNotification } from '../../services/unifiedNotificationService.js';
import { body, param, validationResult } from 'express-validator';
import { requireAuth, requirePermission } from '../../middleware/auth.js';
import { pool as db } from '../../db/connection.js';
import { RowDataPacket, ResultSetHeader } from 'mysql2';
import {
  INCIDENT_UPDATE_FIELDS,
  validateCreateIncidentBody,
  validateUpdateIncidentBody,
} from '../../utils/incidentValidation.js';

export const adminHealthRoutes: IRouter = Router();

const INCIDENT_UPDATE_COLUMNS: Record<(typeof INCIDENT_UPDATE_FIELDS)[number], string> = {
  incident_type: 'incident_type',
  severity: 'severity',
  title: 'title',
  description: 'description',
  started_at: 'started_at',
  ended_at: 'ended_at',
  resolved: 'resolved',
  resolution_notes: 'resolution_notes',
  public_visible: 'public_visible',
  detected_by: 'detected_by',
  exit_code: 'exit_code',
  crash_signal: 'crash_signal',
  shutdown_reason: 'shutdown_reason',
  pid: 'pid',
  uptime_seconds: 'uptime_seconds',
  memory_mb: 'memory_mb',
  cpu_percent: 'cpu_percent',
  core_dump_path: 'core_dump_path',
  core_dump_size_bytes: 'core_dump_size_bytes',
  has_backtrace: 'has_backtrace',
  backtrace: 'backtrace',
  crash_function: 'crash_function',
  crash_file: 'crash_file',
  crash_line: 'crash_line',
  exit_log_excerpt: 'exit_log_excerpt',
  debug_log_excerpt: 'debug_log_excerpt',
  online_players: 'online_players',
  last_command: 'last_command',
  analyzed: 'analyzed',
  notes: 'notes',
};

/**
 * POST /api/admin/ai-analysis/run
 * Run Gemini AI analysis on login data (async - notifies via websocket when done)
 */
adminHealthRoutes.post(
  '/ai-analysis/run',
  requireAuth,
  requirePermission('use_ai_analysis'),
  async (req: Request, res: Response) => {
    const { daysBack = 30 } = req.body;
    const accountName = req.user!.accountName;

    // return immediately, run analysis in background
    res.json({
      success: true,
      message: 'Analysis started. You will be notified when complete.',
    });

    // run analysis async
    (async () => {
      try {
        const { analyzeWithGemini, storeAnalysis } = await import(
          '../../services/geminiSuspicionAnalyzer.js'
        );
        const analysis = await analyzeWithGemini(Number(daysBack));
        await storeAnalysis(analysis);

        // notify the requesting user
        try {
          await createNotification({
            accountName,
            source: 'ai_analysis',
            notificationType: 'ai_analysis_complete',
            message: `AI analysis complete: found ${analysis.suspicious_accounts?.length || 0} suspicious accounts`,
            link: '/admin/ai-analysis',
          });
          logger.info(`Notification sent to ${accountName} for AI analysis complete`);
        } catch (notifError) {
          logger.error('Failed to send AI analysis complete notification:', notifError);
        }
      } catch (error) {
        logger.error('AI analysis error:', error);
        try {
          await createNotification({
            accountName,
            source: 'ai_analysis',
            notificationType: 'ai_analysis_error',
            message: `AI analysis failed: ${getErrorMessage(error) || 'Unknown error'}`,
            link: '/admin/ai-analysis',
          });
          logger.info(`Notification sent to ${accountName} for AI analysis error`);
        } catch (notifError) {
          logger.error('Failed to send AI analysis error notification:', notifError);
        }
      }
    })();
  },
);

/**
 * GET /api/admin/ai-analysis/history
 * Get past AI analysis results
 */
adminHealthRoutes.get(
  '/ai-analysis/history',
  requireAuth,
  requirePermission('use_ai_analysis'),
  async (req: Request, res: Response) => {
    try {
      const { limit = 10 } = req.query;

      const [analyses] = await db.query<any[]>(
        `SELECT id, analysis_timestamp, suspicious_count, patterns_count, summary, created_at
         FROM gemini_analysis_log
         ORDER BY created_at DESC
         LIMIT ?`,
        [Number(limit)],
      );

      // convert mysql datetime strings to iso format with utc timezone
      const data = analyses.map((row: any) => ({
        ...row,
        analysis_timestamp: row.analysis_timestamp
          ? String(row.analysis_timestamp).replace(' ', 'T') + 'Z'
          : null,
        created_at: row.created_at ? String(row.created_at).replace(' ', 'T') + 'Z' : null,
      }));

      return res.json({ success: true, data });
    } catch (error) {
      logger.error('Get AI history error:', error);
      return res.status(500).json({
        success: false,
        error: getErrorMessage(error) || 'Failed to get analysis history',
      });
    }
  },
);

/**
 * GET /api/admin/ai-analysis/:id
 * Get detailed AI analysis by ID
 */
adminHealthRoutes.get(
  '/ai-analysis/:id',
  requireAuth,
  requirePermission('use_ai_analysis'),
  async (req: Request, res: Response) => {
    try {
      const { id } = req.params;

      const [analyses]: any = await db.query('SELECT * FROM gemini_analysis_log WHERE id = ?', [
        id,
      ]);

      if (analyses.length === 0) {
        return res.status(404).json({
          success: false,
          error: 'Analysis not found',
        });
      }

      // convert mysql datetime strings to iso format with utc timezone
      const row = analyses[0];
      const data = {
        ...row,
        analysis_timestamp: row.analysis_timestamp
          ? String(row.analysis_timestamp).replace(' ', 'T') + 'Z'
          : null,
        created_at: row.created_at ? String(row.created_at).replace(' ', 'T') + 'Z' : null,
      };

      return res.json({ success: true, data });
    } catch (error) {
      logger.error('Get AI analysis error:', error);
      return res.status(500).json({
        success: false,
        error: getErrorMessage(error) || 'Failed to get analysis',
      });
    }
  },
);

/**
 * GET /api/admin/crashes
 * Get crash logs with pagination and filtering
 */
adminHealthRoutes.get(
  '/crashes',
  requireAuth,
  requirePermission('view_server_health'),
  async (req: Request, res: Response) => {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 50;
      const analyzed =
        req.query.analyzed === 'true' ? 1 : req.query.analyzed === 'false' ? 0 : undefined;
      const offset = (page - 1) * limit;

      const params: any[] = [];
      let whereClause = " WHERE incident_type = 'crash'";

      if (analyzed !== undefined) {
        whereClause += ' AND analyzed = ?';
        params.push(analyzed);
      }

      const [countRows] = await db.query(
        `SELECT COUNT(*) as total FROM server_incidents${whereClause}`,
        params,
      );
      const total = (countRows as any)[0].total;

      const [crashes] = await db.query<any[]>(
        `SELECT *, started_at AS crash_timestamp FROM server_incidents${whereClause} ORDER BY started_at DESC LIMIT ? OFFSET ?`,
        [...params, limit, offset],
      );

      // convert mysql datetime strings to iso format with utc timezone
      const crashesWithTz = crashes.map((row: any) => ({
        ...row,
        crash_timestamp: row.crash_timestamp
          ? String(row.crash_timestamp).replace(' ', 'T') + 'Z'
          : null,
        analyzed_at: row.analyzed_at ? String(row.analyzed_at).replace(' ', 'T') + 'Z' : null,
      }));

      return res.json({
        crashes: crashesWithTz,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      });
    } catch (error) {
      logger.error('Get crashes error:', error);
      return res.status(500).json({ error: 'Failed to get crash logs' });
    }
  },
);

/**
 * GET /api/admin/crashes/:id
 * Get crash details by ID
 */
adminHealthRoutes.get(
  '/crashes/:id',
  requireAuth,
  requirePermission('view_server_health'),
  async (req: Request, res: Response) => {
    try {
      const { id } = req.params;

      const [crashes] = await db.query(
        "SELECT *, started_at AS crash_timestamp FROM server_incidents WHERE id = ? AND incident_type = 'crash'",
        [id],
      );
      const row = (crashes as any[])[0];

      if (!row) {
        return res.status(404).json({ error: 'Crash not found' });
      }

      // convert mysql datetime strings to iso format with utc timezone
      const crash = {
        ...row,
        crash_timestamp: row.crash_timestamp
          ? String(row.crash_timestamp).replace(' ', 'T') + 'Z'
          : null,
        analyzed_at: row.analyzed_at ? String(row.analyzed_at).replace(' ', 'T') + 'Z' : null,
      };

      return res.json({ crash });
    } catch (error) {
      logger.error('Get crash details error:', error);
      return res.status(500).json({ error: 'Failed to get crash details' });
    }
  },
);

/**
 * PATCH /api/admin/crashes/:id
 * Update crash (mark as analyzed, add notes)
 */
adminHealthRoutes.patch(
  '/crashes/:id',
  requireAuth,
  // A write: the sibling PATCH /incidents/:id needs the same permission.
  requirePermission('manage_server_incidents'),
  [
    param('id').isInt({ min: 1 }).withMessage('Crash ID must be a positive integer'),
    body('analyzed').optional().isBoolean({ strict: true }),
    body('notes').optional({ values: 'null' }).isString().isLength({ max: 10_000 }),
  ],
  async (req: Request, res: Response) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const id = parseInt(req.params.id as string, 10);
      const { analyzed, notes } = req.body;

      const updates: string[] = [];
      const params: any[] = [];

      if (typeof analyzed === 'boolean') {
        updates.push('analyzed = ?');
        params.push(analyzed ? 1 : 0);
      }
      if (notes !== undefined) {
        updates.push('notes = ?');
        params.push(notes);
      }

      if (updates.length > 0) {
        params.push(id);
        await db.query(
          `UPDATE server_incidents SET ${updates.join(', ')} WHERE id = ? AND incident_type = 'crash'`,
          params,
        );
      }

      return res.json({ success: true });
    } catch (error) {
      logger.error('Update crash error:', error);
      return res.status(500).json({ error: 'Failed to update crash' });
    }
  },
);

/**
 * GET /api/admin/server-health
 * Get current server health metrics
 */
adminHealthRoutes.get(
  '/server-health',
  requireAuth,
  requirePermission('view_server_health'),
  async (_req: Request, res: Response) => {
    try {
      const { getServerHealth: getHealth, getHealthStatus } = await import(
        '../../services/serverHealthService.js'
      );

      const health = await getHealth();
      const status = getHealthStatus(health);

      return res.json({ health, status });
    } catch (error) {
      logger.error('Get server health error:', error);
      return res.status(500).json({ error: 'Failed to get server health' });
    }
  },
);

/**
 * GET /api/admin/server-health/history
 * Get historical health metrics
 */
adminHealthRoutes.get(
  '/server-health/history',
  requireAuth,
  requirePermission('view_server_health'),
  async (req: Request, res: Response) => {
    try {
      const hours = parseInt(req.query.hours as string) || 24;
      const { getHealthHistory } = await import('../../services/serverHealthService.js');

      const history = await getHealthHistory(hours);

      return res.json({ history });
    } catch (error) {
      logger.error('Get health history error:', error);
      return res.status(500).json({ error: 'Failed to get health history' });
    }
  },
);

/**
 * GET /api/admin/server-health/incidents
 * Get recent server incidents
 */
adminHealthRoutes.get(
  '/server-health/incidents',
  requireAuth,
  requirePermission('view_server_health'),
  async (req: Request, res: Response) => {
    try {
      const limit = parseInt(req.query.limit as string) || 20;

      const [incidents] = await db.query(
        'SELECT * FROM server_incidents ORDER BY started_at DESC LIMIT ?',
        [limit],
      );

      return res.json({ incidents });
    } catch (error) {
      logger.error('Get incidents error:', error);
      return res.status(500).json({ error: 'Failed to get incidents' });
    }
  },
);

/**
 * GET /api/admin/server-health/uptime
 * Get uptime percentage
 */
adminHealthRoutes.get(
  '/server-health/uptime',
  requireAuth,
  requirePermission('view_server_health'),
  async (req: Request, res: Response) => {
    try {
      const days = parseInt(req.query.days as string) || 30;
      const { getUptimePercentage } = await import('../../services/serverHealthService.js');

      const uptime = await getUptimePercentage(days);

      return res.json({ uptime, days });
    } catch (error) {
      logger.error('Get uptime error:', error);
      return res.status(500).json({ error: 'Failed to get uptime' });
    }
  },
);

/**
 * GET /api/admin/incidents
 * Get all incidents (admin view with full details)
 */
adminHealthRoutes.get(
  '/incidents',
  requireAuth,
  requirePermission('view_server_health'),
  async (req: Request, res: Response) => {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 50;
      const offset = (page - 1) * limit;
      const dateFrom = req.query.dateFrom as string;
      const dateTo = req.query.dateTo as string;

      let whereClause = '';
      const params: any[] = [];

      if (dateFrom && dateTo) {
        whereClause = 'WHERE started_at >= ? AND started_at <= ?';
        params.push(dateFrom, dateTo + ' 23:59:59');
      }

      const [incidents] = await db.query(
        `SELECT * FROM server_incidents ${whereClause} ORDER BY started_at DESC LIMIT ? OFFSET ?`,
        [...params, limit, offset],
      );

      const [countResult] = await db.query(
        `SELECT COUNT(*) as total FROM server_incidents ${whereClause}`,
        params,
      );
      const total = (countResult as any[])[0].total;

      return res.json({
        incidents,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      });
    } catch (error) {
      logger.error('Get incidents error:', error);
      return res.status(500).json({ error: 'Failed to get incidents' });
    }
  },
);

/**
 * POST /api/admin/incidents
 * Create new incident
 */
adminHealthRoutes.post(
  '/incidents',
  requireAuth,
  requirePermission('manage_server_incidents'),
  async (req: Request, res: Response) => {
    try {
      const validationError = validateCreateIncidentBody(req.body);
      if (validationError) {
        return res.status(400).json({ error: validationError });
      }

      const {
        incident_type,
        severity,
        title,
        description,
        started_at,
        ended_at,
        resolved,
        public_visible,
      } = req.body;

      const duration_seconds = ended_at
        ? Math.floor((new Date(ended_at).getTime() - new Date(started_at).getTime()) / 1000)
        : null;

      const [result] = await db.query(
        `INSERT INTO server_incidents (
        incident_type, severity, title, description, started_at, ended_at, duration_seconds, resolved, public_visible
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          incident_type,
          severity,
          title,
          description ?? null,
          started_at,
          ended_at ?? null,
          duration_seconds,
          resolved === true ? 1 : 0,
          public_visible === true ? 1 : 0,
        ],
      );

      return res.status(201).json({
        success: true,
        id: (result as any).insertId,
      });
    } catch (error) {
      logger.error('Create incident error:', error);
      return res.status(500).json({ error: 'Failed to create incident' });
    }
  },
);

/**
 * PATCH /api/admin/incidents/:id
 * Update incident
 */
adminHealthRoutes.patch(
  '/incidents/:id',
  requireAuth,
  requirePermission('manage_server_incidents'),
  [param('id').isInt({ min: 1 }).withMessage('Incident ID must be a positive integer')],
  async (req: Request, res: Response) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const validationError = validateUpdateIncidentBody(req.body);
      if (validationError) {
        return res.status(400).json({ error: validationError });
      }

      const id = parseInt(req.params.id, 10);
      const body = req.body as Record<string, unknown>;
      const updates: string[] = [];
      const values: unknown[] = [];
      const booleanFields = new Set(['resolved', 'public_visible', 'has_backtrace', 'analyzed']);
      const hasOwn = (field: string): boolean => Object.prototype.hasOwnProperty.call(body, field);

      for (const field of INCIDENT_UPDATE_FIELDS) {
        if (!hasOwn(field)) continue;
        const column = INCIDENT_UPDATE_COLUMNS[field];
        const value = booleanFields.has(field) ? (body[field] === true ? 1 : 0) : body[field];
        updates.push(`${column} = ?`);
        values.push(value ?? null);
      }

      if (hasOwn('started_at') || hasOwn('ended_at')) {
        const [incidentRows] = await db.query<RowDataPacket[]>(
          'SELECT started_at, ended_at FROM server_incidents WHERE id = ?',
          [id],
        );
        if (incidentRows.length === 0) {
          return res.status(404).json({ error: 'Incident not found' });
        }

        const effectiveStartedAt = hasOwn('started_at')
          ? body.started_at
          : incidentRows[0].started_at;
        const effectiveEndedAt = hasOwn('ended_at') ? body.ended_at : incidentRows[0].ended_at;
        let durationSeconds: number | null = null;
        if (effectiveEndedAt !== null && effectiveEndedAt !== undefined) {
          durationSeconds = Math.floor(
            (new Date(String(effectiveEndedAt)).getTime() -
              new Date(String(effectiveStartedAt)).getTime()) /
              1000,
          );
          if (durationSeconds < 0) {
            return res.status(400).json({ error: 'ended_at must be at or after started_at' });
          }
        }
        updates.push('duration_seconds = ?');
        values.push(durationSeconds);
      }

      if (updates.length === 0) {
        return res.status(400).json({ error: 'At least one incident field is required' });
      }

      values.push(id);

      const [result] = await db.query<ResultSetHeader>(
        `UPDATE server_incidents SET ${updates.join(', ')} WHERE id = ?`,
        values,
      );
      if (result.affectedRows === 0) {
        return res.status(404).json({ error: 'Incident not found' });
      }

      return res.json({ success: true });
    } catch (error) {
      logger.error('Update incident error:', error);
      return res.status(500).json({ error: 'Failed to update incident' });
    }
  },
);

/**
 * DELETE /api/admin/incidents/:id
 * Delete incident
 */
adminHealthRoutes.delete(
  '/incidents/:id',
  requireAuth,
  requirePermission('manage_server_incidents'),
  [param('id').isInt({ min: 1 }).withMessage('Incident ID must be a positive integer')],
  async (req: Request, res: Response) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const id = parseInt(req.params.id, 10);

      const [result] = await db.query<ResultSetHeader>(
        'DELETE FROM server_incidents WHERE id = ?',
        [id],
      );
      if (result.affectedRows === 0) {
        return res.status(404).json({ error: 'Incident not found' });
      }

      return res.json({ success: true });
    } catch (error) {
      logger.error('Delete incident error:', error);
      return res.status(500).json({ error: 'Failed to delete incident' });
    }
  },
);
