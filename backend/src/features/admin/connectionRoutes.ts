import { Router, Request, Response, type IRouter } from 'express';
import { body, validationResult } from 'express-validator';
import { requireAuth, requireOverlord, requirePermission } from '../../middleware/auth.js';
import { pool as db } from '../../db/connection.js';
import { sendRouteError } from '../../utils/routeError.js';

export const adminConnectionRoutes: IRouter = Router();

// ============================================================================
// Connection Logs & Multi-Account Detection Routes
// ============================================================================

/**
 * GET /api/admin/connections/logs
 * Get paginated connection logs with filters
 */
adminConnectionRoutes.get(
  '/connections/logs',
  requireAuth,
  requirePermission('view_connection_logs'),
  async (req: Request, res: Response) => {
    try {
      const {
        page = '1',
        limit = '50',
        account,
        character,
        ip,
        status,
        startDate,
        endDate,
      } = req.query;

      const pageNum = parseInt(page as string);
      const limitNum = Math.min(parseInt(limit as string), 100);
      const offset = (pageNum - 1) * limitNum;

      // Import services
      const { geolocateIP } = await import('../../utils/geoip.js');

      // Build WHERE clauses
      const whereClauses: string[] = [];
      const params: any[] = [];

      if (account) {
        whereClauses.push('alh.account_name LIKE ?');
        params.push(`%${account}%`);
      }
      if (character) {
        whereClauses.push('alh.character_name LIKE ?');
        params.push(`%${character}%`);
      }
      if (ip) {
        whereClauses.push('alh.ip_address LIKE ?');
        params.push(`%${ip}%`);
      }
      if (status) {
        whereClauses.push('alh.status = ?');
        params.push(status);
      }
      if (startDate) {
        whereClauses.push('alh.timestamp >= ?');
        params.push(startDate);
      }
      if (endDate) {
        whereClauses.push('alh.timestamp <= ?');
        params.push(endDate);
      }

      const whereClause = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

      // Get total count
      const countQuery = `SELECT COUNT(*) as count FROM account_login_history alh ${whereClause}`;
      const [countRows] = await db.query(countQuery, params);
      const totalCount = (countRows as any)[0].count;

      // Get paginated results with suspicious scores
      const dataQuery = `
        SELECT alh.*, sa.suspicion_score
        FROM account_login_history alh
        LEFT JOIN suspicious_accounts sa ON alh.account_name = sa.account_name AND sa.is_resolved = FALSE
        ${whereClause}
        ORDER BY alh.timestamp DESC
        LIMIT ? OFFSET ?
      `;
      const [logs] = await db.query(dataQuery, [...params, limitNum, offset]);

      // Enrich with GeoIP data (batch lookup unique IPs)
      const logsArray = logs as any[];
      const uniqueIPs = [...new Set(logsArray.map((log) => log.ip_address).filter(Boolean))];
      const geoData = new Map<string, any>();

      // Geolocate IPs (will use cache for previously seen IPs)
      for (const ip of uniqueIPs) {
        const geo = await geolocateIP(ip);
        if (geo) {
          geoData.set(ip, geo);
        }
      }

      // Format response
      const enrichedLogs = logsArray.map((log) => ({
        id: log.id,
        timestamp: log.timestamp,
        accountName: log.account_name,
        characterName: log.character_name,
        ipAddress: log.ip_address,
        hostname: log.hostname,
        status: log.status,
        geoLocation: log.ip_address ? geoData.get(log.ip_address) || null : null,
      }));

      return res.json({
        data: enrichedLogs,
        pagination: {
          page: pageNum,
          limit: limitNum,
          total: totalCount,
          totalPages: Math.ceil(totalCount / limitNum),
        },
      });
    } catch (error) {
      return sendRouteError(
        res,
        error,
        'Failed to get connection logs',
        'Failed to get connection logs',
      );
    }
  },
);

/**
 * GET /api/admin/connections/account/:accountName
 * Get connection history for a specific account
 */
adminConnectionRoutes.get(
  '/connections/account/:accountName',
  requireAuth,
  requireOverlord,
  async (req: Request, res: Response) => {
    try {
      const { accountName } = req.params;
      const { days = '30' } = req.query;

      const daysBack = parseInt(days as string);
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - daysBack);

      const { getConnectionTimeline } = await import(
        '../../services/multiAccountDetectionService.js'
      );
      const timeline = await getConnectionTimeline(accountName, daysBack);

      return res.json({ data: timeline });
    } catch (error) {
      return sendRouteError(
        res,
        error,
        'Failed to get account connections',
        'Failed to get account connections',
      );
    }
  },
);

/**
 * GET /api/admin/connections/ip/:ip
 * Get all accounts that logged in from a specific IP
 */
adminConnectionRoutes.get(
  '/connections/ip/:ip',
  requireAuth,
  requireOverlord,
  async (req: Request, res: Response) => {
    try {
      const { ip } = req.params;

      const [accounts] = await db.query(
        'SELECT DISTINCT account_name FROM account_login_history WHERE ip_address = ? ORDER BY account_name',
        [ip],
      );

      // Get connection counts per account
      const accountDetails = await Promise.all(
        (accounts as any[]).map(async (acc) => {
          const [connections] = await db.query(
            'SELECT COUNT(*) as count FROM account_login_history WHERE account_name = ? AND ip_address = ?',
            [acc.account_name, ip],
          );

          const [lastSeen] = await db.query(
            'SELECT timestamp FROM account_login_history WHERE account_name = ? AND ip_address = ? ORDER BY timestamp DESC LIMIT 1',
            [acc.account_name, ip],
          );

          return {
            accountName: acc.account_name,
            connectionCount: parseInt((connections as any)[0].count),
            lastSeen: (lastSeen as any)[0]?.timestamp || null,
          };
        }),
      );

      return res.json({ data: accountDetails });
    } catch (error) {
      return sendRouteError(
        res,
        error,
        'Failed to get IP connections',
        'Failed to get IP connections',
      );
    }
  },
);

/**
 * GET /api/admin/connections/suspicious
 * Get list of flagged suspicious accounts
 */
adminConnectionRoutes.get(
  '/connections/suspicious',
  requireAuth,
  requireOverlord,
  async (req: Request, res: Response) => {
    try {
      const { includeResolved = 'false' } = req.query;

      const { getSuspiciousAccounts } = await import(
        '../../services/multiAccountDetectionService.js'
      );
      const accounts = await getSuspiciousAccounts(includeResolved === 'true');

      return res.json({ data: accounts });
    } catch (error) {
      return sendRouteError(
        res,
        error,
        'Failed to get suspicious accounts',
        'Failed to get suspicious accounts',
      );
    }
  },
);

/**
 * POST /api/admin/connections/resolve/:accountName
 * Mark a suspicious account flag as reviewed/resolved
 */
adminConnectionRoutes.post(
  '/connections/resolve/:accountName',
  requireAuth,
  requireOverlord,
  [body('notes').optional().isString()],
  async (req: Request, res: Response) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { accountName } = req.params;
      const { notes } = req.body;
      const reviewedBy = req.user?.accountName || 'Unknown';

      const { resolveAccountFlag } = await import('../../services/multiAccountDetectionService.js');
      const success = await resolveAccountFlag(accountName, reviewedBy, notes);

      if (!success) {
        return res.status(404).json({ error: 'No unresolved flag found for this account' });
      }

      return res.json({
        success: true,
        message: 'Account flag resolved',
      });
    } catch (error) {
      return sendRouteError(
        res,
        error,
        'Failed to resolve account flag',
        'Failed to resolve account flag',
      );
    }
  },
);

/**
 * GET /api/admin/connections/stats
 * Get connection log statistics for dashboard
 */
adminConnectionRoutes.get(
  '/connections/stats',
  requireAuth,
  requireOverlord,
  async (_req: Request, res: Response) => {
    try {
      const { findAccountsBySharedIP } = await import(
        '../../services/multiAccountDetectionService.js'
      );

      // Get shared IP accounts
      const sharedIPAccounts = await findAccountsBySharedIP(2);

      // Get total connection count (last 30 days)
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      const [loginCountRows] = await db.query(
        "SELECT COUNT(*) as count FROM account_login_history WHERE status = 'login' AND timestamp >= ?",
        [thirtyDaysAgo],
      );

      const [uniqueAccountsRows] = await db.query(
        'SELECT COUNT(DISTINCT account_name) as count FROM account_login_history WHERE timestamp >= ?',
        [thirtyDaysAgo],
      );

      const [uniqueIPsRows] = await db.query(
        'SELECT COUNT(DISTINCT ip_address) as count FROM account_login_history WHERE ip_address IS NOT NULL AND timestamp >= ?',
        [thirtyDaysAgo],
      );

      const [suspiciousCountRows] = await db.query(
        'SELECT COUNT(*) as count FROM suspicious_accounts WHERE is_resolved = FALSE',
      );

      return res.json({
        data: {
          totalLogins: parseInt((loginCountRows as any)[0].count),
          uniqueAccounts: parseInt((uniqueAccountsRows as any)[0].count),
          uniqueIPs: parseInt((uniqueIPsRows as any)[0].count),
          sharedIPCount: sharedIPAccounts.length,
          suspiciousAccountCount: parseInt((suspiciousCountRows as any)[0].count),
        },
      });
    } catch (error) {
      return sendRouteError(
        res,
        error,
        'Failed to get connection stats',
        'Failed to get connection stats',
      );
    }
  },
);
