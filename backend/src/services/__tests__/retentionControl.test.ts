import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { randomUUID } from 'node:crypto';
jest.unstable_mockModule('../../db/lifecycleMetadata.js', () => ({
  assertLifecycleMetadata: async () => {
    if (triggers !== 0) throw new Error('private-metadata-sentinel');
  },
}));
const {
  lockRetentionControl,
  saveRetentionControl,
  RetentionControlError,
  EMPTY_RETENTION_CONTROL,
  RETENTION_CONTROL_DESCRIPTION,
} = await import('../retentionControl.js');
import { RETENTION_CONTROL_KEY, isInternalWebSettingKey } from '../../db/internalWebSettings.js';
const query = jest.fn<(...args: unknown[]) => Promise<unknown>>();
let row: Record<string, unknown> | null = null,
  engine = 'InnoDB',
  triggers = 0;
const db = { execute: query, query } as unknown as Parameters<typeof lockRetentionControl>[0];
beforeEach(() => {
  row = null;
  engine = 'InnoDB';
  triggers = 0;
  query.mockReset();
  query.mockImplementation(async (...args) => {
    const spec = args[0],
      sql = spec && typeof spec === 'object' && 'sql' in spec ? String(spec.sql) : '';
    const values: unknown[] = Array.isArray(args[1]) ? args[1] : [];
    if (sql.includes('information_schema.TABLES')) return [[{ ENGINE: engine }], []];
    if (sql.startsWith('INSERT'))
      row ??= {
        setting_key: values[0],
        setting_value: values[1],
        description: values[2],
        updated_by: null,
      };
    if (sql.startsWith('UPDATE') && row) row.setting_value = values[0];
    if (sql.startsWith('SELECT setting_key,setting_value')) return [row ? [{ ...row }] : [], []];
    return [{ affectedRows: 1 }, []];
  });
});
describe('retention lease/control serialization', () => {
  it('creates only a reserved canonical default and preserves an attributed owner lease', async () => {
    expect(await lockRetentionControl(db)).toEqual({ format: 1, lease: null });
    expect(row).toMatchObject({
      setting_key: RETENTION_CONTROL_KEY,
      setting_value: EMPTY_RETENTION_CONTROL,
      description: RETENTION_CONTROL_DESCRIPTION,
      updated_by: null,
    });
    const value = {
      format: 1 as const,
      lease: { owner: randomUUID(), runId: randomUUID(), expiresAtEpoch: 1792192000 },
    };
    await saveRetentionControl(db, value);
    expect(await lockRetentionControl(db)).toEqual(value);
    expect(isInternalWebSettingKey(RETENTION_CONTROL_KEY.toUpperCase())).toBe(true);
  });
  it('refuses unsafe storage or triggers before materializing a control record', async () => {
    engine = 'MyISAM';
    await expect(lockRetentionControl(db)).rejects.toBeInstanceOf(RetentionControlError);
    expect(row).toBeNull();
    engine = 'InnoDB';
    triggers = 1;
    await expect(lockRetentionControl(db)).rejects.toBeInstanceOf(RetentionControlError);
    expect(row).toBeNull();
  });
  it('retains malformed or noncanonical records instead of replacing their evidence', async () => {
    await lockRetentionControl(db);
    row!.setting_value = '{"format":1,"lease":{"owner":"bad"}}';
    await expect(lockRetentionControl(db)).rejects.toBeInstanceOf(RetentionControlError);
    expect(row!.setting_value).toContain('bad');
    row!.setting_value = EMPTY_RETENTION_CONTROL;
    row!.setting_key = RETENTION_CONTROL_KEY.toUpperCase();
    await expect(lockRetentionControl(db)).rejects.toBeInstanceOf(RetentionControlError);
  });
});
