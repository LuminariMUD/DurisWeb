import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { inspect } from 'node:util';

const sentinels = [
  '198.51.100.42',
  '2001:db8::42',
  'https://provider.invalid/private',
  'synthetic-private-token',
  'synthetic-provider-body',
];
const hostileText = sentinels.join(' ');
const hostileError = Object.assign(new Error(hostileText), {
  command: { name: 'get', args: [`geo:ip:${sentinels[0]}`] },
});
const logger = {
  error: jest.fn(),
  warn: jest.fn(),
  info: jest.fn(),
  debug: jest.fn(),
};
const listeners = new Map<string, (error: Error) => void>();
const redis = {
  on: jest.fn<(event: string, listener: (error: Error) => void) => void>((event, listener) => {
    listeners.set(event, listener);
  }),
  get: jest.fn<(key: string) => Promise<string | null>>(),
  setex: jest.fn<(key: string, ttl: number, value: string) => Promise<string>>(),
  keys: jest.fn<(pattern: string) => Promise<string[]>>(),
  del: jest.fn<(...keys: string[]) => Promise<number>>(),
  ping: jest.fn<() => Promise<string>>(),
  quit: jest.fn<() => Promise<string>>(),
};
const fetchMock = jest.fn<typeof fetch>();

jest.unstable_mockModule('../logger.js', () => ({ default: logger }));
jest.unstable_mockModule('../../config/environment.js', () => ({
  getBackendConfiguration: () => ({
    cacheRedis: { host: '127.0.0.1', port: 6379, database: 0, tls: false },
  }),
}));
jest.unstable_mockModule('ioredis', () => ({
  default: jest.fn(function () {
    return redis;
  }),
}));

const {
  clearGeoIPCache,
  formatGeoLocation,
  geolocateBatch,
  geolocateIP,
  getCountryCode,
  initializeGeoIP,
  isVPNOrProxy,
} = await import('../geoip.js');
const { checkRedisConnection, closeRedisConnection } = await import('../../db/redis.js');

const providerLocation = {
  status: 'success',
  city: 'Test City',
  country: 'Test Country',
  countryCode: 'TC',
  continent: 'Test Continent',
  lat: 12.5,
  lon: -45.5,
  timezone: 'Etc/UTC',
  isp: 'Test ISP',
  proxy: true,
  hosting: false,
};
const location = {
  city: 'Test City',
  country: 'Test Country',
  countryCode: 'TC',
  continent: 'Test Continent',
  latitude: 12.5,
  longitude: -45.5,
  timezone: 'Etc/UTC',
  isp: 'Test ISP',
  isProxy: true,
  isVPN: false,
};

function respond(body: unknown): void {
  fetchMock.mockImplementation(async () => new Response(JSON.stringify(body)));
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(globalThis, 'fetch').mockImplementation(fetchMock);
  redis.get.mockReset().mockResolvedValue(null);
  redis.setex.mockReset().mockResolvedValue('OK');
  redis.keys.mockReset().mockResolvedValue([]);
  redis.del.mockReset().mockResolvedValue(1);
  redis.ping.mockReset().mockResolvedValue('PONG');
  redis.quit.mockReset().mockResolvedValue('OK');
  fetchMock.mockReset();
  respond(providerLocation);
});

afterEach(() => {
  // Inspect errors and nested/non-enumerable fields as well as plain strings.
  const diagnostics = inspect(
    Object.values(logger).map((method) => method.mock.calls),
    {
      depth: null,
    },
  );
  for (const sentinel of sentinels) {
    expect(diagnostics).not.toContain(sentinel);
  }
  jest.useRealTimers();
  jest.restoreAllMocks();
});

describe('GeoIP diagnostic privacy through the real cache helpers', () => {
  it('logs a fixed HTTP category, numeric status and local reference only', async () => {
    fetchMock.mockResolvedValue(
      new Response(hostileText, { status: 429, statusText: hostileText }),
    );
    await expect(geolocateIP(sentinels[0])).resolves.toBeNull();
    expect(logger.error).toHaveBeenCalledWith('GeoIP lookup failed', {
      category: 'provider_http_failure',
      status: 429,
      operationId: expect.stringMatching(/^[0-9a-f-]{36}$/),
    });
    expect(redis.setex).not.toHaveBeenCalled();
  });

  it('discards untrusted provider refusal messages', async () => {
    respond({ status: 'fail', message: hostileText });
    await expect(geolocateIP(sentinels[1])).resolves.toBeNull();
    expect(logger.error).toHaveBeenCalledWith('GeoIP lookup failed', {
      category: 'provider_refusal',
      operationId: expect.any(String),
    });
  });

  it('discards thrown network errors and retains the no-VPN fallback', async () => {
    fetchMock.mockRejectedValue(hostileError);
    await expect(isVPNOrProxy(sentinels[0])).resolves.toBe(false);
    await expect(getCountryCode(sentinels[1])).resolves.toBeNull();
    expect(logger.error).toHaveBeenCalledWith('GeoIP lookup failed', {
      category: 'lookup_exception',
      operationId: expect.any(String),
    });
  });

  it('discards JSON parse exceptions', async () => {
    fetchMock.mockResolvedValue(new Response(hostileText));
    await expect(geolocateIP(sentinels[0])).resolves.toBeNull();
    expect(logger.error).toHaveBeenCalledWith('GeoIP lookup failed', {
      category: 'invalid_response',
      operationId: expect.any(String),
    });
  });

  it.each([
    null,
    [],
    { status: 'unknown', message: hostileText },
    { ...providerLocation, city: { private: hostileText } },
    { ...providerLocation, lat: hostileText },
    { ...providerLocation, proxy: 'true' },
  ])('refuses malformed response %# without caching it', async (body) => {
    respond(body);
    await expect(geolocateIP(sentinels[0])).resolves.toBeNull();
    expect(redis.setex).not.toHaveBeenCalled();
    expect(logger.error).toHaveBeenCalledWith('GeoIP lookup failed', {
      category: 'invalid_response',
      operationId: expect.any(String),
    });
  });

  it('survives cache get and set errors without leaking commands, keys or values', async () => {
    redis.get.mockRejectedValue(hostileError);
    redis.setex.mockRejectedValue(hostileError);
    await expect(geolocateIP(sentinels[0])).resolves.toEqual(location);
    expect(logger.error).toHaveBeenCalledWith('Redis operation failed', {
      category: 'cache_get_failure',
      operationId: expect.any(String),
    });
    expect(logger.error).toHaveBeenCalledWith('Redis operation failed', {
      category: 'cache_set_failure',
      operationId: expect.any(String),
    });
  });

  it('survives malformed cached JSON without logging its contents', async () => {
    redis.get.mockResolvedValue(hostileText);
    await expect(geolocateIP(sentinels[0])).resolves.toEqual(location);
    expect(logger.error).toHaveBeenCalledWith('Redis operation failed', {
      category: 'cache_get_failure',
      operationId: expect.any(String),
    });
  });

  it.each(['keys', 'del'] as const)(
    'sanitizes cache clearing failures at %s',
    async (operation) => {
      redis.keys.mockResolvedValue([`geo:ip:${sentinels[0]}`]);
      redis[operation].mockRejectedValue(hostileError);
      await expect(clearGeoIPCache()).resolves.toBeUndefined();
      expect(logger.error).toHaveBeenCalledWith('Redis operation failed', {
        category: 'cache_delete_failure',
        operationId: expect.any(String),
      });
    },
  );

  it('sanitizes Redis error events and connection lifecycle failures', async () => {
    listeners.get('error')!(hostileError);
    redis.ping.mockRejectedValue(hostileError);
    redis.quit.mockRejectedValue(hostileError);
    await expect(checkRedisConnection()).resolves.toBe(false);
    await expect(closeRedisConnection()).resolves.toBeUndefined();
    for (const category of ['connection_failure', 'health_check_failure', 'close_failure']) {
      expect(logger.error).toHaveBeenCalledWith('Redis operation failed', {
        category,
        operationId: expect.any(String),
      });
    }
  });
});

describe('GeoIP lookup compatibility', () => {
  it('preserves successful provider mapping, cache key and 24-hour TTL', async () => {
    await expect(geolocateIP(sentinels[0])).resolves.toEqual(location);
    expect(redis.setex).toHaveBeenCalledWith(
      `geo:ip:${sentinels[0]}`,
      86400,
      JSON.stringify(location),
    );
    expect(await isVPNOrProxy(sentinels[0])).toBe(true);
    expect(await getCountryCode(sentinels[0])).toBe('TC');
    expect(formatGeoLocation(location)).toBe('Test City, Test Country (VPN/Proxy)');
    expect(formatGeoLocation(null)).toBe('Unknown');
    expect(logger.error).not.toHaveBeenCalled();
  });

  it('returns a cache hit without a provider call or cache rewrite', async () => {
    redis.get.mockResolvedValue(JSON.stringify(location));
    await expect(geolocateIP(sentinels[0])).resolves.toEqual(location);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(redis.setex).not.toHaveBeenCalled();
  });

  it.each(['127.0.0.1', '10.0.0.1', '172.16.0.1', '192.168.0.1', '::1'])(
    'keeps local lookup %s offline and cached',
    async (ip) => {
      await expect(geolocateIP(ip)).resolves.toMatchObject({
        countryCode: 'LOCAL',
        isVPN: false,
        isProxy: false,
      });
      expect(fetchMock).not.toHaveBeenCalled();
      expect(redis.setex).toHaveBeenCalledWith(`geo:ip:${ip}`, 86400, expect.any(String));
    },
  );

  it('accepts missing optional fields with the existing null/false defaults', async () => {
    respond({ status: 'success' });
    await expect(geolocateIP(sentinels[0])).resolves.toMatchObject({
      city: null,
      latitude: null,
      isVPN: false,
      isProxy: false,
    });
  });

  it('initializes without provider access and clears only the GeoIP namespace', async () => {
    await expect(initializeGeoIP()).resolves.toBe(true);
    redis.keys.mockResolvedValue([`geo:ip:${sentinels[0]}`]);
    await clearGeoIPCache();
    expect(redis.keys).toHaveBeenCalledWith('geo:ip:*');
    expect(redis.del).toHaveBeenCalledWith(`geo:ip:${sentinels[0]}`);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('retains batch results and the delay between provider lookups', async () => {
    jest.useFakeTimers();
    fetchMock
      .mockRejectedValueOnce(hostileError)
      .mockResolvedValueOnce(new Response(JSON.stringify(providerLocation)));
    const batch = geolocateBatch([sentinels[0], sentinels[1]]);
    await jest.advanceTimersByTimeAsync(799);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await jest.advanceTimersByTimeAsync(1);
    await expect(batch).resolves.toEqual(
      new Map([
        [sentinels[0], null],
        [sentinels[1], location],
      ]),
    );
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
