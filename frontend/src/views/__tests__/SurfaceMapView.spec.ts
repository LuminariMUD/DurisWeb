import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import L from 'leaflet'
import snapshot from '../../../public/surface-map/data.json'
import SurfaceMapView from '../SurfaceMapView.vue'

vi.mock('@/config/environment', () => ({ frontendConfiguration: { baseUrl: '/duris/' } }))

let wrapper: VueWrapper | undefined
let map: L.Map
let width = 1200
let height = 800
let resize: () => void
const originalMap = L.map
const original3d = L.Browser.any3d
const disconnect = vi.fn()
const request = vi.fn<typeof fetch>()

async function render() {
  wrapper = mount(SurfaceMapView, { attachTo: document.body })
  await flushPromises()
  return wrapper
}

function button(text: string) {
  return wrapper!.findAll('button').find((item) => item.text() === text)!
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.clearAllMocks()
  width = 1200
  height = 800
  Object.defineProperty(L.Browser, 'any3d', { configurable: true, value: true })
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockImplementation(() => width)
  vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockImplementation(() => height)
  vi.stubGlobal(
    'ResizeObserver',
    class {
      constructor(callback: () => void) {
        resize = callback
      }
      observe() {}
      disconnect = disconnect
    },
  )
  vi.spyOn(L, 'map').mockImplementation((...args) => {
    map = originalMap(...args)
    return map
  })
  request.mockReset().mockResolvedValue(new Response(JSON.stringify(snapshot)))
  vi.stubGlobal('fetch', request)
})

afterEach(() => {
  wrapper?.unmount()
  wrapper = undefined
  document.body.innerHTML = ''
  Object.defineProperty(L.Browser, 'any3d', { configurable: true, value: original3d })
  vi.clearAllTimers()
  vi.useRealTimers()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('hosted surface map', () => {
  it('loads the complete snapshot and every asset under the configured deployment prefix', async () => {
    const view = await render()
    expect(request).toHaveBeenCalledWith('/duris/surface-map/data.json', expect.any(Object))
    expect(view.text()).toContain('267 zones listed')
    expect(view.find('[role="alert"]').exists()).toBe(false)
    expect(view.get('.leaflet-image-layer').attributes('src')).toBe(
      '/duris/surface-map/20261028_Duris_Surface_Map1600x1600.wld.png',
    )
    const markers = view.findAll('img.leaflet-marker-icon')
    expect(markers).toHaveLength(27)
    expect(
      markers.filter((marker) => marker.attributes('src') === '/duris/surface-map/dragon.png'),
    ).toHaveLength(16)
    expect(
      markers.filter((marker) => marker.attributes('src') === '/duris/surface-map/helm.png'),
    ).toHaveLength(11)
    for (const marker of markers) {
      expect(marker.attributes('alt')).toMatch(/^(Fly to: |Ferry: ).+/)
      expect(marker.attributes('title')).toBe(marker.attributes('alt'))
      expect(marker.attributes('alt')).not.toContain('<br>')
    }
    expect(view.get('.surface-zone-label').attributes('tabindex')).toBeUndefined()
  })

  it('shows labels at a reachable phone zoom and preserves the visibility control', async () => {
    width = 390
    height = 420
    const view = await render()
    const label = () => view.get<HTMLElement>('.surface-zone-label').element
    expect(label().style.display).toBe('none')
    map.setZoom(map.getMaxZoom(), { animate: false })
    expect(label().style.display).toBe('block')
    await view.get('input[type="checkbox"]').setValue(false)
    expect(view.find('.surface-zone-label').exists()).toBe(false)
    await view.get('input[type="checkbox"]').setValue(true)
    expect(label().style.display).toBe('block')
  })

  it('recomputes unconstrained zoom limits and lets Reset fit after extreme resizes both ways', async () => {
    width = 2400
    height = 2000
    await render()
    const desktopMaximum = map.getMaxZoom()
    width = 240
    height = 200
    resize()
    await button('Reset view').trigger('click')
    expect(map.getZoom()).toBe(-3)
    expect(map.getMinZoom()).toBe(-5)
    expect(map.getMaxZoom()).toBe(-1)
    expect(
      map.getBounds().contains(
        L.latLngBounds([
          [0, 0],
          [1600, 1600],
        ]),
      ),
    ).toBe(true)
    width = 2400
    height = 2000
    resize()
    await button('Reset view').trigger('click')
    expect(map.getMaxZoom()).toBe(desktopMaximum)
    expect(map.getZoom()).toBe(0.25)
  })

  it('uses the same room lookup for the keyboard action and pointer clicks', async () => {
    const view = await render()
    map.setView([1596, 0], map.getMaxZoom(), { animate: false })
    await button('Look up center room').trigger('click')
    expect(view.get('.leaflet-popup-content').text()).toContain('World VNUM: 500000')
    map.fire('click', { latlng: L.latLng(0, 1596) })
    await vi.advanceTimersByTimeAsync(250)
    expect(view.get('.leaflet-popup-content').text()).toContain('World VNUM: 659999')
    map.closePopup()
    await vi.advanceTimersByTimeAsync(250)
    map.fire('click', { latlng: L.latLng(-1, 1596) })
    expect(view.find('.leaflet-popup-content').exists()).toBe(false)
  })

  it.each([
    null,
    { ...snapshot, zones: undefined },
    { ...snapshot, zones: {} },
    { ...snapshot, zones: [{ vnum: 500000, name: null }] },
    { ...snapshot, zones: [{ vnum: 500000.5, name: 'Fraction' }] },
    { ...snapshot, zones: [{ vnum: 660000, name: 'Outside map' }] },
    { ...snapshot, zones: [null] },
    { ...snapshot, dragonRoutes: null },
    { ...snapshot, dragonRoutes: [{ start: '500000', name: 'Wrong type' }] },
    { ...snapshot, ferryRoutes: [{ start: 499999, name: 'Outside map' }] },
    { ...snapshot, ferryRoutes: [{ start: 500000, name: ' ' }] },
  ])(
    'rejects malformed data atomically and recovers with a fresh request (case %#)',
    async (payload) => {
      request.mockResolvedValueOnce(new Response(JSON.stringify(payload)))
      const view = await render()
      expect(view.get('[role="alert"]').text()).toContain('could not be loaded')
      await view.get('input[type="search"]').setValue('Dark')
      expect(view.text()).toContain('0 zones listed')
      expect(view.find('.leaflet-marker-icon').exists()).toBe(false)
      await button('Retry map data').trigger('click')
      await flushPromises()
      expect(request).toHaveBeenCalledTimes(2)
      expect(view.find('[role="alert"]').exists()).toBe(false)
      expect(view.findAll('img.leaflet-marker-icon')).toHaveLength(27)
      await view.get('input[type="search"]').setValue('')
      expect(view.text()).toContain('267 zones listed')
    },
  )

  it.each(['http', 'network'])(
    'allows an explicit retry after a transient %s failure',
    async (failure) => {
      if (failure === 'http') request.mockResolvedValueOnce(new Response('', { status: 503 }))
      else request.mockRejectedValueOnce(new TypeError('Failed to fetch'))
      const view = await render()
      expect(view.get('[role="alert"]').text()).toContain('could not be loaded')
      await button('Retry map data').trigger('click')
      await flushPromises()
      expect(view.text()).toContain('267 zones listed')
      expect(request).toHaveBeenCalledTimes(2)
      expect(view.findAll('img.leaflet-marker-icon')).toHaveLength(27)
    },
  )

  it('aborts pending data and disconnects resizing on unmount', async () => {
    let complete!: (response: Response) => void
    request.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          complete = resolve
        }),
    )
    await render()
    const signal = request.mock.calls[0]![1]!.signal!
    wrapper!.unmount()
    wrapper = undefined
    expect(signal.aborted).toBe(true)
    expect(disconnect).toHaveBeenCalledOnce()
    complete(new Response(JSON.stringify(snapshot)))
    await flushPromises()
    expect(document.querySelector('.leaflet-marker-icon')).toBeNull()
  })
})
