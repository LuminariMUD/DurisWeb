import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getSiteConfig: vi.fn(),
}))

vi.mock('@/services/api', () => ({
  getSiteConfig: mocks.getSiteConfig,
}))

import { parseSiteConfig, resetSiteConfigForTests, useSiteConfig } from '../useSiteConfig'

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
  it('displays the retired NewDuris brand as Duris without changing the stored configuration', async () => {
    mocks.getSiteConfig.mockResolvedValue({ ...validConfiguration, siteTitle: 'NewDuris' })
    const site = useSiteConfig()
    await site.loadConfig()
    expect(site.siteTitle.value).toBe('Duris')
    expect(site.config.value?.siteTitle).toBe('NewDuris')
  })

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

  it.each([
    ['a plaintext MUD socket', { mudWsUrl: 'ws://127.0.0.1:4050' }, /mudWsUrl/],
    ['a fragmented MUD socket', { mudWsUrl: 'wss://ws.example.invalid/mud#fragment' }, /mudWsUrl/],
    ['an unsafe support scheme', { supportUrl: 'javascript:alert(1)' }, /supportUrl/],
    [
      'support URL credentials',
      { supportUrl: 'https://user:secret@support.example.invalid' },
      /supportUrl/,
    ],
  ])('rejects %s', (_label, override, expected) => {
    expect(() => parseSiteConfig({ ...validConfiguration, ...override })).toThrow(expected)
  })
})
