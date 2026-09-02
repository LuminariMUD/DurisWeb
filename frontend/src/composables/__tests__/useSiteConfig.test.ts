import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getSiteConfig: vi.fn(),
}))

vi.mock('@/services/api', () => ({
  getSiteConfig: mocks.getSiteConfig,
}))

import { resetSiteConfigForTests, useSiteConfig } from '../useSiteConfig'

const validConfiguration = {
  siteTitle: 'Example MUD',
  siteLogoUrl: '',
  supportUrl: 'https://support.example.invalid',
  mudHost: 'mud.example.invalid',
  mudPort: '7777',
  mudPortTls: '4001',
  mudWsUrl: 'wss://ws.example.invalid/mud',
  frontPageHeroEnabled: true,
  frontPageHeroTitle: 'Welcome',
  frontPageHeroSubtitle: 'Enter the realm',
  frontPageHeroImageUrl: '',
  frontPageContent: '<p>Configured content</p>',
}

beforeEach(() => {
  resetSiteConfigForTests()
  mocks.getSiteConfig.mockReset()
})

describe('site configuration availability', () => {
  it('publishes configured values after a complete response', async () => {
    mocks.getSiteConfig.mockResolvedValue(validConfiguration)
    const site = useSiteConfig()

    await site.loadConfig()

    expect(site.isAvailable.value).toBe(true)
    expect(site.error.value).toBeNull()
    expect(site.siteTitle.value).toBe('Example MUD')
    expect(site.mudWsUrl.value).toBe('wss://ws.example.invalid/mud')
  })

  it('exposes an unavailable state instead of local defaults on failure', async () => {
    mocks.getSiteConfig.mockResolvedValue({ siteTitle: 'Incomplete' })
    const site = useSiteConfig()

    await site.loadConfig()

    expect(site.isLoaded.value).toBe(true)
    expect(site.isAvailable.value).toBe(false)
    expect(site.error.value).toMatch(/unavailable/i)
    expect(site.siteTitle.value).toBe('')
    expect(site.mudWsUrl.value).toBeNull()
  })
})
