import { afterEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import WorldMap from '../WorldMap.vue'

const api = vi.hoisted(() => ({
  getMapTiles: vi.fn<typeof import('@/features/wiki/api').wikiApi.getMapTiles>(),
  getZoneEntrances: vi.fn<typeof import('@/features/wiki/api').wikiApi.getZoneEntrances>(),
}))
vi.mock('@/features/wiki/api', () => ({ wikiApi: api }))
let view: VueWrapper | undefined
afterEach(() => {
  view?.unmount()
  view = undefined
  vi.restoreAllMocks()
})

describe('world map tile request contract', () => {
  it('requests adjacent non-overlapping chunks within the inclusive 10000-cell limit', async () => {
    api.getMapTiles.mockReset().mockResolvedValue([])
    api.getZoneEntrances.mockReset().mockResolvedValue([])
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null)
    view = mount(WorldMap, { props: { bounds: null } })
    await flushPromises()

    expect(api.getMapTiles.mock.calls.length).toBeGreaterThan(0)
    for (const [bounds, layer] of api.getMapTiles.mock.calls) {
      expect((bounds.maxX - bounds.minX + 1) * (bounds.maxY - bounds.minY + 1)).toBe(10000)
      expect(layer).toBe(0)
    }
    expect(api.getMapTiles.mock.calls.map(([bounds]) => [bounds.minX, bounds.maxX])).toEqual(
      expect.arrayContaining([
        [-100, -1],
        [0, 99],
      ]),
    )
    expect(api.getZoneEntrances.mock.calls).toEqual(api.getMapTiles.mock.calls)
  })
})
