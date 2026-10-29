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
    await wrapper.get('button').trigger('click')
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
})
