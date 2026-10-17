import { describe, expect, it, jest, beforeEach } from '@jest/globals';
import { randomUUID } from 'node:crypto';
import { retentionPreviewPolicy } from '../../config/retentionPolicy.js';
const connect = jest.fn();
const configuration = jest.fn(() => {
  throw new Error('private-configuration-sentinel');
});
let redisLoaded = false;
jest.unstable_mockModule('mysql2/promise', () => ({ default: { createConnection: connect } }));
jest.unstable_mockModule('../../config/environment.js', () => ({
  getBackendConfiguration: configuration,
}));
jest.unstable_mockModule('../../db/redis.js', () => {
  redisLoaded = true;
  return { default: {} };
});
const execution = await import('../retentionExecution.js');
const cli = await import('../../scripts/retention.js');
const options = {
  target: '127.0.0.1:23436/synthetic',
  policyVersion: retentionPreviewPolicy.version,
  runId: randomUUID(),
  cacheTarget: '127.0.0.1:23479/13',
  classes: ['analytics_events', 'login_history'] as const,
  batchSize: 100,
  maxCandidates: 1000,
  timeBudgetMs: 2000,
};
beforeEach(() => {
  jest.clearAllMocks();
});
describe('retention source approval boundary', () => {
  it('has no approved class or execution switch and refuses before configuration or connection I/O', async () => {
    expect(retentionPreviewPolicy.approved).toBe(false);
    expect(retentionPreviewPolicy.executionEnabled).toBe(false);
    expect(Object.values(retentionPreviewPolicy.classes).every((item) => !item.approved)).toBe(
      true,
    );
    await expect(execution.executeRetention(options)).rejects.toMatchObject({
      reason: 'execution_unavailable',
    });
    expect(connect).not.toHaveBeenCalled();
    expect(configuration).not.toHaveBeenCalled();
    expect(redisLoaded).toBe(false);
  });
  it('refuses command-line approval shortcuts and file checkpoints as execution authority', async () => {
    const error = jest.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const args = [
        'execute',
        '--target',
        options.target,
        '--policy-version',
        options.policyVersion,
        '--run-id',
        options.runId,
        '--cache-target',
        options.cacheTarget,
      ];
      expect(await cli.runRetentionCommand(args)).toBe(1);
      expect(JSON.stringify(error.mock.calls)).toContain('execution_unavailable');
      for (const extra of [
        ['--approved', 'true'],
        ['--resume', '/private/preview.json'],
        ['--checkpoint-out', '/private/progress.json'],
      ])
        expect(await cli.runRetentionCommand([...args, ...extra])).toBe(1);
      expect(JSON.stringify(error.mock.calls)).not.toContain('private-configuration-sentinel');
      expect(connect).not.toHaveBeenCalled();
      expect(redisLoaded).toBe(false);
    } finally {
      error.mockRestore();
    }
  });
  it('parses explicit bounds and run identity without changing the default read-only help', async () => {
    expect(
      cli.parseRetentionExecutionArguments([
        '--target',
        options.target,
        '--policy-version',
        options.policyVersion,
        '--run-id',
        options.runId,
        '--cache-target',
        options.cacheTarget,
        '--class',
        'analytics_events',
        '--batch-size',
        '2',
      ]),
    ).toMatchObject({ runId: options.runId, classes: ['analytics_events'], batchSize: 2 });
    for (const args of [
      [],
      ['--run-id', options.runId, '--run-id', options.runId],
      ['--target', options.target],
    ])
      expect(() => cli.parseRetentionExecutionArguments(args)).toThrow();
    const output = jest.spyOn(console, 'log').mockImplementation(() => {});
    try {
      expect(await cli.runRetentionCommand(['--help'])).toBe(0);
      expect(JSON.stringify(output.mock.calls)).toContain('defaults to read-only');
    } finally {
      output.mockRestore();
    }
  });
});
