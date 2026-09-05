import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import { flushPromises, mount } from '@vue/test-utils'

const site = {
  error: ref<string | null>(null),
  isAvailable: ref(false),
  reloadConfig: vi.fn(),
}
const isOffline = ref(false)
vi.mock('@/composables/useSiteConfig', () => ({ useSiteConfig: () => site }))
vi.mock('@/composables/useOfflineStatus', () => ({ useOfflineStatus: () => ({ isOffline }) }))

import SiteAvailabilityNotice from '../SiteAvailabilityNotice.vue'

let wrapper: ReturnType<typeof mount>
const fetchMock = vi.fn()
const statusResponse = (reason: string) =>
  new Response(
    JSON.stringify({
      service: 'durisweb-availability',
      reason,
    }),
  )
const text = () => document.body.textContent ?? ''
const click = async (label: string) => {
  const button = [...document.querySelectorAll('button')].find(
    (element) => element.textContent === label,
  )
  expect(button).toBeDefined()
  button?.click()
  await flushPromises()
}

beforeEach(() => {
  site.error.value = null
  site.isAvailable.value = false
  isOffline.value = false
  site.reloadConfig.mockReset().mockResolvedValue(undefined)
  fetchMock.mockReset().mockResolvedValue(statusResponse('off'))
  vi.stubGlobal('fetch', fetchMock)
})
afterEach(() => {
  wrapper?.unmount()
  vi.unstubAllGlobals()
  document.body.innerHTML = ''
})

describe('site availability notice', () => {
  it('does not show or fetch anything while the site is healthy', async () => {
    wrapper = mount(SiteAvailabilityNotice, { attachTo: document.body })
    await flushPromises()
    expect(document.querySelector('[role="dialog"]')).toBeNull()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('shows an explicit burn-in reason on configuration failure and allows dismissal and reopening', async () => {
    site.error.value = 'Internal configuration error that must not be displayed'
    fetchMock.mockResolvedValue(statusResponse('mud_burnin'))
    wrapper = mount(SiteAvailabilityNotice, { attachTo: document.body })
    await flushPromises()
    expect(text()).toContain('MUD server testing (burn-in)')
    expect(text()).not.toContain('Internal configuration error')
    expect(document.querySelector('[role="dialog"]')?.getAttribute('aria-describedby')).toBeTruthy()
    await click('Dismiss')
    expect(document.querySelector('[role="dialog"]')).toBeNull()
    await click('Details')
    expect(document.querySelector('[role="dialog"]')).not.toBeNull()
    expect(fetchMock).toHaveBeenCalledOnce()
  })

  it.each([
    new Response('tunnel error', { status: 530 }),
    new Response('<html>an origin SPA fallback</html>'),
    new Response(JSON.stringify({ service: 'wrong', reason: 'mud_burnin' })),
    statusResponse('<script>private details</script>'),
  ])('uses neutral copy for failed, missing, or untrusted edge status', async (response) => {
    fetchMock.mockResolvedValue(response)
    wrapper = mount(SiteAvailabilityNotice, { attachTo: document.body })
    window.dispatchEvent(new Event('site-unavailable'))
    await flushPromises()
    expect(text()).toContain('Temporarily unavailable')
    expect(text()).not.toMatch(/burn-in|private details|tunnel error|origin SPA/)
  })

  it('coalesces concurrent failures and does not reopen a dismissed incident', async () => {
    wrapper = mount(SiteAvailabilityNotice, { attachTo: document.body })
    for (let i = 0; i < 5; i++) window.dispatchEvent(new Event('site-unavailable'))
    await flushPromises()
    expect(fetchMock).toHaveBeenCalledOnce()
    await click('Dismiss')
    window.dispatchEvent(new Event('site-unavailable'))
    await flushPromises()
    expect(document.querySelector('[role="dialog"]')).toBeNull()
    expect(fetchMock).toHaveBeenCalledOnce()
  })

  it('keeps maintenance visible on Retry without contacting the backend', async () => {
    fetchMock.mockImplementation(async () => statusResponse('maintenance'))
    site.error.value = 'unavailable'
    wrapper = mount(SiteAvailabilityNotice, { attachTo: document.body })
    await flushPromises()
    await click('Retry')
    expect(text()).toContain('Scheduled maintenance')
    expect(site.reloadConfig).not.toHaveBeenCalled()
    expect(fetchMock).toHaveBeenLastCalledWith(
      '/api/site-availability',
      expect.objectContaining({
        cache: 'no-store',
        credentials: 'omit',
        signal: expect.any(AbortSignal),
      }),
    )
  })

  it('clears the notice only after a successful read-only configuration retry', async () => {
    fetchMock.mockImplementation(async () => statusResponse('off'))
    site.error.value = 'unavailable'
    wrapper = mount(SiteAvailabilityNotice, { attachTo: document.body })
    await flushPromises()
    await click('Retry')
    expect(text()).toContain('Temporarily unavailable')
    site.reloadConfig.mockImplementation(async () => {
      site.isAvailable.value = true
      site.error.value = null
    })
    await click('Retry')
    expect(document.querySelector('[role="dialog"]')).toBeNull()
    expect(wrapper.text()).toBe('')
    expect(site.reloadConfig).toHaveBeenCalledTimes(2)
  })

  it('shows browser offline separately and prevents stale maintenance responses replacing it', async () => {
    let resolve: (response: Response) => void = () => {}
    fetchMock.mockReturnValue(
      new Promise<Response>((done) => {
        resolve = done
      }),
    )
    site.error.value = 'unavailable'
    wrapper = mount(SiteAvailabilityNotice, { attachTo: document.body })
    isOffline.value = true
    await flushPromises()
    resolve(statusResponse('mud_burnin'))
    await flushPromises()
    expect(text()).toContain('You’re offline')
    expect(text()).not.toContain('burn-in')
    await click('Retry')
    expect(site.reloadConfig).not.toHaveBeenCalled()
  })
})
