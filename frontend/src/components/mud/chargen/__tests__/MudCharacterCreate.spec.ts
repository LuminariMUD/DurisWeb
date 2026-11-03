import { describe, expect, it, vi } from 'vitest'
import { mount, type VueWrapper } from '@vue/test-utils'
import MudCharacterCreate from '../MudCharacterCreate.vue'
import type {
  MudAlignment,
  MudChargenClass,
  MudChargenMutation,
  MudChargenState,
  MudRace,
  MudStatMethod,
} from '@/types/mud'

vi.mock('../HelpModal.vue', () => ({ default: { template: '<span />' } }))
const race: MudRace = {
  id: 1,
  name: 'Human',
  ansi: 'Human',
  faction: 'good',
  classes: [{ id: 1, name: 'Warrior', ansi: 'Warrior', alignment: 'good' }],
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
function wizard(modern = true, races = [race]) {
  return mount(MudCharacterCreate, {
    props: {
      races,
      stats: null,
      loading: false,
      error: null,
      hometowns: [],
      hasHometownChoice: false,
      hometownsReady: true,
      nameValid: null,
      nameMessage: null,
      statMethods: modern ? ['default', 'advanced'] : [],
      bonusCount: modern ? 4 : 5,
      resetSequence: 0,
    },
  })
}
async function reachClass(wrapper: VueWrapper) {
  await button(wrapper, 'New Player').trigger('click')
  await button(wrapper, 'Next').trigger('click')
  await button(wrapper, 'Human').trigger('click')
  await button(wrapper, 'Next').trigger('click')
  await wrapper.get('#male').trigger('click')
  await button(wrapper, 'Next').trigger('click')
}
async function reachStatsChoice(wrapper: VueWrapper) {
  await reachClass(wrapper)
  // Class buttons also contain their alignment badge.
  await wrapper
    .findAll('button')
    .find((b) => b.text().startsWith('Warrior'))!
    .trigger('click')
  await button(wrapper, 'Next').trigger('click')
}

async function reachReview(wrapper: VueWrapper) {
  await button(wrapper, 'Next').trigger('click')
  await wrapper.setProps({ stats: state('default', 'ready', 0) })
  await button(wrapper, 'Next').trigger('click')
  await button(wrapper, 'Next').trigger('click')
  await button(wrapper, 'Next').trigger('click')
  await wrapper.get('#name').setValue('Testhero')
  await wrapper.setProps({ nameValid: true })
  await button(wrapper, 'Next').trigger('click')
}

describe('race/class alignment selection', () => {
  const cells: {
    alignment: MudChargenClass['alignment']
    choices: MudAlignment[]
    name: string
  }[] = [
    { alignment: 'good', choices: ['good'], name: 'Paladin' },
    { alignment: 'neutral', choices: ['neutral'], name: 'Druid' },
    { alignment: 'evil', choices: ['evil'], name: 'Necromancer' },
    { alignment: 'any', choices: ['good', 'neutral', 'evil'], name: 'Warrior' },
    { alignment: 'good_neutral', choices: ['good', 'neutral'], name: 'Ranger' },
    { alignment: 'neutral_evil', choices: ['neutral', 'evil'], name: 'Reaver' },
  ]
  it.each(cells)(
    'offers only $alignment choices, reviews and submits the selected alignment',
    async ({ alignment, choices, name }) => {
      const wrapper = wizard(true, [{ ...race, classes: [{ id: 1, name, ansi: name, alignment }] }])
      await wrapper.setProps({ hometownsReady: false })
      await reachClass(wrapper)
      await wrapper
        .findAll('button')
        .find((b) => b.text().startsWith(name))!
        .trigger('click')
      const chosen = choices.includes('neutral') ? 'neutral' : choices[0]!
      if (choices.length > 1) {
        await button(wrapper, 'Next').trigger('click')
      }
      expect(wrapper.findAll('[role="radio"]').map((radio) => radio.attributes('id'))).toEqual(
        choices.length > 1 ? choices : [],
      )
      expect(button(wrapper, 'Next').attributes('disabled')).toBeDefined()
      if (choices.length > 1) await wrapper.get(`#${chosen}`).trigger('click')
      expect(wrapper.emitted('get-hometowns')?.at(-1)).toEqual([1, chosen])
      await wrapper.setProps({ hometownsReady: true })
      await button(wrapper, 'Next').trigger('click')
      expect(wrapper.text()).toContain('Choose Your Stat Rolling System')
      await reachReview(wrapper)
      expect(wrapper.text()).toContain('Alignment')
      expect(wrapper.text()).not.toContain('Faction')
      expect(wrapper.text()).toContain(chosen[0]!.toUpperCase() + chosen.slice(1))
      await button(wrapper, 'Create Character').trigger('click')
      expect(wrapper.emitted('create-character')?.[0]?.[0]).toMatchObject({
        race: 1,
        class: 1,
        alignment: chosen,
      })
      wrapper.unmount()
    },
  )

  it('clears a previous choice when class changes and rejects an injected incompatible choice', async () => {
    const wrapper = wizard(true, [
      {
        ...race,
        classes: [
          { id: 1, name: 'Warrior', ansi: 'Warrior', alignment: 'any' },
          { id: 2, name: 'Ranger', ansi: 'Ranger', alignment: 'good_neutral' },
        ],
      },
    ])
    await reachStatsChoice(wrapper)
    await wrapper.get('#evil').trigger('click')
    await button(wrapper, 'Back').trigger('click')
    await wrapper
      .findAll('button')
      .find((b) => b.text().startsWith('Ranger'))!
      .trigger('click')
    await button(wrapper, 'Next').trigger('click')
    expect(wrapper.find('#evil').exists()).toBe(false)
    expect(wrapper.find('[aria-checked="true"]').exists()).toBe(false)
    expect(button(wrapper, 'Next').attributes('disabled')).toBeDefined()
    // A malformed model update must not bypass the visible allowed choices.
    wrapper.findComponent({ name: 'RadioGroup' }).vm.$emit('update:modelValue', 'evil')
    await wrapper.vm.$nextTick()
    expect(button(wrapper, 'Next').attributes('disabled')).toBeDefined()
    await button(wrapper, 'Next').trigger('click')
    expect(wrapper.text()).toContain('Choose Your Alignment')
    expect(wrapper.emitted('get-hometowns')).toEqual([[1, 'evil']])
    await wrapper.get('#neutral').trigger('click')
    await button(wrapper, 'Next').trigger('click')
    await reachReview(wrapper)
    // Refreshed server options withdraw this combination while the review is open.
    await wrapper.setProps({ races: [{ ...race, classes: [] }] })
    expect(wrapper.text()).toContain('Choose Your Class')
    expect(button(wrapper, 'Next').attributes('disabled')).toBeDefined()
    expect(wrapper.emitted('create-character')).toBeUndefined()
    wrapper.unmount()
  })

  it('drops the class and alignment after changing race', async () => {
    const wrapper = wizard(true, [
      race,
      { ...race, id: 36, name: 'Firbolg', ansi: 'Firbolg', classes: [] },
    ])
    await reachStatsChoice(wrapper)
    await button(wrapper, 'Back').trigger('click')
    await button(wrapper, 'Back').trigger('click')
    await button(wrapper, 'Back').trigger('click')
    await button(wrapper, 'Firbolg').trigger('click')
    await button(wrapper, 'Next').trigger('click')
    await button(wrapper, 'Next').trigger('click')
    expect(wrapper.text()).toContain('Choose Your Class')
    expect(wrapper.text()).not.toContain('Warrior')
    expect(button(wrapper, 'Next').attributes('disabled')).toBeDefined()
    wrapper.unmount()
  })

  it('keeps invalid metadata errors visible without automatically retrying', async () => {
    const wrapper = wizard()
    await wrapper.setProps({
      races: [],
      loading: false,
      error: 'Invalid character creation options. Reconnect and try again.',
    })
    expect(wrapper.get('[role="alert"]').text()).toContain('Invalid character creation options')
    expect(wrapper.emitted('request-options')).toBeUndefined()
    wrapper.unmount()
  })

  it('does not repeat options requests when the server has no available races', async () => {
    const wrapper = wizard(true, [])
    expect(wrapper.emitted('request-options')).toHaveLength(1)
    await wrapper.setProps({ races: [], loading: false })
    expect(wrapper.emitted('request-options')).toHaveLength(1)
    expect(wrapper.get('[role="alert"]').text()).toContain('No races are available')
    wrapper.unmount()
  })

  it('returns to the class step when refreshed metadata removes the alignment step', async () => {
    const wrapper = wizard(true, [
      { ...race, classes: [{ ...race.classes[0]!, alignment: 'any' }] },
    ])
    await reachStatsChoice(wrapper)
    expect(wrapper.text()).toContain('Choose Your Alignment')
    await wrapper.setProps({
      races: [{ ...race, classes: [{ ...race.classes[0]!, alignment: 'evil' }] }],
    })
    expect(wrapper.text()).toContain('Choose Your Class')
    expect(wrapper.text()).not.toContain('Step 0')
    expect(wrapper.emitted('get-hometowns')).toEqual([[1, 'evil']])
    await button(wrapper, 'Next').trigger('click')
    expect(wrapper.text()).toContain('Choose Your Stat Rolling System')
    wrapper.unmount()
  })

  it('reuses accepted stats after refreshed alignment choices require a new selection', async () => {
    const wrapper = wizard(true, [
      { ...race, classes: [{ ...race.classes[0]!, alignment: 'any' }] },
    ])
    await reachStatsChoice(wrapper)
    await wrapper.get('#good').trigger('click')
    await button(wrapper, 'Next').trigger('click')
    await reachReview(wrapper)
    await wrapper.setProps({
      races: [{ ...race, classes: [{ ...race.classes[0]!, alignment: 'neutral_evil' }] }],
    })
    expect(wrapper.text()).toContain('Choose Your Alignment')
    await wrapper.get('#neutral').trigger('click')
    await button(wrapper, 'Next').trigger('click')
    expect(wrapper.text()).toContain('Your Statistics')
    expect(wrapper.emitted('roll-stats')).toEqual([[1, 'default']])
    expect(wrapper.emitted('reset-chargen')).toBeUndefined()
    wrapper.unmount()
  })

  it('waits for a reset before rolling a new race after metadata withdraws the old race', async () => {
    const wrapper = wizard()
    await reachStatsChoice(wrapper)
    await reachReview(wrapper)
    await wrapper.setProps({ races: [{ ...race, id: 36, name: 'Firbolg', ansi: 'Firbolg' }] })
    await button(wrapper, 'Back').trigger('click')
    await button(wrapper, 'Back').trigger('click')
    await button(wrapper, 'Firbolg').trigger('click')
    expect(wrapper.emitted('reset-chargen')).toHaveLength(1)
    expect(button(wrapper, 'Next').attributes('disabled')).toBeDefined()
    await wrapper.setProps({ error: 'Reset failed' })
    expect(button(wrapper, 'Next').attributes('disabled')).toBeDefined()
    expect(wrapper.emitted('roll-stats')).toEqual([[1, 'default']])
    await button(wrapper, 'Firbolg').trigger('click')
    expect(wrapper.emitted('reset-chargen')).toHaveLength(2)
    await wrapper.setProps({ stats: null, resetSequence: 1, error: null })
    await button(wrapper, 'Next').trigger('click')
    await button(wrapper, 'Next').trigger('click')
    await wrapper
      .findAll('button')
      .find((b) => b.text().startsWith('Warrior'))!
      .trigger('click')
    await button(wrapper, 'Next').trigger('click')
    await button(wrapper, 'Next').trigger('click')
    expect(wrapper.emitted('roll-stats')).toEqual([
      [1, 'default'],
      [36, 'default'],
    ])
    wrapper.unmount()
  })
})

describe('stat method wizard', () => {
  it('keeps Firbolg tutorial choices visible and waits for a hometown selection', async () => {
    const wrapper = wizard(true, [{ ...race, id: 36, name: 'Firbolg', ansi: 'Firbolg' }])
    await wrapper.setProps({
      hometowns: [
        { id: 11, name: 'Ugta' },
        { id: 22, name: 'Outpost of Ailvio' },
        { id: 23, name: 'Plane of Life' },
      ],
      hasHometownChoice: true,
    })
    await button(wrapper, 'New Player').trigger('click')
    await button(wrapper, 'Next').trigger('click')
    await button(wrapper, 'Firbolg').trigger('click')
    await button(wrapper, 'Next').trigger('click')
    await wrapper.get('#male').trigger('click')
    await button(wrapper, 'Next').trigger('click')
    await wrapper
      .findAll('button')
      .find((b) => b.text().startsWith('Warrior'))!
      .trigger('click')
    await button(wrapper, 'Next').trigger('click')
    expect(wrapper.text()).toContain('Choose Your Hometown')
    expect(wrapper.text()).toContain('Outpost of Ailvio')
    expect(button(wrapper, 'Next').attributes('disabled')).toBeDefined()
    await button(wrapper, 'Plane of Life').trigger('click')
    expect(button(wrapper, 'Next').attributes('disabled')).toBeUndefined()
    await wrapper.setProps({ hometowns: [], hometownsReady: false, hasHometownChoice: false })
    expect(button(wrapper, 'Next').attributes('disabled')).toBeDefined()
    await wrapper.setProps({
      hometowns: [
        { id: 11, name: 'Ugta' },
        { id: 22, name: 'Outpost of Ailvio' },
      ],
      hometownsReady: true,
      hasHometownChoice: true,
    })
    expect(button(wrapper, 'Next').attributes('disabled')).toBeDefined()
    wrapper.unmount()
  })

  it('refreshes neutral alignment choices and drops a selection after back navigation', async () => {
    const wrapper = wizard(true, [
      {
        ...race,
        id: 14,
        name: 'Thri-kreen',
        ansi: 'Thri-kreen',
        faction: 'neutral',
        classes: [{ ...race.classes[0]!, alignment: 'any' }],
      },
    ])
    await button(wrapper, 'New Player').trigger('click')
    await button(wrapper, 'Next').trigger('click')
    await wrapper.get('[id$="trigger-neutral"]').trigger('mousedown', { button: 0, ctrlKey: false })
    await button(wrapper, 'Thri-kreen').trigger('click')
    await button(wrapper, 'Next').trigger('click')
    await wrapper.get('#male').trigger('click')
    await button(wrapper, 'Next').trigger('click')
    await wrapper
      .findAll('button')
      .find((b) => b.text().startsWith('Warrior'))!
      .trigger('click')
    await button(wrapper, 'Next').trigger('click')
    await wrapper.get('#evil').trigger('click')
    expect(wrapper.emitted('get-hometowns')?.at(-1)).toEqual([14, 'evil'])
    await wrapper.setProps({ hometownsReady: false, hometowns: [], hasHometownChoice: false })
    expect(button(wrapper, 'Next').attributes('disabled')).toBeDefined()
    await button(wrapper, 'Next').trigger('click')
    expect(wrapper.text()).toContain('Choose Your Alignment')
    await wrapper.setProps({
      hometownsReady: true,
      hometowns: [
        { id: 18, name: 'Payang' },
        { id: 25, name: 'Wutvr' },
      ],
      hasHometownChoice: true,
    })
    await button(wrapper, 'Next').trigger('click')
    await button(wrapper, 'Wutvr').trigger('click')
    await button(wrapper, 'Back').trigger('click')
    await wrapper.get('#good').trigger('click')
    expect(wrapper.emitted('get-hometowns')?.at(-1)).toEqual([14, 'good'])
    await wrapper.setProps({
      hometownsReady: true,
      hometowns: [
        { id: 18, name: 'Payang' },
        { id: 22, name: 'Outpost of Ailvio' },
      ],
      hasHometownChoice: true,
    })
    await button(wrapper, 'Next').trigger('click')
    expect(wrapper.text()).not.toContain('Wutvr')
    expect(button(wrapper, 'Next').attributes('disabled')).toBeDefined()
    wrapper.unmount()
  })
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

  it('waits to request hometowns until the class supplies an alignment', async () => {
    const wrapper = wizard()
    await wrapper.setProps({ hometownsReady: false })
    await button(wrapper, 'New Player').trigger('click')
    await button(wrapper, 'Next').trigger('click')
    await button(wrapper, 'Human').trigger('click')
    expect(wrapper.emitted('get-hometowns')).toBeUndefined()
    await button(wrapper, 'Next').trigger('click')
    expect(wrapper.text()).toContain('Choose Your Sex')
    await wrapper.get('#male').trigger('click')
    await button(wrapper, 'Next').trigger('click')
    await wrapper
      .findAll('button')
      .find((b) => b.text().startsWith('Warrior'))!
      .trigger('click')
    expect(wrapper.emitted('get-hometowns')).toEqual([[1, 'good']])
    expect(button(wrapper, 'Next').attributes('disabled')).toBeDefined()
    await wrapper.setProps({ error: 'Hometown lookup failed' })
    await wrapper
      .findAll('button')
      .find((b) => b.text().startsWith('Warrior'))!
      .trigger('click')
    expect(wrapper.emitted('get-hometowns')).toEqual([
      [1, 'good'],
      [1, 'good'],
    ])
    await wrapper.setProps({ hometownsReady: true })
    expect(button(wrapper, 'Next').attributes('disabled')).toBeUndefined()
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
