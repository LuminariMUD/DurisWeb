import { MUD_DIRECTIONS, type MudDirection } from '../types/mud.js'
import type { PlayMapGraph } from './playMap.js'
import { ZONE_MAP_GRID_SIZE, ZONE_MAP_NODE_SIZE, type RoomPosition } from './wikiZoneMapLayout.js'

export interface MapPosition {
  x: number
  y: number
  z: number
  section: number
}
export interface PlayMapLayout {
  positions: Map<number, MapPosition>
  ambiguousSections: Set<number>
}
const vectors: Record<MudDirection, [number, number, number]> = {
  north: [0, -1, 0],
  east: [1, 0, 0],
  south: [0, 1, 0],
  west: [-1, 0, 0],
  up: [0, 0, 1],
  down: [0, 0, -1],
  northeast: [1, -1, 0],
  northwest: [-1, -1, 0],
  southeast: [1, 1, 0],
  southwest: [-1, 1, 0],
}
interface Link {
  to: number
  vector: [number, number, number]
  direction: MudDirection
  incoming: boolean
}

/** Schematic grid adapted from ArjMapper. Levels are inferred, never world coordinates. */
export function layoutPlayMap(graph: PlayMapGraph): PlayMapLayout {
  const positions = new Map<number, MapPosition>()
  const ambiguousSections = new Set<number>()
  const adjacent = new Map<number, Link[]>()
  const outgoing = new Map<number, Set<number>>()
  for (const node of graph.nodes) {
    adjacent.set(node.id, [])
    outgoing.set(node.id, new Set())
  }
  for (const edge of graph.edges) {
    if (!adjacent.has(edge.to) || edge.to === edge.from) continue
    const vector = vectors[edge.direction]
    adjacent
      .get(edge.from)
      ?.push({ to: edge.to, vector, direction: edge.direction, incoming: false })
    adjacent.get(edge.to)?.push({
      to: edge.from,
      vector: [-vector[0], -vector[1], -vector[2]],
      direction: edge.direction,
      incoming: true,
    })
    outgoing.get(edge.from)?.add(edge.to)
  }
  for (const [id, links] of adjacent)
    links.sort(
      (a, b) =>
        Number(a.incoming) - Number(b.incoming) ||
        Number(outgoing.get(b.to)?.has(id)) - Number(outgoing.get(a.to)?.has(id)) ||
        (outgoing.get(b.to)?.size ?? 0) - (outgoing.get(a.to)?.size ?? 0) ||
        MUD_DIRECTIONS.indexOf(a.direction) - MUD_DIRECTIONS.indexOf(b.direction) ||
        a.to - b.to,
    )
  const sorted = [...adjacent.keys()].sort(
    (a, b) => (outgoing.get(b)?.size ?? 0) - (outgoing.get(a)?.size ?? 0) || a - b,
  )
  const occupied = new Set<string>()
  const key = (x: number, y: number, z: number) => `${x},${y},${z}`
  let section = 0
  let sectionX = 0
  for (const root of sorted) {
    if (positions.has(root)) continue
    section++
    let maximumX = sectionX
    positions.set(root, { x: sectionX, y: 0, z: 0, section })
    occupied.add(key(sectionX, 0, 0))
    const queue = [root]
    for (let index = 0; index < queue.length; index++) {
      const id = queue[index]!
      const origin = positions.get(id)!
      for (const link of adjacent.get(id) ?? []) {
        const x = origin.x + link.vector[0],
          y = origin.y + link.vector[1],
          z = origin.z + link.vector[2]
        const existing = positions.get(link.to)
        if (existing) {
          if (existing.section === section && existing.z !== z) ambiguousSections.add(section)
          continue
        }
        let chosen = { x, y, z, section }
        if (occupied.has(key(x, y, z))) {
          // Stop at the nearest free ring, using direction and loop closure to break ties.
          for (let radius = 1; ; radius++) {
            const candidates: Array<{ x: number; y: number; score: number }> = []
            for (let dx = -radius; dx <= radius; dx++)
              for (let dy = -radius; dy <= radius; dy++) {
                if (
                  Math.max(Math.abs(dx), Math.abs(dy)) !== radius ||
                  occupied.has(key(x + dx, y + dy, z))
                )
                  continue
                let score = dx * dx + dy * dy - dx * link.vector[0] - dy * link.vector[1]
                for (const other of adjacent.get(link.to) ?? []) {
                  const target = positions.get(other.to)
                  if (
                    target &&
                    target.x === x + dx + other.vector[0] &&
                    target.y === y + dy + other.vector[1] &&
                    target.z === z + other.vector[2]
                  )
                    score -= 200
                }
                candidates.push({ x: x + dx, y: y + dy, score })
              }
            candidates.sort((a, b) => a.score - b.score || a.y - b.y || a.x - b.x)
            if (candidates[0]) {
              chosen = { ...candidates[0], z, section }
              break
            }
          }
        }
        positions.set(link.to, chosen)
        occupied.add(key(chosen.x, chosen.y, z))
        maximumX = Math.max(maximumX, chosen.x)
        queue.push(link.to)
      }
    }
    sectionX = maximumX + 4
  }
  for (const edge of graph.edges) {
    if (edge.from === edge.to && (edge.direction === 'up' || edge.direction === 'down')) {
      const section = positions.get(edge.from)?.section
      if (section !== undefined) ambiguousSections.add(section)
    }
  }
  return { positions, ambiguousSections }
}

/** Honor authored coordinates without letting generated fallback rooms cover them. */
export function applyPlayMapPositions(
  graph: PlayMapGraph,
  fallback: ReadonlyMap<number, RoomPosition>,
): Map<number, RoomPosition> {
  const positions = new Map<number, RoomPosition>()
  const buckets = new Map<string, RoomPosition[]>()
  const gap = ZONE_MAP_NODE_SIZE + 8
  const key = (x: number, y: number) => `${Math.floor(x / gap)},${Math.floor(y / gap)}`
  function occupy(id: number, position: RoomPosition) {
    positions.set(id, position)
    const bucket = key(position.x, position.y)
    if (!buckets.has(bucket)) buckets.set(bucket, [])
    buckets.get(bucket)!.push(position)
  }
  function occupied(x: number, y: number): boolean {
    for (let dx = -1; dx <= 1; dx++)
      for (let dy = -1; dy <= 1; dy++) {
        for (const point of buckets.get(key(x + dx * gap, y + dy * gap)) ?? []) {
          if (Math.abs(point.x - x) < gap && Math.abs(point.y - y) < gap) return true
        }
      }
    return false
  }
  const nodes = [...graph.nodes].sort((a, b) => a.id - b.id)
  for (const node of nodes) {
    if (node.x !== undefined && node.y !== undefined)
      occupy(node.id, { x: node.x * 25, y: node.y * 25 })
  }
  for (const node of nodes) {
    if (positions.has(node.id)) continue
    const base = fallback.get(node.id) ?? { x: 0, y: 0 }
    let point = base
    for (let radius = 1; occupied(point.x, point.y); radius++) {
      let found = false
      for (let dx = -radius; dx <= radius && !found; dx++)
        for (let dy = -radius; dy <= radius; dy++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== radius) continue
          const x = base.x + dx * ZONE_MAP_GRID_SIZE,
            y = base.y + dy * ZONE_MAP_GRID_SIZE
          if (!occupied(x, y)) {
            point = { x, y }
            found = true
            break
          }
        }
    }
    occupy(node.id, point)
  }
  return positions
}

export const MAP_SECTOR_COLORS: Record<number, string> = {
  0: '#3f3f46',
  1: '#78350f',
  2: '#14532d',
  3: '#166534',
  4: '#44403c',
  5: '#52525b',
  6: '#1e3a8a',
  7: '#1e40af',
  8: '#164e63',
  9: '#0c4a6e',
  10: '#713f12',
  24: '#ca8a04',
  25: '#e2e8f0',
  26: '#7c3aed',
  37: '#525252',
}
