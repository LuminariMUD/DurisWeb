import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import { flushPromises, mount } from '@vue/test-utils'
import { useHead } from '@unhead/vue'

const site = {
  siteTitle: ref('Duris'),
  mudHost: ref('mud.example.test'),
  mudPort: ref('1234'),
  mudPortTls: ref(''),
  isAvailable: ref(true),
  isLoading: ref(false),
  error: ref<string | null>(null),
}
vi.mock('@/composables/useSiteConfig', () => ({ useSiteConfig: () => site }))
vi.mock('@unhead/vue', () => ({ useHead: vi.fn() }))
vi.mock('vue-router', () => ({
  RouterLink: { props: ['to'], template: '<a :href="to"><slot /></a>' },
}))

import MudletGuiView from '@/views/MudletGuiView.vue'

let wrapper: ReturnType<typeof mount>

beforeEach(() => {
  vi.clearAllMocks()
  site.siteTitle.value = 'Duris'
  site.mudHost.value = 'mud.example.test'
  site.mudPort.value = '1234'
  site.mudPortTls.value = ''
  site.isAvailable.value = true
  site.isLoading.value = false
  site.error.value = null
})
afterEach(() => wrapper?.unmount())

function pageMetadata() {
  const input = vi.mocked(useHead).mock.calls[0]?.[0]
  if (typeof input !== 'function') throw new Error('Expected reactive page metadata')
  const metadata = input()
  if (!metadata) throw new Error('Expected page metadata')
  return metadata
}

describe('Mudlet GUI public page', () => {
  it('offers the desktop package, setup, support, and browser alternative without an account', () => {
    wrapper = mount(MudletGuiView)
    expect(wrapper.get('h1').text()).toBe('Mudlet GUI')
    expect(wrapper.text()).toContain('Keep the world in view.')
    expect(wrapper.findAll('ol > li')).toHaveLength(4)
    for (const heading of [
      'Your adventure stays central',
      'Find your bearings',
      'Keep an eye on the group',
      'Give each conversation its place',
      'Bring the details within reach',
      'Choose your own helpers',
      'Set up your next session.',
      'Make room for the whole adventure.',
    ]) {
      expect(wrapper.findAll('h2, h3').map((h) => h.text())).toContain(heading)
    }
    expect(wrapper.findAll('a[href="/play"]')).toHaveLength(2)
    expect(wrapper.find('a[href="/login"]').exists()).toBe(false)
    expect(wrapper.text()).toContain('Mudlet 4.19.1 or newer')
    expect(wrapper.text()).toContain('GMCP enabled')
    expect(wrapper.text()).toContain('Automatic behaviors start off')
    expect(wrapper.text()).toContain('Originally created by Arjinius / Arjin.')
  })

  it('uses named native download and help anchors at the intended external destinations', () => {
    wrapper = mount(MudletGuiView)
    const downloads = wrapper.findAll('a').filter((a) => a.text() === 'Download GUI package')
    expect(downloads).toHaveLength(2)
    for (const download of downloads) {
      expect(download.attributes('href')).toBe(
        'https://github.com/LuminariMUD/duris-client/releases',
      )
      expect(download.attributes('target')).toBeUndefined()
      expect(download.get('svg').attributes('aria-hidden')).toBe('true')
    }
    for (const destination of [
      'https://www.mudlet.org/download/',
      'https://wiki.mudlet.org/w/Manual:Package_Manager',
      'https://github.com/LuminariMUD/duris-client#install',
      'https://github.com/LuminariMUD/duris-client/issues',
      'https://github.com/LuminariMUD/duris-client/releases/latest',
    ]) {
      expect(wrapper.findAll('a').some((a) => a.attributes('href') === destination)).toBe(true)
    }
    expect(wrapper.text()).toContain('duris-client.mpackage')
    expect(wrapper.text()).toContain('Install Mudlet separately.')
  })

  it('describes every native capture, identifies the demonstration data, and links to full-size images', () => {
    wrapper = mount(MudletGuiView)
    const figures = wrapper.findAll('figure')
    expect(figures).toHaveLength(4)
    const descriptions = [
      'central game console',
      '40 percent health',
      'fictional character Kestrel',
      'two-of-five guardian quest',
    ]
    figures.forEach((figure, index) => {
      const img = figure.get('img')
      expect(img.attributes('alt')).toContain(descriptions[index])
      expect(img.attributes('width')).toBe('1920')
      expect(img.attributes('height')).toBe('1080')
      expect(img.attributes('loading')).toBe(index === 0 ? 'eager' : 'lazy')
      expect(figure.get('figcaption').text()).toContain('Arjinius Client 1.3.0')
      expect(figure.get('figcaption').text()).toContain('Offline demonstration with invented')
      const fullSize = figure.get('a')
      expect(fullSize.attributes('href')).toBe(img.attributes('src'))
      expect(fullSize.text()).toMatch(/^Open .+ screenshot at full size$/)
    })
  })

  it('uses configured branding and connection details, including reactive metadata', async () => {
    wrapper = mount(MudletGuiView)
    expect(pageMetadata()?.title).toBe('Mudlet GUI | Duris')
    expect(pageMetadata()?.meta).toContainEqual({
      name: 'description',
      content:
        'Explore the Duris Mudlet GUI: maps, group status, organized chat, and character details around your game console. See screenshots and install the client package.',
    })
    site.siteTitle.value = 'Configured World'
    site.mudHost.value = 'configured.example.test'
    site.mudPort.value = '4321'
    await flushPromises()
    expect(wrapper.text()).toContain('Explore Configured World')
    expect(wrapper.text()).toContain('Open your Configured World profile.')
    expect(wrapper.text()).toContain('Host: configured.example.test · Plaintext port: 4321')
    expect(wrapper.text()).not.toContain('TLS port')
    expect(wrapper.text()).not.toContain('mud.example.test')
    expect(pageMetadata()?.title).toBe('Mudlet GUI | Configured World')
  })

  it('labels the configured TLS port and removes it when TLS is no longer configured', async () => {
    site.mudPortTls.value = '5432'
    wrapper = mount(MudletGuiView)
    const setup = wrapper.get('section[aria-labelledby="installation-heading"]')
    expect(setup.text()).toContain('Host: mud.example.test')
    expect(setup.text()).toContain('TLS port (encrypted): 5432')
    expect(setup.text()).toContain('Plaintext port: 1234')

    site.mudPortTls.value = '6543'
    await flushPromises()
    expect(setup.text()).toContain('TLS port (encrypted): 6543')
    expect(setup.text()).not.toContain('5432')

    site.mudPortTls.value = ''
    await flushPromises()
    expect(setup.text()).not.toContain('TLS port')
    expect(setup.text()).not.toContain('6543')
    expect(setup.text()).toContain('Plaintext port: 1234')
  })

  it('shows loading and unavailable states without inventing a title or connection address', async () => {
    site.isLoading.value = true
    site.isAvailable.value = false
    site.siteTitle.value = ''
    site.mudHost.value = ''
    site.mudPort.value = ''
    site.mudPortTls.value = '5432'
    wrapper = mount(MudletGuiView)
    expect(wrapper.get('[role="status"]').text()).toBe('Loading site information…')
    expect(wrapper.find('figure').exists()).toBe(false)
    site.isLoading.value = false
    site.error.value = 'The website is temporarily unavailable. Please try again shortly.'
    await flushPromises()
    expect(wrapper.get('[role="alert"]').text()).toBe(site.error.value)
    expect(wrapper.find('header').exists()).toBe(false)
    expect(wrapper.text()).not.toContain('Host:')
    expect(wrapper.text()).not.toContain('TLS port')
    expect(wrapper.text()).not.toContain('5432')
    expect(wrapper.text()).not.toContain('Duris')
    expect(pageMetadata()?.title).toBe('Site unavailable')
  })
})
