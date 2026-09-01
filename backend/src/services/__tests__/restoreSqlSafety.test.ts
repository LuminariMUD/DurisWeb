import { beforeAll, describe, expect, it, jest } from '@jest/globals';

jest.unstable_mockModule('../../db/connection.js', () => ({
  pool: { query: jest.fn(), execute: jest.fn(), getConnection: jest.fn() },
}));
jest.unstable_mockModule('unzipper', () => ({
  default: { Open: { file: jest.fn() } },
}));
jest.unstable_mockModule('../webSettingsService.js', () => ({
  getWebSettings: jest.fn(),
}));
jest.unstable_mockModule('../../utils/logger.js', () => ({
  default: { error: jest.fn(), info: jest.fn(), warn: jest.fn() },
}));
jest.unstable_mockModule('node-cron', () => ({
  default: { schedule: jest.fn() },
}));

let buildRestoreSql: typeof import('../backupService.js')['buildRestoreSql'];

beforeAll(async () => {
  ({ buildRestoreSql } = await import('../backupService.js'));
});

describe('restore SQL safety boundary', () => {
  it('rejects SQL expressions embedded in restore row values', () => {
    expect(() =>
      buildRestoreSql({
        player_data: ['(1,(SELECT SLEEP(1)))'],
      }),
    ).toThrow();
  });

  it('rejects tables outside the restore allow-list', () => {
    expect(() =>
      buildRestoreSql({
        accounts: ["('Cwial','literal')"],
        users: ["(1,'unexpected')"],
      }),
    ).toThrow();
  });

  it('preserves ordinary literal rows', () => {
    const sql = buildRestoreSql({
      player_data: ["(1,'safe, value','O\\'Reilly',NULL,0xABCD)"],
    });

    expect(sql).toContain(
      "REPLACE INTO `player_data` VALUES (1,'safe, value','O\\'Reilly',NULL,0xABCD);",
    );
  });
});
