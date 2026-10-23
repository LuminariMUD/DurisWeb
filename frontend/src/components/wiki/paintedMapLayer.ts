import L from 'leaflet'
import type { GridPoint, PaintRegion } from '@/utils/paintedMap/painter'
import type { PaintRequest, PaintResponse } from '@/utils/paintedMap/painter.worker'

/** Sector grid of one map layer, decoded. */
export interface PaintedLayerSource {
  layer: number
  minX: number
  minY: number
  width: number
  height: number
  /** Surface-style layers have an ocean; others sit in solid rock. */
  surface: boolean
  sectors: Uint8Array
  continents: Uint8Array | null
  ports: GridPoint[]
}

export interface PaintProgress {
  done: number
  total: number
}

interface Tile extends PaintRegion {
  key: string
  url: string | null
  pending: boolean
}

interface Job {
  id: number
  source: PaintedLayerSource
  scale: number
  region: PaintRegion
  stale?: () => boolean
  resolve: (url: string | null) => void
  reject: (error: Error) => void
}

interface Slot {
  worker: Worker
  job: Job | null
  layers: Set<string>
}

/** Whole-layer tiles: 8 pixels per room, in 50-room squares (25 underground). */
const BASE_SCALE = 8
/** Sharp tiles painted only for the area in view once zoomed in. */
const DETAIL_SCALE = 32
const DETAIL_TILE = 10
/** Leaflet zoom from which detail tiles are painted (8 screen pixels per room). */
const DETAIL_ZOOM = 3
/** Detail tiles kept for panning back before the oldest are released. */
const DETAIL_CACHE_LIMIT = 300
/** Cave layers get a low-detail painting of the surrounding rock underneath. */
const ROCK_SCALE = 2

const layerKey = (source: PaintedLayerSource) => `layer:${source.layer}`

/** Whether this browser can paint the map (workers and canvas). */
export function canPaintMap(): boolean {
  return typeof Worker !== 'undefined' && typeof document !== 'undefined'
}

function pixelsToUrl(pixels: Uint8ClampedArray<ArrayBuffer>, width: number, height: number) {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d')
  if (!context) return Promise.reject(new Error('Canvas is unavailable'))
  context.putImageData(new ImageData(pixels, width, height), 0, 0)
  return new Promise<string>((resolve, reject) =>
    canvas.toBlob(
      (blob) => (blob ? resolve(URL.createObjectURL(blob)) : reject(new Error('No image'))),
      'image/png',
    ),
  )
}

/**
 * Painted view of the wiki world map, drawn over the original terrain image.
 * Painting runs in a small worker pool; each tile appears as it finishes.
 */
export class PaintedMapLayer {
  private readonly map: L.Map
  private readonly onProgress: (progress: PaintProgress | null) => void
  private readonly baseGroup = L.layerGroup()
  private readonly detailGroup = L.layerGroup()
  private readonly slots: Slot[] = []
  private readonly queue: Job[] = []
  private readonly baseTiles = new Map<string, Tile[]>()
  private readonly rock = new Map<string, Tile>()
  private readonly detailTiles = new Map<string, Tile>()
  private readonly shownDetail = new Map<string, L.ImageOverlay>()
  private wantedDetail = new Set<string>()
  private source: PaintedLayerSource | null = null
  private version = 0
  private nextJobId = 0
  private destroyed = false

  constructor(map: L.Map, onProgress: (progress: PaintProgress | null) => void) {
    this.map = map
    this.onProgress = onProgress
    if (!map.getPane('paintedBase')) map.createPane('paintedBase').style.zIndex = '410'
    if (!map.getPane('paintedDetail')) map.createPane('paintedDetail').style.zIndex = '420'
    this.baseGroup.addTo(map)
    this.detailGroup.addTo(map)
  }

  /** Paint and show a layer, reusing tiles already painted for it. */
  show(source: PaintedLayerSource): void {
    ++this.version
    this.source = source
    this.baseGroup.clearLayers()
    this.clearDetail()
    const key = layerKey(source)

    if (!source.surface && !this.rock.has(key)) {
      const rock: Tile = {
        key: `${key}:rock`,
        x0: 0,
        y0: 0,
        x1: source.width,
        y1: source.height,
        url: null,
        pending: true,
      }
      this.rock.set(key, rock)
      this.paint(source, ROCK_SCALE, rock).then((url) => {
        rock.url = url
        rock.pending = false
        if (url && source === this.source && !this.destroyed) this.addBase(rock, source)
      }, () => this.rock.delete(key))
    } else {
      const rock = this.rock.get(key)
      if (rock?.url) this.addBase(rock, source)
    }

    let tiles = this.baseTiles.get(key)
    if (!tiles) {
      tiles = this.planBaseTiles(source)
      this.baseTiles.set(key, tiles)
    }
    const total = tiles.length
    const report = () => {
      if (source !== this.source || this.destroyed) return
      const done = tiles.filter((tile) => tile.url).length
      this.onProgress(done < total ? { done, total } : null)
    }
    report()
    for (const tile of tiles) {
      if (tile.url) {
        this.addBase(tile, source)
        continue
      }
      if (tile.pending) continue
      tile.pending = true
      this.paint(source, BASE_SCALE, tile).then(
        (url) => {
          tile.url = url
          tile.pending = false
          if (url && source === this.source && !this.destroyed) this.addBase(tile, source)
          report()
        },
        () => {
          tile.pending = false
          report()
        },
      )
    }
    this.refresh()
  }

  /** Remove the painted view; painted tiles are kept for when it returns. */
  hide(): void {
    this.version++
    this.source = null
    this.baseGroup.clearLayers()
    this.clearDetail()
    this.onProgress(null)
  }

  /** Paint sharp tiles for the area in view; call after the map moves or zooms. */
  refresh(): void {
    const source = this.source
    if (!source || this.map.getZoom() < DETAIL_ZOOM) {
      this.clearDetail()
      return
    }
    const kx = (source.width - 1) / source.width
    const ky = (source.height - 1) / source.height
    const view = this.map.getBounds()
    const gx0 = Math.max(0, Math.floor((view.getWest() - source.minX) / kx) - 2)
    const gx1 = Math.min(source.width, Math.ceil((view.getEast() - source.minX) / kx) + 2)
    const gy0 = Math.max(0, Math.floor((-view.getNorth() - source.minY) / ky) - 2)
    const gy1 = Math.min(source.height, Math.ceil((-view.getSouth() - source.minY) / ky) + 2)
    const key = layerKey(source)
    const wanted = new Set<string>()
    const tiles: Tile[] = []
    for (let y0 = Math.floor(gy0 / DETAIL_TILE) * DETAIL_TILE; y0 < gy1; y0 += DETAIL_TILE)
      for (let x0 = Math.floor(gx0 / DETAIL_TILE) * DETAIL_TILE; x0 < gx1; x0 += DETAIL_TILE) {
        const tileKey = `${key}:${x0}:${y0}`
        wanted.add(tileKey)
        let tile = this.detailTiles.get(tileKey)
        if (!tile) {
          // Overlap the next tile by one room so no hairline gaps show.
          tile = {
            key: tileKey,
            x0,
            y0,
            x1: Math.min(source.width, x0 + DETAIL_TILE + 1),
            y1: Math.min(source.height, y0 + DETAIL_TILE + 1),
            url: null,
            pending: false,
          }
          if (!source.surface && !this.hasRooms(source, tile)) continue
          this.detailTiles.set(tileKey, tile)
        }
        tiles.push(tile)
      }
    this.wantedDetail = wanted
    for (const [tileKey, overlay] of this.shownDetail)
      if (!wanted.has(tileKey)) {
        this.detailGroup.removeLayer(overlay)
        this.shownDetail.delete(tileKey)
      }

    // Paint from the centre of the view outwards.
    const cx = (gx0 + gx1) / 2
    const cy = (gy0 + gy1) / 2
    const half = DETAIL_TILE / 2
    const distance = (t: Tile) => Math.hypot(t.x0 + half - cx, t.y0 + half - cy)
    tiles.sort((a, b) => distance(a) - distance(b))
    for (const tile of tiles) {
      if (tile.url) {
        this.showDetail(tile, source)
        continue
      }
      if (tile.pending) continue
      tile.pending = true
      this.paint(source, DETAIL_SCALE, tile, true, () => !this.wantedDetail.has(tile.key)).then(
        (url) => {
          tile.pending = false
          if (!url) return
          tile.url = url
          this.showDetail(tile, source)
          this.trimDetailCache()
        },
        () => {
          tile.pending = false
        },
      )
    }
  }

  /** Stop all painting and release workers and images. */
  destroy(): void {
    this.destroyed = true
    this.version++
    for (const slot of this.slots) {
      slot.worker.terminate()
      slot.job?.resolve(null)
      slot.job = null
    }
    for (const job of this.queue) job.resolve(null)
    this.queue.length = 0
    this.baseGroup.remove()
    this.detailGroup.remove()
    const urls = [
      ...[...this.baseTiles.values()].flat(),
      ...this.rock.values(),
      ...this.detailTiles.values(),
    ]
    for (const tile of urls) if (tile.url) URL.revokeObjectURL(tile.url)
    this.baseTiles.clear()
    this.rock.clear()
    this.detailTiles.clear()
  }

  private planBaseTiles(source: PaintedLayerSource): Tile[] {
    const size = source.surface ? 50 : 25
    const key = layerKey(source)
    const tiles: Tile[] = []
    for (let y0 = 0; y0 < source.height; y0 += size)
      for (let x0 = 0; x0 < source.width; x0 += size) {
        const tile: Tile = {
          key: `${key}:base:${x0}:${y0}`,
          x0,
          y0,
          x1: Math.min(source.width, x0 + size + 1),
          y1: Math.min(source.height, y0 + size + 1),
          url: null,
          pending: false,
        }
        // Underground, only tiles that hold caves are painted over the rock.
        if (source.surface || this.hasRooms(source, tile)) tiles.push(tile)
      }
    return tiles
  }

  private hasRooms(source: PaintedLayerSource, region: PaintRegion): boolean {
    for (let y = Math.max(0, region.y0 - 3); y < Math.min(source.height, region.y1 + 3); y++)
      for (let x = Math.max(0, region.x0 - 3); x < Math.min(source.width, region.x1 + 3); x++)
        if (source.sectors[y * source.width + x] !== 255) return true
    return false
  }

  private bounds(source: PaintedLayerSource, region: PaintRegion): L.LatLngBounds {
    const kx = (source.width - 1) / source.width
    const ky = (source.height - 1) / source.height
    return L.latLngBounds(
      [-(source.minY + region.y1 * ky), source.minX + region.x0 * kx],
      [-(source.minY + region.y0 * ky), source.minX + region.x1 * kx],
    )
  }

  private addBase(tile: Tile, source: PaintedLayerSource) {
    if (!tile.url) return
    this.baseGroup.addLayer(
      L.imageOverlay(tile.url, this.bounds(source, tile), {
        pane: 'paintedBase',
        className: 'painted-map-tile',
      }),
    )
  }

  private showDetail(tile: Tile, source: PaintedLayerSource) {
    if (!tile.url || this.shownDetail.has(tile.key) || !this.wantedDetail.has(tile.key)) return
    if (source !== this.source) return
    const overlay = L.imageOverlay(tile.url, this.bounds(source, tile), {
      pane: 'paintedDetail',
      className: 'painted-map-tile',
    })
    this.shownDetail.set(tile.key, overlay)
    this.detailGroup.addLayer(overlay)
  }

  private clearDetail() {
    this.detailGroup.clearLayers()
    this.shownDetail.clear()
    this.wantedDetail = new Set()
  }

  private trimDetailCache() {
    if (this.detailTiles.size <= DETAIL_CACHE_LIMIT) return
    for (const [tileKey, tile] of this.detailTiles) {
      if (this.detailTiles.size <= DETAIL_CACHE_LIMIT) break
      if (this.wantedDetail.has(tileKey) || tile.pending) continue
      if (tile.url) URL.revokeObjectURL(tile.url)
      this.detailTiles.delete(tileKey)
    }
  }

  private paint(
    source: PaintedLayerSource,
    scale: number,
    region: PaintRegion,
    urgent = false,
    stale?: () => boolean,
  ): Promise<string | null> {
    if (this.destroyed) return Promise.resolve(null)
    if (!this.slots.length) this.startWorkers()
    return new Promise((resolve, reject) => {
      const job: Job = { id: ++this.nextJobId, source, scale, region, stale, resolve, reject }
      if (urgent) this.queue.unshift(job)
      else this.queue.push(job)
      this.pump()
    })
  }

  private startWorkers() {
    const count = Math.max(2, Math.min(6, (navigator.hardwareConcurrency || 4) - 1))
    for (let i = 0; i < count; i++) {
      const worker = new Worker(
        new URL('../../utils/paintedMap/painter.worker.ts', import.meta.url),
        { type: 'module' },
      )
      const slot: Slot = { worker, job: null, layers: new Set() }
      worker.onmessage = (event: MessageEvent<PaintResponse>) => {
        const job = slot.job
        slot.job = null
        this.pump()
        if (!job) return
        const { pixels, width, height, error } = event.data
        if (error || !pixels || !width || !height) {
          job.reject(new Error(error ?? 'Painting failed'))
          return
        }
        pixelsToUrl(new Uint8ClampedArray(pixels), width, height).then(
          (url) => {
            if (this.destroyed) {
              URL.revokeObjectURL(url)
              job.resolve(null)
              return
            }
            job.resolve(url)
          },
          job.reject,
        )
      }
      worker.onerror = () => {
        const job = slot.job
        slot.job = null
        job?.reject(new Error('Painting failed'))
        this.pump()
      }
      this.slots.push(slot)
    }
  }

  private pump() {
    for (const slot of this.slots) {
      if (slot.job) continue
      let job = this.queue.shift()
      // Skip sharp tiles the viewer has already panned away from.
      while (job?.stale?.()) {
        job.resolve(null)
        job = this.queue.shift()
      }
      if (!job) return
      slot.job = job
      const key = layerKey(job.source)
      const request: PaintRequest = {
        id: job.id,
        layerKey: key,
        scale: job.scale,
        region: { x0: job.region.x0, y0: job.region.y0, x1: job.region.x1, y1: job.region.y1 },
      }
      if (!slot.layers.has(key)) {
        slot.layers.add(key)
        request.layer = {
          sectors: job.source.sectors.slice().buffer,
          width: job.source.width,
          height: job.source.height,
          surface: job.source.surface,
          continents: job.source.continents ? job.source.continents.slice().buffer : null,
          ports: job.source.ports,
        }
      }
      slot.worker.postMessage(request)
    }+  }
}
