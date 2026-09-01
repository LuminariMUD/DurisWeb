import { Router, Request, Response, type IRouter } from 'express';
import bcrypt from 'bcrypt';
import { body, validationResult } from 'express-validator';
import rateLimit from 'express-rate-limit';
import { v4 as uuidv4 } from 'uuid';
import { pool as db } from '../db/connection.js';
import logger, { getErrorMessage } from '../utils/logger.js';
import {
  parseAccountFile,
  accountExists,
  isBcryptHash,
  updateAccountPassword,
} from '../services/accountService.js';
import { getFullUserContext } from '../services/permissionService.js';
import {
  generateAccessToken,
  generateRefreshToken,
  verifyToken,
  isAccessToken,
  isRefreshToken,
  requireAuth,
  optionalAuth,
  generateTerminalToken,
} from '../middleware/auth.js';
import {
  hasActiveWebSession,
  hasMatchingRefreshSession,
  revokeAllWebSessions,
} from '../services/sessionService.js';

import { cleanupAccountSessions } from '../services/terminalService.js';

const router: IRouter = Router();

// Rate limiting for auth routes - only counts failed attempts
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // 10 failed attempts per window
  message: 'Too many login attempts, please try again later',
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true, // Don't count successful logins
});

/**
 * POST /api/auth/login
 * Login with MUD account credentials
 */
router.post(
  '/login',
  authLimiter,
  [
    body('username')
      .trim()
      .isLength({ min: 3, max: 50 })
      .withMessage('Username must be 3-50 characters'),
    body('password').isLength({ min: 1 }).withMessage('Password is required'),
  ],
  async (req: Request, res: Response) => {
    try {
      // Validate input
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { username, password } = req.body;

      // Check if account exists
      const exists = await accountExists(username);
      if (!exists) {
        return res.status(401).json({ error: 'Invalid username or password' });
      }

      // Parse account file
      const accountData = await parseAccountFile(username);

      // Check if account is blocked
      if (accountData.isBlocked) {
        return res.status(403).json({ error: 'Account is blocked' });
      }

      // Verify password
      let isValidPassword = false;

      if (isBcryptHash(accountData.passwordHash)) {
        // Bcrypt password
        isValidPassword = await bcrypt.compare(password, accountData.passwordHash);
      } else {
        // Legacy MD5 password (should not happen if MUD converted all passwords)
        return res.status(401).json({
          error: 'Account uses legacy password format. Please login to the MUD first to upgrade.',
        });
      }

      if (!isValidPassword) {
        return res.status(401).json({ error: 'Invalid username or password' });
      }

      // Get full user context (characters + permissions)
      const userContext = await getFullUserContext(
        accountData.accountName,
        accountData.email,
        accountData.characters,
      );

      // Generate a unique session before issuing either token
      const sessionId = uuidv4();
      const accessToken = generateAccessToken(
        accountData.accountName,
        accountData.email,
        sessionId,
      );
      const refreshToken = generateRefreshToken(
        accountData.accountName,
        accountData.email,
        sessionId,
      );

      // Store refresh token in database
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

      await db.query(
        `INSERT INTO web_sessions (id, account_name, refresh_token, expires_at)
         VALUES (?, ?, ?, ?)`,
        [sessionId, accountData.accountName, refreshToken, expiresAt],
      );

      // Set tokens as HTTP-only cookies
      res.cookie('access_token', accessToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: process.env.NODE_ENV === 'production' ? 'strict' : 'lax',
        maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
      });

      res.cookie('refresh_token', refreshToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: process.env.NODE_ENV === 'production' ? 'strict' : 'lax',
        maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
      });

      // Return user context (without password hash)
      return res.json({
        success: true,
        user: {
          accountName: userContext.accountName,
          email: userContext.email,
          avatarUrl: userContext.avatarUrl,
          characters: userContext.characters,
          permissions: userContext.permissions,
        },
      });
    } catch (error) {
      logger.error('Login error:', error);
      return res.status(500).json({ error: 'Login failed' });
    }
  },
);

/**
 * POST /api/auth/logout
 * Logout and invalidate refresh token
 */
router.post('/logout', requireAuth, async (req: Request, res: Response) => {
  try {
    // Revoke the session represented by the authenticated access token
    await db.query('DELETE FROM web_sessions WHERE id = ? AND account_name = ?', [
      req.user!.sessionId,
      req.user!.accountName,
    ]);

    // Clear cookies
    res.clearCookie('access_token');
    res.clearCookie('refresh_token');

    return res.json({ success: true, message: 'Logged out successfully' });
  } catch (error) {
    logger.error('Logout error:', error);
    return res.status(500).json({ error: 'Logout failed' });
  }
});

/**
 * POST /api/auth/refresh
 * Refresh access token using refresh token
 */
router.post('/refresh', async (req: Request, res: Response) => {
  try {
    const refreshToken = req.cookies?.refresh_token;

    if (!refreshToken) {
      return res.status(401).json({ error: 'No refresh token provided' });
    }

    // Verify refresh token
    const payload = verifyToken(refreshToken);
    if (!isRefreshToken(payload)) {
      return res.status(401).json({ error: 'Invalid or expired refresh token' });
    }

    // Check that this refresh token belongs to the same active session and account
    if (!(await hasMatchingRefreshSession(payload.accountName, payload.sid, refreshToken))) {
      return res.status(401).json({ error: 'Refresh token not found or expired' });
    }

    // Generate new access token for the same session
    const newAccessToken = generateAccessToken(payload.accountName, payload.email, payload.sid);

    // Set new access token cookie
    res.cookie('access_token', newAccessToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
    });

    return res.json({ success: true, message: 'Token refreshed successfully' });
  } catch (error) {
    logger.error('Token refresh error:', error);
    return res.status(500).json({ error: 'Token refresh failed' });
  }
});

/**
 * GET /api/auth/me
 * Get current user info with permissions
 */
router.get('/me', optionalAuth, async (req: Request, res: Response) => {
  try {
    // Return null for anonymous users instead of 401
    if (!req.user) {
      return res.json({ user: null });
    }

    // Get account data from file
    const accountData = await parseAccountFile(req.user.accountName);

    if (!accountData) {
      return res.status(404).json({ error: 'Account not found' });
    }

    // Get full user context
    const userContext = await getFullUserContext(
      accountData.accountName,
      accountData.email,
      accountData.characters,
    );

    // Update req.user with permissions
    req.user.permissions = userContext.permissions;

    return res.json({
      user: {
        accountName: userContext.accountName,
        email: userContext.email,
        avatarUrl: userContext.avatarUrl,
        characters: userContext.characters,
        permissions: userContext.permissions,
      },
    });
  } catch (error) {
    logger.error('Get user error:', error);
    return res.status(500).json({ error: 'Failed to get user info' });
  }
});

/**
 * GET /api/auth/check
 * Quick authentication check
 */
router.get('/check', async (req: Request, res: Response) => {
  try {
    const accessToken = req.cookies?.access_token;

    if (!accessToken) {
      return res.json({ authenticated: false });
    }

    const payload = verifyToken(accessToken);

    if (
      !isAccessToken(payload) ||
      !payload.sid ||
      !(await hasActiveWebSession(payload.accountName, payload.sid))
    ) {
      return res.json({ authenticated: false });
    }

    return res.json({
      authenticated: true,
      accountName: payload.accountName,
    });
  } catch (error) {
    logger.error('Auth check error:', error);
    return res.json({ authenticated: false });
  }
});

/**
 * GET /api/auth/terminal-token
 * Returns the access token for authenticated users (for WebSocket terminal auth)
 * Requires authentication via HTTP-only cookie
 */
router.get('/terminal-token', requireAuth, async (req: Request, res: Response) => {
  // The requireAuth middleware already verified the token and attached user
  // We just need to return the token from the cookie
  const accessToken = req.cookies?.access_token;

  if (!accessToken) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  const terminalToken = generateTerminalToken(
    req.user!.accountName,
    req.user!.email,
    req.user!.sessionId,
  );
  return res.json({ token: terminalToken });
});

/**
 * POST /api/auth/change-password
 * Change the current user's password
 */
router.post(
  '/change-password',
  requireAuth,
  [
    body('currentPassword').isLength({ min: 1 }).withMessage('Current password is required'),
    body('newPassword')
      .isLength({ min: 6 })
      .withMessage('New password must be at least 6 characters'),
  ],
  async (req: Request, res: Response) => {
    try {
      // Validate input
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { currentPassword, newPassword } = req.body;
      const accountName = req.user!.accountName;

      // Parse account file to get current password hash
      const accountData = await parseAccountFile(accountName);

      // Verify current password
      let isValidPassword = false;

      if (isBcryptHash(accountData.passwordHash)) {
        isValidPassword = await bcrypt.compare(currentPassword, accountData.passwordHash);
      } else {
        return res.status(400).json({
          error: 'Account uses legacy password format. Please login to the MUD first to upgrade.',
        });
      }

      if (!isValidPassword) {
        return res.status(401).json({ error: 'Current password is incorrect' });
      }

      // Hash the new password
      const saltRounds = 10;
      const newPasswordHash = await bcrypt.hash(newPassword, saltRounds);

      // Update the account file
      await updateAccountPassword(accountName, newPasswordHash);
      await revokeAllWebSessions(accountName);
      await cleanupAccountSessions(accountName);
      res.clearCookie('access_token');
      res.clearCookie('refresh_token');

      return res.json({ success: true, message: 'Password changed successfully' });
    } catch (error) {
      logger.error('Change password error:', error);
      return res.status(500).json({ error: getErrorMessage(error) || 'Failed to change password' });
    }
  },
);

export default router;
