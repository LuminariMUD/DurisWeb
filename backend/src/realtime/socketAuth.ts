import type { WebSocket } from 'ws';
import logger, { getErrorMessage } from '../utils/logger.js';
import { verifyToken, verifyWebSocketToken, isAccessToken } from '../middleware/auth.js';
import { parseAccountFile } from '../services/accountService.js';
import { hasActiveWebSession } from '../services/sessionService.js';
import { getUserPermissions } from '../services/permissionService.js';
import { canAccessZone } from '../services/zoneInfoService.js';
import { hasWebSocketPermission, type WebSocketPrincipal } from '../utils/websocketAccess.js';
import { clientState } from './clientState.js';

/** Verify a WebSocket capability (or access cookie) and require a minimum character level. */
export async function verifyWebSocketAuth(
  token: string | undefined,
  minLevel: number,
  fromCookie = false,
): Promise<WebSocketPrincipal | null> {
  if (!token) {
    logger.warn('[verifyWebSocketAuth] no token provided');
    return null;
  }
  const payload = fromCookie ? verifyToken(token) : verifyWebSocketToken(token);
  if (!payload || (fromCookie && !isAccessToken(payload))) {
    logger.warn('[verifyWebSocketAuth] invalid or wrong-purpose token');
    return null;
  }
  if (!payload.sid || !(await hasActiveWebSession(payload.accountName, payload.sid))) {
    logger.warn('[verifyWebSocketAuth] inactive or legacy session');
    return null;
  }
  const accountData = await parseAccountFile(payload.accountName);
  if (!accountData) {
    logger.warn(`[verifyWebSocketAuth] no account data for ${payload.accountName}`);
    return null;
  }
  const permissions = await getUserPermissions(payload.accountName, accountData.characters);
  logger.info(
    `[verifyWebSocketAuth] ${payload.accountName} maxLevel=${permissions.maxLevel} minLevel=${minLevel}`,
  );
  if (permissions.maxLevel < minLevel) return null;

  return {
    accountName: payload.accountName,
    sessionId: payload.sid,
    permissions,
  };
}

export async function hydrateWebSocketPrincipal(
  ws: WebSocket,
  cookieHeader: string | undefined,
): Promise<void> {
  const token = cookieHeader
    ?.split(';')
    .map((cookie) => cookie.trim())
    .find((cookie) => cookie.startsWith('access_token='))
    ?.slice('access_token='.length);
  if (!token) return;

  try {
    const principal = await verifyWebSocketAuth(decodeURIComponent(token), 0, true);
    if (principal) clientState(ws).wsPrincipal = principal;
  } catch (error) {
    logger.warn('[WebSocket] cookie principal hydration failed:', getErrorMessage(error));
  }
}

export async function authorizeZoneStream(
  ws: WebSocket,
  token: string | undefined,
  zoneId: unknown,
): Promise<WebSocketPrincipal | null> {
  if (typeof zoneId !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/.test(zoneId)) {
    return null;
  }

  const principal = await verifyWebSocketAuth(token, 0);
  if (!principal) return null;

  try {
    const hasGlobalZoneAccess = hasWebSocketPermission(principal, 'manage_zones');
    if (!hasGlobalZoneAccess && !(await canAccessZone(principal.accountName, zoneId, 'view'))) {
      return null;
    }
  } catch (error) {
    logger.warn('[WebSocket] zone access lookup failed:', getErrorMessage(error));
    return null;
  }

  clientState(ws).wsPrincipal = principal;
  return principal;
}
