import dotenv from 'dotenv';

process.env.NODE_ENV ||= 'test';

dotenv.config({ path: '.env.test', quiet: true });

const testDefaults: Readonly<Record<string, string>> = {
  HOST: '127.0.0.1',
  PORT: '3001',
  ALLOWED_ORIGINS: 'http://frontend.test.invalid',
  LOG_LEVEL: 'error',
  SITE_URL: 'http://site.test.invalid',
  JWT_SECRET: 'test-jwt-secret-at-least-32-bytes-long',
  DB_HOST: '127.0.0.1',
  DB_PORT: '3306',
  DB_USER: 'durisweb_test',
  DB_PASSWORD: 'test-password',
  DB_NAME: 'durisweb_test',
  MUD_DATABASE_MODE: 'shared',
  MUD_DIR: '/tmp/durisweb-test-mud',
  MUD_WS_URL: 'ws://127.0.0.1:4050',
  MUD_PROCESS_USER: 'duris-test',
  MUD_PROCESS_HOME: '/tmp/durisweb-test-mud',
  MUD_PROCESS_PATH: '/usr/local/bin:/usr/bin:/bin',
  MUD_PROCESS_LOCALE: 'C.UTF-8',
  MUD_PROCESS_SHELL: '/bin/bash',
  MUD_SETSID_BIN: '/usr/bin/setsid',
  TERMINAL_SANDBOX_BIN: '/usr/bin/bwrap',
  DB_PASSWD: 'mud-test-password',
  DURISWEB_SECRET: 'test-bridge-secret-at-least-32-bytes',
  BACKUP_DIR: '/tmp/durisweb-test-backups',
  CACHE_REDIS_HOST: '127.0.0.1',
  CACHE_REDIS_PORT: '6379',
  CACHE_REDIS_DB: '0',
  CACHE_REDIS_AUTH_MODE: 'none',
  CACHE_REDIS_TLS: 'false',
  MUD_REDIS_ENABLED: 'false',
  DONATIONS_ENABLED: 'false',
  ENABLE_GUILD_SYNC: 'false',
  R2_ENABLED: 'false',
  PUSH_ENABLED: 'false',
  GEMINI_ENABLED: 'false',
};

for (const [name, value] of Object.entries(testDefaults)) {
  process.env[name] ||= value;
}
