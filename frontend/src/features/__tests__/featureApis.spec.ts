import { afterEach, describe, expect, it } from 'vitest'
import type { InternalAxiosRequestConfig } from 'axios'
import { apiClient } from '@/services/httpClient'
import { pvpApi } from '@/features/pvp/api'
import { adminApi } from '@/features/admin/api'
import { builderApi } from '@/features/builder/api'
import { publicStatsApi } from '@/features/publicStats/api'
import { namedSetsApi } from '@/features/namedSets/api'

const seen: InternalAxiosRequestConfig[] = []

afterEach(() => {
  seen.length = 0
  apiClient.defaults.adapter = undefined
  document.cookie = 'csrf_token=; expires=Thu, 01 Jan 1970 00:00:00 GMT'
})

function respond(data: unknown = {}) {
  apiClient.defaults.adapter = async (config: InternalAxiosRequestConfig) => {
    seen.push(config)
    return { data, status: 200, statusText: 'OK', headers: {}, config }
  }
}

describe('feature API modules on the shared client', () => {
  it('keeps every adminApi and builderApi method after splitting them by route group', () => {
    // Counts of methods in the former single object literals (services/api.ts at 8a1986b).
    expect(Object.keys(adminApi)).toHaveLength(53)
    expect(Object.keys(builderApi)).toHaveLength(58)
  })

  it('encodes PvP query filters as before', async () => {
    respond({ data: [] })
    await pvpApi.getEvents({ page: 2, playerName: 'Two Words', hour: 0 })
    expect(seen[0]?.method).toBe('get')
    expect(seen[0]?.url).toBe('/api/pvp/events?page=2&player=Two+Words&hour=0')
    expect(seen[0]?.headers['X-CSRF-Token']).toBeUndefined()
  })

  it('passes axios params for public statistics', async () => {
    respond({ days: 7, hours: [] })
    await publicStatsApi.getFactionOverlap(7)
    expect([seen[0]?.url, seen[0]?.params]).toEqual([
      '/api/public/statistics/faction-overlap',
      { days: 7 },
    ])
  })

  it('reads the public named set report', async () => {
    respond({ notes: '', zones: [], fetchedAt: '2026-11-11T00:00:00.000Z' })
    await expect(namedSetsApi.getReport()).resolves.toMatchObject({ zones: [] })
    expect([seen[0]?.method, seen[0]?.url]).toEqual(['get', '/api/named-sets'])
  })

  it('uploads multipart admin files with the CSRF header', async () => {
    document.cookie = 'csrf_token=synthetic'
    respond({ success: true, heroUrl: '/hero.png' })
    const file = new File(['x'], 'hero.png', { type: 'image/png' })
    await expect(adminApi.uploadHeroImage(file)).resolves.toEqual({ heroUrl: '/hero.png' })
    expect(seen[0]?.method).toBe('post')
    expect(seen[0]?.url).toBe('/api/admin/web/hero-image')
    expect(seen[0]?.data).toBeInstanceOf(FormData)
    expect((seen[0]?.data as FormData).get('hero')).toBeInstanceOf(File)
    expect(seen[0]?.headers['X-CSRF-Token']).toBe('synthetic')
  })
})
