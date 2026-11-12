import { afterEach, describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import LielzGuide from '@/components/mudlet/LielzGuide.vue'
import { automationToggles, commandGroups, displayHelpers } from '@/content/lielzGuide'

let wrapper: ReturnType<typeof mount>
afterEach(() => wrapper?.unmount())

const totalCommands = commandGroups.reduce((total, group) => total + group.commands.length, 0)

describe('Lielz toolkit guide', () => {
  it('links every section from its navigation', () => {
    wrapper = mount(LielzGuide)
    expect(wrapper.get('h2').text()).toBe('The Lielz toolkit, built in.')
    const links = wrapper.get('nav[aria-label="Lielz guide sections"]').findAll('a')
    expect(links.map((a) => a.text().replace(/^\d+/, ''))).toEqual([
      'Quick start',
      'Always on',
      'Automation',
      'Variables',
      'Commands',
      'Keys',
      'Loot split',
    ])
    for (const link of links) {
      const id = link.attributes('href')?.slice(1) ?? ''
      expect(wrapper.find(`section#${id}`).exists()).toBe(true)
    }
  })

  it('explains that automation starts off and how to turn each helper on', () => {
    wrapper = mount(LielzGuide)
    expect(wrapper.text()).toContain('Every automation starts off')
    for (const helper of displayHelpers) expect(wrapper.text()).toContain(helper.setting)
    const chips = wrapper.findAll('.command-chip').map((c) => c.text())
    expect(chips).toEqual(automationToggles.map((t) => `auto ${t.name} on`))
  })

  it('filters automation by kind', async () => {
    wrapper = mount(LielzGuide)
    const classButton = wrapper
      .get('[aria-label="Filter automation by kind"]')
      .findAll('button')
      .find((b) => b.text() === 'Class')
    await classButton?.trigger('click')
    expect(classButton?.attributes('aria-pressed')).toBe('true')
    expect(wrapper.findAll('.command-chip').map((c) => c.text())).toEqual([
      'auto autoRage on',
      'auto autoPlay on',
    ])
  })

  it('searches the command reference and reports an empty result', async () => {
    wrapper = mount(LielzGuide)
    const count = wrapper.get('#lielz-command-count')
    expect(count.text()).toBe(`${totalCommands} entries`)
    const input = wrapper.get('#lielz-command-search')
    await input.setValue('corpse')
    expect(Number(count.text().split(' ')[0])).toBeGreaterThan(0)
    expect(wrapper.findAll('.command-group h4').map((h) => h.text())).toContain('Corpses')
    expect(wrapper.find('nav[aria-label="Command categories"]').exists()).toBe(false)
    await input.setValue('zzzz-no-such-command')
    expect(count.text()).toBe('0 entries')
    expect(wrapper.text()).toContain('No commands match “zzzz-no-such-command”')
    await wrapper
      .findAll('button')
      .find((b) => b.text() === 'Clear search')
      ?.trigger('click')
    expect(count.text()).toBe(`${totalCommands} entries`)
  })

  it('shows the numpad and the ship hotkeys with their switch', () => {
    wrapper = mount(LielzGuide)
    expect(wrapper.findAll('.keypad-key')).toHaveLength(13)
    expect(wrapper.text()).toContain('auto shipKeys on')
    expect(wrapper.text()).toContain('Ctrl+Shift+N · E · O · W')
  })
})
