import { beforeEach, describe, expect, it, jest } from '@jest/globals';

const query = jest.fn((..._args: unknown[]): Promise<any> => Promise.resolve([]));
const extractMentions = jest.fn(() => []);
const createMentions = jest.fn();
const deleteMentions = jest.fn();
const createNotification = jest.fn();
const connection = {
  query,
  beginTransaction: jest.fn<() => Promise<void>>(),
  commit: jest.fn<() => Promise<void>>(),
  rollback: jest.fn<() => Promise<void>>(),
  release: jest.fn(),
};

jest.unstable_mockModule('../../db/connection.js', () => ({
  pool: { query, getConnection: async () => connection },
}));
jest.unstable_mockModule('../builderNotificationService.js', () => ({
  extractMentions,
  createMentions,
  deleteMentions,
  createNotification,
}));

const commentRow = {
  id: 9,
  zone_id: 'zone-a',
  parent_id: null,
  proc_request_id: null,
  account_name: 'Author',
  character_name: null,
  content: 'hello',
  content_html: null,
  created_at: '2026-11-12T00:00:00.000Z',
  updated_at: '2026-11-12T00:00:00.000Z',
};

describe('zone comment HTML persistence boundary', () => {
  let zoneCommentService: typeof import('../zoneCommentService.js');

  beforeEach(async () => {
    jest.clearAllMocks();
    zoneCommentService = await import('../zoneCommentService.js');
  });

  it('sanitizes comment HTML before create reaches SQL', async () => {
    query.mockResolvedValueOnce([{ insertId: 42 }]).mockResolvedValueOnce([
      [
        {
          id: 42,
          zone_id: 'zone-a',
          parent_id: null,
          proc_request_id: null,
          account_name: 'Cwial',
          character_name: null,
          content: 'hello',
          content_html: '<p>hello</p>',
          created_at: '2026-08-28T00:00:00.000Z',
          updated_at: '2026-08-28T00:00:00.000Z',
        },
      ],
    ]);

    await zoneCommentService.createComment(
      {
        zoneId: 'zone-a',
        content: 'hello',
        contentHtml: '<p>hello</p><script>alert(1)</script>',
      },
      'Cwial',
    );

    const params = query.mock.calls[0][1] as unknown[];
    expect(params[6]).toBe('<p>hello</p>');
    expect(String(params[6])).not.toMatch(/<script|alert\(/i);
  });

  it('rejects script-only comment HTML before any query', async () => {
    await expect(
      zoneCommentService.createComment(
        {
          zoneId: 'zone-a',
          content: 'hello',
          contentHtml: '<script>alert(1)</script>',
        },
        'Cwial',
      ),
    ).rejects.toThrow('Content cannot be empty after sanitization');

    expect(query).not.toHaveBeenCalled();
  });
});

describe('zone comment zone scoping', () => {
  let zoneCommentService: typeof import('../zoneCommentService.js');

  beforeEach(async () => {
    jest.clearAllMocks();
    query.mockReset();
    zoneCommentService = await import('../zoneCommentService.js');
  });

  it('returns null or false for a comment in another zone without writing', async () => {
    query.mockResolvedValue([[]]);

    await expect(
      zoneCommentService.updateComment('zone-a', 9, { content: 'x' }, 'Author'),
    ).resolves.toBeNull();
    await expect(zoneCommentService.deleteComment('zone-a', 9, 'Author')).resolves.toBe(false);

    expect(query).toHaveBeenCalledTimes(2);
    for (const [sql, params] of query.mock.calls) {
      expect(String(sql)).toMatch(/WHERE id = \? AND zone_id = \?/);
      expect(params).toEqual([9, 'zone-a']);
    }
    expect(deleteMentions).not.toHaveBeenCalled();
  });

  it('keeps the author check for non-moderators and scopes writes for the author', async () => {
    query.mockResolvedValueOnce([[commentRow]]);
    await expect(
      zoneCommentService.updateComment('zone-a', 9, { content: 'x' }, 'Other', false),
    ).rejects.toThrow('Not authorized to edit this comment');

    query
      .mockResolvedValueOnce([[commentRow]])
      .mockResolvedValueOnce([[]])
      .mockResolvedValueOnce([{ affectedRows: 0 }])
      .mockResolvedValueOnce([{ affectedRows: 1 }]);
    await expect(zoneCommentService.deleteComment('zone-a', 9, 'Author')).resolves.toBe(true);
    const sqls = query.mock.calls.slice(2).map(([sql, params]) => [String(sql), params]);
    expect(sqls).toEqual([
      [
        'SELECT id FROM builder_zone_comments WHERE parent_id = ? AND zone_id = ? FOR UPDATE',
        [9, 'zone-a'],
      ],
      ['DELETE FROM builder_zone_comments WHERE parent_id = ? AND zone_id = ?', [9, 'zone-a']],
      ['DELETE FROM builder_zone_comments WHERE id = ? AND zone_id = ?', [9, 'zone-a']],
    ]);
    expect(connection.commit).toHaveBeenCalledTimes(1);
    expect(deleteMentions).toHaveBeenCalledWith('comment', 9, connection);
  });

  it('rejects a parent comment or proc request from another zone before inserting', async () => {
    query.mockResolvedValueOnce([[]]);
    await expect(
      zoneCommentService.createComment({ zoneId: 'zone-a', parentId: 9, content: 'hi' }, 'Author'),
    ).rejects.toThrow('Parent comment not found');
    expect(query.mock.calls[0][1]).toEqual([9, 'zone-a']);

    query.mockResolvedValueOnce([[]]);
    await expect(
      zoneCommentService.createComment(
        { zoneId: 'zone-a', procRequestId: 4, content: 'hi' },
        'Author',
      ),
    ).rejects.toThrow('Proc request not found');
    expect(String(query.mock.calls[1][0])).toMatch(/FROM builder_proc_requests/);
    expect(query.mock.calls[1][1]).toEqual([4, 'zone-a']);

    expect(query).toHaveBeenCalledTimes(2);
  });

  it('rolls back the complete discussion when deleting the parent fails after reply deletion', async () => {
    query
      .mockResolvedValueOnce([[commentRow]])
      .mockResolvedValueOnce([[{ id: 10 }]])
      .mockResolvedValueOnce([{ affectedRows: 1 }])
      .mockRejectedValueOnce(new Error('parent delete failed'));

    await expect(zoneCommentService.deleteComment('zone-a', 9, 'Author')).rejects.toThrow(
      'parent delete failed',
    );
    expect(connection.rollback).toHaveBeenCalledTimes(1);
    expect(connection.commit).not.toHaveBeenCalled();
    expect(connection.release).toHaveBeenCalledTimes(1);
    expect(deleteMentions).toHaveBeenCalledWith('comment', 10, connection);
    expect(deleteMentions).toHaveBeenCalledWith('comment', 9, connection);
  });

  it('rejects a reply whose parent belongs to another proc-request discussion', async () => {
    query.mockResolvedValueOnce([[{ ...commentRow, proc_request_id: 4 }]]);
    await expect(
      zoneCommentService.createComment(
        { zoneId: 'zone-a', parentId: 9, content: 'reply' },
        'Author',
      ),
    ).rejects.toThrow('Parent comment belongs to another discussion');
    expect(query).toHaveBeenCalledTimes(1);
    expect(connection.rollback).toHaveBeenCalledTimes(1);
    expect(connection.commit).not.toHaveBeenCalled();
  });

  it('locks the proc request then its parent through insertion in the same transaction', async () => {
    query
      .mockResolvedValueOnce([[{ id: 4, zone_id: 'zone-a' }]])
      .mockResolvedValueOnce([[{ ...commentRow, proc_request_id: 4 }]])
      .mockResolvedValueOnce([{ insertId: 10 }])
      .mockResolvedValueOnce([[{ ...commentRow, id: 10, parent_id: 9, proc_request_id: 4 }]]);

    const reply = await zoneCommentService.createComment(
      { zoneId: 'zone-a', parentId: 9, procRequestId: 4, content: 'reply' },
      'Author',
    );
    expect(reply.parentId).toBe(9);
    expect(reply.procRequestId).toBe(4);
    expect(String(query.mock.calls[0][0])).toMatch(/FROM builder_proc_requests[\s\S]*FOR UPDATE$/);
    expect(String(query.mock.calls[1][0])).toMatch(/FROM builder_zone_comments[\s\S]*FOR UPDATE$/);
    expect(connection.beginTransaction).toHaveBeenCalledTimes(1);
    expect(connection.commit).toHaveBeenCalledTimes(1);
    expect(connection.release).toHaveBeenCalledTimes(1);
  });
});
