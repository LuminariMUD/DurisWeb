import { beforeAll, beforeEach, describe, expect, it, jest } from '@jest/globals';

const poolQuery = jest.fn<(...args: unknown[]) => Promise<unknown>>();
const loggerInfo = jest.fn();
const loggerWarn = jest.fn();

jest.unstable_mockModule('../../db/connection.js', () => ({
  pool: { query: poolQuery },
}));
jest.unstable_mockModule('../../utils/logger.js', () => ({
  default: { error: jest.fn(), info: loggerInfo, warn: loggerWarn },
}));

let reconcileBootTime: typeof import('../serverRebootService.js')['reconcileBootTime'];

beforeAll(async () => {
  ({ reconcileBootTime } = await import('../serverRebootService.js'));
});

beforeEach(() => {
  jest.clearAllMocks();
});

describe('durable host reboot tracking', () => {
  it('persists the first observed boot without inventing a completed interval', async () => {
    poolQuery.mockResolvedValueOnce([[]]).mockResolvedValueOnce([{}]);

    await reconcileBootTime(1_000);

    expect(poolQuery).toHaveBeenCalledTimes(2);
    expect(String(poolQuery.mock.calls[1][0])).toContain('INSERT INTO web_settings');
    expect(poolQuery.mock.calls[1][1]).toEqual([
      'durisweb_host_boot_time',
      '1000',
      'Internal durable marker for host reboot detection',
      'durisweb-host-monitor',
    ]);
  });

  it('records the prior boot interval and advances the marker after a reboot', async () => {
    poolQuery
      .mockResolvedValueOnce([[{ setting_value: '1000' }]])
      .mockResolvedValueOnce([[{ count: 0 }]])
      .mockResolvedValueOnce([{ insertId: 7 }])
      .mockResolvedValueOnce([{}]);

    await reconcileBootTime(2_000);

    expect(String(poolQuery.mock.calls[2][0])).toContain('INSERT INTO server_reboots');
    expect(poolQuery.mock.calls[2][1]).toEqual([1_000, 2_000, 1_000, 'durisweb-host-monitor']);
    expect(String(poolQuery.mock.calls[3][0])).toContain('INSERT INTO web_settings');
    expect(loggerInfo).toHaveBeenCalledWith(
      'Server reboot detected! Old boot: 1000, New boot: 2000',
    );
  });

  it('advances a stale marker without duplicating an existing reboot interval', async () => {
    poolQuery
      .mockResolvedValueOnce([[{ setting_value: '1000' }]])
      .mockResolvedValueOnce([[{ count: 1 }]])
      .mockResolvedValueOnce([{}]);

    await reconcileBootTime(2_000);

    expect(poolQuery).toHaveBeenCalledTimes(3);
    expect(String(poolQuery.mock.calls[2][0])).toContain('INSERT INTO web_settings');
  });

  it('ignores small boot-time calculation drift', async () => {
    poolQuery.mockResolvedValueOnce([[{ setting_value: '1000' }]]);

    await reconcileBootTime(1_004);

    expect(poolQuery).toHaveBeenCalledTimes(1);
  });
});
