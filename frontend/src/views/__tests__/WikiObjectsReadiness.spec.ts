import fs from 'node:fs'
import path from 'node:path'

import { flushPromises, shallowMount, type VueWrapper } from '@vue/test-utils'
import { defineComponent } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import WikiObjectsView from '../wiki/WikiObjectsView.vue'

const wikiApi = vi.hoisted(() => ({
  getAffectTypes: vi.fn(),
  getObjectClasses: vi.fn(),
  getObjectRaces: vi.fn(),
  getObjects: vi.fn(),
  getObjectTypes: vi.fn(),
  getSpellEffectTypes: vi.fn(),
  getWearSlots: vi.fn(),
  searchZones: vi.fn(),
}))
const routerPush = vi.hoisted(() => vi.fn())

vi.mock('@/services/api', () => ({ wikiApi }))
vi.mock('vue-router', () => ({ useRouter: () => ({ push: routerPush }) }))
vi.mock('@vueuse/core', () => ({
  useDebounceFn: (callback: (...args: unknown[]) => unknown) => callback,
}))

interface ObjectPage {
  objects: TestObject[]
  total: number
  page: number
  limit: number
  totalPages: number
}

interface TestObject {
  vnum: number
  name: string
  type: number
  typeName: string
  level: number
  weight: number
  slots: string[]
  affects: Array<{ location: number; locationName: string; modifier: number }>
  spellEffects: string[]
  zoneNumber: number
}

interface Deferred<T> {
  promise: Promise<T>
  resolve: (value: T) => void
  reject: (reason: unknown) => void
}

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
const emptyResult: ObjectPage = { objects: [], total: 0, page: 1, limit: 20, totalPages: 0 }
const populatedResult: ObjectPage = {
  objects: [
    {
      vnum: 101,
      name: 'Test sword',
      type: 5,
      typeName: 'Weapon',
      level: 12,
      weight: 4,
      slots: ['Wield'],
      affects: [],
      spellEffects: [],
      zoneNumber: 7,
    },
  ],
  total: 1,
  page: 1,
  limit: 20,
  totalPages: 1,
}
const unavailableError = {
  response: { status: 503, data: { code: 'WIKI_OBJECT_REFERENCE_UNAVAILABLE' } },
}

async function mountWithOverlappingRequests(
  older: Deferred<ObjectPage>,
  latest: Deferred<ObjectPage>,
): Promise<VueWrapper> {
  wikiApi.getObjects.mockReturnValueOnce(older.promise).mockReturnValueOnce(latest.promise)
  const wrapper = shallowMount(WikiObjectsView, {
    global: {
      stubs: {
        Card: SlotStub,
        CardContent: SlotStub,
        Button: ButtonStub,
        Input: InputStub,
      },
    },
  })

  await vi.waitFor(() => expect(wikiApi.getObjects).toHaveBeenCalledTimes(1))
  await wrapper.find('input[placeholder="Search objects..."]').setValue('current request')
  await vi.waitFor(() => expect(wikiApi.getObjects).toHaveBeenCalledTimes(2))
  return wrapper
}

describe('Wiki Objects unavailable state', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    wikiApi.getAffectTypes.mockResolvedValue([])
    wikiApi.getObjectClasses.mockResolvedValue([])
    wikiApi.getObjectRaces.mockResolvedValue([])
    wikiApi.getObjectTypes.mockResolvedValue([])
    wikiApi.getSpellEffectTypes.mockResolvedValue([])
    wikiApi.getWearSlots.mockResolvedValue([])
    wikiApi.searchZones.mockResolvedValue({ zones: [], hasMore: false })
  })

  it('distinguishes an unpublished generation from an empty filtered result', () => {
    const view = fs.readFileSync(
      path.resolve(process.cwd(), 'src/views/wiki/WikiObjectsView.vue'),
      'utf8',
    )

    expect(view).toContain("hasApiErrorCode(e, 503, 'WIKI_OBJECT_REFERENCE_UNAVAILABLE')")
    expect(view).toContain('v-else-if="referenceUnavailable"')
    expect(view).toContain('Object reference data is temporarily unavailable.')
    expect(view).toContain('No objects found matching your criteria.')
  })

  it('loads applicable metadata and supports search, clear, and detail navigation', async () => {
    wikiApi.getObjectTypes.mockResolvedValue([{ id: 5, name: 'Weapon' }])
    wikiApi.getWearSlots.mockResolvedValue([{ id: 16, name: 'Wield' }])
    wikiApi.getObjects.mockResolvedValue(populatedResult)
    const wrapper = shallowMount(WikiObjectsView, {
      global: {
        stubs: {
          Card: SlotStub,
          CardContent: SlotStub,
          Button: ButtonStub,
          Input: InputStub,
        },
      },
    })
    await vi.waitFor(() => expect(wikiApi.getObjects).toHaveBeenCalled())
    await flushPromises()

    expect(wikiApi.getObjectTypes).toHaveBeenCalledTimes(1)
    expect(wrapper.text()).toContain('Lvl')
    expect(wrapper.text()).toContain('12')

    await wrapper.find('input[placeholder="Search objects..."]').setValue('sword')
    await vi.waitFor(() =>
      expect(wikiApi.getObjects).toHaveBeenLastCalledWith(
        expect.objectContaining({ search: 'sword' }),
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
      expect(wikiApi.getObjects).toHaveBeenLastCalledWith(
        expect.not.objectContaining({ search: expect.anything() }),
        1,
        20,
        'vnum',
        'asc',
      ),
    )

    await wrapper.find('div.cursor-pointer').trigger('click')
    expect(routerPush).toHaveBeenCalledWith('/wiki/objects/101')
    wrapper.unmount()
  })

  it('ignores an older unavailable response while the latest request is pending', async () => {
    const older = deferred<ObjectPage>()
    const latest = deferred<ObjectPage>()
    const wrapper = await mountWithOverlappingRequests(older, latest)

    older.reject(unavailableError)
    await flushPromises()

    expect(wrapper.find('.animate-spin').exists()).toBe(true)
    expect(wrapper.text()).not.toContain('Object reference data is temporarily unavailable.')

    latest.resolve(emptyResult)
    await flushPromises()

    expect(wrapper.find('.animate-spin').exists()).toBe(false)
    expect(wrapper.text()).toContain('No objects found matching your criteria.')
    expect(wrapper.text()).not.toContain('Object reference data is temporarily unavailable.')
    wrapper.unmount()
  })

  it('ignores an older success after the latest request reports unavailable data', async () => {
    const older = deferred<ObjectPage>()
    const latest = deferred<ObjectPage>()
    const wrapper = await mountWithOverlappingRequests(older, latest)

    latest.reject(unavailableError)
    await flushPromises()

    expect(wrapper.find('.animate-spin').exists()).toBe(false)
    expect(wrapper.text()).toContain('Object reference data is temporarily unavailable.')

    older.resolve({ ...emptyResult, total: 50, totalPages: 3 })
    await flushPromises()

    expect(wrapper.find('.animate-spin').exists()).toBe(false)
    expect(wrapper.text()).toContain('Object reference data is temporarily unavailable.')
    expect(wrapper.text()).not.toContain('No objects found matching your criteria.')
    wrapper.unmount()
  })
})
