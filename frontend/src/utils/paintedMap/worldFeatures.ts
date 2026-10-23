/**
 * Fixed world features the painted map draws on top of terrain. They come from
 * the MUD source rather than the published map rows, so keep them in step with
 * the files named below when those change.
 */
import { NO_ROOM, type GridPoint } from './painter'

/** First room of the surface map grid; rooms run 400 to a row (src/world/map.h). */
const SURFACE_MAP_START = 500000
const SURFACE_MAP_WIDTH = 400

/** Surface map coordinates of a surface map room vnum. */
export function surfaceRoomCoordinates(vnum: number): GridPoint {
  const offset = vnum - SURFACE_MAP_START
  return { x: offset % SURFACE_MAP_WIDTH, y: Math.floor(offset / SURFACE_MAP_WIDTH) }
}

export interface Port extends GridPoint {
  name: string
}

/**
 * Cargo ports from ports[] in src/ships/ship_variables.c: each name with the
 * ocean map room ships sail to.
 */
export const SURFACE_PORTS: readonly Port[] = [
  { name: 'Flann', vnum: 559632 },
  { name: 'Dalvik', vnum: 635660 },
  { name: 'Menden', vnum: 550725 },
  { name: 'Myrabolus', vnum: 512874 },
  { name: 'Torrhan', vnum: 580879 },
  { name: "Sarmiz'Duul", vnum: 622675 },
  { name: 'Storm Port', vnum: 587128 },
  { name: "Venan'Trut", vnum: 545021 },
  { name: "Thur'Gurax", vnum: 616546 },
  { name: 'Deramuth', vnum: 521443 },
].map(({ name, vnum }) => ({ name, ...surfaceRoomCoordinates(vnum) }))

/**
 * Continent seed rooms from continents[] in src/world/map.c, in id order
 * (also seeded into wiki_continents).
 */
export const CONTINENT_SEEDS: readonly { id: number; vnum: number }[] = [
  { id: 1, vnum: 546926 }, // Good Continent
  { id: 2, vnum: 607066 }, // Evil Continent
  { id: 3, vnum: 521504 }, // Ice Crag
  { id: 4, vnum: 608451 }, // Khomani-Khan
  { id: 5, vnum: 567408 }, // Undead Continent
  { id: 6, vnum: 644892 }, // Jade Empire
  { id: 7, vnum: 643968 }, // Island of Dragons
  { id: 8, vnum: 628685 }, // Ceothia
  { id: 9, vnum: 562323 }, // Fort Boyard
  { id: 10, vnum: 545016 }, // Venan'Trut
  { id: 11, vnum: 513382 }, // Shadow Island
  { id: 12, vnum: 576166 }, // Scorched Island
  { id: 13, vnum: 575445 }, // Tezcatlipoca
  { id: 14, vnum: 556818 }, // Moonshae Island
]

const OCEAN = 12

/**
 * Decorative continent ids approximated from MUD seed rooms using adjacent
 * non-ocean cells. The MUD's set_continent() also requires reciprocal exits
 * and same-zone links, which a sector-only grid cannot encode. These map
 * colours are not authoritative continent assignments for gameplay.
 * Rooms no seed reaches stay 0.
 *
 * `grid` holds sectors row by row from the layer's (minX, minY) corner.
 */
export function surfaceContinents(
  grid: Uint8Array,
  width: number,
  height: number,
  minX: number,
  minY: number,
): Uint8Array {
  const continents = new Uint8Array(width * height)
  const open = (k: number) => grid[k] !== OCEAN && grid[k] !== NO_ROOM
  for (const seed of CONTINENT_SEEDS) {
    const { x, y } = surfaceRoomCoordinates(seed.vnum)
    const sx = x - minX
    const sy = y - minY
    if (sx < 0 || sy < 0 || sx >= width || sy >= height) continue
    const start = sy * width + sx
    if (continents[start] || !open(start)) continue
    continents[start] = seed.id
    const stack = [start]
    while (stack.length) {
      const c = stack.pop()!
      const cx = c % width
      const cy = (c - cx) / width
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          const nx = cx + dx
          const ny = cy + dy
          if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue
          const k = ny * width + nx
          if (continents[k] || !open(k)) continue
          continents[k] = seed.id
          stack.push(k)
        }
    }
  }
  return continents
}
