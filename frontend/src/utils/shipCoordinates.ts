export interface ShipWorldAnchor {
  worldX: number
  worldY: number
}

export interface TacticalShipContact {
  x: number
  y: number
}

export interface ShipWorldCoordinates {
  worldX?: number
  worldY?: number
}

export interface WorldMapBounds {
  minX: number
  maxX: number
  minY: number
  maxY: number
}

export interface WorldPoint {
  x: number
  y: number
}

/**
 * The MUD's tactical contact frame is centered at (50, 50).
 * Its Y axis grows north/up, while raw world-map Y grows south/down.
 */
export function contactToWorldPosition(
  anchor: ShipWorldAnchor,
  contact: TacticalShipContact,
): WorldPoint {
  return {
    x: anchor.worldX + (contact.x - 50),
    y: anchor.worldY + (50 - contact.y),
  }
}

export function hasVerifiedWorldCoordinates(
  value: ShipWorldCoordinates | null | undefined,
): value is ShipWorldAnchor {
  return (
    typeof value?.worldX === 'number' &&
    Number.isFinite(value.worldX) &&
    typeof value.worldY === 'number' &&
    Number.isFinite(value.worldY)
  )
}

/**
 * Return a global position only for a payload with both verified world axes.
 * Tactical coordinates must never be silently interpreted as global cells.
 */
export function getContactWorldPosition(
  ship: ShipWorldCoordinates | null | undefined,
  contact: TacticalShipContact,
): WorldPoint | null {
  if (!hasVerifiedWorldCoordinates(ship)) {
    return null
  }

  return contactToWorldPosition(ship, contact)
}

/**
 * Convert a discrete world coordinate to a percentage on the map image.
 * The minimum and maximum coordinates map to the image edges (0 and 100).
 */
export function mapCoordinateToPercent(value: number, min: number, max: number): number {
  const span = max - min
  if (span <= 0) return 50
  return ((value - min) / span) * 100
}

export function worldPointToMapPercent(point: WorldPoint, bounds: WorldMapBounds): WorldPoint {
  return {
    x: mapCoordinateToPercent(point.x, bounds.minX, bounds.maxX),
    y: mapCoordinateToPercent(point.y, bounds.minY, bounds.maxY),
  }
}
