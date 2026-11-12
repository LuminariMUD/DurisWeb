import { safeFailureCode } from '../../utils/safeFailureCode.js';
import { Router, Request, Response, type IRouter } from 'express';
import logger from '../../utils/logger.js';
import { body, validationResult } from 'express-validator';
import { requireAuth } from '../../middleware/auth.js';
import {
  searchAccounts,
  accountExists,
  parseAccountFile,
  updateAccountPassword,
} from '../../services/accountService.js';
import { getUserPermissions } from '../../services/permissionService.js';
import { revokeAllWebSessions } from '../../services/sessionService.js';
import { cleanupAccountSessions } from '../../services/terminalService.js';
import { revokeSocketSessions } from '../../realtime/socketAuth.js';
import { pool as db } from '../../db/connection.js';
import bcrypt from 'bcrypt';

const MAX_ACCOUNT_SEARCH_RESULTS = 50;

export const adminGodRoutes: IRouter = Router();

// ============================================
// God Command Support (Level 60+)
// ============================================

/**
 * Search accounts for god commands (Level 60+ only)
 * Simpler version of /accounts/search for god command palette
 */
adminGodRoutes.get('/god/accounts/search', requireAuth, async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    // Check user's level from permissions (already loaded by requireAuth)
    const userLevel = req.user.permissions.maxLevel;
    if (userLevel < 60) {
      return res.status(403).json({ error: 'Requires level 60+ character' });
    }

    const query = (req.query.query as string) || '';
    const requested = parseInt(req.query.limit as string) || 15;
    const limit = Math.min(Math.max(requested, 1), MAX_ACCOUNT_SEARCH_RESULTS);

    const accounts = await searchAccounts(query, limit);
    return res.json(accounts);
  } catch (error) {
    logger.error('God command account search error:', error);
    return res.status(500).json({ error: 'Failed to search accounts' });
  }
});

/**
 * Reset account password (Level 60+ only)
 * Used by god command palette setpass command
 */
adminGodRoutes.post(
  '/god/reset-password',
  requireAuth,
  [
    body('accountName').isString().trim().notEmpty().withMessage('Account name is required'),
    body('newPassword').isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
  ],
  async (req: Request, res: Response) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      if (!req.user) {
        return res.status(401).json({ error: 'Not authenticated' });
      }

      // Check user's level from permissions (already loaded by requireAuth)
      const userLevel = req.user.permissions.maxLevel;
      if (userLevel < 60) {
        return res
          .status(403)
          .json({ error: 'Insufficient level. Requires level 60 (Greater God) or higher.' });
      }

      const { accountName, newPassword } = req.body;
      const targetAccount = accountName.toLowerCase();

      if (targetAccount === req.user.accountName.toLowerCase()) {
        return res.status(403).json({ error: 'Use account settings to change your own password.' });
      }

      // Check if target account exists
      const exists = await accountExists(targetAccount);
      if (!exists) {
        return res.status(404).json({ error: `Account '${targetAccount}' not found` });
      }

      // A god may only reset accounts ranked strictly below their own highest character.
      // Terminal sessions are keyed by the stored account name, so act on its exact casing.
      const target = await parseAccountFile(targetAccount);
      const canonicalName = target.accountName;
      const { maxLevel: targetLevel } = await getUserPermissions(canonicalName, target.characters);
      if (targetLevel >= userLevel) {
        return res
          .status(403)
          .json({ error: 'You can only reset passwords for accounts below your level.' });
      }

      // Hash the new password
      const saltRounds = 10;
      const newPasswordHash = await bcrypt.hash(newPassword, saltRounds);

      // Update the account file, then end every session that used the old password.
      await updateAccountPassword(canonicalName, newPasswordHash);
      await revokeAllWebSessions(canonicalName);
      revokeSocketSessions({ accountName: canonicalName });
      await cleanupAccountSessions(canonicalName);

      await db.query(
        `INSERT INTO admin_action_log (account_name, action_type, target, notes)
         VALUES (?, 'god_password_reset', ?, ?)`,
        [req.user.accountName, canonicalName, `L${userLevel} reset L${targetLevel} account`],
      );

      // Log the action (never log the password)
      logger.info(
        `[ADMIN] Password reset: ${req.user.accountName} (L${userLevel}) changed password for account '${canonicalName}'`,
      );

      return res.json({
        success: true,
        message: `Password changed for account '${canonicalName}'`,
      });
    } catch (error) {
      logger.error('Admin password reset error:', { code: safeFailureCode(error) });
      return res.status(500).json({ error: 'Failed to reset password' });
    }
  },
);
