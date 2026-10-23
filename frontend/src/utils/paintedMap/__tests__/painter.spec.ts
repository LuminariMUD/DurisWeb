import { describe, expect, it } from 'vitest'
import { NO_ROOM, paintMap, planPiers } from '../painter'

const OCEAN = 12
const FIELD = 2
const FOREST = 3
const MOUNTAIN = 5

/** A 24x24 surface grid: ocean around a square island with a forest and a ridge. */
function islandGrid(): Uint8Array {
  const size = 24
  const grid = new Uint8Array(size * size).fill(OCEAN)
  for (let y = 6; y < 18; y++)
    for (let x = 6; x < 18; x++) grid[y * size + x] = x < 10 ? FOREST : y === 12 ? MOUNTAIN : FIELD
  return grid
}

function pixel(pixels: Uint8ClampedArray, width: number, x: number, y: number) {
  const o = (y * width + x) * 4
  return [pixels[o]!, pixels[o + 1]!, pixels[o + 2]!, pixels[o + 3]!]
}

describe('painted map renderer', () => {
  it('paints a whole grid at the requested scale, opaque and repeatably', () => {
    const grid = islandGrid()
    const pixels = paintMap(grid, 24, 24, 4, { surface: true })
    expect(pixels.length).toBe(24 * 4 * 24 * 4 * 4)
    for (let i = 3; i < pixels.length; i += 4) expect(pixels[i]).toBe(255)
    expect(paintMap(islandGrid(), 24, 24, 4, { surface: true })).toEqual(pixels)
  })

  it('paints the open ocean blue and the island interior green', () => {
    const pixels = paintMap(islandGrid(), 24, 24, 4, { surface: true })
    const [r, g, b] = pixel(pixels, 96, 2, 2)
    expect(b).toBeGreaterThan(r! + 20)
    expect(b).toBeGreaterThan(g!)
    const [fr, fg, fb] = pixel(pixels, 96, 14 * 4, 9 * 4)
    expect(fg).toBeGreaterThan(fr!)
    expect(fg).toBeGreaterThan(fb!)
  })

  it('paints tiles that match the same rooms of a whole-grid painting', () => {
    const grid = islandGrid()
    const scale = 4
    const whole = paintMap(grid, 24, 24, scale, { surface: true })
    const region = { x0: 8, y0: 4, x1: 20, y1: 16 }
    const tile = paintMap(grid, 24, 24, scale, { surface: true, region })
    const tileWidth = (region.x1 - region.x0) * scale
    expect(tile.length).toBe(tileWidth * (region.y1 - region.y0) * scale * 4)
    for (let y = 0; y < (region.y1 - region.y0) * scale; y++)
      for (let x = 0; x < tileWidth; x++)
        expect(pixel(tile, tileWidth, x, y)).toEqual(
          pixel(whole, 24 * scale, region.x0 * scale + x, region.y0 * scale + y),
        )
  })

  it('draws rock, not ocean, around caves', () => {
    const size = 12
    const grid = new Uint8Array(size * size).fill(NO_ROOM)
    for (let x = 2; x < 10; x++) grid[6 * size + x] = 29 // a tunnel
    const pixels = paintMap(grid, size, size, 4, { surface: false })
    const [r, g, b] = pixel(pixels, 48, 2, 2)
    expect(Math.max(r!, g!, b!)).toBeLessThan(90)
    expect(b! - r!).toBeLessThan(40)
  })

  it('plans one jetty per group of dock rooms and a pier with a ship at each port', () => {
    const grid = islandGrid()
    const water = Uint8Array.from(grid, (s) => (s === OCEAN ? 1 : 0))
    const docks = [
      { x: 12, y: 17 },
      { x: 13, y: 17 },
    ]
    const shapes = planPiers(grid, 24, 24, water, docks, [{ x: 20, y: 10 }])
    expect(shapes.map((s) => s.kind)).toEqual(['pier', 'pier', 'pier', 'boat'])
    const jetty = shapes[0]!
    // The jetty runs from the dock rooms south, out over the water.
    expect(jetty.kind === 'pier' && jetty.y1 > jetty.y0 && jetty.y1 > 17.5).toBe(true)
  })

  it('leaves a port without nearby land unbuilt', () => {
    const grid = new Uint8Array(30 * 30).fill(OCEAN)
    const water = new Uint8Array(30 * 30).fill(1)
    expect(planPiers(grid, 30, 30, water, [], [{ x: 15, y: 15 }])).toEqual([])
  })
})
