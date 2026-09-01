/** Sanitized operator view of the privileged MUD bridge transport. */

import { getWebSettings } from './webSettingsService.js';
import { getMudBridgeRuntimeStatus } from './mudAuctionClient.js';
import { inspectMudWebSocketEndpoint } from './mudTransportPolicy.js';

export interface MudTransportStatus {
  readonly scheme: 'ws' | 'wss' | null;
  readonly host: string | null;
  readonly port: string | null;
  readonly loopback: boolean | null;
  readonly connected: boolean;
  readonly authenticated: boolean;
  readonly certificateExpiresAt: string | null;
  readonly certificateStatus: 'valid' | 'expired' | 'not_applicable' | 'unknown';
  readonly secretRotatedAt: string | null;
  readonly secretAgeDays: number | null;
  readonly blocked: boolean;
  readonly reason: string | null;
}

function secretRotation(): { rotatedAt: string | null; ageDays: number | null } {
  const raw = process.env.DURISWEB_SECRET_ROTATED_AT?.trim();
  if (!raw) return { rotatedAt: null, ageDays: null };
  const date = new Date(raw);
  const ageMs = Date.now() - date.getTime();
  if (Number.isNaN(date.getTime()) || ageMs < 0) {
    return { rotatedAt: null, ageDays: null };
  }
  return {
    rotatedAt: date.toISOString(),
    ageDays: Math.floor(ageMs / 86_400_000),
  };
}

export async function getMudTransportStatus(): Promise<MudTransportStatus> {
  const settings = await getWebSettings();
  const endpoint = inspectMudWebSocketEndpoint(settings.mudWsPort || '4050');
  const runtime = getMudBridgeRuntimeStatus();
  const rotation = secretRotation();
  const certificateStatus =
    endpoint.scheme === 'ws'
      ? 'not_applicable'
      : runtime.certificateExpiresAt === null
        ? 'unknown'
        : new Date(runtime.certificateExpiresAt).getTime() <= Date.now()
          ? 'expired'
          : 'valid';
  const reason = endpoint.blockedReason || endpoint.configurationError;

  return {
    scheme: endpoint.scheme,
    host: endpoint.host,
    port: endpoint.port,
    loopback: endpoint.loopback,
    connected: runtime.connected,
    authenticated: runtime.authenticated,
    certificateExpiresAt: runtime.certificateExpiresAt,
    certificateStatus,
    secretRotatedAt: rotation.rotatedAt,
    secretAgeDays: rotation.ageDays,
    blocked: reason !== null,
    reason,
  };
}
