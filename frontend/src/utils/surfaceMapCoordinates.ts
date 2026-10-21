// Drevarr's October 2026 surface map uses a 400x400 world grid rendered at 4px per room.
// Keep these conversions in sync with the upstream map when refreshing the snapshot.
export const SURFACE_IMAGE_SIZE = 1600
export const SURFACE_MAP_WIDTH = 400
const SURFACE_MAP_HEIGHT = 400
const SQUARE_SIZE = 4
const STARTING_VNUM = 500000

export function surfaceVnumToPosition(vnum: number): [number, number] {
  const offset = vnum - STARTING_VNUM
  const rowFromBottom = Math.floor(offset / SURFACE_MAP_WIDTH)
  const column = offset % SURFACE_MAP_WIDTH
  return [(SURFACE_MAP_HEIGHT - 1 - rowFromBottom) * SQUARE_SIZE, column * SQUARE_SIZE]
}

export function surfacePositionToVnum(latitude: number, longitude: number): number | null {
  if (
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude) ||
    latitude < 0 ||
    longitude < 0 ||
    latitude >= SURFACE_IMAGE_SIZE ||
    longitude >= SURFACE_IMAGE_SIZE
  ) {
    return null
  }
  const tileX = Math.floor(longitude / SQUARE_SIZE)
  const tileY = Math.floor(latitude / SQUARE_SIZE)
  return STARTING_VNUM + (SURFACE_MAP_HEIGHT - 1 - tileY) * SURFACE_MAP_WIDTH + tileX
}
