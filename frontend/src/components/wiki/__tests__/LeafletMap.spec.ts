import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import L from 'leaflet'
import LeafletMap from '../LeafletMap.vue'
import { wikiApi } from '@/services/api'
import type { WikiZoneEntrance } from '@/types'

vi.mock('@/services/api', () => ({ wikiApi: { getZoneEntrances: vi.fn() } }))
const bounds = { minX: 0, maxX: 399, minY: 0, maxY: 399 }
function entrance(id = 1, overrides: Partial<WikiZoneEntrance> = {}): WikiZoneEntrance {
  return {
    id,
    x: 190,
    y: 190,
    fromRoomVnum: 100 + id,
    toRoomVnum: 200 + id,
    toZoneNumber: id,
    toZoneName: `Destination ${id}`,
    direction: 'north',
    ...overrides,
  }
}
let wrapper: VueWrapper | undefined
let map: L.Map
let fine = true
const originalMap = L.map
const original3d = L.Browser.any3d
const disconnect = vi.fn()
const removeListener = vi.fn()
const settle = async () => {
  await flushPromises()
  await vi.advanceTimersByTimeAsync(150)
  await flushPromises()
}
async function render(props: Record<string, unknown> = {}) {
  wrapper = mount(LeafletMap, { props: { bounds, ...props }, attachTo: document.body })
  await settle()
  return wrapper
}
async function zoom(value: number) {
  map.setZoom(value, { animate: false })
  await settle()
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.clearAllMocks()
  Object.defineProperty(L.Browser, 'any3d', { configurable: true, value: true })
  fine = true
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      disconnect = disconnect
    },
  )
  vi.stubGlobal(
    'matchMedia',
    vi.fn((query: string) => ({
      matches: query.includes('pointer') ? fine : true,
      addEventListener: vi.fn(),
      removeEventListener: removeListener,
    })),
  )
  Object.defineProperty(HTMLElement.prototype, 'clientWidth', {
    configurable: true,
    get: () => 800,
  })
  Object.defineProperty(HTMLElement.prototype, 'clientHeight', {
    configurable: true,
    get: () => 600,
  })
  vi.spyOn(L, 'map').mockImplementation((...args) => {
    map = originalMap(...args)
    return map
  })
  vi.mocked(wikiApi.getZoneEntrances).mockResolvedValue([entrance()])
})
afterEach(() => {
  wrapper?.unmount()
  wrapper = undefined
  document.body.innerHTML = ''
  vi.clearAllTimers()
  vi.useRealTimers()
  Object.defineProperty(L.Browser, 'any3d', { configurable: true, value: original3d })
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('wiki entrance visibility and navigation', () => {
  it.each([
    [true, true],
    [true, false],
    [false, true],
    [false, false],
  ])(
    'preserves markers=%s names=%s through zoom, resize and layer changes',
    async (markers, names) => {
      await render({ initialShowMarkers: markers, initialShowZoneNames: names, hideControls: true })
      for (const level of [2.9, 3, 3.9, 4]) {
        await zoom(level)
        map.fire('resize')
        await settle()
        expect(document.querySelectorAll('.zone-dot').length).toBe(markers ? 1 : 0)
        expect(document.querySelectorAll('.zone-name').length).toBe(
          names && (!markers || level >= 3) ? 1 : 0,
        )
        expect(document.querySelectorAll('.leaflet-marker-icon').length).toBe(
          markers || names ? 1 : 0,
        )
      }
      await wrapper!.setProps({ layer: -1 })
      await settle()
      await zoom(3)
      expect(document.querySelectorAll('.zone-name').length).toBe(names ? 1 : 0)
      expect(document.querySelectorAll('input').length).toBe(0)
      expect(vi.mocked(wikiApi.getZoneEntrances).mock.calls.length > 0).toBe(markers || names)
    },
  )

  it('discloses overview names on keyboard focus and keeps names on touch', async () => {
    await render()
    await zoom(2.9)
    const marker = document.querySelector<HTMLElement>('.leaflet-marker-icon')!
    expect(document.querySelector('.zone-name')).toBeNull()
    marker.dispatchEvent(new FocusEvent('focus'))
    expect(document.querySelector('.zone-name')?.textContent).toBe('Destination 1')
    marker.dispatchEvent(new FocusEvent('blur'))
    wrapper!.unmount()
    wrapper = undefined
    fine = false
    await render()
    await zoom(2.9)
    expect(document.querySelector('.zone-name')?.textContent).toBe('Destination 1')
  })

  it('keeps visible names navigable when dots are off, with literal complete names', async () => {
    const text = '<img src=x onerror=alert(1)> ' + 'A'.repeat(100)
    vi.mocked(wikiApi.getZoneEntrances).mockResolvedValue([entrance(7, { toZoneName: text })])
    await render({ initialShowMarkers: false })
    expect(document.querySelector('.zone-name')?.textContent).toBe(text)
    expect(document.querySelector('.zone-name img')).toBeNull()
    document.querySelector<HTMLElement>('.zone-entrance-name')!.click()
    expect(wrapper!.emitted('zoneClick')?.[0]).toEqual([7, text])
  })

  it('keeps separate entrances and exposes all co-located destinations as text', async () => {
    vi.mocked(wikiApi.getZoneEntrances).mockResolvedValue([
      entrance(1),
      entrance(2, { toZoneName: '<b>Second</b>' }),
      entrance(3, { toZoneNumber: 1 }),
      entrance(4, { x: 200, toZoneNumber: 1 }),
    ])
    await render()
    await zoom(3)
    expect(document.querySelectorAll('.leaflet-marker-icon')).toHaveLength(2)
    document.querySelector<HTMLElement>('[aria-label="2 destinations"]')!.click()
    expect(document.querySelectorAll('.zone-popup button')).toHaveLength(2)
    expect(document.querySelector('.zone-popup b')).toBeNull()
    const button = [...document.querySelectorAll<HTMLButtonElement>('.zone-popup button')][1]!
    expect(button.textContent).toBe('<b>Second</b>')
    button.click()
    expect(wrapper!.emitted('zoneClick')?.[0]).toEqual([2, '<b>Second</b>'])
  })

  it('keeps the destination chooser and focus through its automatic pan refresh', async () => {
    vi.mocked(wikiApi.getZoneEntrances).mockResolvedValue([entrance(1), entrance(2)])
    await render()
    document.querySelector<HTMLElement>('[aria-label="2 destinations"]')!.click()
    document.querySelectorAll<HTMLButtonElement>('.zone-popup button')[1]!.focus()
    map.fire('moveend')
    await settle()
    expect(document.querySelectorAll('.zone-popup button')).toHaveLength(2)
    expect(document.activeElement?.textContent).toBe('Destination 2')
  })

  it('renders markup in hover tooltips literally and routes normal markers', async () => {
    vi.mocked(wikiApi.getZoneEntrances).mockResolvedValue([
      entrance(5, { toZoneName: '<svg>Long name</svg>' }),
    ])
    await render()
    await zoom(3)
    expect(document.querySelector('.zone-label')?.textContent).toBe('<svg>Long name</svg>')
    expect(document.querySelector('.zone-label svg')).toBeNull()
    document.querySelector<HTMLElement>('.leaflet-marker-icon')!.click()
    expect(wrapper!.emitted('zoneClick')?.[0]).toEqual([5, '<svg>Long name</svg>'])
  })

  it('rejects slow earlier layer responses and cannot restore disabled entrances', async () => {
    let resolveOld!: (rows: WikiZoneEntrance[]) => void
    vi.mocked(wikiApi.getZoneEntrances).mockImplementation((_bounds, layer) =>
      layer === 0
        ? new Promise((resolve) => {
            resolveOld = resolve
          })
        : Promise.resolve([entrance(2)]),
    )
    await render()
    await wrapper!.setProps({ layer: -1 })
    await settle()
    resolveOld([entrance(99)])
    await settle()
    expect(document.querySelector('[aria-label="Destination 99"]')).toBeNull()
    expect(document.querySelector('[aria-label="Destination 2"]')).not.toBeNull()
    await wrapper!.findAll('input')[0]!.setValue(false)
    await wrapper!.findAll('input')[1]!.setValue(false)
    await settle()
    await zoom(3)
    expect(document.querySelectorAll('.leaflet-marker-icon')).toHaveLength(0)
  })

  it.each(['hidden', 'unmounted'])(
    'ignores a delayed entrance response after the map is %s',
    async (state) => {
      let finish!: (rows: WikiZoneEntrance[]) => void
      vi.mocked(wikiApi.getZoneEntrances).mockReturnValue(
        new Promise((resolve) => {
          finish = resolve
        }),
      )
      await render()
      if (state === 'hidden') {
        await wrapper!.findAll('input')[0]!.setValue(false)
        await wrapper!.findAll('input')[1]!.setValue(false)
      } else {
        wrapper!.unmount()
        wrapper = undefined
      }
      finish([entrance(99)])
      await settle()
      expect(
        document.querySelectorAll('.leaflet-marker-icon, .zone-name, .zone-popup'),
      ).toHaveLength(0)
    },
  )

  it.each([true, false])(
    'preserves entrance keyboard focus through a viewport refresh with markers=%s',
    async (markers) => {
      await render({ initialShowMarkers: markers })
      document.querySelector<HTMLElement>('.leaflet-marker-icon')!.focus()
      map.fire('moveend')
      await settle()
      expect(document.activeElement?.getAttribute('aria-label')).toBe('Destination 1')
    },
  )

  it('does not duplicate overlays after rapid moves and cancels pending work on unmount', async () => {
    await render()
    await zoom(3)
    map.fire('moveend')
    map.fire('moveend')
    await settle()
    expect(document.querySelectorAll('.zone-label')).toHaveLength(1)
    map.fire('moveend')
    wrapper!.unmount()
    wrapper = undefined
    const calls = vi.mocked(wikiApi.getZoneEntrances).mock.calls.length
    await settle()
    expect(wikiApi.getZoneEntrances).toHaveBeenCalledTimes(calls)
    expect(disconnect).toHaveBeenCalled()
    expect(removeListener).toHaveBeenCalled()
  })
})
