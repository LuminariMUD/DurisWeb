import { describe, expect, it, jest } from '@jest/globals';

const database = { query: jest.fn(), execute: jest.fn() };
const stop = jest.fn();
const schedule = jest.fn((_expression: string, _job: () => Promise<void>) => ({ stop }));

jest.unstable_mockModule('../../db/connection.js', () => ({ pool: database, mudPool: database }));
jest.unstable_mockModule('../webSettingsService.js', () => ({ getWebSettings: jest.fn() }));
jest.unstable_mockModule('../../utils/logger.js', () => ({
  default: { error: jest.fn(), info: jest.fn(), warn: jest.fn() },
}));
jest.unstable_mockModule('node-cron', () => ({ default: { schedule } }));

const { startHourlyBackupScheduler, stopHourlyBackupScheduler } = await import(
  '../backupService.js'
);

describe('hourly backup scheduler lifecycle', () => {
  it('schedules once, keeps its stop handle, and stops without creating a backup', () => {
    startHourlyBackupScheduler();
    startHourlyBackupScheduler();
    expect(schedule).toHaveBeenCalledTimes(1);
    expect(schedule.mock.calls[0]?.[0]).toBe('0 * * * *');

    stopHourlyBackupScheduler();
    stopHourlyBackupScheduler();
    expect(stop).toHaveBeenCalledTimes(1);
    expect(database.query).not.toHaveBeenCalled();
    expect(database.execute).not.toHaveBeenCalled();

    // A stopped scheduler can be started again by a later startup.
    startHourlyBackupScheduler();
    expect(schedule).toHaveBeenCalledTimes(2);
    stopHourlyBackupScheduler();
  });
});
