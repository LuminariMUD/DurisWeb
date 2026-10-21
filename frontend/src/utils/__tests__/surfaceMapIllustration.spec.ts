import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { terrainAt } from '../surfaceMapIllustration'

describe('the coordinate-aligned atlas treatment', () => {
  it('classifies the existing map colours', () => {
    expect(terrainAt(29, 95, 151)).toBe(0)
    expect(terrainAt(40, 100, 65)).toBe(1)
    expect(terrainAt(190, 150, 100)).toBe(3)
    expect(terrainAt(155, 120, 188)).toBe(4)
    expect(terrainAt(167, 52, 44)).toBe(5)
  })

  it("uses Drevarr's pinned real-world marker dataset unchanged", () => {
    const source = new URL('../../../public/surface-map/data.json', import.meta.url)
    const data = JSON.parse(readFileSync(source, 'utf8')) as {
      zones: { name: string; vnum: number }[]
      ferryRoutes: { name: string; start: number }[]
      dragonRoutes: { name: string; start: number }[]
    }
    expect(data.zones).toHaveLength(267)
    expect(data.ferryRoutes).toHaveLength(11)
    expect(data.dragonRoutes).toHaveLength(16)
    for (const point of [
      ...data.zones.map((zone) => zone.vnum),
      ...data.ferryRoutes.map((stop) => stop.start),
      ...data.dragonRoutes.map((stop) => stop.start),
    ]) {
      expect(point).toBeGreaterThanOrEqual(500000)
      expect(point).toBeLessThan(660000)
    }
  })
})
