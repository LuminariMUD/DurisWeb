import { beforeEach, describe, expect, it, jest } from '@jest/globals';
const scan = jest.fn<(...args: unknown[]) => Promise<[string, string[]]>>(),
  del = jest.fn<(...keys: string[]) => Promise<number>>();
const info = jest.fn<(...args: unknown[]) => Promise<string>>();
jest.unstable_mockModule('../../db/redis.js', () => ({ default: { scan, del, info } }));
const { cleanupRetiredAnalyticsCache, RetentionCacheError } = await import(
  '../retentionCacheCleanup.js'
);
beforeEach(() => {
  jest.clearAllMocks();
  scan.mockResolvedValue(['0', []]);
  info.mockResolvedValue('run_id:' + 'a'.repeat(40) + '\r\n');
  del.mockImplementation(async (...keys) => keys.length);
});
describe('retired analytics cache cleanup', () => {
  it('removes owned legacy keys with raw interval characters using safe Redis arguments', async () => {
    const key = 'web_analytics:traffic:30d:legacy\ninterval';
    scan.mockResolvedValue(['0', [key]]);
    expect((await cleanupRetiredAnalyticsCache('0', 2000)).complete).toBe(true);
    expect(del).toHaveBeenCalledWith(key);
  });
  it('uses SCAN and bounded deletes, then confirms a complete namespace iteration', async () => {
    scan
      .mockResolvedValueOnce(['9', ['web_analytics:old:1']])
      .mockResolvedValueOnce([
        '0',
        Array.from({ length: 230 }, (_, id) => 'web_analytics:old:' + id),
      ]);
    expect(await cleanupRetiredAnalyticsCache('0', 2000)).toEqual({
      cursor: '0',
      complete: true,
      removed: 231,
      serverId: 'a'.repeat(40),
    });
    expect(del.mock.calls.every((call) => call.length <= 100)).toBe(true);
    expect(scan).toHaveBeenCalledWith('9', 'MATCH', 'web_analytics:*', 'COUNT', 100);
  });
  it('refuses untrusted namespace/cursor data before deleting unrelated cache keys', async () => {
    scan.mockResolvedValue(['0', ['other:private']]);
    await expect(cleanupRetiredAnalyticsCache('0', 2000)).rejects.toBeInstanceOf(
      RetentionCacheError,
    );
    expect(del).not.toHaveBeenCalled();
    await expect(cleanupRetiredAnalyticsCache('malformed', 2000)).rejects.toBeInstanceOf(
      RetentionCacheError,
    );
  });
  it('restarts traversal after a cache server restart instead of trusting an old hash cursor', async () => {
    info.mockResolvedValue('run_id:' + 'b'.repeat(40) + '\r\n');
    await cleanupRetiredAnalyticsCache('9', 2000, 'a'.repeat(40));
    expect(scan).toHaveBeenCalledWith('0', 'MATCH', 'web_analytics:*', 'COUNT', 100);
  });
  it('discards raw cache failures rather than claiming removal', async () => {
    scan.mockResolvedValue(['0', ['web_analytics:old']]);
    del.mockRejectedValue(new Error('private-key-payload-password-sentinel'));
    const error: unknown = await cleanupRetiredAnalyticsCache('0', 2000).catch(
      (failure) => failure as unknown,
    );
    expect(error).toBeInstanceOf(RetentionCacheError);
    expect(String(error)).not.toContain('private-key-payload-password-sentinel');
  });
});
