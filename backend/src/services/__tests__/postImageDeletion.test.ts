import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { inspect } from 'node:util';
import type { DeleteObjectCommand, DeleteObjectCommandOutput } from '@aws-sdk/client-s3';

interface Image {
  id: number;
  account_name: string;
  image_key: string;
  image_url: string;
  is_orphan: number;
  post_id: number | null;
  thread_id: number | null;
  created_epoch: number;
  removal_requested_at_epoch: number | null;
}
const images = new Map<number, Image>();
let enabled = true;
let failDelete = false;
const warn = jest.fn();
const send =
  jest.fn<
    (
      command: DeleteObjectCommand,
      options?: { abortSignal?: AbortSignal },
    ) => Promise<DeleteObjectCommandOutput>
  >();
const query = jest.fn<(...args: unknown[]) => Promise<unknown>>();
const getConnection = jest.fn(async () => {
  let snapshot: Map<number, Image> | undefined;
  return {
    query,
    execute: query,
    release: jest.fn(),
    destroy: jest.fn(),
    beginTransaction: async () => {
      snapshot = new Map([...images].map(([id, row]) => [id, { ...row }]));
    },
    commit: async () => {
      snapshot = undefined;
    },
    rollback: async () => {
      if (snapshot) {
        images.clear();
        for (const [id, row] of snapshot) images.set(id, row);
        snapshot = undefined;
      }
    },
  };
});
jest.unstable_mockModule('../../db/connection.js', () => ({
  pool: { query, execute: query, getConnection },
}));
jest.unstable_mockModule('../r2Client.js', () => ({
  isR2Enabled: () => enabled,
  requireR2Storage: () => ({
    configuration: { bucketName: 'synthetic-bucket', publicUrl: 'https://assets.test.invalid' },
    client: { send },
  }),
}));
jest.unstable_mockModule('../../utils/logger.js', () => ({
  default: { warn, info: jest.fn(), error: jest.fn() },
}));
const service = await import('../postImageService.js');

function seed(id = 1): Image {
  const row = {
    id,
    account_name: 'ImageFixture',
    image_key: `duris/forum-images/imagefixture/${id}.webp`,
    image_url: `https://assets.test.invalid/duris/forum-images/imagefixture/${id}.webp`,
    is_orphan: 1,
    post_id: null,
    thread_id: null,
    created_epoch: Math.floor(Date.now() / 1000) - 7200,
    removal_requested_at_epoch: null,
  };
  images.set(id, row);
  return row;
}
beforeEach(() => {
  enabled = true;
  failDelete = false;
  images.clear();
  warn.mockClear();
  getConnection.mockClear();
  send.mockReset();
  query.mockReset();
  send.mockResolvedValue({ $metadata: { httpStatusCode: 204 } });
  query.mockImplementation(async (...args) => {
    const first = args[0];
    const sql =
      typeof first === 'string'
        ? first
        : first && typeof first === 'object' && 'sql' in first
          ? String(first.sql)
          : '';
    const values = Array.isArray(args[1]) ? args[1] : [];
    if (sql.includes('information_schema.TABLES')) return [[{ ENGINE: 'InnoDB' }], []];
    if (sql.includes('GET_LOCK')) return [[{ acquired: 1 }], []];
    if (sql.includes('RELEASE_LOCK')) return [[{ released: 1 }], []];
    if (sql.includes('AS cutoff')) return [[{ cutoff: Math.floor(Date.now() / 1000) - 3600 }], []];
    if (sql.startsWith('SELECT COUNT'))
      return [
        [
          {
            count: [...images.values()].filter(
              (row) => row.is_orphan === 1 || row.removal_requested_at_epoch !== null,
            ).length,
          },
        ],
        [],
      ];
    if (sql.startsWith('SELECT')) {
      if (sql.includes('WHERE id = ?'))
        return [[images.get(Number(values[0]))].filter(Boolean), []];
      let rows = [...images.values()].filter(
        (row) => row.is_orphan === 1 || row.removal_requested_at_epoch !== null,
      );
      if (sql.includes('id > ?')) rows = rows.filter((row) => row.id > Number(values[0]));
      if (sql.includes('id <= ?')) rows = rows.filter((row) => row.id <= Number(values[0]));
      if (sql.includes('account_name = ?'))
        rows = rows.filter((row) => row.account_name === values[0]);
      if (sql.includes('LIMIT 100')) rows = rows.slice(0, 100);
      if (sql.includes('LIMIT ?')) rows = rows.slice(0, Number(values.at(-1)));
      return [rows, []];
    }
    if (sql.startsWith('UPDATE forum_post_images SET removal_requested')) {
      const row = images.get(Number(values[0]));
      if (row) {
        row.removal_requested_at_epoch ??= Math.floor(Date.now() / 1000);
        row.is_orphan = 0;
      }
      return [{ affectedRows: Number(!!row) }, []];
    }
    if (sql.startsWith('DELETE')) {
      if (failDelete) throw new Error('private-database-bindings-sentinel');
      const removed = images.delete(Number(values[0]));
      return [{ affectedRows: Number(removed) }, []];
    }
    return [[], []];
  });
});

describe('post image removal recovery', () => {
  it('reads actual image sources rather than attribute-like text in captions', () => {
    const image = seed();
    expect(
      service.extractForumImageSources(
        `<img src="${image.image_url}" alt="caption src='https://decoy.test.invalid/image'">`,
      ),
    ).toEqual([image.image_url]);
  });
  it('keeps its retry reference when object storage is disabled', async () => {
    seed();
    enabled = false;
    await expect(service.deletePostImage(1, 'ImageFixture')).rejects.toMatchObject({
      reason: 'storage_disabled',
    });
    expect(images.has(1)).toBe(true);
    expect(send).not.toHaveBeenCalled();
  });
  it('does no disabled cleanup, instead of silently dropping retained objects', async () => {
    seed();
    enabled = false;
    expect(await service.cleanupOrphanImages()).toBe(0);
    expect(images.has(1)).toBe(true);
    expect(send).not.toHaveBeenCalled();
  });
  it('retains the row and excludes untrusted provider errors from diagnostics', async () => {
    const image = seed();
    send.mockRejectedValue(new Error('private-provider-key-token-sentinel'));
    await expect(service.deletePostImage(1, 'ImageFixture')).rejects.toMatchObject({
      reason: 'provider_failure',
    });
    expect(images.has(1)).toBe(true);
    expect(images.get(1)).toMatchObject({
      is_orphan: 0,
      removal_requested_at_epoch: expect.any(Number),
    });
    await expect(
      service.linkImagesToPost(9, [image.image_url + '?size=2#preview'], 'ImageFixture'),
    ).rejects.toBeInstanceOf(service.PostImageAttachmentError);
    expect(inspect(warn.mock.calls)).not.toContain('private-provider-key-token-sentinel');
  });
  it.each([undefined, 200, 202, 404, 500])(
    'requires the documented deletion acknowledgement, not status %s',
    async (status) => {
      seed();
      send.mockResolvedValue({ $metadata: { httpStatusCode: status } });
      await expect(service.deletePostImage(1, 'ImageFixture')).rejects.toMatchObject({
        reason: 'provider_unconfirmed',
      });
      expect(images.has(1)).toBe(true);
    },
  );
  it('keeps versioned/delete-marker responses pending instead of asserting permanent removal', async () => {
    seed();
    send.mockResolvedValue({
      $metadata: { httpStatusCode: 204 },
      DeleteMarker: true,
      VersionId: 'synthetic-version',
    });
    await expect(service.deletePostImage(1, 'ImageFixture')).rejects.toMatchObject({
      reason: 'provider_unconfirmed',
    });
    expect(images.has(1)).toBe(true);
  });
  it('can retry after a confirmed provider deletion and failed metadata deletion', async () => {
    seed();
    failDelete = true;
    await expect(service.deletePostImage(1, 'ImageFixture')).rejects.toMatchObject({
      reason: 'database_unavailable',
    });
    expect(images.has(1)).toBe(true);
    failDelete = false;
    expect(await service.deletePostImage(1, 'ImageFixture')).toBe(true);
    expect(images.has(1)).toBe(false);
    expect(send).toHaveBeenCalledTimes(2);
    expect(inspect(warn.mock.calls)).not.toContain('private-database-bindings-sentinel');
  });
  it('does not send deletion requests for missing, foreign or attached images', async () => {
    const row = seed();
    expect(await service.deletePostImage(9, 'ImageFixture')).toBe(false);
    expect(await service.deletePostImage(1, 'OtherAccount')).toBe(false);
    row.is_orphan = 0;
    expect(await service.deletePostImage(1, 'ImageFixture')).toBe(false);
    row.is_orphan = 1;
    row.post_id = 9;
    expect(await service.deletePostImage(1, 'ImageFixture')).toBe(false);
    expect(send).not.toHaveBeenCalled();
    expect(images.has(1)).toBe(true);
  });
  it('counts only confirmed cleanup and continues past a failed object', async () => {
    const first = seed(1);
    seed(2);
    send.mockImplementation(async (command) => {
      if (command.input.Key === first.image_key) throw new Error('private-provider-sentinel');
      return { $metadata: { httpStatusCode: 204 } };
    });
    expect(await service.cleanupOrphanImages()).toBe(1);
    expect(images.has(1)).toBe(true);
    expect(images.has(2)).toBe(false);
  });
});
