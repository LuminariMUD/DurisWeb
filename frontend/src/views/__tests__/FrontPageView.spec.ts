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

/** Stands in for the browser observer so a test can decide what has scrolled into view. */
class FakeIntersectionObserver {
  static instances: FakeIntersectionObserver[] = []
  observed = new Set<Element>()
  constructor(private readonly callback: IntersectionObserverCallback) {
    FakeIntersectionObserver.instances.push(this)
  }
  observe(element: Element) {
    this.observed.add(element)
  }
  unobserve(element: Element) {
    this.observed.delete(element)
  }
  disconnect() {
    this.observed.clear()
  }
  static watching(target: Element) {
    return FakeIntersectionObserver.instances.filter((observer) => observer.observed.has(target))
  }
  static report(target: Element, isIntersecting: boolean) {
    for (const observer of FakeIntersectionObserver.watching(target)) {
      observer.callback(
        [{ target, isIntersecting } as IntersectionObserverEntry],
        observer as unknown as IntersectionObserver,
      )
    }
  }
}

/** jsdom has no PointerEvent; the handlers only read the type and the client position. */
function pointerEvent(type: string, pointerType: string, clientX = 0, clientY = 0) {
  const event = new MouseEvent(type, { clientX, clientY })
  Object.defineProperty(event, 'pointerType', { value: pointerType })
  return event
}

let wrapper: ReturnType<typeof mount>
beforeEach(() => {
  FakeIntersectionObserver.instances = []
  site.frontPageHeroEnabled.value = true
  site.frontPageHeroTitle.value = 'Welcome to DurisMUD'
  site.frontPageHeroSubtitle.value = 'The Premier PvP MUD Since 1994'
  site.frontPageHeroImageUrl.value = ''
  site.frontPageContent.value = ''
  site.isLoading.value = false
  site.isAvailable.value = true
  site.error.value = null
})
afterEach(() => {
  wrapper?.unmount()
  vi.unstubAllGlobals()
})

describe('Duris homepage', () => {
  it('replaces the stock welcome and keeps play, news and discovery paths accessible', () => {
    site.frontPageContent.value =
      '<p>Welcome to the official DurisMUD website. Edit this content in Web Settings.</p>'
    wrapper = mount(FrontPageView)
    expect(wrapper.find('h1').text().replace(/\s+/g, ' ')).toBe('A world written in blood.')
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
  it('registers the corona to the default artwork and gives custom art atmosphere only', () => {
    wrapper = mount(FrontPageView)
    expect(wrapper.find('.hero-scene .corona').exists()).toBe(true)
    expect(wrapper.find('.hero-scene--custom').exists()).toBe(false)
    expect(wrapper.get('.hero-stage').attributes('aria-hidden')).toBe('true')
    wrapper.unmount()

    site.frontPageHeroImageUrl.value = '/custom-art.webp'
    wrapper = mount(FrontPageView)
    expect(wrapper.find('.corona').exists()).toBe(false)
    expect(wrapper.find('.hero-scene--custom').exists()).toBe(true)
    expect(wrapper.findAll('.mist')).toHaveLength(2)
    expect(wrapper.findAll('.ember').length).toBeGreaterThan(0)
  })
  it('leans the scene away from a mouse, and settles when it leaves or motion is paused', async () => {
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      callback(0)
      return 0
    })
    wrapper = mount(FrontPageView)
    const hero = wrapper.get('.hero').element as HTMLElement
    vi.spyOn(hero, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 100, 1000, 500))

    hero.dispatchEvent(pointerEvent('pointermove', 'touch', 1000, 100))
    expect(hero.style.getPropertyValue('--px')).toBe('')

    hero.dispatchEvent(pointerEvent('pointermove', 'mouse', 1000, 100))
    expect(hero.style.getPropertyValue('--px')).toBe('1.000')
    expect(hero.style.getPropertyValue('--py')).toBe('-1.000')

    hero.dispatchEvent(pointerEvent('pointerleave', 'mouse'))
    expect(hero.style.getPropertyValue('--px')).toBe('0.000')

    await wrapper.get('.motion-control').trigger('click')
    hero.dispatchEvent(pointerEvent('pointermove', 'mouse', 1000, 100))
    expect(hero.style.getPropertyValue('--px')).toBe('0.000')
  })
  it('leaves every section visible when the browser cannot observe scrolling', () => {
    wrapper = mount(FrontPageView)
    expect(wrapper.find('[data-reveal]').exists()).toBe(false)
  })
  it('reveals sections once as they scroll into view and rests the hero when it leaves', async () => {
    vi.stubGlobal('IntersectionObserver', FakeIntersectionObserver)
    wrapper = mount(FrontPageView)
    await flushPromises()
    const pathway = wrapper.get('.pathway')
    expect(wrapper.findAll('[data-reveal="pending"]')).toHaveLength(8)

    FakeIntersectionObserver.report(pathway.element, false)
    expect(pathway.attributes('data-reveal')).toBe('pending')
    FakeIntersectionObserver.report(pathway.element, true)
    expect(pathway.attributes('data-reveal')).toBe('shown')
    expect(wrapper.findAll('[data-reveal="pending"]')).toHaveLength(7)
    // Revealed once: scrolling away and back does not replay it.
    expect(FakeIntersectionObserver.watching(pathway.element)).toHaveLength(0)

    const hero = wrapper.get('.hero')
    expect(hero.classes()).not.toContain('hero--offstage')
    FakeIntersectionObserver.report(hero.element, false)
    await flushPromises()
    expect(hero.classes()).toContain('hero--offstage')
    FakeIntersectionObserver.report(hero.element, true)
    await flushPromises()
    expect(hero.classes()).not.toContain('hero--offstage')
  })
  it('keeps configuration failures explicit', () => {
    site.isAvailable.value = false
    site.error.value = 'Site configuration is unavailable.'
    wrapper = mount(FrontPageView)
    expect(wrapper.get('[role="alert"]').text()).toBe(site.error.value)
    expect(wrapper.find('.hero').exists()).toBe(false)
  })
})
