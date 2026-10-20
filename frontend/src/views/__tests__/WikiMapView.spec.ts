import { flushPromises, shallowMount, type VueWrapper } from '@vue/test-utils'
import { defineComponent } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import WikiMapView from '../wiki/WikiMapView.vue'

const wikiApi = vi.hoisted(() => ({
  getContinents: vi.fn(),
  getMapBounds: vi.fn(),
  getMapLayers: vi.fn(),
}))
const reload = vi.hoisted(() => vi.fn())
vi.mock('@/services/api', () => ({ wikiApi }))
vi.mock('vue-router', () => ({ useRouter: () => ({ push: vi.fn(), go: reload }) }))

const SlotStub = defineComponent({ template: '<div><slot /></div>' })
const ButtonStub = defineComponent({
  emits: ['click'],
  template: '<button @click="$emit(\'click\')"><slot /></button>',
})
let wrapper: VueWrapper | undefined

function render() {
  wrapper = shallowMount(WikiMapView, {
    global: {
      stubs: { Card: SlotStub, CardContent: SlotStub, Button: ButtonStub },
    },
  })
  return wrapper
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.clearAllMocks()
  wikiApi.getContinents.mockReset().mockResolvedValue([])
  wikiApi.getMapBounds.mockReset().mockResolvedValue({ minX: 0, maxX: 399, minY: 0, maxY: 399 })
  wikiApi.getMapLayers.mockReset().mockResolvedValue([{ id: 0, name: 'Surface' }])
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  wrapper?.unmount()
  wrapper = undefined
  vi.clearAllTimers()
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('world map loading recovery', () => {
  it.each(['getContinents', 'getMapBounds', 'getMapLayers'] as const)(
    'recovers when %s temporarily fails without reloading the page',
    async (method) => {
      wikiApi[method].mockRejectedValueOnce({ isAxiosError: true, response: { status: 503 } })
      const view = render()
      await flushPromises()
      await vi.runAllTimersAsync()
      await flushPromises()

      expect(view.findComponent({ name: 'LeafletMap' }).exists()).toBe(true)
      expect(wikiApi[method]).toHaveBeenCalledTimes(2)
      expect(reload).not.toHaveBeenCalled()
    },
  )

  it.each(['ERR_NETWORK', 'ECONNABORTED', 'ETIMEDOUT'])(
    'recovers from an interrupted request (%s)',
    async (code) => {
      wikiApi.getMapBounds.mockRejectedValueOnce({ isAxiosError: true, code })
      const view = render()
      await flushPromises()
      await vi.runAllTimersAsync()
      await flushPromises()

      expect(view.findComponent({ name: 'LeafletMap' }).exists()).toBe(true)
      expect(wikiApi.getMapBounds).toHaveBeenCalledTimes(2)
    },
  )

  it('bounds automatic retries and lets Retry fetch fresh data without a page reload', async () => {
    wikiApi.getContinents.mockRejectedValue({ isAxiosError: true, response: { status: 503 } })
    const view = render()
    await flushPromises()
    await vi.runAllTimersAsync()
    await flushPromises()

    expect(wikiApi.getContinents).toHaveBeenCalledTimes(3)
    expect(view.text()).toContain('The map service is temporarily unavailable')
    wikiApi.getContinents.mockResolvedValue([])
    await view.get('button').trigger('click')
    await flushPromises()

    expect(view.findComponent({ name: 'LeafletMap' }).exists()).toBe(true)
    expect(reload).not.toHaveBeenCalled()
  })

  it.each([
    [401, 'Sign in to view the map'],
    [403, 'You do not have permission to view the map'],
    [429, 'Too many map requests'],
  ])('explains HTTP %i without automatically retrying it', async (status, message) => {
    wikiApi.getMapBounds.mockRejectedValue({ isAxiosError: true, response: { status } })
    const view = render()
    await flushPromises()
    await vi.runAllTimersAsync()

    expect(view.text()).toContain(message)
    expect(wikiApi.getMapBounds).toHaveBeenCalledTimes(1)
    expect(view.findComponent({ name: 'LeafletMap' }).exists()).toBe(false)
  })

  it('does not send another request after navigating away during recovery', async () => {
    wikiApi.getContinents.mockRejectedValue({ isAxiosError: true, code: 'ERR_NETWORK' })
    render()
    await flushPromises()
    wrapper?.unmount()
    wrapper = undefined
    await vi.runAllTimersAsync()

    expect(wikiApi.getContinents).toHaveBeenCalledTimes(1)
  })
})
