import { afterEach, describe, expect, it } from 'vitest'
import type { InternalAxiosRequestConfig } from 'axios'
import { apiClient } from '@/services/httpClient'
import { changelogApi } from '../api'

const requests: Array<[string | undefined, string | undefined, unknown, unknown]> = []

afterEach(() => {
  requests.length = 0
  apiClient.defaults.adapter = undefined
  document.cookie = 'csrf_token=; expires=Thu, 01 Jan 1970 00:00:00 GMT'
})

describe('changelogApi', () => {
  it('keeps its endpoints, encoding, and CSRF behavior on the shared client', async () => {
    document.cookie = 'csrf_token=synthetic'
    apiClient.defaults.adapter = async (config: InternalAxiosRequestConfig) => {
      requests.push([config.method, config.url, config.data, config.headers['X-CSRF-Token']])
      return { data: { ok: true }, status: 200, statusText: 'OK', headers: {}, config }
    }

    await expect(changelogApi.getEntries(2, 5)).resolves.toEqual({ ok: true })
    await changelogApi.getAdminEntries()
    await changelogApi.getUnreadCount()
    await changelogApi.markAsRead(3)
    await changelogApi.markAllAsRead()
    await changelogApi.createEntry({ version: '1', title: 't', content: 'c', category: 'public' })
    await changelogApi.updateEntry(4, { isPublished: true })
    await changelogApi.deleteEntry(4)

    expect(requests).toEqual([
      ['get', '/api/changelog?page=2&limit=5', undefined, undefined],
      ['get', '/api/changelog/admin?page=1&limit=20', undefined, undefined],
      ['get', '/api/changelog/unread-count', undefined, undefined],
      ['post', '/api/changelog/3/read', undefined, 'synthetic'],
      ['post', '/api/changelog/read-all', undefined, 'synthetic'],
      [
        'post',
        '/api/changelog',
        '{"version":"1","title":"t","content":"c","category":"public"}',
        'synthetic',
      ],
      ['put', '/api/changelog/4', '{"isPublished":true}', 'synthetic'],
      ['delete', '/api/changelog/4', undefined, 'synthetic'],
    ])
  })
})
