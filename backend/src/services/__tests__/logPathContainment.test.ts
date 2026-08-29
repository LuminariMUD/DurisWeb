import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';

const mudRoot = fs.mkdtempSync(path.join(os.tmpdir(), 't025-logs-'));
const runtimeRoot = path.join(mudRoot, 'logs', 'log');
const playerRoot = path.join(mudRoot, 'logs', 'player-log');
fs.mkdirSync(runtimeRoot, { recursive: true });
fs.mkdirSync(playerRoot, { recursive: true });
fs.writeFileSync(path.join(runtimeRoot, 'runtime.log'), 'INFO safe line\n');
const outsideFile = path.join(mudRoot, 'outside-secret.log');
fs.writeFileSync(outsideFile, 'SECRET SHOULD NOT BE READ\n');

let getLogFilePath: typeof import('../logService.js')['getLogFilePath'];
let readLogPaginated: typeof import('../logService.js')['readLogPaginated'];
let tailLog: typeof import('../logService.js')['tailLog'];

beforeAll(async () => {
  process.env.MUD_DIR = mudRoot;
  const service = await import('../logService.js');
  getLogFilePath = service.getLogFilePath;
  readLogPaginated = service.readLogPaginated;
  tailLog = service.tailLog;
});

afterAll(() => {
  fs.rmSync(mudRoot, { recursive: true, force: true });
});

describe('log path containment', () => {
  it('accepts a normal log filename', () => {
    expect(getLogFilePath('runtime', 'runtime.log')).toBe(path.join(runtimeRoot, 'runtime.log'));
  });

  it.each([
    '../outside-secret.log',
    '../../etc/passwd',
    '/etc/passwd',
    'runtime.log/../outside-secret.log',
    'runtime\\.log',
    '"quoted.log',
  ])('rejects unsafe log name %s', (logName) => {
    expect(() => getLogFilePath('runtime', logName)).toThrow();
  });

  it('rejects a symlinked log even when the link is inside the log directory', () => {
    const symlinkPath = path.join(runtimeRoot, 'linked.log');
    fs.symlinkSync(outsideFile, symlinkPath);

    expect(() => getLogFilePath('runtime', 'linked.log')).toThrow();
  });

  it('prevents readers from traversing outside the selected log category', async () => {
    await expect(readLogPaginated('runtime', '../outside-secret.log')).rejects.toThrow();
    await expect(tailLog('runtime', '../../etc/passwd')).rejects.toThrow();
  });
});
