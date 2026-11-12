import { beforeEach, describe, expect, it, jest } from '@jest/globals';

const query = jest.fn((..._args: unknown[]): Promise<any> => Promise.resolve([]));
const extractMentions = jest.fn(() => []);
const createMentions = jest.fn();
const deleteMentions = jest.fn();
const createNotification = jest.fn();

jest.unstable_mockModule('../../db/connection.js', () => ({
  pool: { query },
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

  it('deletes by ID and zone, and keeps mentions when nothing matched', async () => {
    query.mockResolvedValueOnce([{ affectedRows: 0 }]);

    await expect(procRequestService.deleteProcRequest('zone-a', 7)).resolves.toBe(false);
    expect(query.mock.calls[0]).toEqual([
      'DELETE FROM builder_proc_requests WHERE id = ? AND zone_id = ?',
      [7, 'zone-a'],
    ]);
    expect(deleteMentions).not.toHaveBeenCalled();

    query.mockResolvedValueOnce([{ affectedRows: 1 }]);
    await expect(procRequestService.deleteProcRequest('zone-a', 7)).resolves.toBe(true);
    expect(deleteMentions).toHaveBeenCalledWith('proc_request', 7);
  });
});
