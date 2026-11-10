import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { useMudStore } from '../../../stores/mudStore.js'
import type { MudShipContact, MudShipInfo } from '../../../types/mud.js'
import ShipRadar from '../ShipRadar.vue'
import MudShipPanel from '../MudShipPanel.vue'

vi.mock('@/composables/useMudConnection', () => ({
  useMudConnection: () => ({ sendGameCommand: vi.fn() }),
}))
vi.mock('@/services/api', () => ({
  wikiApi: {
    getWorldMapImage: vi.fn(async () => new Blob()),
    getMapBounds: vi.fn(async () => ({ minX: 0, maxX: 199, minY: 0, maxY: 99 })),
  },
}))
vi.mock('@/utils/worldMapCache', () => ({
  getCachedWorldMap: vi.fn(async () => null),
  setCachedWorldMap: vi.fn(),
}))

// #785's west seam: the target is two cells west, in the observer's tactical frame.
const contact: MudShipContact = {
  id: 'AB',
  name: 'Seam contact',
  x: 48,
  y: 50,
  range: 2,
  bearing: 270,
  heading: 0,
  speed: 0,
  arc: 'PS',
  race: 'evil',
  status: '',
  targeting_you: true,
  you_targeting: true,
}
const info: MudShipInfo = {
  name: 'Observer',
  id: 'CD',
  captain: '',
  class: 1,
  frags: 0,
  status: '',
  maxSpeed: 100,
  contactRange: 35,
  sail: 100,
  maxSail: 100,
  crewStamina: 100,
  maxCrewStamina: 100,
  repairStock: 0,
  crewType: '',
  chiefs: { sail: '', guns: '', repair: '' },
  skills: { sail: 0, guns: 0, repair: 0 },
  skillMods: { sail: 0, guns: 0, repair: 0 },
  people: 0,
  maxPeople: 10,
  armor: { bow: [1, 1], port: [1, 1], stern: [1, 1], starboard: [1, 1] },
  internal: { bow: [1, 1], port: [1, 1], stern: [1, 1], starboard: [1, 1] },
  weapons: [],
  equipment: [],
  cargo: { current: 0, max: 0, items: [] },
}
const slot = { template: '<div><slot /></div>' }
const global = {
  stubs: {
    Card: slot,
    CardContent: slot,
    CardHeader: slot,
    ScrollArea: slot,
    ContextMenu: slot,
    ContextMenuTrigger: slot,
    ContextMenuContent: true,
    Button: { template: '<button><slot /></button>' },
    Slider: true,
  },
}

beforeEach(() => {
  setActivePinia(createPinia())
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  )
  vi.stubGlobal(
    'URL',
    class extends URL {
      static createObjectURL() {
        return 'blob:ship-test'
      }
      static revokeObjectURL() {}
    },
  )
})
afterEach(() => vi.unstubAllGlobals())

it('updates rendered range, bearing and locks from replacement snapshots, then clears', async () => {
  const store = useMudStore()
  store.setShipContacts({ heading: 0, speed: 0, contacts: [contact] })
  const wrapper = mount(MudShipPanel, { global })
  expect(wrapper.text()).toContain('2.0nm @ 270° W')
  expect(wrapper.find('[title="Targeting you!"]').exists()).toBe(true)
  store.setShipContacts({
    heading: 0,
    speed: 0,
    contacts: [
      {
        ...contact,
        range: 35,
        bearing: 0,
        targeting_you: false,
        you_targeting: false,
      },
    ],
  })
  await flushPromises()
  expect(wrapper.text()).toContain('35.0nm @ 0° N')
  expect(wrapper.find('[title="Targeting you!"]').exists()).toBe(false)
  expect(wrapper.find('[title="You are targeting"]').exists()).toBe(false)
  store.setShipContacts({ heading: 0, speed: 0, contacts: [] })
  await flushPromises()
  expect(wrapper.text()).toContain('No contacts on radar')
  store.setShipContacts(null)
  await flushPromises()
  expect(wrapper.text()).not.toContain('Seam contact')
  wrapper.unmount()
})

it('keeps seam contacts on radar without guessing unavailable map wrapping', async () => {
  const store = useMudStore()
  store.setShipContacts({ heading: 0, speed: 0, worldX: 0, worldY: 0, contacts: [contact] })
  const wrapper = mount(ShipRadar, { global })
  await flushPromises()
  expect(wrapper.text()).toContain('Seam contact')
  await wrapper.get('button[title="Switch to World Map"]').trigger('click')
  await flushPromises()
  expect(wrapper.text()).toContain('Some contacts cannot be placed on this map')
  expect(wrapper.find('[title="Seam contact [AB] (-2, 0)"]').exists()).toBe(false)
  // A normal browser does not get privileged world axes; do not reuse old axes.
  store.setShipContacts({ heading: 0, speed: 0, contacts: [contact] })
  await flushPromises()
  expect(wrapper.text()).toContain('World coordinates are unavailable')
  wrapper.unmount()
})

it.each(['disconnect', 'error', 'menu', 'reset', 'account', 'logout', 'character'])(
  'retires ship status and contacts across the %s boundary',
  (boundary) => {
    const store = useMudStore()
    store.setCharacter({
      name: 'Before',
      level: 1,
      class: 'Warrior',
      race: 'Human',
      alignment: 'good',
      guild: '',
      title: '',
    })
    store.setShipInfo(info)
    store.setShipContacts({ heading: 0, speed: 0, contacts: [contact] })
    if (boundary === 'disconnect') store.setConnectionState('disconnected')
    if (boundary === 'error') store.setConnectionState('error')
    if (boundary === 'menu') store.confirmReturnToMenu()
    if (boundary === 'reset') store.reset()
    if (boundary === 'account') store.setAccount('Next', [])
    if (boundary === 'logout') store.clearAccount()
    if (boundary === 'character') store.setCharacter({ ...store.character!, name: 'After' })
    expect(store.shipContacts).toBeNull()
    expect(store.shipInfo).toBeNull()
  },
)

it('retains current ship state when the same character receives an ordinary status refresh', () => {
  const store = useMudStore()
  store.setCharacter({
    name: 'Sailor',
    level: 1,
    class: 'Warrior',
    race: 'Human',
    alignment: 'good',
    guild: '',
    title: '',
  })
  store.setShipInfo(info)
  store.setShipContacts({ heading: 0, speed: 0, contacts: [contact] })
  store.setCharacter({ ...store.character!, level: 2 })
  expect(store.shipInfo?.name).toBe('Observer')
  expect(store.shipContacts?.contacts).toEqual([contact])
})
