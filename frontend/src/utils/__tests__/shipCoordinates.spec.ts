import { describe, expect, it } from 'vitest'

import {
  contactToWorldPosition,
  getContactWorldPosition,
  mapCoordinateToPercent,
  type ShipWorldAnchor,
} from '@/utils/shipCoordinates'

const anchor: ShipWorldAnchor = { worldX: 100, worldY: 100 }

describe('ship coordinate frames', () => {
  it.each([
    ['north', { x: 50, y: 55 }, { x: 100, y: 95 }],
    ['south', { x: 50, y: 45 }, { x: 100, y: 105 }],
    ['east', { x: 55, y: 50 }, { x: 105, y: 100 }],
    ['west', { x: 45, y: 50 }, { x: 95, y: 100 }],
  ])(
    '%s converts tactical contact coordinates back to raw world coordinates',
    (_name, contact, expected) => {
      expect(contactToWorldPosition(anchor, contact)).toEqual(expected)
    },
  )

  it('returns no world position without both verified world coordinates', () => {
    expect(getContactWorldPosition({}, { x: 55, y: 50 })).toBeNull()
    expect(getContactWorldPosition({ worldX: 100 }, { x: 55, y: 50 })).toBeNull()
    expect(getContactWorldPosition({ worldY: 100 }, { x: 55, y: 50 })).toBeNull()
  })

  it('returns a world position only when both coordinates are present', () => {
    expect(getContactWorldPosition({ worldX: 100, worldY: 100 }, { x: 50, y: 50 })).toEqual({
      x: 100,
      y: 100,
    })
  })

  it('maps discrete map edges to the edge percentages', () => {
    expect(mapCoordinateToPercent(10, 10, 20)).toBe(0)
    expect(mapCoordinateToPercent(15, 10, 20)).toBe(50)
    expect(mapCoordinateToPercent(20, 10, 20)).toBe(100)
  })
})
