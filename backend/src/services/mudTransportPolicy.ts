/**
 * Transport and credential policy for the privileged MUD bridge.
 *
 * Pure and side-effect free, so it can be tested without opening a socket or a
 * database pool. `mudAuctionClient.ts` is the only intended consumer.
 */

import crypto from 'crypto';

export interface MudTransportEndpoint {
  readonly url: string | null;
  readonly scheme: 'ws' | 'wss' | null;
  readonly host: string | null;
  readonly port: string | null;
  readonly loopback: boolean | null;
  readonly blockedReason: string | null;
  readonly configurationError: string | null;
}

/**
 * Hosts for which plaintext ws:// is acceptable, because the traffic never
 * leaves the machine. Anything else must use wss://.
 */
export function isLoopbackHost(hostname: string): boolean {
  const host = hostname.trim().toLowerCase();

  if (host === 'localhost') return true;

  // URL parsing strips brackets from an IPv6 literal, but accept both forms.
  const bare = host.startsWith('[') && host.endsWith(']') ? host.slice(1, -1) : host;
  if (bare === '::1' || bare === '0:0:0:0:0:0:0:1') return true;

  // The whole 127.0.0.0/8 range is loopback, not just 127.0.0.1.
  const ipv4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(bare);
  if (ipv4) {
    const octets = ipv4.slice(1).map(Number);
    if (octets.every((o) => o >= 0 && o <= 255) && octets[0] === 127) {
      return true;
    }
  }

  return false;
}

export function inspectMudWebSocketEndpoint(wsPort: string): MudTransportEndpoint {
  const configuredUrl = process.env.MUD_WS_URL?.trim();
  const configuredHost = process.env.MUD_WS_HOST?.trim() || '127.0.0.1';
  const candidate = configuredUrl || `ws://${configuredHost}:${wsPort}`;
  let parsed: URL;

  try {
    parsed = new URL(candidate);
  } catch {
    return {
      url: null,
      scheme: null,
      host: null,
      port: null,
      loopback: null,
      blockedReason: null,
      configurationError: 'MUD WebSocket URL is invalid.',
    };
  }

  if (parsed.protocol !== 'ws:' && parsed.protocol !== 'wss:') {
    return {
      url: null,
      scheme: null,
      host: parsed.hostname || null,
      port: parsed.port || null,
      loopback: parsed.hostname ? isLoopbackHost(parsed.hostname) : null,
      blockedReason: null,
      configurationError: 'MUD WebSocket URL must use ws:// or wss://.',
    };
  }
  if (parsed.username || parsed.password || parsed.search || parsed.hash) {
    return {
      url: null,
      scheme: parsed.protocol === 'wss:' ? 'wss' : 'ws',
      host: parsed.hostname,
      port: parsed.port || null,
      loopback: isLoopbackHost(parsed.hostname),
      blockedReason: null,
      configurationError: 'MUD WebSocket URL contains forbidden components.',
    };
  }

  const scheme = parsed.protocol === 'wss:' ? 'wss' : 'ws';
  const loopback = isLoopbackHost(parsed.hostname);
  const blockedReason =
    scheme === 'ws' && !loopback
      ? 'Plaintext ws:// is refused for a non-loopback MUD host. Configure wss://.'
      : null;

  return {
    url: parsed.toString(),
    scheme,
    host: parsed.hostname,
    port: parsed.port || null,
    loopback,
    blockedReason,
    configurationError: null,
  };
}

export function resolveMudWebSocketUrl(wsPort: string): string {
  const endpoint = inspectMudWebSocketEndpoint(wsPort);
  const error = endpoint.configurationError || endpoint.blockedReason;
  if (error || !endpoint.url) {
    throw new Error(error || 'MUD WebSocket URL is invalid.');
  }
  return endpoint.url;
}

/**
 * Connection options. Certificate validation is stated explicitly rather than
 * left to the library default, so disabling it would be a visible edit.
 */
export function buildMudSocketOptions(wsUrl: string): { rejectUnauthorized: boolean } | undefined {
  return wsUrl.startsWith('wss:') ? { rejectUnauthorized: true } : undefined;
}

/**
 * Which key to sign with. During a rotation both are live on the MUD
 * (`src/net/ws_auth.h` accepts DURISWEB_SECRET and DURISWEB_SECRET_PREVIOUS),
 * so the client can fall back once if the current key is rejected.
 */
export type DuriswebSecretSlot = 'current' | 'previous';

export function readDuriswebSecret(slot: DuriswebSecretSlot): string | null {
  const raw =
    slot === 'current' ? process.env.DURISWEB_SECRET : process.env.DURISWEB_SECRET_PREVIOUS;

  if (!raw || Buffer.byteLength(raw, 'utf8') < 32) {
    return null;
  }
  return raw;
}

/**
 * Sign a connection-bound challenge. The MUD binds the signature to the current
 * minute and accepts the adjacent minute either side for clock skew.
 */
export function generateDuriswebSig(
  challenge: string,
  slot: DuriswebSecretSlot = 'current',
): string {
  if (!/^[0-9a-f]{64}$/i.test(challenge)) {
    throw new Error('Invalid DurisWeb authentication challenge');
  }

  const secret = readDuriswebSecret(slot);
  if (!secret) {
    // Names the variable, never its value.
    throw new Error(
      slot === 'current'
        ? 'DURISWEB_SECRET must contain at least 32 bytes'
        : 'DURISWEB_SECRET_PREVIOUS must contain at least 32 bytes',
    );
  }

  const minute = Math.floor(Date.now() / 60000);
  return crypto.createHmac('sha256', secret).update(`${minute}:${challenge}`).digest('hex');
}
