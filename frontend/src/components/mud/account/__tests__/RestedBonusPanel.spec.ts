import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { useMudStore } from '@/stores/mudStore'
import RestedBonusPanel from '../RestedBonusPanel.vue'

vi.mock('@/composables/useMudConnection', () => ({
  useMudConnection: () => ({ getRestedBonus: vi.fn() }),
}))

describe('rested bonus availability', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('explains the first-entry guarantee without claiming offline hours', () => {
    useMudStore().setRestedBonus({
      characters: [
        {
          name: 'Unplayed',
          availableOnFirstEntry: true,
          restedPercent: 100,
          restedHours: 0,
          maxHours: 20,
        },
      ],
    })
    const wrapper = mount(RestedBonusPanel)
    expect(wrapper.text()).toContain('Available on first entry')
    expect(wrapper.text()).toContain('begins when you first enter the game')
    expect(wrapper.text()).toContain('while playing and while logged out')
    expect(wrapper.text()).not.toContain('0 / 20 hours')
    wrapper.unmount()
  })

  it('retains the hours display for a played character', () => {
    useMudStore().setRestedBonus({
      characters: [
        {
          name: 'Played',
          availableOnFirstEntry: false,
          restedPercent: 100,
          restedHours: 20,
          maxHours: 20,
        },
      ],
    })
    const wrapper = mount(RestedBonusPanel)
    expect(wrapper.text()).toContain('20 / 20 hours')
    expect(wrapper.text()).toContain('Fully rested!')
    expect(wrapper.text()).not.toContain('Available on first entry')
    wrapper.unmount()
  })
})
