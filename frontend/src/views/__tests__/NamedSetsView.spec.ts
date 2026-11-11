import { beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick, ref } from 'vue'
import { mount } from '@vue/test-utils'
import type { NamedSetReport } from '@/features/namedSets/api'

const query = {
  data: ref<NamedSetReport>(),
  isLoading: ref(false),
  isError: ref(false),
  isFetching: ref(false),
  refetch: vi.fn(),
}
vi.mock('@/composables/useNamedSets', () => ({ useNamedSets: () => query }))
import NamedSetsView from '../NamedSetsView.vue'

const REPORT: NamedSetReport = {
  notes: '  &+MNotes&n: &+W*&n <b>caster level</b> rises with pieces',
  fetchedAt: '2026-11-11T12:00:00.000Z',
  zones: [
    {
      zone: 14,
      name: 'The Goblin Warrens',
      coloredName: '&+gThe Goblin Warrens&n',
      spells: [
        { name: 'armor', pieces: 3, cooldown: null },
        { name: 'haste', pieces: 5, cooldown: null },
      ],
    },
    {
      zone: 73,
      name: 'Fire Giants Keep',
      coloredName: '&+rFire Giants Keep&n',
      spells: [{ name: 'stone skin', pieces: 6, cooldown: 'one_minute' }],
    },
    {
      zone: 87,
      name: 'Orc Stronghold',
      coloredName: 'Orc Stronghold',
      spells: [
        { name: 'haste', pieces: 4, cooldown: null },
        { name: 'conjure elemental', pieces: 6, cooldown: 'five_minutes' },
      ],
    },
    { zone: 300, name: 'Quiet Marsh', coloredName: 'Quiet Marsh', spells: [] },
  ],
}

beforeEach(() => {
  query.data.value = REPORT
  query.isLoading.value = false
  query.isError.value = false
  query.isFetching.value = false
  query.refetch.mockReset()
})

const zoneRows = (wrapper: ReturnType<typeof mount>) =>
  wrapper.findAll('tbody tr').map((row) => row.find('th').text())

describe('NamedSetsView', () => {
  it('lists every zone with spells, pieces, and labelled cooldowns', () => {
    const wrapper = mount(NamedSetsView)
    expect(zoneRows(wrapper)).toEqual([
      '#14 The Goblin Warrens',
      '#73 Fire Giants Keep',
      '#87 Orc Stronghold',
      '#300 Quiet Marsh',
    ])
    const text = wrapper.text()
    expect(text).toContain('stone skin (6) · 1 min cooldown')
    const labels = wrapper.findAll('tbody button').map((button) => button.attributes('aria-label'))
    expect(labels).toContain('stone skin, 6 pieces, 1 min cooldown')
    expect(labels).toContain('armor, 3 pieces')
    expect(text).toContain('1 min cooldown')
    expect(text).toContain('5 min cooldown')
    expect(text).toContain('Hit points only')
    expect(text).toContain('Showing 4 of 4 zones')
  })

  it('renders MUD-colored names and notes without injecting markup', () => {
    const wrapper = mount(NamedSetsView)
    expect(
      wrapper.find('tbody th span.text-green-500, tbody th span[class*="green"]').exists(),
    ).toBe(true)
    const notes = wrapper.find('details pre')
    expect(notes.text()).toContain('<b>caster level</b>')
    expect(notes.find('b').exists()).toBe(false)
  })

  it('searches by spell, zone name, and zone number', async () => {
    const wrapper = mount(NamedSetsView)
    const search = wrapper.find('#named-sets-search')
    await search.setValue('haste')
    expect(zoneRows(wrapper)).toEqual(['#14 The Goblin Warrens', '#87 Orc Stronghold'])
    await search.setValue('giants')
    expect(zoneRows(wrapper)).toEqual(['#73 Fire Giants Keep'])
    await search.setValue('#87')
    expect(zoneRows(wrapper)).toEqual(['#87 Orc Stronghold'])
    await search.setValue('8')
    expect(wrapper.text()).toContain('No zones match these filters.')
  })

  it('filters by spell from the picker or by pressing a spell, and clears', async () => {
    const wrapper = mount(NamedSetsView)
    const options = wrapper.findAll('#named-sets-spell option').map((option) => option.text())
    expect(options).toEqual([
      'All spells',
      'armor (1)',
      'conjure elemental (1)',
      'haste (2)',
      'stone skin (1)',
    ])

    await wrapper.find('#named-sets-spell').setValue('stone skin')
    expect(zoneRows(wrapper)).toEqual(['#73 Fire Giants Keep'])

    await wrapper.find('#named-sets-spell').setValue('')
    const haste = wrapper
      .findAll('tbody button')
      .find((button) => button.text().startsWith('haste'))!
    await haste.trigger('click')
    expect(zoneRows(wrapper)).toEqual(['#14 The Goblin Warrens', '#87 Orc Stronghold'])
    expect(wrapper.findAll('tbody button[aria-pressed="true"]')).toHaveLength(2)

    const clear = wrapper.findAll('button').find((button) => button.text() === 'Clear')!
    await clear.trigger('click')
    expect(zoneRows(wrapper)).toHaveLength(4)
  })

  it('explains an unavailable report and retries on request', async () => {
    query.data.value = undefined
    query.isError.value = true
    const wrapper = mount(NamedSetsView)
    const alert = wrapper.find('[role="alert"]')
    expect(alert.text()).toContain("isn't available right now")
    expect(alert.text()).toContain('namedreport')
    await alert.find('button').trigger('click')
    expect(query.refetch).toHaveBeenCalledTimes(1)
  })

  it('announces loading', async () => {
    query.data.value = undefined
    query.isLoading.value = true
    const wrapper = mount(NamedSetsView)
    await nextTick()
    expect(wrapper.find('[role="status"]').text()).toBe('Loading named sets...')
  })
})
