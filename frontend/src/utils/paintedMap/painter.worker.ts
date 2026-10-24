/**
 * Paints map tiles off the main thread. Each worker keeps the grids it has been
 * sent, so after the first tile of a layer a request carries only coordinates.
 */
import { paintMap, type GridPoint, type PaintRegion } from './painter'

export interface PaintLayerData {
  sectors: ArrayBuffer
  width: number
  height: number
  surface: boolean
  continents: ArrayBuffer | null
  ports: GridPoint[]
}

export interface PaintRequest {
  id: number
  layerKey: string
  /** Sent with the first request for a layer to each worker. */
  layer?: PaintLayerData
  scale: number
  region: PaintRegion
}

export interface PaintResponse {
  id: number
  pixels?: ArrayBuffer
  /** PNG encoded off the main thread, when OffscreenCanvas is supported. */
  blob?: Blob
  width?: number
  height?: number
  error?: string
}

interface LayerState {
  grid: Uint8Array
  width: number
  height: number
  surface: boolean
  continents: Uint8Array | null
  ports: GridPoint[]
}

const layers = new Map<string, LayerState>()
// The app compiles against the DOM library, so describe just what this
// worker uses of its global scope.
interface WorkerScope {
  onmessage: ((event: MessageEvent<PaintRequest>) => void) | null
  postMessage(message: PaintResponse, transfer?: Transferable[]): void
}
const scope = self as unknown as WorkerScope

scope.onmessage = async (event: MessageEvent<PaintRequest>) => {
  const { id, layerKey, layer, scale, region } = event.data
  try {
    if (layer) {
      layers.set(layerKey, {
        grid: new Uint8Array(layer.sectors),
        width: layer.width,
        height: layer.height,
        surface: layer.surface,
        continents: layer.continents ? new Uint8Array(layer.continents) : null,
        ports: layer.ports,
      })
    }
    const state = layers.get(layerKey)
    if (!state) throw new Error(`No sector grid for ${layerKey}`)
    const pixels = paintMap(state.grid, state.width, state.height, scale, {
      surface: state.surface,
      continents: state.continents,
      ports: state.ports,
      region,
    })
    const width = (region.x1 - region.x0) * scale
    const height = (region.y1 - region.y0) * scale
    // Chrome (including macOS) can encode PNG off-thread. Other browsers
    // retain the proven pixel-buffer path without losing the map.
    if (typeof OffscreenCanvas !== 'undefined') {
      try {
        const canvas = new OffscreenCanvas(width, height)
        const context = canvas.getContext('2d')
        if (context) {
          context.putImageData(new ImageData(new Uint8ClampedArray(pixels), width, height), 0, 0)
          const blob = await canvas.convertToBlob({ type: 'image/png' })
          scope.postMessage({ id, blob, width, height })
          return
        }
      } catch {
        // Unsupported/failed encoding is not a painting failure.
      }
    }
    const response: PaintResponse = {
      id,
      pixels: pixels.buffer as ArrayBuffer,
      width,
      height,
    }
    scope.postMessage(response, [pixels.buffer as ArrayBuffer])
  } catch (error) {
    const response: PaintResponse = {
      id,
      error: error instanceof Error ? error.message : String(error),
    }
    scope.postMessage(response)
  }
}
