import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import type { CharacterWithStats } from '@/types'
import CharacterCard from '../CharacterCard.vue'

const character: CharacterWithStats = {
  pid: 1,
  name: 'Hero',
  race: 'Human',
  class: 'Warrior',
  spec: null,
  level: 50,
  guild: null,
  guildRank: null,
  active: true,
  money: 1234,
  balance: 2000,
  playtime: 7200,
  epics: 7,
  stats: { frags: 12, deaths: 4, fragRank: 2, kdRatio: 3, forumPosts: 3, forumThreads: 2 },
}

describe('character profile privacy', () => {
  it('renders no character details for a non-owner even if given private data', () => {
    const wrapper = mount(CharacterCard, {
      props: {
        character,
        isExpanded: true,
        isOwnProfile: false,
      },
    })

    expect(wrapper.text()).toBe('')
    expect(wrapper.html()).not.toContain('Hero')
    expect(wrapper.html()).not.toContain('Warrior')
    expect(wrapper.text()).not.toContain('Playtime:')
    expect(wrapper.text()).not.toContain('Wealth')
    expect(wrapper.text()).not.toContain('On hand:')
  })

  it('keeps the owner wealth breakdown and playtime visible', () => {
    const wrapper = mount(CharacterCard, {
      props: { character, isExpanded: true, isOwnProfile: true },
    })

    expect(wrapper.text()).toContain('Playtime: 2 hrs')
    expect(wrapper.text()).toContain('On hand: 1p 2g 3s 4c')
    expect(wrapper.text()).toContain('Bank: 2p')
  })
})
