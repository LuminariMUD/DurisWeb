import { afterEach, describe, expect, it, vi } from 'vitest'
import { createMemoryHistory, createRouter } from 'vue-router'
import { clearLegacyAnalyticsSession } from '../analytics'

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  vi.useRealTimers()
  localStorage.clear()
})

describe('optional analytics closure', () => {
  it('clears the old identifier without new identifiers, timers, or requests', async () => {
    vi.useFakeTimers()
    localStorage.setItem('analytics_session_id', 'legacy-sentinel')
    localStorage.setItem('unrelated-preference', 'keep')
    const setItem = vi.spyOn(Storage.prototype, 'setItem')
    const fetch = vi.fn()
    vi.stubGlobal('fetch', fetch)
    const random = vi.spyOn(crypto, 'getRandomValues')
    const timer = vi.spyOn(window, 'setTimeout')
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        { path: '/', component: { template: '<div />' } },
        { path: '/news', component: { template: '<div />' } },
      ],
    })
    clearLegacyAnalyticsSession()
    expect(timer).not.toHaveBeenCalled()
    expect(localStorage.getItem('analytics_session_id')).toBeNull()
    await router.push('/news')
    await vi.runAllTimersAsync()
    expect(fetch).not.toHaveBeenCalled()
    expect(setItem).not.toHaveBeenCalled()
    expect(random).not.toHaveBeenCalled()
    expect(localStorage.getItem('unrelated-preference')).toBe('keep')
  })

  it('does not break startup when browser storage is unavailable', () => {
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
      throw new DOMException('Access denied', 'SecurityError')
    })
    expect(() => clearLegacyAnalyticsSession()).not.toThrow()
  })
})
