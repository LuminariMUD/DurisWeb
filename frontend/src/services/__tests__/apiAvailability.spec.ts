import { afterEach, describe, expect, it, vi } from 'vitest'
import { AxiosError, CanceledError } from 'axios'
import { apiClient } from '../httpClient.js'
import { apiClient as legacyApiClient } from '../api.js'

afterEach(() => vi.restoreAllMocks())

describe('API availability signals', () => {
  it.each([
    [503, false],
    [500, true],
  ] as const)(
    'classifies a gated HTTP %s response without replay or false outage=%s',
    async (status, signal) => {
      const dispatch = vi.spyOn(window, 'dispatchEvent')
      const adapter = vi.fn(async (config) => {
        throw new AxiosError('operation refused', 'ERR_BAD_RESPONSE', config, undefined, {
          status,
          statusText: 'Refused',
          headers: {},
          config,
          data: { error: 'operation_gated', gate: 'databaseRestore' },
        })
      })
      await expect(apiClient.post('/api/admin/backup/restore', {}, { adapter })).rejects.toThrow()
      expect(adapter).toHaveBeenCalledOnce()
      expect(dispatch).toHaveBeenCalledTimes(signal ? 1 : 0)
    },
  )
  it.each([500, 502, 503, 504, 530])(
    'signals HTTP %s without replaying the request',
    async (status) => {
      const dispatch = vi.spyOn(window, 'dispatchEvent')
      const adapter = vi.fn(async (config) => {
        throw new AxiosError('private upstream details', 'ERR_BAD_RESPONSE', config, undefined, {
          status,
          statusText: 'Failure',
          headers: {},
          config,
          data: 'private upstream details',
        })
      })
      await expect(apiClient.post('/action', { value: 'test' }, { adapter })).rejects.toThrow()
      expect(adapter).toHaveBeenCalledOnce()
      expect(dispatch).toHaveBeenCalledOnce()
      expect(dispatch.mock.calls[0]?.[0].type).toBe('site-unavailable')
      expect(dispatch.mock.calls[0]?.[0]).not.toHaveProperty('detail')
    },
  )

  it.each(['ERR_NETWORK', 'ECONNABORTED', 'ETIMEDOUT'])(
    'signals %s connection failures',
    async (code) => {
      const dispatch = vi.spyOn(window, 'dispatchEvent')
      await expect(
        apiClient.get('/test', {
          adapter: async () => {
            throw new AxiosError('private details', code)
          },
        }),
      ).rejects.toThrow()
      expect(dispatch).toHaveBeenCalledOnce()
    },
  )

  it.each([400, 401, 403, 404, 409, 429])(
    'does not mislabel HTTP %s as an outage',
    async (status) => {
      const dispatch = vi.spyOn(window, 'dispatchEvent')
      await expect(
        apiClient.get('/test', {
          adapter: async (config) => {
            throw new AxiosError('error', 'ERR_BAD_REQUEST', config, undefined, {
              status,
              statusText: 'Error',
              headers: {},
              config,
              data: {},
            })
          },
        }),
      ).rejects.toThrow()
      expect(dispatch).not.toHaveBeenCalled()
    },
  )

  it('ignores cancellation', async () => {
    const dispatch = vi.spyOn(window, 'dispatchEvent')
    await expect(
      apiClient.get('/test', {
        adapter: async () => {
          throw new CanceledError()
        },
      }),
    ).rejects.toThrow()
    expect(dispatch).not.toHaveBeenCalled()
  })

  it('shares one instance and adds CSRF only to mutations', async () => {
    expect(legacyApiClient).toBe(apiClient)
    expect(apiClient.defaults.withCredentials).toBe(true)
    expect(apiClient.defaults.timeout).toBe(10000)
    document.cookie = 'csrf_token=synthetic-token'
    const seen: Array<[string | undefined, unknown]> = []
    const adapter = vi.fn(async (config) => {
      seen.push([config.method, config.headers['X-CSRF-Token']])
      return { data: {}, status: 200, statusText: 'OK', headers: {}, config }
    })
    await apiClient.get('/read', { adapter })
    await apiClient.post('/write', {}, { adapter })
    await apiClient.delete('/remove', { adapter })
    expect(seen).toEqual([
      ['get', undefined],
      ['post', 'synthetic-token'],
      ['delete', 'synthetic-token'],
    ])
    document.cookie = 'csrf_token=; expires=Thu, 01 Jan 1970 00:00:00 GMT'
  })
})
