import crypto from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';
import type { ResultSetHeader } from 'mysql2';

const port = process.env.TEST_BUILDER_NOTIFICATION_DB_PORT;
if (
  port &&
  (!['23436', '23437'].includes(port) ||
    process.env.DB_PORT !== port ||
    process.env.DB_HOST !== '127.0.0.1' ||
    !process.env.DB_NAME?.startsWith('durisweb_qualification_'))
) {
  throw new Error('Builder notification qualification requires a disposable database');
}

(port ? describe : describe.skip)('builder notification read-state contract on real SQL', () => {
  let pool: typeof import('../../db/connection.js').pool;
  let builderNotifications: typeof import('../builderNotificationService.js');
  let unifiedNotifications: typeof import('../unifiedNotificationService.js');
  const account = `notification_${crypto.randomBytes(8).toString('hex')}`;
  const otherAccount = `${account}_other`;
  const ids: number[] = [];

  beforeAll(async () => {
    ({ pool } = await import('../../db/connection.js'));
    builderNotifications = await import('../builderNotificationService.js');
    unifiedNotifications = await import('../unifiedNotificationService.js');
    for (const [owner, read] of [
      [account, false],
      [account, true],
      [account, true],
      [otherAccount, true],
    ] as const) {
      const [result] = await pool.query<ResultSetHeader>(
        `INSERT INTO notifications (account_name,source,notification_type,message,is_read,created_at)
         VALUES (?,'builder','comment_mention','Synthetic notification',?,DATE_ADD('2000-01-01',INTERVAL ? SECOND))`,
        [owner, read, ids.length],
      );
      ids.push(result.insertId);
    }
  });

  afterAll(async () => {
    if (pool) {
      if (ids.length) await pool.query('DELETE FROM notifications WHERE id IN (?)', [ids]);
      await pool.end();
    }
  });

  it('returns only read notifications with the filtered total and correct pagination', async () => {
    const first = await builderNotifications.getNotifications(account, true, 1, 0);
    const second = await builderNotifications.getNotifications(account, true, 1, 1);
    expect(first.notifications.map((row) => row.id)).toEqual([ids[2]]);
    expect(second.notifications.map((row) => row.id)).toEqual([ids[1]]);
    expect([first.total, second.total]).toEqual([2, 2]);
    expect([first.hasMore, second.hasMore]).toEqual([true, false]);
  });

  it('preserves unread, all-state and existing unreadOnly callers without crossing accounts', async () => {
    const unread = await builderNotifications.getNotifications(account, false);
    const all = await builderNotifications.getNotifications(account);
    const legacy = await unifiedNotifications.getNotifications(account, { unreadOnly: true });
    expect(unread.notifications.map((row) => row.id)).toEqual([ids[0]]);
    expect(legacy.notifications.map((row) => row.id)).toEqual([ids[0]]);
    expect(all.notifications.map((row) => row.id)).toEqual([ids[2], ids[1], ids[0]]);
    expect([unread.total, legacy.total, all.total]).toEqual([1, 1, 3]);
  });
});
