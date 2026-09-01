import { afterEach, beforeEach, describe, expect, it } from '@jest/globals';

import {
  buildMudSocketOptions,
  generateDuriswebSig,
  isLoopbackHost,
  readDuriswebSecret,
} from '../mudTransportPolicy.js';

const CURRENT = 'current-secret-at-least-thirty-two-bytes-long';
const PREVIOUS = 'previous-secret-at-least-thirty-two-byte';
const CHALLENGE = 'a'.repeat(64);

const savedEnv = { ...process.env };

beforeEach(() => {
  process.env.DURISWEB_SECRET = CURRENT;
  delete process.env.DURISWEB_SECRET_PREVIOUS;
});

afterEach(() => {
  process.env = { ...savedEnv };
});

describe('loopback host policy', () => {
  it.each(['127.0.0.1', '127.1.2.3', '127.255.255.255', 'localhost', 'LOCALHOST', '::1', '[::1]', '0:0:0:0:0:0:0:1'])(
    'treats %s as loopback',
    (host) => {
      expect(isLoopbackHost(host)).toBe(true);
    },
  );

  it.each(['10.0.0.5', '192.168.1.10', '8.8.8.8', 'mud.example.com', '128.0.0.1', '126.255.255.255', '2001:db8::1'])(
    'treats %s as non-loopback',
    (host) => {
      expect(isLoopbackHost(host)).toBe(false);
    },
  );

  it('does not accept a host that merely starts with 127', () => {
    expect(isLoopbackHost('127.example.com')).toBe(false);
    expect(isLoopbackHost('1270.0.0.1')).toBe(false);
  });

  it('rejects octets out of range', () => {
    expect(isLoopbackHost('127.0.0.256')).toBe(false);
  });
});

describe('certificate validation', () => {
  it('enables validation explicitly for wss', () => {
    expect(buildMudSocketOptions('wss://mud.example.com:4050/')).toEqual({
      rejectUnauthorized: true,
    });
  });

  it('passes no options for plaintext loopback', () => {
    expect(buildMudSocketOptions('ws://127.0.0.1:4050/')).toBeUndefined();
  });
});

describe('secret handling', () => {
  it('reads the current secret', () => {
    expect(readDuriswebSecret('current')).toBe(CURRENT);
  });

  it('treats an absent previous secret as absent', () => {
    expect(readDuriswebSecret('previous')).toBeNull();
  });

  it('rejects a secret shorter than 32 bytes rather than using it', () => {
    process.env.DURISWEB_SECRET_PREVIOUS = 'too-short';
    expect(readDuriswebSecret('previous')).toBeNull();
  });

  it('rejects an empty secret', () => {
    process.env.DURISWEB_SECRET_PREVIOUS = '';
    expect(readDuriswebSecret('previous')).toBeNull();
  });

  it('accepts a valid previous secret during rotation', () => {
    process.env.DURISWEB_SECRET_PREVIOUS = PREVIOUS;
    expect(readDuriswebSecret('previous')).toBe(PREVIOUS);
  });
});

describe('signature generation', () => {
  it('produces a 64-character lowercase hex digest', () => {
    expect(generateDuriswebSig(CHALLENGE)).toMatch(/^[0-9a-f]{64}$/);
  });

  it('produces a different signature under each secret', () => {
    process.env.DURISWEB_SECRET_PREVIOUS = PREVIOUS;
    const current = generateDuriswebSig(CHALLENGE, 'current');
    const previous = generateDuriswebSig(CHALLENGE, 'previous');

    expect(current).toMatch(/^[0-9a-f]{64}$/);
    expect(previous).toMatch(/^[0-9a-f]{64}$/);
    expect(current).not.toBe(previous);
  });

  it('rejects a malformed challenge', () => {
    expect(() => generateDuriswebSig('short')).toThrow(/challenge/i);
    expect(() => generateDuriswebSig('z'.repeat(64))).toThrow(/challenge/i);
  });

  it('fails closed when the requested secret is missing', () => {
    expect(() => generateDuriswebSig(CHALLENGE, 'previous')).toThrow(
      /DURISWEB_SECRET_PREVIOUS/,
    );
  });

  it('names the variable but never the secret value in its error', () => {
    process.env.DURISWEB_SECRET = 'too-short';
    try {
      generateDuriswebSig(CHALLENGE);
      throw new Error('expected a throw');
    } catch (error) {
      const message = (error as Error).message;
      expect(message).toContain('DURISWEB_SECRET');
      expect(message).not.toContain('too-short');
    }
  });
});
