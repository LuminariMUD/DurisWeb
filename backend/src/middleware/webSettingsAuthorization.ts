import type { NextFunction, Request, Response } from 'express';

const OVERLORD_ONLY_SETTINGS = new Set(['mud_ws_url']);

/**
 * Enforce the additional privilege boundary for settings that control where
 * the browser sends player credentials.
 */
export function requireWebSettingAuthorization(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (!req.user) {
    res.status(401).json({ error: 'Not authenticated' });
    return;
  }

  const key = req.params.key.trim();
  if (OVERLORD_ONLY_SETTINGS.has(key) && req.user.permissions.role !== 'overlord') {
    res.status(403).json({ error: 'Overlord access required for this setting' });
    return;
  }

  next();
}
