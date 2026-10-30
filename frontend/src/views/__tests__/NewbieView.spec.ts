import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import { mount } from '@vue/test-utils'

vi.mock('@unhead/vue', () => ({ useHead: vi.fn() }))
vi.mock('@/composables/useSiteConfig', () => ({
  useSiteConfig: () => ({ siteTitle: ref('') }),
}))
vi.mock('vue-router', () => ({
  RouterLink: { props: ['to'], template: '<a :href="to"><slot /></a>' },
}))

import NewbieView from '../NewbieView.vue'

let wrapper: ReturnType<typeof mount>
const scrollIntoView = vi.fn()

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({ matches: false }))
  Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
    configurable: true,
    value: scrollIntoView,
  })
  wrapper = mount(NewbieView, { attachTo: document.body })
})

afterEach(() => {
  wrapper.unmount()
  vi.unstubAllGlobals()
})

describe('NEWBIE crash course', () => {
  it('keeps the static course and real next steps available without site configuration', () => {
    expect(wrapper.findAll('h1')).toHaveLength(1)
    expect(wrapper.get('h1').text()).toContain('Every legend')
    expect(wrapper.find('a[href="/play"]').exists()).toBe(true)
    expect(wrapper.find('a[href="/guide"]').exists()).toBe(true)
    expect(wrapper.find('a[href="/mudlet-gui"]').exists()).toBe(true)
    expect(wrapper.find('a[href="/login"]').exists()).toBe(false)
  })

  it('finds commands by explanation or category, ignoring case and outer whitespace', async () => {
    await wrapper.get('input').setValue('  TELEPORT  ')
    expect(wrapper.findAll('.reference-entry')).toHaveLength(1)
    expect(wrapper.get('.reference-entry dt code').text()).toBe('recall')
    expect(wrapper.get('[role="status"]').text()).toBe('1 command')

    await wrapper.get('input').setValue('Company')
    expect(wrapper.findAll('.reference-entry').length).toBeGreaterThan(1)
    expect(
      wrapper.findAll('.reference-entry').every((entry) => entry.text().includes('Company')),
    ).toBe(true)
  })

  it('explains an empty result and restores the full reference when cleared', async () => {
    const initialCount = wrapper.findAll('.reference-entry').length
    await wrapper.get('input').setValue('unfindable-command')
    expect(wrapper.findAll('.reference-entry')).toHaveLength(0)
    expect(wrapper.text()).toContain('No commands match')
    expect(wrapper.get('[role="status"]').text()).toBe('0 commands')
    await wrapper.get('.command-search button').trigger('click')
    expect(wrapper.get('input').element.value).toBe('')
    expect(document.activeElement).toBe(wrapper.get('input').element)
    expect(wrapper.findAll('.reference-entry')).toHaveLength(initialCount)
  })

  it('moves keyboard focus to the selected chapter in the application scroll container', async () => {
    await wrapper.get('nav a[href="#explore"]').trigger('click')
    expect(document.activeElement).toBe(wrapper.get('#explore').element)
    expect(scrollIntoView).toHaveBeenLastCalledWith({ block: 'start', behavior: 'smooth' })
  })

  it('avoids animated chapter scrolling when reduced motion is requested', async () => {
    vi.mocked(window.matchMedia).mockReturnValue({ matches: true } as MediaQueryList)
    await wrapper.get('nav a[href="#commands"]').trigger('click')
    expect(document.activeElement).toBe(wrapper.get('#commands').element)
    expect(scrollIntoView).toHaveBeenLastCalledWith({ block: 'start', behavior: 'auto' })
  })

  it('offers all three shorts without loading a player before a visitor chooses one', () => {
    expect(wrapper.findAll('#watch .short-card')).toHaveLength(3)
    expect(wrapper.find('iframe').exists()).toBe(false)
    for (const id of ['hrpmW41xkKo', 'B0z2x4ngaeo', 'BTr7aWM80ts']) {
      const link = wrapper.get(`#watch a[href="https://www.youtube.com/shorts/${id}"]`)
      expect(link.attributes('target')).toBe('_blank')
      expect(link.attributes('rel')).toBe('noopener noreferrer')
      expect(wrapper.get(`#video-play-${id}`).attributes('aria-label')).toMatch(/^Play /)
    }
  })

  it('opens the chosen player, replaces it when another short is selected, and restores focus on close', async () => {
    await wrapper.get('#video-play-B0z2x4ngaeo').trigger('click')
    expect(wrapper.findAll('iframe')).toHaveLength(1)
    expect(wrapper.get('iframe').attributes('src')).toBe(
      'https://www.youtube-nocookie.com/embed/B0z2x4ngaeo?autoplay=1&playsinline=1&rel=0',
    )
    expect(wrapper.get('iframe').attributes('title')).toBe(
      'DurisMUD - New Player Creation - Text Game',
    )
    expect(wrapper.get('iframe').attributes('referrerpolicy')).toBe(
      'strict-origin-when-cross-origin',
    )
    expect(document.activeElement).toBe(wrapper.get('iframe').element)

    await wrapper.get('#video-play-hrpmW41xkKo').trigger('click')
    expect(wrapper.findAll('iframe')).toHaveLength(1)
    expect(wrapper.get('iframe').attributes('src')).toContain('/embed/hrpmW41xkKo?')
    expect(wrapper.find('#video-play-B0z2x4ngaeo').exists()).toBe(true)
    await wrapper.get('button[aria-label="Close video: Player vs. player"]').trigger('click')
    expect(wrapper.find('iframe').exists()).toBe(false)
    expect(document.activeElement).toBe(wrapper.get('#video-play-hrpmW41xkKo').element)
  })

  it('makes the video showcase reachable through the chapter navigation', async () => {
    await wrapper.get('nav a[href="#watch"]').trigger('click')
    expect(document.activeElement).toBe(wrapper.get('#watch').element)
    expect(scrollIntoView).toHaveBeenLastCalledWith({ block: 'start', behavior: 'smooth' })
  })
})
