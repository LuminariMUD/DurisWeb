import { beforeEach, describe, expect, it, jest } from '@jest/globals';

const query = jest.fn<(...args: unknown[]) => Promise<unknown>>();

jest.unstable_mockModule('../../db/connection.js', () => ({
  pool: { query },
}));
jest.unstable_mockModule('../permissionService.js', () => ({}));

const { checkCategoryAccess, getCategoryAccessForAccount } = await import('../categoryService.js');

const anonymous = {
  accountName: '',
  role: 'player',
  immortalLevel: null,
  maxLevel: 1,
  canAccessImmortalForum: false,
  canAccessGodForum: false,
  guilds: [],
  canModerate: false,
  canBan: false,
  canEditPosts: false,
  canDeletePosts: false,
  canPinThreads: false,
  canLockThreads: false,
  adminPermissions: [],
} as const;

const player = {
  ...anonymous,
  accountName: 'Cwial',
};

describe('canonical forum category access', () => {
  beforeEach(() => {
    query.mockReset()
  });

  it('does not treat anonymous users as authenticated-category members', async () => {
    query.mockResolvedValueOnce([[{
      access_type: 'authenticated',
      min_level: null,
      guild_name: null,
      is_archived: 0,
    }]]);

    await expect(checkCategoryAccess(10, '', anonymous as never, [])).resolves.toEqual({
      canView: false,
      canPost: false,
      canModerate: false,
    });
  });

  it('requires the role threshold for role-based categories', async () => {
    query.mockResolvedValueOnce([[{
      access_type: 'role_based',
      min_level: 59,
      guild_name: null,
      is_archived: 0,
    }]]);

    await expect(checkCategoryAccess(11, 'Cwial', player as never, [])).resolves.toEqual({
      canView: false,
      canPost: false,
      canModerate: false,
    });
  });

  it('does not treat membership in one guild as access to every guild category', async () => {
    query.mockResolvedValueOnce([[{
      access_type: 'guild',
      min_level: null,
      guild_name: 'OtherGuild',
      is_archived: 0,
    }]]);

    await expect(checkCategoryAccess(14, 'Cwial', {
      ...player,
      guilds: ['CwialGuild'],
    } as never, [])).resolves.toEqual({
      canView: false,
      canPost: false,
      canModerate: false,
    });
  });

  it('does not expose a custom-ACL category to anonymous callers when no rule matches', async () => {
    query
      .mockResolvedValueOnce([[{
        access_type: 'custom_acl',
        min_level: null,
        guild_name: null,
        is_archived: 0,
      }]])
      .mockResolvedValueOnce([[]]);

    await expect(checkCategoryAccess(12, '', anonymous as never, [])).resolves.toEqual({
      canView: false,
      canPost: false,
      canModerate: false,
    });
  });

  it('defaults authenticated custom-ACL callers to deny when no rule matches', async () => {
    query
      .mockResolvedValueOnce([[{
        access_type: 'custom_acl',
        min_level: null,
        guild_name: null,
        is_archived: 0,
      }]])
      .mockResolvedValueOnce([[]]);

    await expect(checkCategoryAccess(13, 'Cwial', player as never, [])).resolves.toEqual({
      canView: false,
      canPost: false,
      canModerate: false,
    });
  });
  it('loads account character IDs before evaluating character-specific ACL rules', async () => {
    query
      .mockResolvedValueOnce([[{ pid: 12345 }]])
      .mockResolvedValueOnce([[{
        access_type: 'custom_acl',
        min_level: null,
        guild_name: null,
        is_archived: 0,
      }]])
      .mockResolvedValueOnce([[{ character_pid: 12345, permission_type: 'allow', can_view: 1, can_post: 0, can_moderate: 0 }]]);

    await expect(getCategoryAccessForAccount(12, player as never)).resolves.toEqual({
      canView: true,
      canPost: false,
      canModerate: false,
    });

    expect(query).toHaveBeenNthCalledWith(1,
      'SELECT pid FROM account_characters WHERE account_name = ? AND deleted_at IS NULL',
      ['Cwial'],
    );
  });

  it('honors a matching deny rule before lower-priority allow rules', async () => {
    query
      .mockResolvedValueOnce([[{
        access_type: 'custom_acl',
        min_level: null,
        guild_name: null,
        is_archived: 0,
      }]])
      .mockResolvedValueOnce([[
        { account_name: 'Cwial', permission_type: 'deny', can_view: 0, can_post: 0, can_moderate: 0 },
        { min_immortal_level: 1, permission_type: 'allow', can_view: 1, can_post: 1, can_moderate: 1 },
      ]]);

    await expect(checkCategoryAccess(15, 'Cwial', player as never, [])).resolves.toEqual({
      canView: false,
      canPost: false,
      canModerate: false,
    });
  });
});
