import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import WikiZoneDetailView from '../WikiZoneDetailView.vue'
import { wikiApi } from '@/services/api'

vi.mock('@/services/api', () => ({
  wikiApi: { getZoneDetail: vi.fn(), getZoneMapData: vi.fn(), getZoneSpawns: vi.fn() },
}))
vi.mock('vue-router', () => ({
  useRouter: () => ({ push: vi.fn() }),
  useRoute: () => ({ query: { room: '83100' } }),
}))

const MapStub = {
  props: ['rooms', 'selectedRoomVnum'],
  emits: ['select-room'],
  template:
    '<button data-map-room @click="$emit(\'select-room\', 83101)">{{ selectedRoomVnum }}</button>',
}
let wrapper: VueWrapper | undefined

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(wikiApi.getZoneDetail).mockResolvedValue({
    number: 831,
    name: 'Alatorin',
    minLevel: 0,
    maxLevel: 0,
    difficulty: 0,
    alignment: 0,
    epicType: 0,
    roomCount: 2,
    mobCount: 0,
    objectCount: 0,
    rooms: [
      {
        vnum: 83100,
        name: 'Rise',
        sectorType: 5,
        zoneNumber: 831,
        exits: [{ direction: 'north', toRoom: 83101, hasDoor: false }],
      },
      {
        vnum: 83101,
        name: 'Turn',
        sectorType: 5,
        zoneNumber: 831,
        exits: [{ direction: 'south', toRoom: 83100, hasDoor: false }],
      },
    ],
  })
  vi.mocked(wikiApi.getZoneMapData).mockResolvedValue({ nodes: [], edges: [] })
  vi.mocked(wikiApi.getZoneSpawns).mockResolvedValue({ roomSpawns: {} })
})

afterEach(() => {
  wrapper?.unmount()
  wrapper = undefined
})

async function render() {
  wrapper = mount(WikiZoneDetailView, {
    props: { number: '831' },
    global: {
      stubs: {
        WikiZoneMap: MapStub,
        ResizablePanelGroup: { template: '<div><slot /></div>' },
        ResizablePanel: { template: '<div><slot /></div>' },
        ResizableHandle: true,
        ScrollArea: { template: '<div><slot /></div>' },
      },
    },
  })
  await flushPromises()
  return wrapper
}

describe('wiki zone room selection', () => {
  it('initializes map selection from the room query and updates it after a map click', async () => {
    const view = await render()
    expect(view.find('[data-map-room]').text()).toBe('83100')
    await view.find('[data-map-room]').trigger('click')
    expect(view.find('[data-map-room]').text()).toBe('83101')
    expect(view.text()).toContain('Turn')
  })

  it('keeps exit-button navigation, keyboard exits, and the native room list in sync with the map', async () => {
    const view = await render()
    const north = view.findAll('button').find((button) => button.text().startsWith('north'))!
    await north.trigger('click')
    expect(view.find('[data-map-room]').text()).toBe('83101')
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 's' }))
    await flushPromises()
    expect(view.find('[data-map-room]').text()).toBe('83100')
    await view
      .findAll('button')
      .find((button) => button.text().includes('Room List'))!
      .trigger('click')
    const room = view
      .findAll('button')
      .find(
        (button) =>
          button.text().includes('#83101') &&
          button.text().includes('Turn') &&
          button.attributes('type') === 'button',
      )!
    await room.trigger('click')
    expect(view.find('[data-map-room]').text()).toBe('83101')
    expect(
      view
        .findAll('button')
        .some(
          (button) =>
            button.text().includes('#83100') &&
            button.text().includes('Rise') &&
            button.classes().includes('w-full'),
        ),
    ).toBe(false)
  })
})
