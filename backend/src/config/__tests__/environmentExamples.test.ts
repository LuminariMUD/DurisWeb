import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from '@jest/globals';
import dotenv from 'dotenv';

import { parseBackendEnvironment } from '../environment.js';

const CONFIG_DIRECTORY = path.dirname(fileURLToPath(import.meta.url));
const BACKEND_ROOT = path.resolve(CONFIG_DIRECTORY, '../../..');

describe('backend environment examples', () => {
  it.each(['.env.example', '.env.test.example'])('%s forces placeholder replacement', (name) => {
    const example = fs.readFileSync(path.join(BACKEND_ROOT, name), 'utf8');
    expect(() => parseBackendEnvironment(dotenv.parse(example))).toThrow(/example placeholder/);
    const configured = dotenv.parse(example.replaceAll('CHANGE_ME', 'configured'));
    expect(() => parseBackendEnvironment(configured)).not.toThrow();
  });

  it('documents every optional integration and rotation key', () => {
    const example = fs.readFileSync(path.join(BACKEND_ROOT, '.env.example'), 'utf8');
    const optionalKeys = [
      'MUD_DB_HOST',
      'MUD_DB_PORT',
      'MUD_DB_USER',
      'MUD_DB_PASSWORD',
      'MUD_DB_NAME',
      'DURISWEB_SECRET_PREVIOUS',
      'DURISWEB_SECRET_ROTATED_AT',
      'CACHE_REDIS_USERNAME',
      'CACHE_REDIS_CA_CERT',
      'CACHE_REDIS_TLS_SERVER_NAME',
      'MUD_REDIS_HOST',
      'MUD_REDIS_PORT',
      'MUD_REDIS_DB',
      'MUD_REDIS_NAMESPACE',
      'MUD_REDIS_AUTH_MODE',
      'MUD_REDIS_PRESENCE_USERNAME',
      'MUD_REDIS_PRESENCE_PASSWORD',
      'MUD_REDIS_CACHE_USERNAME',
      'MUD_REDIS_CACHE_PASSWORD',
      'MUD_REDIS_TLS',
      'MUD_REDIS_CA_CERT',
      'MUD_REDIS_TLS_SERVER_NAME',
      'KOFI_VERIFICATION_TOKEN',
      'MUD_REDIS_DONATION_USERNAME',
      'MUD_REDIS_DONATION_PASSWORD',
      'MUD_REDIS_DONATION_SECRET',
      'R2_ACCOUNT_ID',
      'R2_ACCESS_KEY_ID',
      'R2_SECRET_ACCESS_KEY',
      'R2_BUCKET_NAME',
      'R2_PUBLIC_URL',
      'VAPID_PUBLIC_KEY',
      'VAPID_PRIVATE_KEY',
      'VAPID_SUBJECT',
      'GEMINI_API_KEY',
      'ALLOW_UNSAFE_AUCTION_WRITES',
      'ALLOW_UNSAFE_ITEM_DELETES',
      'ALLOW_UNSAFE_PLAYER_WIPE',
      'ALLOW_UNSAFE_DATABASE_RESTORE',
    ];
    for (const key of optionalKeys) {
      expect(example).toMatch(new RegExp(`^#? ${key}=|^${key}=`, 'm'));
    }
  });
});
