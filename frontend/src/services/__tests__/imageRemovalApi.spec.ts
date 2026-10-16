import { afterEach, describe, expect, it, vi } from 'vitest'
import { AxiosHeaders } from 'axios'
import { apiClient, forumApi } from '../api'

afterEach(() => vi.restoreAllMocks())
function response(data: unknown) {
  return {
    data,
    status: 200,
    statusText: 'OK',
    headers: {},
    config: { headers: new AxiosHeaders() },
  }
}
describe('image removal result boundary', () => {
  it('returns explicit confirmed, failed and remaining counts', async () => {
    const result = {
      deleted: 1,
      failed: 1,
      remaining: 1,
      unavailableImageUrls: ['https://images.test.invalid/first.webp'],
    }
    vi.spyOn(apiClient, 'delete').mockResolvedValue(response(result))
    await expect(forumApi.clearOrphanImages()).resolves.toEqual(result)
  })
  it.each([
    null,
    { deleted: 1 },
    { deleted: 1, failed: '1', remaining: 0, unavailableImageUrls: [] },
    { deleted: -1, failed: 0, remaining: 0, unavailableImageUrls: [] },
    { deleted: 0, failed: 1, remaining: 1, unavailableImageUrls: [null] },
  ])('rejects incomplete or malformed acknowledgement %j', async (data) => {
    vi.spyOn(apiClient, 'delete').mockResolvedValue(response(data))
    await expect(forumApi.clearOrphanImages()).rejects.toThrow('Invalid image removal response')
  })
})
