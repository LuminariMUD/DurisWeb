import { describe, expect, it } from 'vitest'
import { NO_ROOM, UNDEAD_CONTINENT } from '../painter'
import {
  CONTINENT_SEEDS,
  SURFACE_PORTS,
  surfaceContinents,
  surfaceRoomCoordinates,
} from '../worldFeatures'

describe('painted map world features', () => {
  it('uses canonical MUD tint IDs independently of database continent rows', () => {
    expect(CONTINENT_SEEDS.find((seed) => seed.id === 3)?.vnum).toBe(567408)
    expect(CONTINENT_SEEDS.find((seed) => seed.id === 4)?.vnum).toBe(521504)
    expect(CONTINENT_SEEDS.find((seed) => seed.id === 5)?.vnum).toBe(608451)
    expect(UNDEAD_CONTINENT).toBe(3)
  })
  it('places surface rooms on the 400-room-wide map grid', () => {
    expect(surfaceRoomCoordinates(500000)).toEqual({ x: 0, y: 0 })
    expect(surfaceRoomCoordinates(500401)).toEqual({ x: 1, y: 1 })
    expect(SURFACE_PORTS.find((p) => p.name === 'Flann')).toEqual({ name: 'Flann', x: 32, y: 149 })
  })

  it('floods each continent from its seed without crossing the ocean', () => {
    const evil = surfaceRoomCoordinates(CONTINENT_SEEDS.find((c) => c.id === 2)!.vnum)
    // A 12x6 window of the surface around the Evil Continent seed: land on the
    // left half, ocean in the middle column, an unconnected island on the right.
    const minX = evil.x - 2
    const minY = evil.y - 2
    const width = 12
    const height = 6
    const grid = new Uint8Array(width * height).fill(2)
    for (let y = 0; y < height; y++) grid[y * width + 6] = 12
    grid[0] = NO_ROOM
    const continents = surfaceContinents(grid, width, height, minX, minY)
    expect(continents[2 * width + 2]).toBe(2) // the seed itself
    expect(continents[5 * width + 5]).toBe(2) // connected land
    expect(continents[0]).toBe(0) // no room
    expect(continents[3 * width + 6]).toBe(0) // ocean
    expect(continents[3 * width + 9]).toBe(0) // across the water
  })

  it('ignores seeds outside the grid', () => {
    const grid = new Uint8Array(4).fill(2)
    expect([...surfaceContinents(grid, 2, 2, 0, 0)]).toEqual([0, 0, 0, 0])
  })
})
