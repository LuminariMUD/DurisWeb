import { beforeEach, describe, expect, it, jest } from '@jest/globals';

const query = jest.fn<(...args: unknown[]) => Promise<unknown>>();

jest.unstable_mockModule('../../db/connection.js', () => ({
  pool: { query },
}));

const { revokeAllWebSessions } = await import('../sessionService.js');

describe('web session lifecycle', () => {
  beforeEach(() => {
    query.mockReset()
  });

  it('revokes every web session for an account after a password change', async () => {
    query.mockResolvedValueOnce([{ affectedRows: 3 }]);

    await expect(revokeAllWebSessions('Cwial')).resolves.toBe(3);
    expect(query).toHaveBeenCalledWith(
      'DELETE FROM web_sessions WHERE LOWER(account_name) = LOWER(?)',
      ['Cwial'],
    );
  });
});
