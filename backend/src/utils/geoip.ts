/**
 * GeoIP Lookup Service using ip-api.com free API
 *
 * API Documentation: https://ip-api.com/docs/api:json
 * Free tier: 45 requests per minute
 * No API key required
 */

import { randomUUID } from 'node:crypto';
import { getCache, setCache, deleteCache } from '../db/redis.js';
import logger from './logger.js';

export interface GeoLocation {
  city: string | null;
  country: string | null;
  countryCode: string | null;
  continent: string | null;
  latitude: number | null;
  longitude: number | null;
  timezone: string | null;
  isp: string | null;
  isProxy: boolean;
  isVPN: boolean;
}

// Cache TTL for geoip (in seconds for Redis)
const GEOIP_CACHE_TTL = 24 * 60 * 60; // 24 hours
const REDIS_KEY_PREFIX = 'geo:ip:';

type GeoIPFailure =
  | 'provider_http_failure'
  | 'provider_refusal'
  | 'invalid_response'
  | 'lookup_exception';

function logLookupFailure(category: GeoIPFailure, status?: number): void {
  // Neither provider text nor exception objects are safe diagnostic inputs.
  logger.error('GeoIP lookup failed', {
    category,
    operationId: randomUUID(),
    ...(Number.isInteger(status) && status! >= 100 && status! <= 599 ? { status } : {}),
  });
}

interface ProviderLocation {
  status: 'success';
  city?: string | null;
  country?: string | null;
  countryCode?: string | null;
  continent?: string | null;
  timezone?: string | null;
  isp?: string | null;
  lat?: number | null;
  lon?: number | null;
  proxy?: boolean | null;
  hosting?: boolean | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isProviderLocation(value: unknown): value is ProviderLocation {
  if (!isRecord(value) || value.status !== 'success') return false;
  return (
    ['city', 'country', 'countryCode', 'continent', 'timezone', 'isp'].every(
      (field) => value[field] == null || typeof value[field] === 'string',
    ) &&
    ['lat', 'lon'].every(
      (field) =>
        value[field] == null || (typeof value[field] === 'number' && Number.isFinite(value[field])),
    ) &&
    ['proxy', 'hosting'].every((field) => value[field] == null || typeof value[field] === 'boolean')
  );
}

/**
 * Initialize GeoIP service (no-op for API-based service)
 */
export async function initializeGeoIP(): Promise<boolean> {
  logger.info('GeoIP service initialized (using ip-api.com)');
  return true;
}

/**
 * Lookup geolocation for an IP address using ip-api.com
 */
export async function geolocateIP(ipAddress: string): Promise<GeoLocation | null> {
  const cacheKey = `${REDIS_KEY_PREFIX}${ipAddress}`;

  // Check Redis cache first
  const cached = await getCache<GeoLocation>(cacheKey);
  if (cached) {
    return cached;
  }

  // Skip private/local IPs
  if (isPrivateIP(ipAddress)) {
    const localGeo: GeoLocation = {
      city: 'Local',
      country: 'Local Network',
      countryCode: 'LOCAL',
      continent: null,
      latitude: null,
      longitude: null,
      timezone: null,
      isp: 'Local',
      isProxy: false,
      isVPN: false,
    };
    await setCache(cacheKey, localGeo, GEOIP_CACHE_TTL);
    return localGeo;
  }

  try {
    // Query ip-api.com
    const response = await fetch(
      `http://ip-api.com/json/${ipAddress}?fields=status,message,continent,country,countryCode,city,lat,lon,timezone,isp,proxy,hosting`,
    );

    if (!response.ok) {
      logLookupFailure('provider_http_failure', response.status);
      return null;
    }

    let data: unknown;
    try {
      data = await response.json();
    } catch {
      logLookupFailure('invalid_response');
      return null;
    }

    if (isRecord(data) && data.status === 'fail') {
      logLookupFailure('provider_refusal');
      return null;
    }
    if (!isProviderLocation(data)) {
      logLookupFailure('invalid_response');
      return null;
    }

    const geoLocation: GeoLocation = {
      city: data.city || null,
      country: data.country || null,
      countryCode: data.countryCode || null,
      continent: data.continent || null,
      latitude: data.lat || null,
      longitude: data.lon || null,
      timezone: data.timezone || null,
      isp: data.isp || null,
      isProxy: data.proxy === true,
      isVPN: data.hosting === true,
    };

    // Cache the result in Redis
    await setCache(cacheKey, geoLocation, GEOIP_CACHE_TTL);

    return geoLocation;
  } catch {
    logLookupFailure('lookup_exception');
    return null;
  }
}

/**
 * Check if an IP is likely a VPN/proxy
 */
export async function isVPNOrProxy(ipAddress: string): Promise<boolean> {
  const geo = await geolocateIP(ipAddress);
  return geo?.isVPN || geo?.isProxy || false;
}

/**
 * Get country code for an IP (lightweight)
 */
export async function getCountryCode(ipAddress: string): Promise<string | null> {
  const geo = await geolocateIP(ipAddress);
  return geo?.countryCode || null;
}

/**
 * Format geolocation as a human-readable string
 */
export function formatGeoLocation(geo: GeoLocation | null): string {
  if (!geo) {
    return 'Unknown';
  }

  const parts: string[] = [];

  if (geo.city) {
    parts.push(geo.city);
  }

  if (geo.country) {
    parts.push(geo.country);
  }

  let location = parts.join(', ') || 'Unknown';

  if (geo.isVPN || geo.isProxy) {
    location += ' (VPN/Proxy)';
  }

  return location;
}

/**
 * Check if IP is a private/local address
 */
function isPrivateIP(ip: string): boolean {
  // IPv6 localhost
  if (ip === '::1') {
    return true;
  }

  const parts = ip.split('.');

  if (parts.length !== 4) {
    return false; // Not IPv4, could be IPv6 or invalid
  }

  const first = parseInt(parts[0]);
  const second = parseInt(parts[1]);

  // 127.0.0.0/8 (localhost)
  if (first === 127) {
    return true;
  }

  // 10.0.0.0/8 (private)
  if (first === 10) {
    return true;
  }

  // 172.16.0.0/12 (private)
  if (first === 172 && second >= 16 && second <= 31) {
    return true;
  }

  // 192.168.0.0/16 (private)
  if (first === 192 && second === 168) {
    return true;
  }

  return false;
}

/**
 * Batch geolocate multiple IPs (with rate limiting)
 */
export async function geolocateBatch(
  ipAddresses: string[],
): Promise<Map<string, GeoLocation | null>> {
  const results = new Map<string, GeoLocation | null>();

  // Rate limit: 45 requests per minute = ~750ms between requests
  const delay = 800; // 800ms to be safe

  for (const ip of ipAddresses) {
    const geo = await geolocateIP(ip);
    results.set(ip, geo);

    // Add delay if not the last IP
    if (ip !== ipAddresses[ipAddresses.length - 1]) {
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  return results;
}

/**
 * Clear the GeoIP cache (useful for testing)
 */
export async function clearGeoIPCache(): Promise<void> {
  await deleteCache(`${REDIS_KEY_PREFIX}*`);
  logger.info('GeoIP cache cleared');
}
