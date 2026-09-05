import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import { flushPromises, mount } from '@vue/test-utils'

const site = {
  siteTitle: ref('Duris'),
  frontPageHeroEnabled: ref(true),
  frontPageHeroTitle: ref('Welcome to DurisMUD'),
  frontPageHeroSubtitle: ref('The Premier PvP MUD Since 1994'),
  frontPageHeroImageUrl: ref(''),
  frontPageContent: ref(''),
  isLoading: ref(false),
  isAvailable: ref(true),
  error: ref<string | null>(null),
}
vi.mock('@/composables/useSiteConfig', () => ({ useSiteConfig: () => site }))
vi.mock('@unhead/vue', () => ({ useHead: vi.fn() }))
vi.mock('vue-router', () => ({
  RouterLink: { props: ['to'], template: '<a :href="to"><slot /></a>' },
}))
vi.mock('@/components/forum/widgets/TopFraggerDisplay.vue', () => ({
  default: { template: '<p>Top fragger widget</p>' },
}))
vi.mock('@/components/forum/widgets/RecentPvPDisplay.vue', () => ({
  default: { template: '<p>Recent battles widget</p>' },
}))
vi.mock('@/components/forum/widgets/MapPreviewDisplay.vue', () => ({
  default: { template: '<p>Map widget</p>' },
}))
vi.mock('@/components/forum/CarouselDisplay.vue', () => ({
  default: { props: ['dataImages', 'dataHeight'], template: '<p>Carousel widget</p>' },
}))
import FrontPageView from '@/views/FrontPageView.vue'

let wrapper: ReturnType<typeof mount>
beforeEach(() => {
  site.frontPageHeroEnabled.value = true
  site.frontPageHeroTitle.value = 'Welcome to DurisMUD'
  site.frontPageHeroSubtitle.value = 'The Premier PvP MUD Since 1994'
  site.frontPageHeroImageUrl.value = ''
  site.frontPageContent.value = ''
  site.isLoading.value = false
  site.isAvailable.value = true
  site.error.value = null
})
afterEach(() => wrapper?.unmount())

describe('Duris homepage', () => {
  it('replaces the stock welcome and keeps play, news and discovery paths accessible', () => {
    site.frontPageContent.value =
      '<p>Welcome to the official DurisMUD website. Edit this content in Web Settings.</p>'
    wrapper = mount(FrontPageView)
    expect(wrapper.find('h1').text()).toContain('blood.')
    expect(wrapper.text()).not.toContain('Edit this content')
    expect(wrapper.get('a[href="/news"]').text()).toBe('News & Updates')
    expect(wrapper.findAll('a[href="/play"]')).toHaveLength(2)
    for (const path of ['/wiki/map', '/pvp', '/forum']) {
      expect(wrapper.find('a[href="' + path + '"]').exists()).toBe(true)
    }
  })
  it('preserves custom hero copy, image and the visibility setting', async () => {
    site.frontPageHeroTitle.value = 'A new chapter'
    site.frontPageHeroSubtitle.value = 'The gates are open'
    site.frontPageHeroImageUrl.value = '/custom-art.webp'
    wrapper = mount(FrontPageView)
    expect(wrapper.get('h1').text()).toBe('A new chapter')
    expect(wrapper.text()).toContain('The gates are open')
    expect(wrapper.get('.hero-art').attributes('src')).toBe('/custom-art.webp')
    site.frontPageHeroEnabled.value = false
    await flushPromises()
    expect(wrapper.find('.hero').exists()).toBe(false)
    expect(wrapper.find('a[href="/play"]').exists()).toBe(true)
  })
  it('sanitizes custom content and preserves an image-only section', async () => {
    site.frontPageContent.value =
      '<img src="/story.webp" alt="Story" onerror="alert(1)"><script>alert(1)</script>'
    wrapper = mount(FrontPageView)
    await flushPromises()
    const content = wrapper.get('.editorial-content')
    expect(content.get('img').attributes('alt')).toBe('Story')
    expect(content.find('script').exists()).toBe(false)
    expect(content.get('img').attributes('onerror')).toBeUndefined()
  })
  it('mounts widget-only content after loading and replaces it on edit', async () => {
    site.isLoading.value = true
    site.frontPageContent.value =
      '<div data-type="top-fragger"></div><div data-type="recent-pvp"></div><div data-type="map-preview"></div><div data-type="carousel" data-images="[]"></div>'
    wrapper = mount(FrontPageView)
    expect(wrapper.get('[role="status"]').text()).toContain('Loading')
    site.isLoading.value = false
    await flushPromises()
    for (const text of [
      'Top fragger widget',
      'Recent battles widget',
      'Map widget',
      'Carousel widget',
    ]) {
      expect(wrapper.get('.editorial-content').text()).toContain(text)
    }
    site.frontPageContent.value = '<p>A new announcement</p>'
    await flushPromises()
    expect(wrapper.get('.editorial-content').text()).toBe('A new announcement')
  })
  it('pauses and resumes the animated artwork', async () => {
    wrapper = mount(FrontPageView)
    const button = wrapper.get('.motion-control')
    await button.trigger('click')
    expect(button.attributes('aria-pressed')).toBe('true')
    expect(wrapper.get('.duris-home').classes()).toContain('motion-paused')
    expect(button.text()).toContain('Resume motion')
    await button.trigger('click')
    expect(button.attributes('aria-pressed')).toBe('false')
  })
  it('keeps configuration failures explicit', () => {
    site.isAvailable.value = false
    site.error.value = 'Site configuration is unavailable.'
    wrapper = mount(FrontPageView)
    expect(wrapper.get('[role="alert"]').text()).toBe(site.error.value)
    expect(wrapper.find('.hero').exists()).toBe(false)
  })
})
