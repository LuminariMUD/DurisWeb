import path from 'node:path';

import dotenv from 'dotenv';

export type RuntimeEnvironment = 'development' | 'test' | 'production';
export type AuthenticationMode = 'none' | 'password' | 'acl';
export type MudDatabaseMode = 'shared' | 'separate';

export interface DatabaseConfiguration {
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
}

export interface RedisConnectionConfiguration {
  host: string;
  port: number;
  database: number;
  username?: string;
  password?: string;
  tls: boolean;
  caCertificatePath?: string;
  tlsServerName?: string;
}

export interface ScopedRedisConfigurationValues extends RedisConnectionConfiguration {
  namespace: string;
  credentials: {
    presence: { username?: string; password?: string };
    cache: { username?: string; password?: string };
    donation?: { username?: string; password?: string };
  };
}

export interface R2Configuration {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucketName: string;
  publicUrl: string;
}

export interface PushConfiguration {
  publicKey: string;
  privateKey: string;
  subject: string;
}

export interface BackendConfiguration {
  environment: RuntimeEnvironment;
  server: {
    host: string;
    port: number;
    allowedOrigins: string[];
  };
  database: DatabaseConfiguration;
  mudDatabase: {
    mode: MudDatabaseMode;
    connection: DatabaseConfiguration;
  };
  cacheRedis: RedisConnectionConfiguration;
  scopedRedis: ScopedRedisConfigurationValues | null;
  mud: {
    directory: string;
    websocketUrl: string;
    processUser: string;
    processHome: string;
    processPath: string;
    processLocale: string;
    processShell: string;
    setsidBinary: string;
    terminalSandboxBinary: string;
    processDatabasePassword: string;
    bridgeSecret: string;
    previousBridgeSecret?: string;
    bridgeSecretRotatedAt?: string;
  };
  backupDirectory: string;
  siteUrl: string;
  jwtSecret: string;
  logLevel: 'error' | 'warn' | 'info' | 'http' | 'verbose' | 'debug' | 'silly';
  features: {
    guildSync: boolean;
    mudRedis: boolean;
    donations: boolean;
    r2: boolean;
    push: boolean;
    gemini: boolean;
  };
  donationVerificationToken?: string;
  donationSigningSecret?: string;
  r2?: R2Configuration;
  push?: PushConfiguration;
  geminiApiKey?: string;
}

/** Aggregates configuration issues without including the rejected secret values. */
export class ConfigurationError extends Error {
  readonly issues: readonly string[];

  constructor(issues: readonly string[]) {
    super(`Invalid backend configuration:\n- ${issues.join('\n- ')}`);
    this.name = 'ConfigurationError';
    this.issues = issues;
  }
}

type EnvironmentSource = Readonly<Record<string, string | undefined>>;

/** Returns whether a host is confined to the local machine. */
function isLoopbackHost(hostname: string): boolean {
  const host = hostname.trim().toLowerCase();
  if (host === 'localhost') return true;
  const bare = host.startsWith('[') && host.endsWith(']') ? host.slice(1, -1) : host;
  if (bare === '::1' || bare === '0:0:0:0:0:0:0:1') return true;
  const ipv4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(bare);
  if (!ipv4) return false;
  const octets = ipv4.slice(1).map(Number);
  return octets.every((octet) => octet >= 0 && octet <= 255) && octets[0] === 127;
}

/** Treats whitespace-only legacy aliases as absent. */
function hasValue(source: EnvironmentSource, name: string): boolean {
  return Boolean(source[name]?.trim());
}

/** Reads a required string while rejecting documented placeholder values. */
function requiredString(
  source: EnvironmentSource,
  name: string,
  issues: string[],
  minimumBytes = 1,
): string {
  const value = source[name]?.trim();
  if (!value) {
    issues.push(`${name} is required`);
    return '';
  }
  if (/(?:change[_-]?me|replace_with)/i.test(value)) {
    issues.push(`${name} still contains an example placeholder`);
  }
  if (Buffer.byteLength(value, 'utf8') < minimumBytes) {
    issues.push(`${name} must contain at least ${minimumBytes} bytes`);
  }
  return value;
}

/** Reads an optional string while still rejecting placeholder values. */
function optionalString(
  source: EnvironmentSource,
  name: string,
  issues: string[],
): string | undefined {
  const value = source[name]?.trim();
  if (value && /(?:change[_-]?me|replace_with)/i.test(value)) {
    issues.push(`${name} still contains an example placeholder`);
  }
  return value || undefined;
}

/** Parses an explicitly configured boolean without inventing a default. */
function requiredBoolean(source: EnvironmentSource, name: string, issues: string[]): boolean {
  const value = requiredString(source, name, issues).toLowerCase();
  if (value !== 'true' && value !== 'false') {
    if (value) issues.push(`${name} must be true or false`);
    return false;
  }
  return value === 'true';
}

/** Parses an enum value and records every unsupported selection. */
function requiredEnum<T extends string>(
  source: EnvironmentSource,
  name: string,
  allowed: readonly T[],
  issues: string[],
): T {
  const value = requiredString(source, name, issues);
  if (!allowed.includes(value as T)) {
    if (value) issues.push(`${name} must be one of: ${allowed.join(', ')}`);
    return allowed[0];
  }
  return value as T;
}

/** Parses a bounded base-10 integer without accepting numeric prefixes. */
function requiredInteger(
  source: EnvironmentSource,
  name: string,
  minimum: number,
  maximum: number,
  issues: string[],
): number {
  const raw = requiredString(source, name, issues);
  const value = Number(raw);
  if (!Number.isInteger(value) || value < minimum || value > maximum) {
    if (raw) issues.push(`${name} must be an integer between ${minimum} and ${maximum}`);
    return minimum;
  }
  return value;
}

/** Parses a credential-free URL restricted to the protocols owned by a setting. */
function requiredUrl(
  source: EnvironmentSource,
  name: string,
  protocols: readonly string[],
  issues: string[],
): string {
  const raw = requiredString(source, name, issues);
  if (!raw) return '';
  try {
    const value = new URL(raw);
    if (!protocols.includes(value.protocol)) {
      issues.push(`${name} must use ${protocols.join(' or ')}`);
    }
    if (value.username || value.password) {
      issues.push(`${name} must not contain credentials`);
    }
    return value.toString();
  } catch {
    issues.push(`${name} must be a valid URL`);
    return raw;
  }
}

/** Resolves a required absolute path so all consumers receive the same canonical form. */
function requiredAbsolutePath(source: EnvironmentSource, name: string, issues: string[]): string {
  const value = requiredString(source, name, issues);
  if (value && !path.isAbsolute(value)) {
    issues.push(`${name} must be an absolute path`);
  }
  return value ? path.resolve(value) : '';
}

/** Validates a PATH-like value without silently adding process defaults. */
function requiredPathList(source: EnvironmentSource, name: string, issues: string[]): string {
  const value = requiredString(source, name, issues);
  if (value && value.split(path.delimiter).some((entry) => !entry || !path.isAbsolute(entry))) {
    issues.push(`${name} must contain only absolute paths separated by ${path.delimiter}`);
  }
  return value;
}

/** Accepts a bare hostname or supported loopback bind address. */
function requiredHost(source: EnvironmentSource, name: string, issues: string[]): string {
  const value = requiredString(source, name, issues);
  if (
    value &&
    value !== '::' &&
    value !== '::1' &&
    !/^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)*[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i.test(
      value,
    )
  ) {
    issues.push(`${name} must be a hostname or IP address without a scheme, port, or path`);
  }
  return value;
}

/** Enforces TLS for privileged MUD bridge traffic that leaves loopback. */
function requiredMudWebSocketUrl(source: EnvironmentSource, issues: string[]): string {
  const value = requiredUrl(source, 'MUD_WS_URL', ['ws:', 'wss:'], issues);
  if (!value) return value;
  try {
    const parsed = new URL(value);
    if (parsed.search || parsed.hash) {
      issues.push('MUD_WS_URL must not contain a query string or fragment');
    }
    const hostname = parsed.hostname.toLowerCase();
    const isLoopback =
      hostname === 'localhost' ||
      hostname === '::1' ||
      hostname === '[::1]' ||
      /^127(?:\.(?:\d{1,3})){3}$/.test(hostname);
    if (parsed.protocol === 'ws:' && !isLoopback) {
      issues.push('MUD_WS_URL must use wss: for non-loopback hosts');
    }
  } catch {
    // requiredUrl already recorded the invalid URL.
  }
  return value;
}

/** Parses exact HTTP origins for credentialed CORS requests. */
function parseAllowedOrigins(source: EnvironmentSource, name: string, issues: string[]): string[] {
  const raw = requiredString(source, name, issues);
  if (!raw) return [];
  const origins = raw
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
  if (origins.length === 0) {
    issues.push(`${name} must contain at least one origin`);
    return [];
  }
  for (const origin of origins) {
    try {
      const parsed = new URL(origin);
      if (!['http:', 'https:'].includes(parsed.protocol) || parsed.origin !== origin) {
        issues.push(`${name} entries must be http(s) origins without paths`);
        break;
      }
    } catch {
      issues.push(`${name} entries must be valid URLs`);
      break;
    }
  }
  return origins;
}

/** Parses one explicitly owned database connection family. */
function parseDatabase(
  source: EnvironmentSource,
  prefix: 'DB' | 'MUD_DB',
  issues: string[],
): DatabaseConfiguration {
  return {
    host: requiredString(source, `${prefix}_HOST`, issues),
    port: requiredInteger(source, `${prefix}_PORT`, 1, 65_535, issues),
    user: requiredString(source, `${prefix}_USER`, issues),
    password: requiredString(source, `${prefix}_PASSWORD`, issues),
    database: requiredString(source, `${prefix}_NAME`, issues),
  };
}

/** Selects the credentials required by a Redis authentication mode. */
function parseRedisCredentials(
  source: EnvironmentSource,
  prefix: string,
  mode: AuthenticationMode,
  issues: string[],
): { username?: string; password?: string } {
  if (mode === 'none') return {};
  const password = requiredString(source, `${prefix}_PASSWORD`, issues);
  if (mode === 'password') return { password };
  return {
    username: requiredString(source, `${prefix}_USERNAME`, issues),
    password,
  };
}

/** Parses the general cache connection and prevents remote plaintext authentication. */
function parseCacheRedis(
  source: EnvironmentSource,
  environment: RuntimeEnvironment,
  issues: string[],
): RedisConnectionConfiguration {
  const authenticationMode = requiredEnum(
    source,
    'CACHE_REDIS_AUTH_MODE',
    ['none', 'password', 'acl'] as const,
    issues,
  );
  if (environment === 'production' && authenticationMode === 'none') {
    issues.push('CACHE_REDIS_AUTH_MODE must not be none in production');
  }
  const host = requiredString(source, 'CACHE_REDIS_HOST', issues);
  const tls = requiredBoolean(source, 'CACHE_REDIS_TLS', issues);
  const credentials = parseRedisCredentials(source, 'CACHE_REDIS', authenticationMode, issues);
  if (authenticationMode !== 'none' && !tls && !isLoopbackHost(host)) {
    issues.push('CACHE_REDIS_TLS must be true for credentialed non-loopback connections');
  }
  const caCertificatePath = tls
    ? requiredAbsolutePath(source, 'CACHE_REDIS_CA_CERT', issues)
    : undefined;
  const tlsServerName = tls
    ? requiredString(source, 'CACHE_REDIS_TLS_SERVER_NAME', issues)
    : undefined;

  return {
    host,
    port: requiredInteger(source, 'CACHE_REDIS_PORT', 1, 65_535, issues),
    database: requiredInteger(source, 'CACHE_REDIS_DB', 0, 255, issues),
    ...credentials,
    tls,
    caCertificatePath,
    tlsServerName,
  };
}

/** Parses the independently scoped MUD Redis identities and deployment namespace. */
function parseScopedRedis(
  source: EnvironmentSource,
  environment: RuntimeEnvironment,
  donationsEnabled: boolean,
  issues: string[],
): ScopedRedisConfigurationValues {
  const authenticationMode = requiredEnum(
    source,
    'MUD_REDIS_AUTH_MODE',
    ['none', 'acl'] as const,
    issues,
  );
  if (environment === 'production' && authenticationMode === 'none') {
    issues.push('MUD_REDIS_AUTH_MODE must be acl in production');
  }
  const tls = requiredBoolean(source, 'MUD_REDIS_TLS', issues);
  const caCertificatePath = tls
    ? requiredAbsolutePath(source, 'MUD_REDIS_CA_CERT', issues)
    : undefined;
  const tlsServerName = tls
    ? requiredString(source, 'MUD_REDIS_TLS_SERVER_NAME', issues)
    : undefined;
  const noCredentials = {};

  const namespace = requiredString(source, 'MUD_REDIS_NAMESPACE', issues);
  const namespacePrefix = environment === 'production' ? 'duris:production:' : 'duris:local:';
  if (
    namespace &&
    (!namespace.startsWith(namespacePrefix) ||
      !/^[a-z0-9](?:[a-z0-9_-]{0,30}[a-z0-9])?$/.test(namespace.slice(namespacePrefix.length)))
  ) {
    issues.push(
      `MUD_REDIS_NAMESPACE must use ${namespacePrefix}<deployment> with lowercase letters, digits, hyphens, or underscores`,
    );
  }

  return {
    host: requiredString(source, 'MUD_REDIS_HOST', issues),
    port: requiredInteger(source, 'MUD_REDIS_PORT', 1, 65_535, issues),
    database: requiredInteger(source, 'MUD_REDIS_DB', 0, 255, issues),
    namespace,
    tls,
    caCertificatePath,
    tlsServerName,
    credentials: {
      presence:
        authenticationMode === 'acl'
          ? parseRedisCredentials(source, 'MUD_REDIS_PRESENCE', 'acl', issues)
          : noCredentials,
      cache:
        authenticationMode === 'acl'
          ? parseRedisCredentials(source, 'MUD_REDIS_CACHE', 'acl', issues)
          : noCredentials,
      donation:
        donationsEnabled && authenticationMode === 'acl'
          ? parseRedisCredentials(source, 'MUD_REDIS_DONATION', 'acl', issues)
          : donationsEnabled
            ? noCredentials
            : undefined,
    },
  };
}

/** Rejects obsolete aliases so ownership cannot drift back to implicit fallbacks. */
function rejectLegacyAliases(source: EnvironmentSource, issues: string[]): void {
  const aliases = [
    'DURIS_DB_HOST',
    'DURIS_DB_PORT',
    'DURIS_DB_USER',
    'DURIS_DB_PASSWORD',
    'DURIS_DB_NAME',
  ];
  const configuredAliases = aliases.filter((name) => hasValue(source, name));
  if (configuredAliases.length > 0) {
    issues.push(
      `legacy ${configuredAliases.join(', ')} configuration is not supported; use MUD_DATABASE_MODE and MUD_DB_*`,
    );
  }
  if (hasValue(source, 'MUD_WS_HOST')) {
    issues.push('legacy MUD_WS_HOST is not supported; use the complete MUD_WS_URL');
  }
  if (hasValue(source, 'REDIS_HOST') || hasValue(source, 'REDIS_PORT')) {
    issues.push('legacy REDIS_* connection keys are not supported; use MUD_REDIS_*');
  }
}

/** Parses the complete backend contract and reports all discovered issues together. */
export function parseBackendEnvironment(source: EnvironmentSource): BackendConfiguration {
  const issues: string[] = [];
  rejectLegacyAliases(source, issues);

  const environment = requiredEnum(
    source,
    'NODE_ENV',
    ['development', 'test', 'production'] as const,
    issues,
  );
  const database = parseDatabase(source, 'DB', issues);
  const mudDatabaseMode = requiredEnum(
    source,
    'MUD_DATABASE_MODE',
    ['shared', 'separate'] as const,
    issues,
  );
  const mudDatabase =
    mudDatabaseMode === 'separate' ? parseDatabase(source, 'MUD_DB', issues) : database;
  const guildSync = requiredBoolean(source, 'ENABLE_GUILD_SYNC', issues);
  const mudRedisEnabled = requiredBoolean(source, 'MUD_REDIS_ENABLED', issues);
  const donationsEnabled = requiredBoolean(source, 'DONATIONS_ENABLED', issues);
  const r2Enabled = requiredBoolean(source, 'R2_ENABLED', issues);
  const pushEnabled = requiredBoolean(source, 'PUSH_ENABLED', issues);
  const geminiEnabled = requiredBoolean(source, 'GEMINI_ENABLED', issues);

  if (donationsEnabled && !mudRedisEnabled) {
    issues.push('DONATIONS_ENABLED requires MUD_REDIS_ENABLED=true');
  }

  const scopedRedis = mudRedisEnabled
    ? parseScopedRedis(source, environment, donationsEnabled, issues)
    : null;
  const cacheRedis = parseCacheRedis(source, environment, issues);
  const previousBridgeSecret = optionalString(source, 'DURISWEB_SECRET_PREVIOUS', issues);
  if (previousBridgeSecret && Buffer.byteLength(previousBridgeSecret, 'utf8') < 32) {
    issues.push('DURISWEB_SECRET_PREVIOUS must contain at least 32 bytes when provided');
  }
  const rotatedAt = optionalString(source, 'DURISWEB_SECRET_ROTATED_AT', issues);
  if (Boolean(previousBridgeSecret) !== Boolean(rotatedAt)) {
    issues.push(
      'DURISWEB_SECRET_PREVIOUS and DURISWEB_SECRET_ROTATED_AT must be configured together',
    );
  }
  if (rotatedAt && Number.isNaN(Date.parse(rotatedAt))) {
    issues.push('DURISWEB_SECRET_ROTATED_AT must be a valid date-time when provided');
  }

  const r2 = r2Enabled
    ? {
        accountId: requiredString(source, 'R2_ACCOUNT_ID', issues),
        accessKeyId: requiredString(source, 'R2_ACCESS_KEY_ID', issues),
        secretAccessKey: requiredString(source, 'R2_SECRET_ACCESS_KEY', issues),
        bucketName: requiredString(source, 'R2_BUCKET_NAME', issues),
        publicUrl: requiredUrl(source, 'R2_PUBLIC_URL', ['http:', 'https:'], issues).replace(
          /\/$/,
          '',
        ),
      }
    : undefined;

  const push = pushEnabled
    ? {
        publicKey: requiredString(source, 'VAPID_PUBLIC_KEY', issues),
        privateKey: requiredString(source, 'VAPID_PRIVATE_KEY', issues),
        subject: requiredUrl(source, 'VAPID_SUBJECT', ['mailto:', 'http:', 'https:'], issues),
      }
    : undefined;

  const configuration: BackendConfiguration = {
    environment,
    server: {
      host: requiredHost(source, 'HOST', issues),
      port: requiredInteger(source, 'PORT', 1, 65_535, issues),
      allowedOrigins: parseAllowedOrigins(source, 'ALLOWED_ORIGINS', issues),
    },
    database,
    mudDatabase: {
      mode: mudDatabaseMode,
      connection: mudDatabase,
    },
    cacheRedis,
    scopedRedis,
    mud: {
      directory: requiredAbsolutePath(source, 'MUD_DIR', issues),
      websocketUrl: requiredMudWebSocketUrl(source, issues),
      processUser: requiredString(source, 'MUD_PROCESS_USER', issues),
      processHome: requiredAbsolutePath(source, 'MUD_PROCESS_HOME', issues),
      processPath: requiredPathList(source, 'MUD_PROCESS_PATH', issues),
      processLocale: requiredString(source, 'MUD_PROCESS_LOCALE', issues),
      processShell: requiredAbsolutePath(source, 'MUD_PROCESS_SHELL', issues),
      setsidBinary: requiredAbsolutePath(source, 'MUD_SETSID_BIN', issues),
      terminalSandboxBinary: requiredAbsolutePath(source, 'TERMINAL_SANDBOX_BIN', issues),
      processDatabasePassword: requiredString(source, 'DB_PASSWD', issues),
      bridgeSecret: requiredString(source, 'DURISWEB_SECRET', issues, 32),
      previousBridgeSecret,
      bridgeSecretRotatedAt: rotatedAt ? new Date(rotatedAt).toISOString() : undefined,
    },
    backupDirectory: requiredAbsolutePath(source, 'BACKUP_DIR', issues),
    siteUrl: requiredUrl(source, 'SITE_URL', ['http:', 'https:'], issues).replace(/\/$/, ''),
    jwtSecret: requiredString(source, 'JWT_SECRET', issues, 32),
    logLevel: requiredEnum(
      source,
      'LOG_LEVEL',
      ['error', 'warn', 'info', 'http', 'verbose', 'debug', 'silly'] as const,
      issues,
    ),
    features: {
      guildSync,
      mudRedis: mudRedisEnabled,
      donations: donationsEnabled,
      r2: r2Enabled,
      push: pushEnabled,
      gemini: geminiEnabled,
    },
    donationVerificationToken: donationsEnabled
      ? requiredString(source, 'KOFI_VERIFICATION_TOKEN', issues)
      : undefined,
    donationSigningSecret: donationsEnabled
      ? requiredString(source, 'MUD_REDIS_DONATION_SECRET', issues, 32)
      : undefined,
    r2,
    push,
    geminiApiKey: geminiEnabled ? requiredString(source, 'GEMINI_API_KEY', issues) : undefined,
  };

  if (issues.length > 0) throw new ConfigurationError(issues);
  return configuration;
}

let environmentFilesLoaded = false;
let cachedConfiguration: BackendConfiguration | null = null;

/** Loads the documented dotenv precedence once per process. */
function loadEnvironmentFiles(): void {
  if (environmentFilesLoaded) return;
  environmentFilesLoaded = true;
  dotenv.config({
    path: process.env.NODE_ENV === 'test' ? ['.env.test', '.env'] : '.env',
  });
}

/** Returns the single cached backend configuration used by runtime consumers. */
export function getBackendConfiguration(): BackendConfiguration {
  if (cachedConfiguration) return cachedConfiguration;
  loadEnvironmentFiles();
  cachedConfiguration = parseBackendEnvironment(process.env);
  return cachedConfiguration;
}

/** Clears only the parsed test cache while preserving production immutability. */
export function resetBackendConfigurationForTests(): void {
  if (process.env.NODE_ENV !== 'test') {
    throw new Error('Backend configuration can only be reset while NODE_ENV=test');
  }
  cachedConfiguration = null;
}
