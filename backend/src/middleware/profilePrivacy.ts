import type { NextFunction, Request, Response } from 'express';

/** Profile ownership never follows staff permissions or client-supplied flags. */
export function isAccountOwner(req: Request, accountName: string | null): boolean {
  return accountName !== null && req.user?.accountName.toLowerCase() === accountName.toLowerCase();
}

/** Apply before authentication so refusals cannot be reused across viewers either. */
export function privateProfileResponse(_req: Request, res: Response, next: NextFunction): void {
  res.set('Cache-Control', 'private, no-store');
  res.vary('Cookie');
  next();
}
