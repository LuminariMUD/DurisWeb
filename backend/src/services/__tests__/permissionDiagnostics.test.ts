import { expect, it, jest } from '@jest/globals';
import { stubModule } from '../../test/stubModule.js';

const query = jest.fn<(...args: unknown[]) => Promise<unknown>>();
const stub = (specifier: string, overrides?: Record<string, unknown>) =>
  jest.unstable_mockModule(specifier, stubModule(new URL(specifier, import.meta.url), overrides));
stub('../../db/connection.js', { pool: { query }, mudPool: { query } });
stub('../forumSettingsService.js');
stub('../adminPermissionService.js');
const { getCharacterInfo } = await import('../permissionService.js');
const { default: logger } = await import('../../utils/logger.js');

it('keeps SQL diagnostics out of permission refresh logs while failing closed', async () => {
  const error = Object.assign(new Error('SELECT private /account/path 192.0.2.1'), {
    code: 'ER_PARSE_ERROR',
  });
  query.mockRejectedValueOnce(error);
  const log = jest.spyOn(logger, 'error').mockImplementation(() => logger);
  try {
    await expect(getCharacterInfo(['Fixture'])).rejects.toBe(error);
    expect(log.mock.calls[0]).toEqual([
      '[Permissions] Error fetching character info:',
      { code: 'ER_PARSE_ERROR' },
    ]);
  } finally {
    log.mockRestore();
  }
});
