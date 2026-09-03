/**
 * @jest-environment node
 */
import { beforeEach, describe, expect, it, jest } from '@jest/globals';

const query = jest.fn<(...args: unknown[]) => Promise<unknown>>();
const sendMudCommandAsync =
  jest.fn<
    (...args: unknown[]) => Promise<{
      success: boolean;
      error?: string;
    }>
  >();
const isMudConnected = jest.fn<() => boolean>();
const isHookEnabledSync = jest.fn<(id: string) => boolean>();

jest.unstable_mockModule('../../db/connection.js', () => ({
  pool: { query },
}));
jest.unstable_mockModule('../mudAuctionClient.js', () => ({
  sendMudCommandAsync,
  isMudConnected,
}));
jest.unstable_mockModule('../../hooks/hookGate.js', () => ({
  isHookEnabledSync,
}));

const { deleteCharacter, getUniqueClasses, getUniqueRaces, getUserList } = await import(
  '../userManagementService.js'
);

describe('userManagementService', () => {
  beforeEach(() => {
    query.mockReset();
    sendMudCommandAsync.mockReset();
    isMudConnected.mockReset().mockReturnValue(true);
    isHookEnabledSync.mockReset().mockReturnValue(true);
  });

  describe('getUserList', () => {
    it('maps joined rows and pagination without ambient player data', async () => {
      const lastLogin = new Date('2026-08-31T10:00:00.000Z');
      query.mockResolvedValueOnce([[{ total: 3 }], []]).mockResolvedValueOnce([
        [
          {
            pid: 42,
            account_name: 'account',
            character_name: 'Cwial',
            race: '&+BHuman&n',
            class: '&+WWarrior&n',
            level: 56,
            racewar: 1,
            email: 'player@example.test',
            last_ip: '203.0.113.10',
            last_login: lastLogin,
            web_last_login: null,
            is_banned: 1,
            ban_reason: 'test fixture',
            banned_at: lastLogin,
            banned_by: 'Overlord',
            is_deleted: 0,
            deleted_at: null,
          },
        ],
        [],
      ]);

      const result = await getUserList({ page: 1, limit: 2 });

      expect(result.pagination).toEqual({ page: 1, limit: 2, total: 3, totalPages: 2 });
      expect(result.data[0]).toMatchObject({
        pid: 42,
        race: '&+BHuman&n',
        class: '&+WWarrior&n',
        last_ip: '203.0.113.10',
        is_banned: true,
        is_deleted: false,
      });
    });

    it('binds filters, safe sorting, limit, and offset to both queries', async () => {
      query.mockResolvedValueOnce([[{ total: 0 }], []]).mockResolvedValueOnce([[], []]);

      await getUserList({
        search: '42',
        race: 'Human',
        class: 'Warrior',
        alignment: 2,
        ban_status: 'banned',
        page: 2,
        limit: 5,
        sort_by: 'class',
        sort_order: 'asc',
      });

      const filterParams = ['%42%', '%42%', '%42%', 42, 'Human', 'Warrior', 2];
      expect(query).toHaveBeenNthCalledWith(
        1,
        expect.stringContaining('ub.is_active = TRUE'),
        filterParams,
      );
      // The alignment filter needs the player_data alias it references, and no
      // query may depend on the legacy players_core table.
      const countQuery = String(query.mock.calls[0][0]);
      expect(countQuery).toContain('LEFT JOIN player_data pd ON ac.pid = pd.pid');
      expect(countQuery).toContain('pd.racewar = ?');
      expect(countQuery).not.toContain('players_core');
      expect(query).toHaveBeenNthCalledWith(
        2,
        expect.stringContaining('ORDER BY c.name ASC, ac.char_name'),
        [...filterParams, 5, 5],
      );
    });
  });

  it('returns unique races from the service query result', async () => {
    query.mockResolvedValueOnce([[{ race: '&+BHuman&n' }, { race: '&+GElf&n' }], []]);

    await expect(getUniqueRaces()).resolves.toEqual(['&+BHuman&n', '&+GElf&n']);
    expect(query).toHaveBeenCalledWith(expect.stringContaining('FROM races'));
  });

  it('returns unique specialized classes from the service query result', async () => {
    query.mockResolvedValueOnce([[{ class: '&+WWarrior&n' }, { class: '&+CZealot&n' }], []]);

    await expect(getUniqueClasses()).resolves.toEqual(['&+WWarrior&n', '&+CZealot&n']);
    expect(query).toHaveBeenCalledWith(expect.stringContaining('FROM classes'));
  });

  describe('deleteCharacter', () => {
    it('stops at the website gate before connection, query, or command work', async () => {
      isHookEnabledSync.mockReturnValue(false);

      await expect(deleteCharacter('account', 'Cwial', 'Overlord')).resolves.toEqual({
        success: false,
        message: 'Character deletion is disabled by the website hook gate',
      });
      expect(isHookEnabledSync).toHaveBeenCalledWith('admin_delete_character');
      expect(isMudConnected).not.toHaveBeenCalled();
      expect(query).not.toHaveBeenCalled();
      expect(sendMudCommandAsync).not.toHaveBeenCalled();
    });

    it('refuses while the authenticated MUD bridge is disconnected', async () => {
      isMudConnected.mockReturnValue(false);

      await expect(deleteCharacter('account', 'Cwial', 'Overlord')).resolves.toEqual({
        success: false,
        message: 'MUD server is not connected',
      });
      expect(query).not.toHaveBeenCalled();
    });

    it('does not send a command for a missing or deleted character', async () => {
      query.mockResolvedValueOnce([[], []]);

      await expect(deleteCharacter('account', 'Cwial', 'Overlord')).resolves.toEqual({
        success: false,
        message: 'Character not found or already deleted',
      });
      expect(sendMudCommandAsync).not.toHaveBeenCalled();
    });

    it('returns the authenticated bridge error without claiming deletion', async () => {
      query.mockResolvedValueOnce([[{ pid: 42 }], []]);
      sendMudCommandAsync.mockResolvedValueOnce({ success: false, error: 'MUD refused' });

      await expect(deleteCharacter('account', 'Cwial', 'Overlord')).resolves.toEqual({
        success: false,
        message: 'MUD refused',
      });
    });

    it('sends the exact registered command and reports acknowledged success', async () => {
      query.mockResolvedValueOnce([[{ pid: 42 }], []]);
      sendMudCommandAsync.mockResolvedValueOnce({ success: true });

      await expect(deleteCharacter('account', 'Cwial', 'Overlord')).resolves.toEqual({
        success: true,
        message: 'Character Cwial has been deleted',
      });
      expect(sendMudCommandAsync).toHaveBeenCalledWith('admin_delete_character', {
        account: 'account',
        name: 'Cwial',
        pid: 42,
        deletedBy: 'Overlord',
      });
    });
  });
});
