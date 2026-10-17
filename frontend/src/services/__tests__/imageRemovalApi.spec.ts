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
    { deleted: 1, failed: 0, remaining: null, unavailableImageUrls: [] },
    {
      deleted: 1,
      failed: 0,
      remaining: null,
      unavailableImageUrls: [],
      reference: 'private-invalid',
    },
  ])('rejects incomplete or malformed acknowledgement %j', async (data) => {
    vi.spyOn(apiClient, 'delete').mockResolvedValue(response(data))
    await expect(forumApi.clearOrphanImages()).rejects.toThrow('Invalid image removal response')
  })
  it('retains partial results when the remaining count is unknown', async () => {
    const result = {
      deleted: 1,
      failed: 0,
      remaining: null,
      unavailableImageUrls: ['https://images.test.invalid/first.webp'],
      reference: 'd3a51f53-ffcd-44b5-b4aa-86a8aa37bf15',
    }
    vi.spyOn(apiClient, 'delete').mockResolvedValue(response(result))
    await expect(forumApi.clearOrphanImages()).resolves.toEqual(result)
  })
})
