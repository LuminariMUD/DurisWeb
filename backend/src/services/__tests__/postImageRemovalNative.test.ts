import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from '@jest/globals';
import mysql, {
  type Pool,
  type Connection,
  type RowDataPacket,
  type ResultSetHeader,
} from 'mysql2/promise';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import type { DeleteObjectCommand, DeleteObjectCommandOutput } from '@aws-sdk/client-s3';
import { runFixtureWebMigrations } from '../../test/webMigrationFixture.js';
import { POST_IMAGE_REMOVAL_MIGRATION } from '../../db/postImageRemovalSchema.js';
import express, { type RequestHandler } from 'express';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { inspect } from 'node:util';
import { getBackendConfiguration } from '../../config/environment.js';

const port = Number(process.env.TEST_IMAGE_DB_PORT);
const environment = getBackendConfiguration();
const database = environment.database.database;
if (
  process.env.TEST_IMAGE_DB_PORT &&
  (![23436, 23437].includes(port) ||
    environment.database.host !== '127.0.0.1' ||
    environment.database.port !== port ||
    database !== 'durisweb_qualification_image_suite')
)
  throw new Error(
    'Image native tests require the dedicated disposable fixture and matching DB_PORT',
  );
let enabled = true;
const send =
  jest.fn<
    (
      command: DeleteObjectCommand,
      options?: { abortSignal?: AbortSignal },
    ) => Promise<DeleteObjectCommandOutput>
  >();
jest.unstable_mockModule('../r2Client.js', () => ({
  isR2Enabled: () => enabled,
  requireR2Storage: () => ({
    configuration: {
      bucketName: 'synthetic-bucket',
      publicUrl: 'https://assets.image-qualification.invalid',
    },
    client: { send },
  }),
}));
const actor = 'Image_' + crypto.randomBytes(6).toString('hex');
const authenticate: RequestHandler = (req, res, next) => {
  if (req.get('X-Image-Fixture') !== 'authenticated') {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }
  req.user = {
    accountName: actor,
    email: '',
    sessionId: 'synthetic-image-session',
    adminPermissions: new Set(),
    permissions: {
      accountName: actor,
      role: 'player',
      immortalLevel: null,
      maxLevel: 20,
      guilds: [],
      canAccessImmortalForum: false,
      canAccessGodForum: false,
      canModerate: false,
      canBan: false,
      canEditPosts: false,
      canDeletePosts: false,
      canPinThreads: false,
      canLockThreads: false,
      adminPermissions: [],
    },
  };
  next();
};
jest.unstable_mockModule('../../middleware/auth.js', () => ({
  requireAuth: authenticate,
  optionalAuth: authenticate,
  requireModerator: authenticate,
  requirePermission: () => authenticate,
}));
jest.unstable_mockModule('../../index.js', () => ({ broadcastForumPost: jest.fn() }));
const imageIds = new Set<number>(),
  threadIds = new Set<number>(),
  postIds = new Set<number>();
let pool: Pool | undefined, observer: Connection | undefined;
let images: typeof import('../postImageService.js');
let forum: typeof import('../forumService.js');
let categoryId = 0;
let app: express.Express;
function deferred<T>() {
  let resolve!: (value: T) => void;
  return {
    promise: new Promise<T>((r) => {
      resolve = r;
    }),
    resolve: (value: T) => resolve(value),
  };
}
async function seed(age = 7200) {
  const key = `duris/forum-images/${actor.toLowerCase()}/${crypto.randomBytes(8).toString('hex')}.webp`;
  const url = 'https://assets.image-qualification.invalid/' + key;
  const [result] = await pool!.execute<ResultSetHeader>(
    `INSERT INTO forum_post_images
    (account_name,image_key,image_url,mime_type,file_size,is_orphan,created_at) VALUES (?,?,?,'image/webp',1,TRUE,FROM_UNIXTIME(UNIX_TIMESTAMP()-?))`,
    [actor, key, url, age],
  );
  imageIds.add(result.insertId);
  return { id: result.insertId, key, url };
}
async function row(id: number) {
  const [rows] = await pool!.execute<RowDataPacket[]>(
    'SELECT * FROM forum_post_images WHERE id=?',
    [id],
  );
  return rows[0];
}
function html(url: string) {
  return `<p>Synthetic image</p><img src="${url}">`;
}
async function thread(content = '<p>Synthetic thread</p>') {
  const id = await forum.createThread(categoryId, actor, null, 'Synthetic image thread', content);
  threadIds.add(id);
  return id;
}
async function post(parent: number, content: string) {
  const id = await forum.createPost(parent, actor, null, content);
  postIds.add(id);
  return id;
}
function intercept(
  interceptor: (
    sql: string,
    run: () => Promise<unknown>,
    thread: number,
    method: string,
  ) => Promise<unknown>,
) {
  const checkout = pool!.getConnection.bind(pool);
  const createConnection = mysql.createConnection.bind(mysql);
  function wrap<T extends Connection>(connection: T): T {
    return new Proxy(connection, {
      get(target, key) {
        const value: unknown = Reflect.get(target, key, target);
        if (['query', 'execute', 'commit'].includes(String(key)) && typeof value === 'function')
          return (...args: unknown[]) => {
            const first = args[0];
            const sql =
              typeof first === 'string'
                ? first
                : first && typeof first === 'object' && 'sql' in first
                  ? String(first.sql)
                  : '';
            return interceptor(
              sql,
              async () => Reflect.apply(value, target, args),
              target.threadId,
              String(key),
            );
          };
        return typeof value === 'function' ? value.bind(target) : value;
      },
    });
  }
  jest.spyOn(pool!, 'getConnection').mockImplementation(async () => wrap(await checkout()));
  jest
    .spyOn(mysql, 'createConnection')
    .mockImplementation(async (options) => wrap(await createConnection(options)));
}
async function assertLeaseFree(id: number) {
  const [rows] = await observer!.execute<RowDataPacket[]>(
    "SELECT IS_USED_LOCK(SHA2(CONCAT('post_image_removal:',DATABASE(),':',?),256)) AS holder",
    [id],
  );
  expect(rows[0].holder).toBeNull();
}
async function waitForBlockedStatement(thread: number) {
  for (let attempt = 0; attempt < 200; attempt++) {
    const [rows] =
      port === 23436
        ? await observer!.execute<RowDataPacket[]>(
            'SELECT COUNT(*) AS count FROM performance_schema.data_lock_waits w JOIN performance_schema.threads t ON t.THREAD_ID=w.REQUESTING_THREAD_ID WHERE t.PROCESSLIST_ID=?',
            [thread],
          )
        : await observer!.execute<RowDataPacket[]>(
            "SELECT COUNT(*) AS count FROM information_schema.PROCESSLIST WHERE ID=? AND COMMAND IN ('Execute','Query') AND TIME_MS>=100 AND INFO LIKE '%FROM forum_post_images%FOR UPDATE'",
            [thread],
          );
    if (Number(rows[0].count) > 0) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error('Expected the identified image claimant to remain blocked');
}

(port ? describe : describe.skip)(
  'durable image removal on a full disposable owner/schema fixture',
  () => {
    beforeAll(async () => {
      pool = (await import('../../db/connection.js')).pool;
      images = await import('../postImageService.js');
      forum = await import('../forumService.js');
      observer = await mysql.createConnection({ host: '127.0.0.1', port, user: 'root', database });
      const [categories] = await pool.execute<RowDataPacket[]>(
        'SELECT id FROM forum_categories ORDER BY id LIMIT 1',
      );
      categoryId = Number(categories[0].id);
      app = express();
      app.use(
        express.json(),
        cookieParser(),
        (await import('../../middleware/csrf.js')).verifyCsrfToken,
      );
      app.use('/api/forum', (await import('../../routes/forum.js')).default);
    });
    beforeEach(() => {
      enabled = true;
      send.mockReset();
      send.mockResolvedValue({ $metadata: { httpStatusCode: 204 } });
    });
    afterEach(async () => {
      jest.restoreAllMocks();
      // Drain already-scheduled, unchanged notification reads before removing fixtures.
      await new Promise((resolve) => setImmediate(resolve));
      if (pool) {
        if (imageIds.size)
          await pool.query('DELETE FROM forum_post_images WHERE id IN (?)', [[...imageIds]]);
        if (postIds.size)
          await pool.query('DELETE FROM forum_posts WHERE id IN (?)', [[...postIds]]);
        if (threadIds.size)
          await pool.query('DELETE FROM forum_threads WHERE id IN (?)', [[...threadIds]]);
      }
      imageIds.clear();
      threadIds.clear();
      postIds.clear();
    });
    afterAll(async () => {
      await observer?.end();
      if (pool) {
        (await import('../../db/redis.js')).default.disconnect();
        await pool.end();
      }
    });

    it('persists intent through disabled/failing storage, rejects reuse and retries the same reference', async () => {
      const image = await seed();
      enabled = false;
      await expect(images.deletePostImage(image.id, actor)).rejects.toMatchObject({
        reason: 'storage_disabled',
      });
      expect(await row(image.id)).toMatchObject({ is_orphan: 0 });
      expect(Number((await row(image.id)).removal_requested_at_epoch)).toBeGreaterThan(0);
      expect(send).not.toHaveBeenCalled();
      await assertLeaseFree(image.id);
      const parent = await thread();
      await expect(
        images.linkImagesToThread(parent, [image.url + '?size=2#preview'], actor),
      ).rejects.toBeInstanceOf(images.PostImageAttachmentError);
      const script = `import {linkImagesToThread,PostImageAttachmentError} from './src/services/postImageService.ts';
      import {pool} from './src/db/connection.ts';
      try{try{await linkImagesToThread(Number(process.argv[1]),[process.argv[2]],process.argv[3]);throw new Error('Pending image unexpectedly attached');}
      catch(error){if(!(error instanceof PostImageAttachmentError))throw error;console.log('pending-image-removal-rejected');}}finally{await pool.end();}`;
      const child = spawnSync(
        process.execPath,
        [
          '--import',
          'tsx',
          '--input-type=module',
          '--eval',
          script,
          String(parent),
          image.url,
          actor,
        ],
        { cwd: process.cwd(), env: process.env, encoding: 'utf8', timeout: 15000 },
      );
      expect(child.status).toBe(0);
      expect(child.stdout).toContain('pending-image-removal-rejected');
      enabled = true;
      send.mockRejectedValueOnce(new Error('Synthetic provider outage'));
      await expect(images.deletePostImage(image.id, actor)).rejects.toMatchObject({
        reason: 'provider_failure',
      });
      expect(await row(image.id)).toBeDefined();
      expect(await images.deletePostImage(image.id, actor)).toBe(true);
      expect(await row(image.id)).toBeUndefined();
      await assertLeaseFree(image.id);
    });

    it('retains intent on unconfirmed/versioned acknowledgements and on metadata failure after origin deletion', async () => {
      const image = await seed();
      send.mockResolvedValueOnce({ $metadata: { httpStatusCode: 200 } });
      await expect(images.deletePostImage(image.id, actor)).rejects.toMatchObject({
        reason: 'provider_unconfirmed',
      });
      send.mockResolvedValueOnce({
        $metadata: { httpStatusCode: 204 },
        DeleteMarker: true,
        VersionId: 'synthetic-version',
      });
      await expect(images.deletePostImage(image.id, actor)).rejects.toMatchObject({
        reason: 'provider_unconfirmed',
      });
      intercept(async (sql, run) => {
        if (sql.startsWith('DELETE FROM forum_post_images'))
          throw new Error('Synthetic SQL deletion failure');
        return run();
      });
      await expect(images.deletePostImage(image.id, actor)).rejects.toMatchObject({
        reason: 'database_unavailable',
      });
      expect((await row(image.id)).removal_requested_at_epoch).not.toBeNull();
      jest.restoreAllMocks();
      expect(await images.deletePostImage(image.id, actor)).toBe(true);
      await assertLeaseFree(image.id);
    });

    it('atomically claims images for new threads/posts and edits, including while storage is disabled', async () => {
      const first = await seed();
      const parent = await thread(html(first.url));
      expect(await row(first.id)).toMatchObject({
        thread_id: parent,
        is_orphan: 0,
        removal_requested_at_epoch: null,
      });
      const second = await seed();
      const postId = await post(parent, html(second.url + '?cache=1#view'));
      expect(await row(second.id)).toMatchObject({ post_id: postId, is_orphan: 0 });
      enabled = false;
      const third = await seed();
      expect(await forum.updateThread(parent, 'Edited', html(third.url), actor)).toBe(true);
      const fourth = await seed();
      expect(await forum.updatePost(postId, html(fourth.url), actor)).toBe(true);
      expect(await row(third.id)).toMatchObject({ thread_id: parent, is_orphan: 0 });
      expect(await row(fourth.id)).toMatchObject({ post_id: postId, is_orphan: 0 });
      enabled = true;
      expect(await images.cleanupOrphanImages()).toBe(0);
      expect(send).not.toHaveBeenCalled();
      await expect(images.deletePostImage(first.id, actor)).resolves.toBe(false);
    });

    it('rolls back all four publication paths when managed references are pending removal', async () => {
      const parent = await thread();
      const postId = await post(parent, '<p>Original post</p>');
      const image = await seed();
      enabled = false;
      await expect(images.deletePostImage(image.id, actor)).rejects.toMatchObject({
        reason: 'storage_disabled',
      });
      const [before] = await pool!.execute<RowDataPacket[]>(
        'SELECT content,reply_count FROM forum_threads WHERE id=?',
        [parent],
      );
      await expect(
        forum.createThread(categoryId, actor, null, 'Must not publish', html(image.url)),
      ).rejects.toBeInstanceOf(images.PostImageAttachmentError);
      await expect(forum.createPost(parent, actor, null, html(image.url))).rejects.toBeInstanceOf(
        images.PostImageAttachmentError,
      );
      await expect(
        forum.updateThread(parent, 'Must not update', html(image.url), actor),
      ).rejects.toBeInstanceOf(images.PostImageAttachmentError);
      await expect(forum.updatePost(postId, html(image.url), actor)).rejects.toBeInstanceOf(
        images.PostImageAttachmentError,
      );
      const [after] = await pool!.execute<RowDataPacket[]>(
        'SELECT content,reply_count FROM forum_threads WHERE id=?',
        [parent],
      );
      expect(after).toEqual(before);
      const [posts] = await pool!.execute<RowDataPacket[]>(
        'SELECT content FROM forum_posts WHERE thread_id=?',
        [parent],
      );
      expect(posts).toHaveLength(1);
      expect(posts[0].content).toBe('<p>Original post</p>');
      const [threads] = await pool!.execute<RowDataPacket[]>(
        'SELECT id FROM forum_threads WHERE author_account_name=?',
        [actor],
      );
      expect(threads).toHaveLength(1);
      expect(send).not.toHaveBeenCalled();
    });

    it('makes durable pending state visible to publishers while the provider response is still in flight', async () => {
      const parent = await thread(),
        image = await seed(),
        started = deferred<void>(),
        response = deferred<DeleteObjectCommandOutput>();
      send.mockImplementationOnce(async () => {
        started.resolve();
        return response.promise;
      });
      const removed = images.deletePostImage(image.id, actor);
      await started.promise;
      try {
        await expect(forum.createPost(parent, actor, null, html(image.url))).rejects.toBeInstanceOf(
          images.PostImageAttachmentError,
        );
      } finally {
        response.resolve({ $metadata: { httpStatusCode: 204 } });
      }
      expect(await removed).toBe(true);
      expect(await row(image.id)).toBeUndefined();
    });

    it('preserves an attachment whose publication transaction owns the row before removal', async () => {
      const parent = await thread(),
        image = await seed(),
        locked = deferred<void>(),
        release = deferred<void>(),
        started = deferred<void>();
      let paused = false,
        waiting = 0;
      intercept(async (sql, run, thread, method) => {
        if (method === 'commit' && !paused) {
          paused = true;
          locked.resolve();
          await release.promise;
          return run();
        }
        if (paused && sql.includes('FROM forum_post_images WHERE id = ? FOR UPDATE')) {
          waiting = thread;
          started.resolve();
        }
        return run();
      });
      const created = post(parent, html(image.url));
      await locked.promise;
      const removal = images.deletePostImage(image.id, actor);
      await started.promise;
      let failure: unknown;
      try {
        await waitForBlockedStatement(waiting);
      } catch (error) {
        failure = error;
      } finally {
        release.resolve();
      }
      const postId = await created;
      expect(await removal).toBe(false);
      expect(failure).toBeUndefined();
      expect(await row(image.id)).toMatchObject({
        post_id: postId,
        is_orphan: 0,
        removal_requested_at_epoch: null,
      });
      expect(send).not.toHaveBeenCalled();
    });

    it('uses a connection lease for duplicate removals and releases it after failure', async () => {
      const image = await seed(),
        started = deferred<void>(),
        response = deferred<DeleteObjectCommandOutput>();
      send.mockImplementationOnce(async () => {
        started.resolve();
        return response.promise;
      });
      const first = images.deletePostImage(image.id, actor);
      await started.promise;
      try {
        await expect(images.deletePostImage(image.id, actor)).rejects.toMatchObject({
          reason: 'operation_in_progress',
        });
        expect(send).toHaveBeenCalledTimes(1);
      } finally {
        response.resolve({ $metadata: { httpStatusCode: 204 } });
      }
      expect(await first).toBe(true);
      await assertLeaseFree(image.id);
    });

    it('keeps provider waits outside the application pool and admits at most two removals', async () => {
      const selected = [await seed(), await seed(), await seed()];
      const borrowed = await Promise.all(Array.from({ length: 10 }, () => pool!.getConnection()));
      const entered = deferred<void>();
      const response = deferred<DeleteObjectCommandOutput>();
      let providerCalls = 0;
      send.mockImplementation(async () => {
        if (++providerCalls === 2) entered.resolve();
        return response.promise;
      });
      const pending = Promise.allSettled(
        selected.map((image) => images.deletePostImage(image.id, actor)),
      );
      const timeout = setTimeout(() => entered.resolve(), 2000);
      let callsWhileBorrowed = 0;
      try {
        await entered.promise;
        callsWhileBorrowed = providerCalls;
      } finally {
        clearTimeout(timeout);
        borrowed.forEach((connection) => connection.release());
        response.resolve({ $metadata: { httpStatusCode: 204 } });
      }
      const results = await pending;
      expect(callsWhileBorrowed).toBe(2);
      expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(2);
      const rejected = results.find((result) => result.status === 'rejected');
      expect(rejected && rejected.status === 'rejected' && rejected.reason).toMatchObject({
        reason: 'operation_in_progress',
      });
      expect(send).toHaveBeenCalledTimes(2);
      for (const image of selected) await assertLeaseFree(image.id);
      expect(await row(selected[2].id)).toBeDefined();
      expect(await images.deletePostImage(selected[2].id, actor)).toBe(true);
    });

    it.each(['create thread', 'update thread', 'create post', 'update post'] as const)(
      'preserves safe diagnostic context for %s failures',
      async (operation) => {
        const parent = await thread();
        const postId = await post(parent, '<p>Diagnostic fixture</p>');
        await new Promise((resolve) => setImmediate(resolve));
        const log = (await import('../../utils/logger.js')).default;
        const errors = jest.spyOn(log, 'error').mockImplementation(() => log);
        jest.spyOn(pool!, 'getConnection').mockRejectedValue(
          Object.assign(new Error('private-write-sentinel'), {
            code: 'ER_LOCK_DEADLOCK',
            sql: 'private-bindings-sentinel',
          }),
        );
        const endpoint =
          operation === 'create thread'
            ? '/api/forum/threads'
            : operation === 'update thread'
              ? '/api/forum/threads/' + parent
              : operation === 'create post'
                ? '/api/forum/threads/' + parent + '/posts'
                : '/api/forum/posts/' + postId;
        const action = operation.startsWith('create')
          ? request(app).post(endpoint)
          : request(app).patch(endpoint);
        const response = await action
          .set('X-Image-Fixture', 'authenticated')
          .set('Cookie', 'csrf_token=' + 'f'.repeat(64))
          .set('X-CSRF-Token', 'f'.repeat(64))
          .send({
            categoryId,
            title: 'Diagnostic fixture',
            content: '<p>Diagnostic fixture content</p>',
          });
        expect(response.status).toBe(500);
        expect(response.body.reference).toMatch(/^[\da-f-]{36}$/);
        expect(errors.mock.calls).toContainEqual([
          operation[0].toUpperCase() + operation.slice(1) + ' failed',
          expect.objectContaining({
            reference: response.body.reference,
            stage: 'publication',
            code: 'ER_LOCK_DEADLOCK',
          }),
        ]);
        expect(inspect(errors.mock.calls) + JSON.stringify(response.body)).not.toContain(
          'private-',
        );
      },
    );

    it('bounds provider timeout without losing or reopening the pending reference', async () => {
      const image = await seed();
      send.mockImplementationOnce(
        (_command, options) =>
          new Promise((_resolve, reject) => {
            options!.abortSignal!.addEventListener(
              'abort',
              () => reject(new Error('Synthetic aborted request')),
              { once: true },
            );
          }),
      );
      await expect(images.deletePostImage(image.id, actor)).rejects.toMatchObject({
        reason: 'provider_timeout',
      });
      expect(await row(image.id)).toMatchObject({ is_orphan: 0 });
      await assertLeaseFree(image.id);
      const parent = await thread();
      await expect(images.linkImagesToThread(parent, [image.url], actor)).rejects.toBeInstanceOf(
        images.PostImageAttachmentError,
      );
    });

    it('reports partial bulk results, keeps retry status visible below quota, then completes on retry', async () => {
      const first = await seed(),
        second = await seed();
      send.mockImplementation(async (command) => {
        if (command.input.Key === first.key) throw new Error('Synthetic provider outage');
        return { $metadata: { httpStatusCode: 204 } };
      });

      const result = await images.clearOrphanImagesForAccount(actor);
      expect(result).toMatchObject({ deleted: 1, failed: 1, remaining: 1 });
      expect(new Set(result.unavailableImageUrls)).toEqual(new Set([first.url, second.url]));
      expect(await images.getOrphanImageCount(actor)).toBe(1);
      expect(await images.getPendingImageRemovalCount(actor)).toBe(1);
      expect(await row(second.id)).toBeUndefined();
      send.mockResolvedValue({ $metadata: { httpStatusCode: 204 } });
      expect(await images.clearOrphanImagesForAccount(actor)).toMatchObject({
        deleted: 1,
        failed: 0,
        remaining: 0,
      });
    });

    it('returns the same safe failure reference from batch logs and HTTP errors', async () => {
      const log = (await import('../../utils/logger.js')).default;
      const warnings = jest.spyOn(log, 'warn').mockImplementation(() => log);
      jest.spyOn(pool!, 'getConnection').mockRejectedValueOnce(new Error('private-batch-sentinel'));
      const response = await request(app)
        .delete('/api/forum/images/orphans')
        .set('X-Image-Fixture', 'authenticated')
        .set('Cookie', 'csrf_token=' + 'f'.repeat(64))
        .set('X-CSRF-Token', 'f'.repeat(64));
      expect(response.status).toBe(503);
      expect(response.body.reference).toMatch(/^[\da-f-]{36}$/);
      expect(warnings.mock.calls).toContainEqual([
        'post_image_removal_incomplete',
        expect.objectContaining({ reference: response.body.reference }),
      ]);
      expect(warnings.mock.calls).toContainEqual([
        'post_image_batch_removal_incomplete',
        { reference: response.body.reference },
      ]);
      expect(inspect(warnings.mock.calls) + JSON.stringify(response.body)).not.toContain(
        'private-',
      );
      expect(send).not.toHaveBeenCalled();
    });

    it('keeps acknowledged removals and unavailable URLs when the final count fails', async () => {
      const image = await seed();
      const log = (await import('../../utils/logger.js')).default;
      const warnings = jest.spyOn(log, 'warn').mockImplementation(() => log);
      jest.spyOn(pool!, 'execute').mockRejectedValueOnce(new Error('private-count-sentinel'));
      const response = await request(app)
        .delete('/api/forum/images/orphans')
        .set('X-Image-Fixture', 'authenticated')
        .set('Cookie', 'csrf_token=' + 'f'.repeat(64))
        .set('X-CSRF-Token', 'f'.repeat(64));
      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        deleted: 1,
        failed: 0,
        remaining: null,
        unavailableImageUrls: [image.url],
      });
      expect(response.body.reference).toMatch(/^[\da-f-]{36}$/);
      expect(warnings.mock.calls).toContainEqual([
        'post_image_removal_incomplete',
        expect.objectContaining({ reference: response.body.reference }),
      ]);
      expect(await row(image.id)).toBeUndefined();
      expect(send).toHaveBeenCalledTimes(1);
      expect(inspect(warnings.mock.calls) + JSON.stringify(response.body)).not.toContain(
        'private-',
      );
      expect(inspect(warnings.mock.calls)).not.toContain(image.url);
    });

    it('enforces actual HTTP auth/CSRF and reports confirmed, failed and remaining batch work', async () => {
      const image = await seed();
      const missingCsrf = await request(app)
        .delete('/api/forum/images/orphans')
        .set('X-Image-Fixture', 'authenticated');
      expect(missingCsrf.status).toBe(403);
      const unauthorized = await request(app)
        .delete('/api/forum/images/orphans')
        .set('Cookie', 'csrf_token=' + 'f'.repeat(64))
        .set('X-CSRF-Token', 'f'.repeat(64));
      expect(unauthorized.status).toBe(401);
      expect(send).not.toHaveBeenCalled();
      send.mockRejectedValueOnce(new Error('private-provider-sentinel'));
      const failed = await request(app)
        .delete('/api/forum/images/' + image.id)
        .set('X-Image-Fixture', 'authenticated')
        .set('Cookie', 'csrf_token=' + 'f'.repeat(64))
        .set('X-CSRF-Token', 'f'.repeat(64));
      expect(failed.status).toBe(503);
      expect(JSON.stringify(failed.body)).not.toContain('private-provider-sentinel');
      expect(await row(image.id)).toBeDefined();
      send.mockRejectedValueOnce(new Error('private-provider-sentinel'));
      const partial = await request(app)
        .delete('/api/forum/images/orphans')
        .set('X-Image-Fixture', 'authenticated')
        .set('Cookie', 'csrf_token=' + 'f'.repeat(64))
        .set('X-CSRF-Token', 'f'.repeat(64));
      expect(partial.status).toBe(200);
      expect(partial.body).toMatchObject({
        deleted: 0,
        failed: 1,
        remaining: 1,
        unavailableImageUrls: [image.url],
      });
      const complete = await request(app)
        .delete('/api/forum/images/orphans')
        .set('X-Image-Fixture', 'authenticated')
        .set('Cookie', 'csrf_token=' + 'f'.repeat(64))
        .set('X-CSRF-Token', 'f'.repeat(64));
      expect(complete.status).toBe(200);
      expect(complete.body).toMatchObject({ deleted: 1, failed: 0, remaining: 0 });
      const absent = await request(app)
        .delete('/api/forum/images/' + image.id)
        .set('X-Image-Fixture', 'authenticated')
        .set('Cookie', 'csrf_token=' + 'f'.repeat(64))
        .set('X-CSRF-Token', 'f'.repeat(64));
      expect(absent.status).toBe(404);
    });

    it('returns an HTTP conflict for pending-image publication without inserting a post', async () => {
      const parent = await thread(),
        image = await seed();
      enabled = false;
      await expect(images.deletePostImage(image.id, actor)).rejects.toMatchObject({
        reason: 'storage_disabled',
      });
      const response = await request(app)
        .post('/api/forum/threads/' + parent + '/posts')
        .set('X-Image-Fixture', 'authenticated')
        .set('Cookie', 'csrf_token=' + 'f'.repeat(64))
        .set('X-CSRF-Token', 'f'.repeat(64))
        .send({ content: html(image.url) });
      expect(response.status).toBe(409);
      expect(response.body.error).toContain('awaiting removal');
      const [rows] = await pool!.execute<RowDataPacket[]>(
        'SELECT COUNT(*) AS count FROM forum_posts WHERE thread_id=?',
        [parent],
      );
      expect(Number(rows[0].count)).toBe(0);
    });

    it('keeps the one-hour rule for new orphans but retries explicit recent requests and skips attached/unknown rows', async () => {
      const recent = await seed(10),
        unknown = await seed(),
        attached = await seed();
      await pool!.execute('UPDATE forum_post_images SET created_at=NULL WHERE id=?', [unknown.id]);
      await pool!.execute('UPDATE forum_post_images SET is_orphan=FALSE WHERE id=?', [attached.id]);
      expect(await images.cleanupOrphanImages()).toBe(0);
      expect(send).not.toHaveBeenCalled();
      enabled = false;
      await expect(images.deletePostImage(recent.id, actor)).rejects.toMatchObject({
        reason: 'storage_disabled',
      });
      enabled = true;
      expect(await images.cleanupOrphanImages()).toBe(1);
      expect(await row(unknown.id)).toBeDefined();
      expect(await row(attached.id)).toBeDefined();
    });

    it('bounds cleanup batches, moves past retained failures and prevents local overlap', async () => {
      const retained = await seed();
      for (let index = 0; index < 119; index++) await seed();
      send.mockImplementation(async (command) => {
        if (command.input.Key === retained.key) throw new Error('Synthetic provider outage');
        return { $metadata: { httpStatusCode: 204 } };
      });
      const count = await images.cleanupOrphanImages();
      expect(count).toBeGreaterThan(0);
      expect(count).toBeLessThanOrEqual(100);
      expect(await row(retained.id)).toBeDefined();
      send.mockResolvedValue({ $metadata: { httpStatusCode: 204 } });
      for (let run = 0; run < 5; run++) await images.cleanupOrphanImages();
      expect(await images.getOrphanImageCount(actor)).toBe(0);
      const image = await seed(),
        started = deferred<void>(),
        response = deferred<DeleteObjectCommandOutput>();
      send.mockImplementationOnce(async () => {
        started.resolve();
        return response.promise;
      });
      const first = images.cleanupOrphanImages(),
        second = images.cleanupOrphanImages();
      await started.promise;
      response.resolve({ $metadata: { httpStatusCode: 204 } });
      expect(await first).toBe(1);
      expect(await second).toBe(1);
      expect(await row(image.id)).toBeUndefined();
    });

    it('reverses only unused intent schema and recovers an interrupted exact DDL without touching data', async () => {
      const image = await seed();
      enabled = false;
      await expect(images.deletePostImage(image.id, actor)).rejects.toMatchObject({
        reason: 'storage_disabled',
      });
      expect(() =>
        runFixtureWebMigrations(port, database, {
          direction: 'down',
          name: POST_IMAGE_REMOVAL_MIGRATION,
        }),
      ).toThrow(/post_image_rollback_refuses_pending_removal/);
      await pool!.execute('DELETE FROM forum_post_images WHERE id=?', [image.id]);
      imageIds.delete(image.id);
      runFixtureWebMigrations(port, database, {
        direction: 'down',
        name: POST_IMAGE_REMOVAL_MIGRATION,
        loseDdlAcknowledgement: 'image',
      });
      runFixtureWebMigrations(port, database, {
        direction: 'down',
        name: POST_IMAGE_REMOVAL_MIGRATION,
      });
      runFixtureWebMigrations(port, database, {
        direction: 'up',
        name: POST_IMAGE_REMOVAL_MIGRATION,
        loseDdlAcknowledgement: 'image',
      });
      runFixtureWebMigrations(port, database, {
        direction: 'up',
        name: POST_IMAGE_REMOVAL_MIGRATION,
      });
    });
  },
);
