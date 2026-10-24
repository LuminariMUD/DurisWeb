import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises } from '@vue/test-utils'
import L from 'leaflet'
import { PaintedMapLayer, type PaintedLayerSource } from '../paintedMapLayer'
import type { PaintRequest, PaintResponse } from '@/utils/paintedMap/painter.worker'

class TestWorker {
  static instances: TestWorker[] = []
  onmessage: ((event: MessageEvent<PaintResponse>) => void) | null = null
  onerror: (() => void) | null = null
  requests: PaintRequest[] = []
  terminate = vi.fn()
  constructor() {
    TestWorker.instances.push(this)
  }
  postMessage(request: PaintRequest) {
    this.requests.push(request)
  }
  reply(error?: string, useBlob = false) {
    const request = this.requests.at(-1)!
    this.onmessage?.({
      data: {
        id: request.id,
        width: 1,
        height: 1,
        ...(useBlob ? { blob: new Blob(['tile']) } : { pixels: new ArrayBuffer(4) }),
        error,
      },
    } as MessageEvent<PaintResponse>)
  }
}

function source(layer = 0): PaintedLayerSource {
  return {
    layer,
    minX: 0,
    minY: 0,
    width: 100,
    height: 100,
    surface: layer === 0,
    sectors: new Uint8Array(10000),
    continents: null,
    ports: [],
  }
}
let map: L.Map
let painted: PaintedMapLayer
let failure: ReturnType<typeof vi.fn<() => void>>
let urlId = 0
beforeEach(() => {
  TestWorker.instances = []
  vi.stubGlobal('Worker', TestWorker)
  vi.stubGlobal('ImageData', class {})
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
    putImageData() {},
  } as unknown as CanvasRenderingContext2D)
  vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation((callback) =>
    callback(new Blob(['tile'])),
  )
  vi.stubGlobal(
    'URL',
    class extends URL {
      static createObjectURL = vi.fn(() => `blob:tile-${++urlId}`)
      static revokeObjectURL = vi.fn()
    },
  )
  const element = document.createElement('div')
  document.body.append(element)
  map = L.map(element, { crs: L.CRS.Simple, zoomAnimation: false }).setView([-50, 50], 0)
  failure = vi.fn()
  painted = new PaintedMapLayer(map, vi.fn(), failure)
})
afterEach(() => {
  painted.destroy()
  map.remove()
  document.body.innerHTML = ''
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('painted map worker lifecycle', () => {
  it('caps retained and queued detail through large-view pans', async () => {
    painted.show({ ...source(), width: 400, height: 400, sectors: new Uint8Array(160000) })
    map.setView([-200, 200], 3, { animate: false })
    const bounds = vi.spyOn(map, 'getBounds')
    const completed = new Set<number>()
    for (let pan = 0; pan < 5; pan++) {
      bounds.mockReturnValue(L.latLngBounds([-350, pan * 30], [-50, 400 + pan * 30]))
      painted.refresh()
      for (let step = 0; step < 150; step++) {
        let busy = false
        for (const worker of TestWorker.instances) {
          const id = worker.requests.at(-1)?.id
          if (id === undefined || completed.has(id)) continue
          completed.add(id)
          worker.reply()
          busy = true
        }
        await flushPromises()
        if (!busy) break
      }
      expect(map.getPane('paintedDetail')!.querySelectorAll('img').length).toBeLessThanOrEqual(64)
      expect(map.getPane('paintedDetail')!.querySelectorAll('img').length).toBeGreaterThan(0)
    }
    expect(TestWorker.instances.length).toBeLessThanOrEqual(2)
    const cache = (
      painted as unknown as { detailTiles: Map<string, unknown> }
    ).detailTiles
    expect(cache.size).toBeLessThanOrEqual(128)
    painted.destroy()
    expect(URL.revokeObjectURL).toHaveBeenCalled()
  })

  it('discards all old tiles when a fresh source replaces the same layer', async () => {
    vi.spyOn(map, 'getBounds').mockReturnValue(L.latLngBounds([-150, -50], [50, 150]))
    const initial = { ...source(), width: 2, height: 2, sectors: new Uint8Array(4) }
    painted.show(initial)
    TestWorker.instances[0]!.reply()
    await flushPromises()
    painted.show({ ...initial, sectors: new Uint8Array(4).fill(3) })
    expect(map.getPane('paintedBase')!.querySelectorAll('img')).toHaveLength(0)
    expect(URL.revokeObjectURL).toHaveBeenCalled()
    expect(TestWorker.instances.at(-2)!.requests[0]!.layer?.sectors).toEqual(
      new Uint8Array(4).fill(3).buffer,
    )
  })

  it('keeps late underground rock below cave tiles', async () => {
    vi.spyOn(map, 'getBounds').mockReturnValue(L.latLngBounds([-150, -50], [50, 150]))
    painted.show(source(-1))
    const [rock, cave] = TestWorker.instances
    cave!.reply()
    await flushPromises()
    rock!.reply()
    await flushPromises()
    expect(map.getPane('paintedBase')!.querySelectorAll('img')).toHaveLength(1)
    expect(map.getPane('paintedRock')!.querySelectorAll('img')).toHaveLength(1)
    expect(Number(map.getPane('paintedRock')!.style.zIndex)).toBeLessThan(
      Number(map.getPane('paintedBase')!.style.zIndex),
    )
  })

  it('cancels all old-layer jobs and drops prepared grids on every switch', async () => {
    for (const layer of [0, -1, -2, 0]) {
      const oldWorkers = [...TestWorker.instances]
      painted.show(source(layer))
      for (const worker of oldWorkers) expect(worker.terminate).toHaveBeenCalledOnce()
      const current = TestWorker.instances.slice(oldWorkers.length)
      expect(current.length).toBeGreaterThan(0)
      for (const worker of current)
        for (const request of worker.requests) expect(request.layerKey).toBe(`layer:${layer}`)
      await flushPromises()
    }
  })

  it('terminates a failed pool, reports fallback, and retries with fresh workers', () => {
    painted.show(source())
    const old = [...TestWorker.instances]
    old[0]!.onerror!()
    expect(failure).toHaveBeenCalledOnce()
    for (const worker of old) expect(worker.terminate).toHaveBeenCalledOnce()
    painted.show(source())
    expect(TestWorker.instances.length).toBeGreaterThan(old.length)
  })

  it('retries one tile error, then exposes permanent failure', async () => {
    vi.spyOn(map, 'getBounds').mockReturnValue(L.latLngBounds([-150, -50], [50, 150]))
    const one = { ...source(), width: 2, height: 2, sectors: new Uint8Array(4) }
    painted.show(one)
    const worker = TestWorker.instances[0]!
    worker.reply('failed')
    expect(worker.requests).toHaveLength(2)
    expect(failure).not.toHaveBeenCalled()
    worker.reply('failed again')
    await flushPromises()
    expect(failure).toHaveBeenCalledOnce()
  })

  it('recovers a transient error and revokes generated images at teardown', async () => {
    vi.spyOn(map, 'getBounds').mockReturnValue(L.latLngBounds([-150, -50], [50, 150]))
    painted.show({ ...source(), width: 2, height: 2, sectors: new Uint8Array(4) })
    const worker = TestWorker.instances[0]!
    worker.reply('failed')
    worker.reply()
    await flushPromises()
    expect(failure).not.toHaveBeenCalled()
    expect(map.getPane('paintedBase')!.querySelectorAll('img')).toHaveLength(1)
    painted.destroy()
    expect(URL.revokeObjectURL).toHaveBeenCalled()
  })

  it('only paints visible overview tiles and restores cached imagery when returning', async () => {
    const bounds = vi.spyOn(map, 'getBounds')
    bounds.mockReturnValue(L.latLngBounds([-90, 80], [-80, 90]))
    painted.show(source())
    expect(TestWorker.instances.flatMap((worker) => worker.requests)).toHaveLength(1)
    const first = TestWorker.instances[0]!
    first.reply()
    await flushPromises()
    expect(map.getPane('paintedBase')!.querySelectorAll('img')).toHaveLength(1)

    bounds.mockReturnValue(L.latLngBounds([-30, 10], [-10, 30]))
    painted.refresh()
    expect(map.getPane('paintedBase')!.querySelectorAll('img')).toHaveLength(0)
    const second = TestWorker.instances.flatMap((worker) => worker.requests).at(-1)!
    expect(second.region.x0).toBe(0)
    expect(second.region.y0).toBe(0)
    for (const worker of TestWorker.instances)
      if (worker.requests.at(-1)?.id === second.id) worker.reply()
    await flushPromises()
    expect(map.getPane('paintedBase')!.querySelectorAll('img')).toHaveLength(1)

    const count = TestWorker.instances.flatMap((worker) => worker.requests).length
    bounds.mockReturnValue(L.latLngBounds([-90, 80], [-80, 90]))
    painted.refresh()
    expect(map.getPane('paintedBase')!.querySelectorAll('img')).toHaveLength(1)
    expect(TestWorker.instances.flatMap((worker) => worker.requests)).toHaveLength(count)
  })

  it('accepts worker-encoded PNG without using the main-thread canvas', async () => {
    vi.spyOn(map, 'getBounds').mockReturnValue(L.latLngBounds([-150, -50], [50, 150]))
    painted.show({ ...source(), width: 2, height: 2, sectors: new Uint8Array(4) })
    TestWorker.instances[0]!.reply(undefined, true)
    await flushPromises()
    expect(HTMLCanvasElement.prototype.getContext).not.toHaveBeenCalled()
    expect(map.getPane('paintedBase')!.querySelectorAll('img')).toHaveLength(1)
  })

  it('uses Retina-appropriate detail at zoom 3 and full detail at zoom 4', () => {
    vi.stubGlobal('devicePixelRatio', 2)
    painted.show({ ...source(), width: 400, height: 400, sectors: new Uint8Array(160000) })
    const bounds = vi.spyOn(map, 'getBounds')
    bounds.mockReturnValue(L.latLngBounds([-230, 170], [-170, 230]))
    map.setZoom(3, { animate: false })
    painted.refresh()
    const worker = TestWorker.instances[0]!
    worker.reply()
    expect(worker.requests.at(-1)!.scale).toBe(16)

    map.setZoom(4, { animate: false })
    painted.refresh()
    worker.reply()
    expect(worker.requests.at(-1)!.scale).toBe(32)
  })

  it('keeps both resolution caches warm through repeated zoom threshold transitions', async () => {
    vi.stubGlobal('devicePixelRatio', 2)
    const bounds = vi.spyOn(map, 'getBounds')
    bounds.mockReturnValue(L.latLngBounds([-230, 170], [-170, 230]))
    painted.show({ ...source(), width: 400, height: 400, sectors: new Uint8Array(160000) })
    const completed = new Set<number>()
    const drain = async () => {
      for (let step = 0; step < 180; step++) {
        let busy = false
        for (const worker of TestWorker.instances) {
          const id = worker.requests.at(-1)?.id
          if (id === undefined || completed.has(id)) continue
          completed.add(id)
          worker.reply()
          busy = true
        }
        await flushPromises()
        if (!busy) break
      }
    }
    map.setZoom(3, { animate: false })
    painted.refresh()
    await drain()
    const initial16 = TestWorker.instances
      .flatMap((w) => w.requests)
      .filter((r) => r.scale === 16).length
    expect(initial16).toBeGreaterThan(0)
    map.setZoom(3.5, { animate: false })
    painted.refresh()
    await drain()
    const initial32 = TestWorker.instances
      .flatMap((w) => w.requests)
      .filter((r) => r.scale === 32).length
    expect(initial32).toBeGreaterThan(0)
    map.setZoom(3, { animate: false })
    painted.refresh()
    await drain()
    expect(
      TestWorker.instances.flatMap((w) => w.requests).filter((r) => r.scale === 16),
    ).toHaveLength(initial16)
    map.setZoom(3.5, { animate: false })
    painted.refresh()
    await drain()
    expect(
      TestWorker.instances.flatMap((w) => w.requests).filter((r) => r.scale === 32),
    ).toHaveLength(initial32)
    expect(map.getPane('paintedDetail')!.querySelectorAll('img').length).toBeLessThanOrEqual(64)
  })

  it('queues viewport detail from centre outward while all workers are busy', () => {
    vi.stubGlobal('devicePixelRatio', 2)
    painted.show({ ...source(), width: 400, height: 400, sectors: new Uint8Array(160000) })
    map.setView([-200, 200], 4, { animate: false })
    vi.spyOn(map, 'getBounds').mockReturnValue(L.latLngBounds([-230, 170], [-170, 230]))
    painted.refresh()
    const worker = TestWorker.instances[0]!
    worker.reply()
    expect(worker.requests.at(-1)!.scale).toBe(32)
    const { x0, y0 } = worker.requests.at(-1)!.region
    expect(Math.abs(x0 + 5 - 200)).toBeLessThanOrEqual(5)
    expect(Math.abs(y0 + 5 - 200)).toBeLessThanOrEqual(5)
  })
})
