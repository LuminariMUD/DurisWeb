import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { promisify } from 'node:util';
import { WebSocket } from 'ws';
import { stubModule } from '../../test/stubModule.js';

let running = false;
const execute = jest.fn(async () => [[{ state: running ? 'running' : 'stopped', boot_time: 123 }]]);
const shutdown = jest.fn(async (..._args: unknown[]) => {
  throw new Error('CONTROL_PRIVATE_SENTINEL');
});
const spawn = jest.fn(() => {
  const child = Object.assign(new EventEmitter(), {
    stdout: new PassThrough(),
    stderr: new PassThrough(),
    unref: jest.fn(),
  });
  setImmediate(() =>
    child.emit('error', Object.assign(new Error('SPAWN_PRIVATE_SENTINEL'), { code: 'ENOENT' })),
  );
  return child;
});
const exec = Object.assign(jest.fn(), {
  [promisify.custom]: async () => {
    if (running) return { stdout: 'cycle_mud.sh', stderr: '' };
    throw new Error('Synthetic process is absent');
  },
});
jest.unstable_mockModule('child_process', () => ({ exec, spawn }));
jest.unstable_mockModule('fs/promises', () => ({
  default: {
    readFile: async () => {
      if (running) return '900001';
      throw new Error('Synthetic PID file absent');
    },
    unlink: jest.fn(),
  },
}));
jest.unstable_mockModule('../../db/connection.js', () => ({ pool: { execute, query: execute } }));
const stub = (specifier: string, overrides: Record<string, unknown>) =>
  jest.unstable_mockModule(specifier, stubModule(new URL(specifier, import.meta.url), overrides));
stub('../processMonitor.js', {
  getDmsProcessStats: async () => ({
    pid: running ? 900002 : null,
    isRunning: running,
    uptime: 100,
    cpu: 0,
    memory: 0,
  }),
});
stub('../serverRebootService.js', { recordMudShutdown: shutdown });
stub('../crashDetectionService.js', { createWebShutdownIncident: jest.fn() });
stub('../../hooks/hookGate.js', { isHookEnabledSync: () => true });
stub('../../hooks/hookActivity.js', { recordHookActivity: jest.fn() });
stub('../gitService.js', {
  getCurrentCommitHash: async () => {
    throw new Error('DEPLOY_PRIVATE_SENTINEL');
  },
  refreshGitCache: jest.fn(),
});

const control = await import('../mudControlService.js');
const deployment = await import('../deploymentService.js');
const { default: logger } = await import('../../utils/logger.js');
const states = jest.fn<NonNullable<Parameters<typeof control.setStateBroadcaster>[0]>>();
const output = jest.fn<NonNullable<Parameters<typeof control.setOutputBroadcaster>[0]>>();

beforeEach(() => {
  running = false;
  jest.clearAllMocks();
  jest.spyOn(logger, 'error').mockImplementation(() => logger);
  jest.spyOn(process, 'kill').mockImplementation(() => {
    throw new Error('Process signaling is forbidden in this fixture');
  });
  control.setStateBroadcaster(states);
  control.setOutputBroadcaster(output);
});
afterEach(() => {
  control.setStateBroadcaster(null);
  control.setOutputBroadcaster(null);
  jest.restoreAllMocks();
});

describe('unexpected control diagnostics without operating processes', () => {
  it('handles asynchronous child spawn failure without an unhandled event', async () => {
    const result = await control.startMud('SyntheticOperator', 'synthetic');
    expect(result).toMatchObject({
      success: false,
      message: expect.stringMatching(/^Failed to start MUD \(reference /),
    });
    expect(states).toHaveBeenLastCalledWith({
      state: 'unknown',
      action: 'start',
      by: 'SyntheticOperator',
    });
    expect(
      JSON.stringify([result, output.mock.calls, jest.mocked(logger.error).mock.calls]),
    ).not.toContain('SPAWN_PRIVATE_SENTINEL');
    expect(spawn).toHaveBeenCalledTimes(1);
    expect(process.kill).not.toHaveBeenCalled();
  });
  it.each(['stop', 'restart'] as const)(
    'does not announce stopped or leak failure text after %s fails',
    async (action) => {
      running = true;
      const result = await (action === 'stop' ? control.stopMud : control.restartMud)(
        'SyntheticOperator',
        'synthetic',
        'Synthetic reason',
      );
      expect(result).toMatchObject({
        success: false,
        message: expect.stringContaining('reference'),
      });
      expect(states).toHaveBeenLastCalledWith({
        state: 'unknown',
        action,
        by: 'SyntheticOperator',
        reason: 'Synthetic reason',
      });
      expect(
        JSON.stringify([result, output.mock.calls, jest.mocked(logger.error).mock.calls]),
      ).not.toContain('CONTROL_PRIVATE_SENTINEL');
      expect(process.kill).not.toHaveBeenCalled();
      expect(spawn).not.toHaveBeenCalled();
    },
  );
  it('keeps unexpected deployment errors out of progress and completion messages', async () => {
    const send = jest.fn();
    const ws = {
      readyState: WebSocket.OPEN,
      bufferedAmount: 0,
      send,
      terminate: jest.fn(),
    } as unknown as WebSocket;
    await deployment.deployToCommit({
      ws,
      accountName: 'SyntheticOperator',
      ipAddress: 'synthetic',
      targetHash: 'a'.repeat(40),
      fromHash: '',
      action: 'deploy',
      logs: { git: '', compile: '' },
    });
    const replies = send.mock.calls.map(([text]) => JSON.parse(String(text)));
    expect(replies.at(-1)).toMatchObject({
      type: 'DEPLOY_COMPLETE',
      success: false,
      error: expect.stringMatching(/^Deployment failed \(reference /),
    });
    expect(JSON.stringify([replies, jest.mocked(logger.error).mock.calls])).not.toContain(
      'DEPLOY_PRIVATE_SENTINEL',
    );
    expect(spawn).not.toHaveBeenCalled();
    expect(process.kill).not.toHaveBeenCalled();
  });
});
