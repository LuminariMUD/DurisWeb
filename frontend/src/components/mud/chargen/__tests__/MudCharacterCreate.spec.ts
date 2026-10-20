import { describe, expect, it, vi } from 'vitest'
import { mount, type VueWrapper } from '@vue/test-utils'
import MudCharacterCreate from '../MudCharacterCreate.vue'
import type { MudChargenMutation, MudChargenState, MudRace, MudStatMethod } from '@/types/mud'

vi.mock('../HelpModal.vue', () => ({ default: { template: '<span />' } }))
const race: MudRace = {
  id: 1,
  name: 'Human',
  ansi: 'Human',
  faction: 'good',
  classes: [{ id: 1, name: 'Warrior', ansi: 'Warrior', alignment: 'any' }],
}
const labels = {
  str: 'quite excellent',
  dex: 'very good',
  agi: 'good',
  con: 'very good',
  pow: 'good',
  int: 'good',
  wis: 'good',
  cha: 'good',
  luk: 'good',
  kar: 'good',
}
function state(
  method: MudStatMethod = 'default',
  phase: MudChargenState['phase'] = 'bonuses',
  bonusRemaining = 4,
): MudChargenState {
  return { stats: { ...labels }, method, phase, bonusRemaining }
}
function button(wrapper: VueWrapper, name: string) {
  const result = wrapper
    .findAll('button')
    .find((b) => b.text().trim() === name || (name === 'New Player' && b.text().startsWith(name)))
  if (!result) throw new Error(`Missing button ${name}: ${wrapper.text()}`)
  return result
}
function wizard(modern = true) {
  return mount(MudCharacterCreate, {
    props: {
      races: [race],
      stats: null,
      loading: false,
      error: null,
      hometowns: [],
      hasHometownChoice: false,
      nameValid: null,
      nameMessage: null,
      statMethods: modern ? ['default', 'advanced'] : [],
      bonusCount: modern ? 4 : 5,
      resetSequence: 0,
    },
  })
}
async function reachStatsChoice(wrapper: VueWrapper) {
  await button(wrapper, 'New Player').trigger('click')
  await button(wrapper, 'Next').trigger('click')
  await button(wrapper, 'Human').trigger('click')
  await button(wrapper, 'Next').trigger('click')
  await wrapper.get('#male').trigger('click')
  await button(wrapper, 'Next').trigger('click')
  // Class buttons also contain their alignment badge.
  await wrapper
    .findAll('button')
    .find((b) => b.text().startsWith('Warrior'))!
    .trigger('click')
  await button(wrapper, 'Next').trigger('click')
}

describe('stat method wizard', () => {
  it('allows Cancel while initial options are loading', async () => {
    const wrapper = wizard(false)
    await wrapper.setProps({ races: [], loading: true })
    expect(button(wrapper, 'Cancel').attributes('disabled')).toBeUndefined()
    await button(wrapper, 'Cancel').trigger('click')
    expect(wrapper.emitted('cancel')).toHaveLength(1)
    expect(wrapper.emitted('reset-chargen')).toBeUndefined()
    wrapper.unmount()
  })

  it.each<MudChargenMutation>([
    'roll_stats',
    'accept_stats',
    'add_bonus',
    'swap_stats',
    'reset_chargen',
    'create_character',
  ])('blocks Cancel during %s even when metadata cleared loading', async (pending) => {
    const wrapper = wizard()
    await wrapper.setProps({ pending, loading: false })
    expect(wrapper.get('[role="status"]').text()).toContain('Waiting for the game')
    expect(button(wrapper, 'Cancel').attributes('disabled')).toBeDefined()
    await button(wrapper, 'Cancel').trigger('click')
    expect(wrapper.emitted('cancel')).toBeUndefined()
    expect(wrapper.emitted('reset-chargen')).toBeUndefined()
    await wrapper.setProps({ pending: null, error: 'Request failed' })
    expect(wrapper.find('[role="status"]').exists()).toBe(false)
    expect(button(wrapper, 'Cancel').attributes('disabled')).toBeUndefined()
    await button(wrapper, 'Cancel').trigger('click')
    expect(wrapper.emitted('reset-chargen')).toHaveLength(1)
    expect(button(wrapper, 'Cancel').attributes('disabled')).toBeDefined()
    await wrapper.setProps({ resetSequence: 1 })
    expect(wrapper.emitted('cancel')).toHaveLength(1)
    wrapper.unmount()
  })

  it('waits for the preselected Default choice and displays four bonuses without reroll', async () => {
    const wrapper = wizard()
    await reachStatsChoice(wrapper)
    expect(wrapper.text()).toContain('Choose Your Stat Rolling System')
    expect(wrapper.get('#stat-default').attributes('aria-checked')).toBe('true')
    expect(wrapper.emitted('roll-stats')).toBeUndefined()
    await button(wrapper, 'Next').trigger('click')
    expect(wrapper.emitted('roll-stats')).toEqual([[1, 'default']])
    expect(wrapper.text()).toContain('Choose Your Stat Rolling System')
    await wrapper.setProps({ stats: state() })
    expect(wrapper.text()).toContain('Your Statistics')
    expect(wrapper.text()).not.toContain('Reroll')
    await button(wrapper, 'Next').trigger('click')
    expect(wrapper.text()).toContain('4 selections')
    expect(wrapper.text()).toContain('Karma cannot receive bonuses')
    const strength = wrapper.findAll('button').find((b) => b.text().startsWith('Str'))!
    expect(strength.attributes('disabled')).toBeUndefined()
    await strength.trigger('click')
    expect(wrapper.emitted('add-bonus')).toEqual([['str']])
    await wrapper.setProps({ loading: true })
    expect(button(wrapper, 'Next').attributes('disabled')).toBeDefined()
    await wrapper.setProps({ loading: false, error: 'Stat is already at maximum' })
    expect(wrapper.get('[role="alert"]').text()).toContain('already at maximum')
    const dex = wrapper.findAll('button').find((b) => b.text().startsWith('Dex'))!
    await dex.trigger('click')
    expect(wrapper.emitted('add-bonus')).toEqual([['str'], ['dex']])
    expect(wrapper.text()).toContain('4 remaining')
    wrapper.unmount()
  })

  it('keeps the race step pending until hometown metadata succeeds', async () => {
    const wrapper = wizard()
    await button(wrapper, 'New Player').trigger('click')
    await button(wrapper, 'Next').trigger('click')
    await button(wrapper, 'Human').trigger('click')
    await wrapper.setProps({ loading: true })
    expect(button(wrapper, 'Next').attributes('disabled')).toBeDefined()
    await wrapper.setProps({ loading: false, error: 'Hometown lookup failed' })
    expect(button(wrapper, 'Next').attributes('disabled')).toBeDefined()
    await button(wrapper, 'Human').trigger('click')
    expect(wrapper.emitted('get-hometowns')).toEqual([[1], [1]])
    await wrapper.setProps({ error: null })
    await button(wrapper, 'Next').trigger('click')
    expect(wrapper.text()).toContain('Choose Your Sex')
    wrapper.unmount()
  })

  it('rerolls only Advanced and waits for acceptance before showing bonuses', async () => {
    const wrapper = wizard()
    await reachStatsChoice(wrapper)
    await wrapper.get('#stat-advanced').trigger('click')
    await button(wrapper, 'Next').trigger('click')
    expect(wrapper.emitted('roll-stats')).toEqual([[1, 'advanced']])
    await wrapper.setProps({ stats: state('advanced', 'rolling') })
    await button(wrapper, 'Reroll').trigger('click')
    expect(wrapper.emitted('roll-stats')).toEqual([
      [1, 'advanced'],
      [1, 'advanced'],
    ])
    await button(wrapper, 'Next').trigger('click')
    expect(wrapper.emitted('accept-stats')).toHaveLength(1)
    expect(wrapper.text()).toContain('Your Statistics')
    await button(wrapper, 'Next').trigger('click')
    expect(wrapper.emitted('accept-stats')).toHaveLength(1)
    await wrapper.setProps({ error: 'Invalid stat selection response. Reconnect and try again.' })
    expect(button(wrapper, 'Cancel').attributes('disabled')).toBeUndefined()
    expect(button(wrapper, 'Next').attributes('disabled')).toBeUndefined()
    expect(wrapper.text()).toContain('Your Statistics')
    await wrapper.setProps({ error: null })
    await button(wrapper, 'Next').trigger('click')
    expect(wrapper.emitted('accept-stats')).toHaveLength(2)
    await wrapper.setProps({ stats: state('advanced', 'bonuses') })
    expect(wrapper.text()).toContain('Allocate Bonus Points')
    expect(wrapper.text()).not.toContain('Reroll')
    wrapper.unmount()
  })

  it('acknowledges reset before going Back or completing Cancel', async () => {
    const wrapper = wizard()
    await reachStatsChoice(wrapper)
    await button(wrapper, 'Next').trigger('click')
    await wrapper.setProps({ stats: state() })
    await button(wrapper, 'Next').trigger('click')
    await button(wrapper, 'Back').trigger('click')
    expect(wrapper.emitted('reset-chargen')).toHaveLength(1)
    expect(wrapper.text()).toContain('Allocate Bonus Points')
    await wrapper.setProps({ stats: null, resetSequence: 1 })
    expect(wrapper.text()).toContain('Choose Your Stat Rolling System')
    expect(wrapper.emitted('roll-stats')).toHaveLength(1)
    await button(wrapper, 'Cancel').trigger('click')
    expect(wrapper.emitted('cancel')).toBeUndefined()
    await wrapper.setProps({ error: 'Reset failed' })
    expect(wrapper.text()).toContain('Choose Your Stat Rolling System')
    expect(wrapper.emitted('cancel')).toBeUndefined()
    await button(wrapper, 'Cancel').trigger('click')
    expect(wrapper.emitted('reset-chargen')).toHaveLength(3)
    await wrapper.setProps({ resetSequence: 2 })
    expect(wrapper.emitted('cancel')).toHaveLength(1)
    wrapper.unmount()
  })

  it('shows creation failures once and keeps the review available for retry', async () => {
    const wrapper = wizard()
    await reachStatsChoice(wrapper)
    await button(wrapper, 'Next').trigger('click')
    await wrapper.setProps({ stats: state('default', 'ready', 0) })
    await button(wrapper, 'Next').trigger('click')
    await button(wrapper, 'Next').trigger('click')
    await button(wrapper, 'Next').trigger('click')
    await wrapper.get('#name').setValue('Testhero')
    await wrapper.setProps({ nameValid: true })
    await button(wrapper, 'Next').trigger('click')
    await button(wrapper, 'Create Character').trigger('click')
    await wrapper.setProps({ error: 'Name already taken' })
    expect(wrapper.findAll('[role="alert"]')).toHaveLength(1)
    expect(wrapper.get('[role="alert"]').text()).toBe('Name already taken')
    expect(wrapper.text()).toContain('Review Your Character')
    expect(button(wrapper, 'Create Character').attributes('disabled')).toBeUndefined()
    await button(wrapper, 'Create Character').trigger('click')
    expect(wrapper.emitted('create-character')).toHaveLength(2)
    wrapper.unmount()
  })

  it('preserves the older server flow without accept/reset commands', async () => {
    const wrapper = wizard(false)
    await reachStatsChoice(wrapper)
    expect(wrapper.text()).toContain('Your Statistics')
    expect(wrapper.emitted('roll-stats')).toEqual([[1]])
    expect(wrapper.text()).not.toContain('Choose Your Stat Rolling System')
    await wrapper.setProps({ stats: { stats: labels, bonusRemaining: 5 } })
    await button(wrapper, 'Reroll').trigger('click')
    await button(wrapper, 'Next').trigger('click')
    expect(wrapper.text()).toContain('5 selections')
    expect(wrapper.emitted('accept-stats')).toBeUndefined()
    await button(wrapper, 'Cancel').trigger('click')
    expect(wrapper.emitted('reset-chargen')).toBeUndefined()
    expect(wrapper.emitted('cancel')).toHaveLength(1)
    wrapper.unmount()
  })
})
