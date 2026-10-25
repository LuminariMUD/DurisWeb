export interface WikiMapRoom {
  vnum: number
  name: string
  sectorType: number
  exits?: Readonly<Record<string, number>>
}

export interface RoomPosition {
  x: number
  y: number
}

export interface ZoneMapConnection {
  id: string
  source: string
  target: string
  sourceDirections: string[]
  targetDirections: string[]
  vertical: boolean
}

export const ZONE_MAP_GRID_SIZE = 56
export const ZONE_MAP_NODE_SIZE = 24

// Vertical links are schematic offsets, identified separately by the renderer.
const directionOffsets: Record<string, RoomPosition> = {
  north: { x: 0, y: -1 },
  east: { x: 1, y: 0 },
  south: { x: 0, y: 1 },
  west: { x: -1, y: 0 },
  up: { x: 1, y: -1 },
  down: { x: 1, y: 1 },
  northeast: { x: 1, y: -1 },
  northwest: { x: -1, y: -1 },
  southeast: { x: 1, y: 1 },
  southwest: { x: -1, y: 1 },
}

/** One visual connection retains every directed exit between its two rooms. */
export function getZoneMapConnections(rooms: readonly WikiMapRoom[]): ZoneMapConnection[] {
  const ids = new Set(rooms.map((room) => room.vnum))
  const connections = new Map<string, ZoneMapConnection>()
  for (const room of [...rooms].sort((a, b) => a.vnum - b.vnum)) {
    for (const [direction, destination] of Object.entries(room.exits ?? {}).sort()) {
      if (!ids.has(destination)) continue
      const source = Math.min(room.vnum, destination)
      const target = Math.max(room.vnum, destination)
      const id = `edge-${source}-${target}`
      let connection = connections.get(id)
      if (!connection) {
        connection = {
          id,
          source: String(source),
          target: String(target),
          sourceDirections: [],
          targetDirections: [],
          vertical: false,
        }
        connections.set(id, connection)
      }
      const directions =
        room.vnum === source ? connection.sourceDirections : connection.targetDirections
      directions.push(direction)
      connection.vertical ||= direction === 'up' || direction === 'down'
    }
  }
  return [...connections.values()]
}

interface Neighbor extends RoomPosition {
  vnum: number
  incoming: boolean
  directionOrder: number
}

interface Component {
  positions: Map<number, RoomPosition>
  width: number
  height: number
  firstVnum: number
}

/** Traverse every weak component, then pack its schematic into the panel's aspect ratio. */
export function layoutZoneRooms(
  rooms: readonly WikiMapRoom[],
  aspectRatio = 1,
): Map<number, RoomPosition> {
  const neighbors = new Map<number, Neighbor[]>()
  for (const room of rooms) neighbors.set(room.vnum, [])
  for (const room of rooms) {
    for (const [direction, destination] of Object.entries(room.exits ?? {})) {
      if (!neighbors.has(destination) || destination === room.vnum) continue
      const offset = directionOffsets[direction] ?? { x: 1, y: 0 }
      const directionOrder = Object.keys(directionOffsets).indexOf(direction)
      neighbors
        .get(room.vnum)
        ?.push({ vnum: destination, ...offset, incoming: false, directionOrder })
      // Incoming-only rooms belong to the same component, without inventing an exit.
      neighbors.get(destination)?.push({
        vnum: room.vnum,
        x: -offset.x,
        y: -offset.y,
        incoming: true,
        directionOrder,
      })
    }
  }
  for (const adjacent of neighbors.values()) {
    adjacent.sort(
      (a, b) =>
        Number(a.incoming) - Number(b.incoming) ||
        a.directionOrder - b.directionOrder ||
        a.vnum - b.vnum ||
        a.x - b.x ||
        a.y - b.y,
    )
  }

  const visited = new Set<number>()
  const components: Component[] = []
  for (const firstVnum of [...neighbors.keys()].sort((a, b) => a - b)) {
    if (visited.has(firstVnum)) continue
    const positions = new Map<number, RoomPosition>()
    const occupied = new Set<string>()
    const queue = [{ vnum: firstVnum, x: 0, y: 0 }]
    visited.add(firstVnum)
    for (let index = 0; index < queue.length; index++) {
      const current = queue[index]
      let position = { x: current.x, y: current.y }
      // Expand until a free cell is found; a fixed search can return an overlap.
      for (let radius = 1; occupied.has(`${position.x},${position.y}`); radius++) {
        const candidates: RoomPosition[] = []
        for (let offset = -radius; offset <= radius; offset++) {
          candidates.push(
            { x: current.x + offset, y: current.y - radius },
            { x: current.x + offset, y: current.y + radius },
          )
        }
        for (let offset = -radius + 1; offset < radius; offset++) {
          candidates.push(
            { x: current.x - radius, y: current.y + offset },
            { x: current.x + radius, y: current.y + offset },
          )
        }
        // Prefer the nearest cell, starting east and proceeding clockwise.
        // This keeps uncomplicated existing corridors stable when a branch collides.
        const distance = (point: RoomPosition) =>
          (point.x - current.x) ** 2 + (point.y - current.y) ** 2
        const angle = (point: RoomPosition) =>
          (Math.atan2(point.y - current.y, point.x - current.x) + Math.PI * 2) % (Math.PI * 2)
        candidates.sort((a, b) => distance(a) - distance(b) || angle(a) - angle(b))
        position = candidates.find((point) => !occupied.has(`${point.x},${point.y}`)) ?? position
      }
      positions.set(current.vnum, position)
      occupied.add(`${position.x},${position.y}`)
      for (const adjacent of neighbors.get(current.vnum) ?? []) {
        if (visited.has(adjacent.vnum)) continue
        visited.add(adjacent.vnum)
        queue.push({
          vnum: adjacent.vnum,
          x: position.x + adjacent.x,
          y: position.y + adjacent.y,
        })
      }
    }
    const points = [...positions.values()]
    const minX = Math.min(...points.map((point) => point.x))
    const minY = Math.min(...points.map((point) => point.y))
    const width = Math.max(...points.map((point) => point.x)) - minX + 1
    const height = Math.max(...points.map((point) => point.y)) - minY + 1
    for (const point of positions.values()) {
      point.x -= minX
      point.y -= minY
    }
    components.push({ positions, width, height, firstVnum })
  }

  if (components.length === 0) return new Map()
  const ratio = Number.isFinite(aspectRatio) && aspectRatio > 0 ? aspectRatio : 1
  const gap = 2
  const totalArea = components.reduce(
    (area, component) => area + (component.width + gap) * (component.height + gap),
    0,
  )
  const rowWidth = Math.max(
    ...components.map((component) => component.width),
    Math.ceil(Math.sqrt(totalArea * ratio)),
  )
  components.sort((a, b) => b.height - a.height || b.width - a.width || a.firstVnum - b.firstVnum)
  const result = new Map<number, RoomPosition>()
  let x = 0
  let y = 0
  let rowHeight = 0
  for (const component of components) {
    if (x > 0 && x + component.width > rowWidth) {
      x = 0
      y += rowHeight + gap
      rowHeight = 0
    }
    for (const [vnum, point] of component.positions) {
      result.set(vnum, {
        x: (x + point.x) * ZONE_MAP_GRID_SIZE,
        y: (y + point.y) * ZONE_MAP_GRID_SIZE,
      })
    }
    x += component.width + gap
    rowHeight = Math.max(rowHeight, component.height)
  }
  return result
}
