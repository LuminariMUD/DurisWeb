import type { UserPermissions } from '../services/permissionService.js';

export interface WebSocketPrincipal {
  accountName: string;
  sessionId: string;
  permissions: UserPermissions;
}

export function hasWebSocketPermission(
  principal: WebSocketPrincipal | undefined,
  permissionKey: string,
  minimumLevel?: number,
): boolean {
  if (!principal) return false;
  if (principal.permissions.role === 'overlord') return true;
  if (principal.permissions.adminPermissions.includes(permissionKey)) return true;
  return minimumLevel !== undefined && principal.permissions.maxLevel >= minimumLevel;
}

export function canReceiveAccountEvent(
  principal: WebSocketPrincipal | undefined,
  accountName: string,
): boolean {
  return principal?.accountName === accountName;
}

export class WebSocketStreamLimiter<T extends object> {
  private readonly active = new Map<T, Set<string>>();

  constructor(private readonly maxPerConnection = 2) {}

  acquire(connection: T, streamKey: string): boolean {
    let streams = this.active.get(connection);
    if (!streams) {
      streams = new Set<string>();
      this.active.set(connection, streams);
    }

    if (streams.has(streamKey)) return false;
    if (streams.size >= this.maxPerConnection) return false;
    streams.add(streamKey);
    return true;
  }

  release(connection: T, streamKey: string): void {
    const streams = this.active.get(connection);
    if (!streams) return;
    streams.delete(streamKey);
    if (streams.size === 0) this.active.delete(connection);
  }

  clear(connection: T): void {
    this.active.delete(connection);
  }

  count(connection: T): number {
    return this.active.get(connection)?.size ?? 0;
  }
}
