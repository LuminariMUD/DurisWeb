import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { UserPermissions, getUserPermissions } from '../services/permissionService.js';
import { parseAccountFile } from '../services/accountService.js';
import { getUserPermissions as getAdminPermissions } from '../services/adminPermissionService.js';
import { hasActiveWebSession } from '../services/sessionService.js';
import logger from '../utils/logger.js';

// Extend Express Request type to include user
declare global {
  namespace Express {
    interface Request {
      user?: {
        accountName: string;
        email: string;
        sessionId: string;
        permissions: UserPermissions;
        adminPermissions: Set<string>;
      };
    }
  }
}

export interface JWTPayload {
  accountName: string;
  email: string;
  sid: string;
  tokenType?: 'access' | 'refresh' | 'terminal';
  iat: number;
  exp: number;
}

function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    logger.error('FATAL: JWT_SECRET environment variable is not set');
    logger.error('Generate a secure secret with: openssl rand -base64 64');
    process.exit(1);
  }
  return secret;
}

const JWT_SECRET = getJwtSecret();
const JWT_ACCESS_EXPIRY = '30d'; // Access token expires in 30 days
const JWT_REFRESH_EXPIRY = '30d'; // Refresh token expires in 30 days

/**
 * Generate JWT access token
 */
export function generateAccessToken(accountName: string, email: string, sessionId: string): string {
  return jwt.sign(
    { accountName, email, sid: sessionId, tokenType: 'access' },
    JWT_SECRET,
    { expiresIn: JWT_ACCESS_EXPIRY }
  );
}

/**
 * Generate JWT refresh token
 */
export function generateRefreshToken(accountName: string, email: string, sessionId: string): string {
  return jwt.sign(
    { accountName, email, sid: sessionId, tokenType: 'refresh' },
    JWT_SECRET,
    { expiresIn: JWT_REFRESH_EXPIRY }
  );
}

export function generateTerminalToken(accountName: string, email: string, sessionId: string): string {
  return jwt.sign(
    { accountName, email, sid: sessionId, tokenType: 'terminal' },
    JWT_SECRET,
    { expiresIn: '5m' }
  );
}

/**
 * Verify a short-lived terminal-only capability.
 */
export function verifyTerminalToken(token: string): JWTPayload | null {
  const payload = verifyToken(token);
  return payload?.tokenType === 'terminal' ? payload : null;
}

export function isAccessToken(payload: JWTPayload | null): payload is JWTPayload {
  return payload !== null && (payload.tokenType === undefined || payload.tokenType === 'access');
}

export function isRefreshToken(payload: JWTPayload | null): payload is JWTPayload {
  return payload !== null && (payload.tokenType === undefined || payload.tokenType === 'refresh');
}

/**
 * Verify JWT token
 */
export function verifyToken(token: string): JWTPayload | null {
  try {
    return jwt.verify(token, JWT_SECRET) as JWTPayload;
  } catch (_error) {
    return null;
  }
}

/**
 * Middleware: Require authentication
 * Verifies JWT token from cookie and attaches user to request
 */
export async function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    // Get token from cookie
    const token = req.cookies?.access_token;

    if (!token) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }

    // Verify token
    const payload = verifyToken(token);

    if (!isAccessToken(payload)) {
      res.status(401).json({ error: 'Invalid or expired token' });
      return;
    }

    if (!payload.sid || !await hasActiveWebSession(payload.accountName, payload.sid)) {
      res.status(401).json({ error: 'Session is no longer active' });
      return;
    }

    // Parse account file to get characters
    const accountData = await parseAccountFile(payload.accountName);

    if (!accountData) {
      res.status(401).json({ error: 'Account not found' });
      return;
    }

    // Get user permissions from account data
    const permissions = await getUserPermissions(payload.accountName, accountData.characters);

    // Get admin permissions (roles + individual permissions)
    const adminPermissions = await getAdminPermissions(payload.accountName);

    // Attach user info with permissions
    req.user = {
      accountName: payload.accountName,
      email: payload.email,
      sessionId: payload.sid,
      permissions,
      adminPermissions
    };

    next();
  } catch (error) {
    logger.error('Auth middleware error:', error);
    res.status(500).json({ error: 'Authentication error' });
  }
}

/**
 * Middleware: Require immortal status (Level 57+)
 */
export function requireImmortal(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  if (!req.user) {
    res.status(401).json({ error: 'Not authenticated' });
    return;
  }

  if (req.user.permissions.maxLevel < 57) {
    res.status(403).json({ error: 'Immortal access required (Level 57+)' });
    return;
  }

  next();
}

/**
 * Middleware: Require god status (Level 59+, Lesser God or higher)
 */
export function requireGod(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  if (!req.user) {
    res.status(401).json({ error: 'Not authenticated' });
    return;
  }

  if (req.user.permissions.maxLevel < 59) {
    res.status(403).json({ error: 'God access required (Level 59+)' });
    return;
  }

  next();
}

/**
 * Middleware: Require Overlord status (Level 62)
 */
export function requireOverlord(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  if (!req.user) {
    res.status(401).json({ error: 'Not authenticated' });
    return;
  }

  if (req.user.permissions.role !== 'overlord') {
    res.status(403).json({ error: 'Overlord access required (Level 62)' });
    return;
  }

  next();
}

/**
 * Middleware: Require specific guild membership
 */
export function requireGuild(guildName: string) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }

    if (!req.user.permissions.guilds.includes(guildName)) {
      res.status(403).json({ error: `Guild ${guildName} membership required` });
      return;
    }

    next();
  };
}

/**
 * Middleware: Require moderation permissions
 */
export function requireModerator(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  if (!req.user) {
    res.status(401).json({ error: 'Not authenticated' });
    return;
  }

  if (!req.user.permissions.canModerate) {
    res.status(403).json({ error: 'Moderator access required' });
    return;
  }

  next();
}

/**
 * Middleware: Require Greater God status (Level 60+)
 */
export function requireGreaterGod(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  if (!req.user) {
    res.status(401).json({ error: 'Not authenticated' });
    return;
  }

  if (req.user.permissions.maxLevel < 60) {
    res.status(403).json({ error: 'Greater God access required (Level 60+)' });
    return;
  }

  next();
}

/**
 * Middleware: Require specific admin permission
 * Checks BOTH immortal level AND admin permission system (OR logic)
 * This allows backward compatibility while enabling granular delegation
 */
export function requirePermission(permissionKey: string) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }

    // Overlords (Level 62) automatically bypass all permission checks
    if (req.user.permissions.role === 'overlord') {
      next();
      return;
    }

    // Check if user has the specific admin permission
    if (req.user.adminPermissions.has(permissionKey)) {
      next();
      return;
    }

    // If neither immortal level nor permission grants access, deny
    res.status(403).json({
      error: `Permission denied: ${permissionKey} required`,
      required_permission: permissionKey
    });
  };
}

/**
 * Middleware: Optional authentication
 * Attaches user to request if authenticated, but allows anonymous access
 */
export async function optionalAuth(
  req: Request,
  _res: Response,
  next: NextFunction
): Promise<void> {
  try {
    // Get token from cookie
    const token = req.cookies?.access_token;

    if (!token) {
      // No token - continue as anonymous user
      next();
      return;
    }

    // Verify token
    const payload = verifyToken(token);

    if (!isAccessToken(payload)) {
      // Invalid token - continue as anonymous user
      next();
      return;
    }

    if (!payload.sid || !await hasActiveWebSession(payload.accountName, payload.sid)) {
      // Revoked or expired session - continue as anonymous user
      next();
      return;
    }

    // Parse account file to get characters
    const accountData = await parseAccountFile(payload.accountName);

    if (!accountData) {
      // Account not found - continue as anonymous user
      next();
      return;
    }

    // Get user permissions from account data
    const permissions = await getUserPermissions(payload.accountName, accountData.characters);

    // Get admin permissions (roles + individual permissions)
    const adminPermissions = await getAdminPermissions(payload.accountName);

    // Attach user info with permissions
    req.user = {
      accountName: payload.accountName,
      email: payload.email,
      sessionId: payload.sid,
      permissions,
      adminPermissions
    };

    next();
  } catch (error) {
    logger.error('Optional auth middleware error:', error);
    // On error, continue as anonymous user
    next();
  }
}
