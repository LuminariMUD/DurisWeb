import { WebSocket } from 'ws';
import logger from '../utils/logger.js';
import { verifyToken, verifyWebSocketToken, isAccessToken } from '../middleware/auth.js';
import { parseAccountFile } from '../services/accountService.js';
import { getActiveWebSessionIds, hasActiveWebSession } from '../services/sessionService.js';
import { getUserPermissions, type UserPermissions } from '../services/permissionService.js';
import { canAccessZone } from '../services/zoneInfoService.js';
import { hasWebSocketPermission, type WebSocketPrincipal } from '../utils/websocketAccess.js';
import { applicationClients } from './broadcasts.js';
import { clientState } from './clientState.js';
import { closeTerminal } from './terminalHandlers.js';
import { revokeLogSubscriptions } from './logStreamHandlers.js';
import { safeFailureCode } from '../utils/safeFailureCode.js';

/** Close code for a socket whose web session ended or could not be revalidated. */
const SESSION_ENDED_CLOSE_CODE = 4401;
const REVALIDATION_TIMEOUT_MS = 10_000;

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
  // Permissions and account reads may outlive a logout or session expiry.
  if (!(await hasActiveWebSession(payload.accountName, payload.sid))) return null;

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
    // A token-authenticated subscribe may have set a principal while the cookie was checked;
    // never replace it, and never give a principal to a socket that has already closed.
    const state = clientState(ws);
    if (principal && ws.readyState === WebSocket.OPEN && state.wsPrincipal === undefined) {
      state.wsPrincipal = principal;
    }
  } catch (error) {
    logger.warn('[WebSocket] cookie principal hydration failed:', { code: safeFailureCode(error) });
  }
}

const sameAccount = (a: string | undefined, b: string) =>
  a !== undefined && a.toLowerCase() === b.toLowerCase();

/** The web sessions a socket acts for: its push principal and its terminal owner. */
function socketSessions(ws: WebSocket): Array<{ accountName: string; sessionId: string }> {
  const { wsPrincipal, terminalAuth } = clientState(ws);
  const sessions: Array<{ accountName: string; sessionId: string }> = [];
  if (wsPrincipal) {
    sessions.push({ accountName: wsPrincipal.accountName, sessionId: wsPrincipal.sessionId });
  }
  if (terminalAuth?.accountName && terminalAuth.webSessionId) {
    sessions.push({ accountName: terminalAuth.accountName, sessionId: terminalAuth.webSessionId });
  }
  return sessions;
}

function endSocketSession(ws: WebSocket): void {
  if (ws.readyState === WebSocket.OPEN) ws.close(SESSION_ENDED_CLOSE_CODE, 'Session ended');
}

/**
 * Close every application socket acting for an ended web session: one session on logout, or
 * all of an account's sessions after a password change or reset. The close listener releases
 * log watchers, zone streams and the terminal.
 */
export function revokeSocketSessions(target: { accountName: string; sessionId?: string }): void {
  for (const ws of applicationClients()) {
    const ended = socketSessions(ws).some(
      ({ accountName, sessionId }) =>
        sameAccount(accountName, target.accountName) &&
        (target.sessionId === undefined || sessionId === target.sessionId),
    );
    if (ended) endSocketSession(ws);
  }
}

let revalidation: Promise<void> | undefined;
let revalidationQueued: Promise<void> | undefined;
let revalidationWork: Promise<void> | undefined;

async function revalidateOnce(): Promise<void> {
  // Capture identities before any I/O. A later login owns its own permissions and session.
  const snapshots = Array.from(applicationClients())
    .filter((ws) => ws.readyState === WebSocket.OPEN && socketSessions(ws).length > 0)
    .map((ws) => ({
      ws,
      principal: clientState(ws).wsPrincipal,
      terminal: clientState(ws).terminalAuth,
    }));
  if (snapshots.length === 0) return;

  let cancelled = false;
  const ownsPrincipal = (snapshot: (typeof snapshots)[number]) =>
    !cancelled &&
    snapshot.ws.readyState === WebSocket.OPEN &&
    snapshot.principal !== undefined &&
    clientState(snapshot.ws).wsPrincipal === snapshot.principal;
  const ownsTerminal = (snapshot: (typeof snapshots)[number]) =>
    !cancelled &&
    snapshot.ws.readyState === WebSocket.OPEN &&
    snapshot.terminal !== undefined &&
    clientState(snapshot.ws).terminalAuth === snapshot.terminal;
  const endOwnedSession = (snapshot: (typeof snapshots)[number]) => {
    if (ownsPrincipal(snapshot) || ownsTerminal(snapshot)) endSocketSession(snapshot.ws);
  };

  // Keep unfinished I/O shared after its deadline; repeated ticks must not queue more SQL.
  if (revalidationWork) {
    snapshots.forEach(endOwnedSession);
    return;
  }

  const check = async () => {
    const sessions = new Map<string, { accountName: string; sessionId: string }>();
    for (const { principal, terminal } of snapshots) {
      for (const session of [
        principal && { accountName: principal.accountName, sessionId: principal.sessionId },
        terminal?.accountName &&
          terminal.webSessionId && {
            accountName: terminal.accountName,
            sessionId: terminal.webSessionId,
          },
      ]) {
        if (session) sessions.set(`${session.accountName}\0${session.sessionId}`, session);
      }
    }
    const active = await getActiveWebSessionIds([...sessions.values()]);
    if (cancelled) return;

    // One permission computation per account, shared by all of its sockets.
    const permissionsByAccount = new Map<string, Promise<UserPermissions>>();
    const permissionsFor = (accountName: string) => {
      let permissions = permissionsByAccount.get(accountName);
      if (!permissions) {
        permissions = parseAccountFile(accountName).then((account) =>
          getUserPermissions(accountName, account.characters),
        );
        permissionsByAccount.set(accountName, permissions);
      }
      return permissions;
    };

    await Promise.all(
      snapshots.map(async (snapshot) => {
        const { ws, principal, terminal } = snapshot;
        if (
          (ownsPrincipal(snapshot) && !active.has(principal!.sessionId)) ||
          (ownsTerminal(snapshot) && !active.has(terminal!.webSessionId!))
        ) {
          endOwnedSession(snapshot);
          return;
        }
        try {
          if (principal && ownsPrincipal(snapshot)) {
            const permissions = await permissionsFor(principal.accountName);
            if (ownsPrincipal(snapshot)) {
              principal.permissions = permissions;
              if (!hasWebSocketPermission(principal, 'view_server_logs')) {
                revokeLogSubscriptions(ws);
              }
            }
          }
          if (terminal?.accountName && ownsTerminal(snapshot)) {
            const permissions = await permissionsFor(terminal.accountName);
            if (
              ownsTerminal(snapshot) &&
              permissions.role !== 'overlord' &&
              !permissions.adminPermissions.includes('terminal_access')
            ) {
              await closeTerminal(ws);
            }
          }
        } catch (error) {
          logger.warn('[WebSocket] principal revalidation failed:', {
            code: safeFailureCode(error),
          });
          endOwnedSession(snapshot);
        }
      }),
    );
  };

  const work = check().finally(() => {
    if (revalidationWork === work) revalidationWork = undefined;
  });
  revalidationWork = work;
  let timer: NodeJS.Timeout | undefined;
  try {
    await Promise.race([
      work,
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(
          () => reject(new Error('Revalidation timed out')),
          REVALIDATION_TIMEOUT_MS,
        );
        timer.unref();
      }),
    ]);
  } catch (error) {
    logger.warn('[WebSocket] principal revalidation failed:', { code: safeFailureCode(error) });
    snapshots.forEach(endOwnedSession);
  } finally {
    cancelled = true; // A timed-out lookup must never apply a late result.
    clearTimeout(timer);
  }
}

/**
 * Re-check every socket that acts for a web session: end those whose session is gone and
 * refresh the permissions of the rest. Concurrent calls share one queued follow-up pass, so a
 * change made during a pass is always seen. Never rejects.
 */
export function revalidateSockets(): Promise<void> {
  if (!revalidation) {
    revalidation = revalidateOnce()
      .catch((error) => {
        logger.warn('[WebSocket] principal revalidation failed:', { code: safeFailureCode(error) });
      })
      .finally(() => {
        revalidation = undefined;
      });
    return revalidation;
  }
  revalidationQueued ??= revalidation.then(() => {
    revalidationQueued = undefined;
    return revalidateSockets();
  });
  return revalidationQueued;
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
    logger.warn('[WebSocket] zone access lookup failed:', { code: safeFailureCode(error) });
    return null;
  }

  if (ws.readyState !== WebSocket.OPEN) return null;
  clientState(ws).wsPrincipal = principal;
  return principal;
}
