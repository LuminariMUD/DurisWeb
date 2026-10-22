import { describe, expect, it } from 'vitest'
import { surfacePositionToVnum, surfaceVnumToPosition } from '../surfaceMapCoordinates'

describe('October 2026 surface map coordinate conversions', () => {
  it('places the first and last room in the correct image corners', () => {
    expect(surfaceVnumToPosition(500000)).toEqual([1596, 0])
    expect(surfaceVnumToPosition(659999)).toEqual([0, 1596])
  })

  it('converts the source room numbers into map positions and back', () => {
    for (const vnum of [500000, 514072, 552212, 635261, 659999]) {
      const [lat, lng] = surfaceVnumToPosition(vnum)
      expect(surfacePositionToVnum(lat, lng)).toBe(vnum)
    }
  })

  it('rejects clicks outside the displayed surface image', () => {
    expect(surfacePositionToVnum(-1, 1)).toBeNull()
    expect(surfacePositionToVnum(1, 1600)).toBeNull()
    expect(surfacePositionToVnum(1600, 1)).toBeNull()
    expect(surfacePositionToVnum(Number.NaN, 1)).toBeNull()
  })
})
