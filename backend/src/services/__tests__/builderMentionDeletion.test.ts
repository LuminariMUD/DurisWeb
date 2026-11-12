import { beforeEach, describe, expect, it, jest } from '@jest/globals';

const poolQuery = jest.fn<(...args: unknown[]) => Promise<unknown>>();
const transactionQuery = jest.fn<(...args: unknown[]) => Promise<unknown>>();
jest.unstable_mockModule('../../db/connection.js', () => ({ pool: { query: poolQuery } }));
jest.unstable_mockModule('../unifiedNotificationService.js', () => ({}));
const { deleteMentions } = await import('../builderNotificationService.js');

describe('builder mention deletion connection ownership', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('keeps ordinary callers on the pool', async () => {
    await deleteMentions('comment', 7);
    expect(poolQuery).toHaveBeenCalledWith(
      'DELETE FROM builder_mentions WHERE entity_type = ? AND entity_id = ?',
      ['comment', 7],
    );
  });

  it('uses only the supplied transaction for atomic deletion', async () => {
    const connection = { query: transactionQuery } as unknown as Parameters<
      typeof deleteMentions
    >[2];
    await deleteMentions('proc_request', 7, connection);
    expect(transactionQuery).toHaveBeenCalledWith(
      'DELETE FROM builder_mentions WHERE entity_type = ? AND entity_id = ?',
      ['proc_request', 7],
    );
    expect(poolQuery).not.toHaveBeenCalled();
  });
});
