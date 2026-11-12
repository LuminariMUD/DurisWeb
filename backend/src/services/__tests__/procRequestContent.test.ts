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

describe('proc request HTML persistence boundary', () => {
  let procRequestService: typeof import('../procRequestService.js');

  beforeEach(async () => {
    jest.clearAllMocks();
    procRequestService = await import('../procRequestService.js');
  });

  it('sanitizes description HTML before create reaches SQL', async () => {
    query.mockResolvedValueOnce([{ insertId: 42 }]).mockResolvedValueOnce([
      [
        {
          id: 42,
          zone_id: 'zone-a',
          entity_type: 'room',
          vnum: 100,
          title: 'Add room behavior',
          description: 'hello',
          description_html: '<p>hello</p>',
          status: 'requested',
          assigned_to: null,
          requested_by: 'Cwial',
          requested_at: '2026-08-28T00:00:00.000Z',
          updated_at: '2026-08-28T00:00:00.000Z',
        },
      ],
    ]);

    await procRequestService.createProcRequest(
      {
        zoneId: 'zone-a',
        entityType: 'room',
        vnum: 100,
        title: 'Add room behavior',
        description: 'hello',
        descriptionHtml: '<p>hello</p><script>alert(1)</script>',
      },
      'Cwial',
    );

    const params = query.mock.calls[0][1] as unknown[];
    expect(params[5]).toBe('<p>hello</p>');
    expect(String(params[5])).not.toMatch(/<script|alert\(/i);
  });

  it('rejects script-only description HTML before any query', async () => {
    await expect(
      procRequestService.createProcRequest(
        {
          zoneId: 'zone-a',
          entityType: 'room',
          vnum: 100,
          title: 'Rejected',
          description: 'hello',
          descriptionHtml: '<script>alert(1)</script>',
        },
        'Cwial',
      ),
    ).rejects.toThrow('Content cannot be empty after sanitization');

    expect(query).not.toHaveBeenCalled();
  });
});

describe('proc request zone scoping', () => {
  let procRequestService: typeof import('../procRequestService.js');

  beforeEach(async () => {
    jest.clearAllMocks();
    query.mockReset();
    procRequestService = await import('../procRequestService.js');
  });

  it('reads by ID and zone, and returns null for another zone without writing or notifying', async () => {
    query.mockResolvedValueOnce([[]]);

    const updated = await procRequestService.updateProcRequestStatus(
      'zone-a',
      7,
      'completed',
      'Someone',
      'Cwial',
      'Zone A',
    );

    expect(updated).toBeNull();
    expect(query).toHaveBeenCalledTimes(1);
    expect(String(query.mock.calls[0][0])).toMatch(/WHERE id = \? AND zone_id = \?/);
    expect(query.mock.calls[0][1]).toEqual([7, 'zone-a']);
    expect(createNotification).not.toHaveBeenCalled();
  });

  it('scopes the UPDATE to the zone for a same-zone request', async () => {
    const row = {
      id: 7,
      zone_id: 'zone-a',
      entity_type: 'room',
      vnum: 100,
      title: 'T',
      description: null,
      description_html: null,
      status: 'requested',
      assigned_to: null,
      requested_by: 'Cwial',
      requested_at: '2026-11-12T00:00:00.000Z',
      updated_at: '2026-11-12T00:00:00.000Z',
    };
    query
      .mockResolvedValueOnce([[row]])
      .mockResolvedValueOnce([{ affectedRows: 1 }])
      .mockResolvedValueOnce([[{ ...row, title: 'New' }]]);

    const updated = await procRequestService.updateProcRequest('zone-a', 7, { title: 'New' });

    expect(updated?.title).toBe('New');
    expect(String(query.mock.calls[1][0])).toMatch(/WHERE id = \? AND zone_id = \?$/);
    expect(query.mock.calls[1][1]).toEqual(['New', 7, 'zone-a']);
    expect(query.mock.calls[2][1]).toEqual([7, 'zone-a']);
  });

  it('does not notify when a concurrent deletion wins before the UPDATE', async () => {
    query
      .mockResolvedValueOnce([
        [
          {
            id: 7,
            zone_id: 'zone-a',
            title: 'T',
            status: 'requested',
            assigned_to: null,
            requested_by: 'Requester',
          },
        ],
      ])
      .mockResolvedValueOnce([{ affectedRows: 0 }]);

    await expect(
      procRequestService.updateProcRequestStatus(
        'zone-a',
        7,
        'completed',
        'Assignee',
        'Editor',
        'Zone A',
      ),
    ).resolves.toBeNull();
    expect(query).toHaveBeenCalledTimes(2);
    expect(createNotification).not.toHaveBeenCalled();
  });

  it('deletes by ID and zone, and keeps mentions when nothing matched', async () => {
    query.mockResolvedValueOnce([{ affectedRows: 0 }]);

    await expect(procRequestService.deleteProcRequest('zone-a', 7)).resolves.toBe(false);
    expect(query.mock.calls[0]).toEqual([
      'DELETE FROM builder_proc_requests WHERE id = ? AND zone_id = ?',
      [7, 'zone-a'],
    ]);
    expect(deleteMentions).not.toHaveBeenCalled();
    expect(connection.rollback).toHaveBeenCalledTimes(1);
    expect(connection.commit).not.toHaveBeenCalled();
    expect(connection.release).toHaveBeenCalledTimes(1);

    query.mockResolvedValueOnce([{ affectedRows: 1 }]).mockResolvedValueOnce([{ affectedRows: 2 }]);
    await expect(procRequestService.deleteProcRequest('zone-a', 7)).resolves.toBe(true);
    expect(String(query.mock.calls[2][0])).toMatch(
      /UPDATE builder_zone_comments SET proc_request_id = NULL\s+WHERE proc_request_id = \? AND zone_id = \?/,
    );
    expect(query.mock.calls[2][1]).toEqual([7, 'zone-a']);
    expect(deleteMentions).toHaveBeenCalledWith('proc_request', 7, connection);
    expect(connection.commit).toHaveBeenCalledTimes(1);
    expect(connection.release).toHaveBeenCalledTimes(2);
  });

  it('rolls deletion back and releases the connection when mention cleanup fails', async () => {
    query.mockResolvedValueOnce([{ affectedRows: 1 }]);
    deleteMentions.mockImplementationOnce(() => Promise.reject(new Error('cleanup failed')));

    await expect(procRequestService.deleteProcRequest('zone-a', 7)).rejects.toThrow(
      'cleanup failed',
    );
    expect(connection.rollback).toHaveBeenCalledTimes(1);
    expect(connection.commit).not.toHaveBeenCalled();
    expect(connection.release).toHaveBeenCalledTimes(1);
  });

  it('rolls deletion back before mention cleanup if preserving comments fails', async () => {
    query
      .mockResolvedValueOnce([{ affectedRows: 1 }])
      .mockRejectedValueOnce(new Error('comment preservation failed'));
    await expect(procRequestService.deleteProcRequest('zone-a', 7)).rejects.toThrow(
      'comment preservation failed',
    );
    expect(deleteMentions).not.toHaveBeenCalled();
    expect(connection.rollback).toHaveBeenCalledTimes(1);
    expect(connection.commit).not.toHaveBeenCalled();
    expect(connection.release).toHaveBeenCalledTimes(1);
  });
});
