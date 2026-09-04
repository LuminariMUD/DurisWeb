import { flushPromises, shallowMount, type VueWrapper } from '@vue/test-utils'
import { defineComponent } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import WikiMobDetailView from '../wiki/WikiMobDetailView.vue'
import WikiMobsView from '../wiki/WikiMobsView.vue'

const wikiApi = vi.hoisted(() => ({
  getActFlags: vi.fn(),
  getMobClasses: vi.fn(),
  getMobDetail: vi.fn(),
  getMobRaces: vi.fn(),
  getMobs: vi.fn(),
  searchZones: vi.fn(),
}))
const routerPush = vi.hoisted(() => vi.fn())

vi.mock('@/services/api', () => ({ wikiApi }))
vi.mock('vue-router', () => ({ useRouter: () => ({ push: routerPush }) }))
vi.mock('@vueuse/core', () => ({
  useDebounceFn: (callback: (...args: unknown[]) => unknown) => callback,
}))

interface MobPage {
  mobs: TestMob[]
  total: number
  page: number
  limit: number
  totalPages: number
}

interface TestMob {
  vnum: number
  name: string
  keywords: string
  level: number
  alignment: number
  mobClass: number
  classname: string
  gold: number
  exp: number
  zoneNumber: number
  zoneName: string
  species: number
  raceName: string
  actFlags: number
  flags: string[]
}

interface Deferred<T> {
  promise: Promise<T>
  resolve: (value: T) => void
  reject: (reason: unknown) => void
}

/** Create an externally controlled request for overlap-order regression tests. */
function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, resolve, reject }
}

const InputStub = defineComponent({
  inheritAttrs: false,
  props: {
    modelValue: { type: [String, Number], default: '' },
  },
  emits: ['update:modelValue'],
  template:
    '<input v-bind="$attrs" :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)" />',
})

const SlotStub = defineComponent({ template: '<div><slot /></div>' })
const ButtonStub = defineComponent({
  inheritAttrs: false,
  emits: ['click'],
  template: '<button v-bind="$attrs" @click="$emit(\'click\')"><slot /></button>',
})
const AnsiTextStub = defineComponent({
  props: { text: { type: String, required: true } },
  template: '<span>{{ text }}</span>',
})

const emptyResult: MobPage = { mobs: [], total: 0, page: 1, limit: 20, totalPages: 0 }
const populatedResult: MobPage = {
  mobs: [
    {
      vnum: 201,
      name: 'Test guardian',
      keywords: 'test guardian',
      level: 20,
      alignment: 500,
      mobClass: 1,
      classname: 'Warrior',
      gold: 25,
      exp: 1000,
      zoneNumber: 7,
      zoneName: 'Test Zone',
      species: 1,
      raceName: 'Human',
      actFlags: 1,
      flags: ['SPEC'],
    },
  ],
  total: 1,
  page: 1,
  limit: 20,
  totalPages: 1,
}
const unavailableError = {
  response: { status: 503, data: { code: 'WIKI_MOB_REFERENCE_UNAVAILABLE' } },
}

/** Mount the list with slot-preserving primitives so rendered states remain observable. */
function mountMobs(): VueWrapper {
  return shallowMount(WikiMobsView, {
    global: {
      stubs: {
        Card: SlotStub,
        CardContent: SlotStub,
        Button: ButtonStub,
        Input: InputStub,
      },
    },
  })
}

/** Start an initial list request and a newer search request without settling either. */
async function mountWithOverlappingRequests(
  older: Deferred<MobPage>,
  latest: Deferred<MobPage>,
): Promise<VueWrapper> {
  wikiApi.getMobs.mockReturnValueOnce(older.promise).mockReturnValueOnce(latest.promise)
  const wrapper = mountMobs()

  await vi.waitFor(() => expect(wikiApi.getMobs).toHaveBeenCalledTimes(1))
  await wrapper.find('input[placeholder="Search mobs..."]').setValue('current request')
  await vi.waitFor(() => expect(wikiApi.getMobs).toHaveBeenCalledTimes(2))
  return wrapper
}

describe('Wiki Mobs readiness', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    wikiApi.getActFlags.mockResolvedValue([])
    wikiApi.getMobClasses.mockResolvedValue([])
    wikiApi.getMobRaces.mockResolvedValue([])
    wikiApi.searchZones.mockResolvedValue({ zones: [], hasMore: false })
  })

  it('stops before list loading when applicable metadata reports an unpublished generation', async () => {
    wikiApi.getMobClasses.mockRejectedValueOnce(unavailableError)
    const wrapper = mountMobs()
    await flushPromises()

    expect(wikiApi.getMobs).not.toHaveBeenCalled()
    expect(wrapper.text()).toContain('Mob reference data is temporarily unavailable.')
    expect(wrapper.text()).not.toContain('No mobs found matching your criteria.')
    wrapper.unmount()
  })

  it('distinguishes an unpublished list generation from a valid empty result', async () => {
    wikiApi.getMobs.mockRejectedValueOnce(unavailableError)
    const unavailableWrapper = mountMobs()
    await flushPromises()

    expect(unavailableWrapper.text()).toContain('Mob reference data is temporarily unavailable.')
    expect(unavailableWrapper.text()).not.toContain('No mobs found matching your criteria.')
    unavailableWrapper.unmount()

    wikiApi.getMobs.mockResolvedValueOnce(emptyResult)
    const emptyWrapper = mountMobs()
    await flushPromises()

    expect(emptyWrapper.text()).toContain('No mobs found matching your criteria.')
    expect(emptyWrapper.text()).not.toContain('Mob reference data is temporarily unavailable.')
    emptyWrapper.unmount()
  })

  it('clears a previous 503 state when a later list request fails generically', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    wikiApi.getMobs.mockRejectedValueOnce(unavailableError).mockRejectedValueOnce(new Error('down'))
    const wrapper = mountMobs()
    await flushPromises()

    await wrapper.find('input[placeholder="Search mobs..."]').setValue('retry')
    await flushPromises()

    expect(wrapper.text()).toContain('Failed to load mob data. Please try again.')
    expect(wrapper.text()).not.toContain('Mob reference data is temporarily unavailable.')
    expect(consoleError).toHaveBeenCalledOnce()
    consoleError.mockRestore()
    wrapper.unmount()
  })

  it('loads applicable metadata and supports search, clear, and detail navigation', async () => {
    wikiApi.getMobClasses.mockResolvedValue([{ id: 1, name: 'Warrior' }])
    wikiApi.getMobRaces.mockResolvedValue([{ id: 1, name: 'Human' }])
    wikiApi.getActFlags.mockResolvedValue([{ id: 1, name: 'SPEC', description: 'Special' }])
    wikiApi.getMobs.mockResolvedValue(populatedResult)
    const wrapper = mountMobs()
    await flushPromises()

    expect(wikiApi.getMobClasses).toHaveBeenCalledTimes(1)
    expect(wikiApi.getMobRaces).toHaveBeenCalledTimes(1)
    expect(wikiApi.getActFlags).toHaveBeenCalledTimes(1)
    expect(wrapper.text()).toContain('Lvl')
    expect(wrapper.text()).toContain('20')

    await wrapper.find('input[placeholder="Search mobs..."]').setValue('guardian')
    await vi.waitFor(() =>
      expect(wikiApi.getMobs).toHaveBeenLastCalledWith(
        expect.objectContaining({ search: 'guardian' }),
        1,
        20,
        'vnum',
        'asc',
      ),
    )

    const clearButton = wrapper.findAll('button').find((button) => button.text().includes('Clear'))
    expect(clearButton).toBeDefined()
    await clearButton?.trigger('click')
    await vi.waitFor(() =>
      expect(wikiApi.getMobs).toHaveBeenLastCalledWith(
        expect.not.objectContaining({ search: expect.anything() }),
        1,
        20,
        'vnum',
        'asc',
      ),
    )

    await wrapper.find('div.cursor-pointer').trigger('click')
    expect(routerPush).toHaveBeenCalledWith('/wiki/mobs/7/201')
    wrapper.unmount()
  })

  it('ignores an older unavailable response while the latest request is pending', async () => {
    const older = deferred<MobPage>()
    const latest = deferred<MobPage>()
    const wrapper = await mountWithOverlappingRequests(older, latest)

    older.reject(unavailableError)
    await flushPromises()

    expect(wrapper.text()).not.toContain('Mob reference data is temporarily unavailable.')

    latest.resolve(emptyResult)
    await flushPromises()

    expect(wrapper.text()).toContain('No mobs found matching your criteria.')
    expect(wrapper.text()).not.toContain('Mob reference data is temporarily unavailable.')
    wrapper.unmount()
  })

  it('ignores an older success after the latest request reports unavailable data', async () => {
    const older = deferred<MobPage>()
    const latest = deferred<MobPage>()
    const wrapper = await mountWithOverlappingRequests(older, latest)

    latest.reject(unavailableError)
    await flushPromises()

    expect(wrapper.text()).toContain('Mob reference data is temporarily unavailable.')

    older.resolve({ ...emptyResult, total: 50, totalPages: 3 })
    await flushPromises()

    expect(wrapper.text()).toContain('Mob reference data is temporarily unavailable.')
    expect(wrapper.text()).not.toContain('No mobs found matching your criteria.')
    wrapper.unmount()
  })
})

describe('Wiki Mob detail readiness', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('ignores a stale unavailable failure after newer route details load', async () => {
    const older = deferred<
      TestMob & {
        longDesc: string
        detailedDesc: string
        hitDice: string
        damDice: string
        ac: number
        thac0: number
        zoneLocations: Array<{ zoneNumber: number; zoneName: string }>
        spawnRooms: Array<{ roomVnum: number; roomName: string }>
        equipment: []
      }
    >()
    const latest = deferred<typeof older extends Deferred<infer T> ? T : never>()
    wikiApi.getMobDetail.mockReturnValueOnce(older.promise).mockReturnValueOnce(latest.promise)
    const wrapper = shallowMount(WikiMobDetailView, {
      props: { zoneNumber: '7', vnum: '201' },
      global: {
        stubs: {
          Card: SlotStub,
          CardContent: SlotStub,
          CardHeader: SlotStub,
          CardTitle: SlotStub,
          Button: ButtonStub,
          Badge: SlotStub,
          AnsiText: AnsiTextStub,
        },
      },
    })
    await vi.waitFor(() => expect(wikiApi.getMobDetail).toHaveBeenCalledTimes(1))

    await wrapper.setProps({ vnum: '202' })
    await vi.waitFor(() => expect(wikiApi.getMobDetail).toHaveBeenCalledTimes(2))
    latest.resolve({
      ...populatedResult.mobs[0]!,
      vnum: 202,
      name: 'Current instructor',
      longDesc: 'An instructor waits here.',
      detailedDesc: 'The instructor is ready to teach.',
      hitDice: '35d8',
      damDice: '5d6',
      ac: -30,
      thac0: 0,
      zoneLocations: [{ zoneNumber: 7, zoneName: 'Test Zone' }],
      spawnRooms: [{ roomVnum: 700, roomName: 'Test Room' }],
      equipment: [],
    })
    await flushPromises()

    older.reject(unavailableError)
    await flushPromises()

    expect(wrapper.text()).toContain('Current instructor')
    expect(wrapper.text()).not.toContain('Mob reference data is temporarily unavailable.')
    wrapper.unmount()
  })
})
