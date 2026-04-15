import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';

/**
 * CSRF Protection using Double Submit Cookie pattern
 *
 * How it works:
 * 1. Server generates a random token and sets it as a cookie (readable by JS)
 * 2. Frontend reads the cookie and includes it in request headers
 * 3. Server verifies the header value matches the cookie value
 *
 * This prevents CSRF because:
 * - Attacker's site can trigger requests with cookies (same-origin policy allows this)
 * - But attacker's site CANNOT read our cookies due to same-origin policy
 * - So attacker cannot include the correct header value
 */

/**
 * Middleware to generate CSRF token cookie if not present
 */
export function generateCsrfToken(req: Request, res: Response, next: NextFunction): void {
  // Only generate if not already set
  if (!req.cookies.csrf_token) {
    const token = crypto.randomBytes(32).toString('hex');

    res.cookie('csrf_token', token, {
      httpOnly: false, // Must be readable by JavaScript
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 24 * 60 * 60 * 1000, // 24 hours
    });
  }

  next();
}

// Paths exempt from CSRF protection (public endpoints with no security-sensitive state changes)
const CSRF_EXEMPT_PATHS = [
  '/api/analytics/track', // Public page view tracking
  '/kofihook', // ko-fi webhook (external, can't send csrf)
];

/**
 * Middleware to verify CSRF token on state-changing requests
 */
export function verifyCsrfToken(req: Request, res: Response, next: NextFunction): void {
  // Skip for safe methods (GET, HEAD, OPTIONS)
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
    return next();
  }

  // Skip for exempt paths
  if (CSRF_EXEMPT_PATHS.includes(req.path)) {
    return next();
  }

  const tokenFromCookie = req.cookies.csrf_token;
  const tokenFromHeader = req.headers['x-csrf-token'];

  if (!tokenFromCookie || !tokenFromHeader || tokenFromCookie !== tokenFromHeader) {
    res.status(403).json({ error: 'Invalid CSRF token' });
    return;
  }

  next();
}
