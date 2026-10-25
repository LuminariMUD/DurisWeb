import { describe, expect, it } from 'vitest'
import {
  getZoneMapConnections,
  layoutZoneRooms,
  ZONE_MAP_GRID_SIZE,
  type WikiMapRoom,
} from '../wikiZoneMapLayout.js'

function room(vnum: number, exits: Record<string, number> = {}): WikiMapRoom {
  return { vnum, name: `Room ${vnum}`, sectorType: 0, exits }
}

function bounds(positions: Map<number, { x: number; y: number }>) {
  const points = [...positions.values()]
  return {
    width:
      Math.max(...points.map((point) => point.x)) - Math.min(...points.map((point) => point.x)),
    height:
      Math.max(...points.map((point) => point.y)) - Math.min(...points.map((point) => point.y)),
  }
}

describe('zone-room layout', () => {
  it('lays out disconnected corridors and incoming-only rooms using their exits', () => {
    const positions = layoutZoneRooms([
      room(1),
      room(2, { east: 1 }),
      room(10, { north: 11 }),
      room(11, { north: 12 }),
      room(12),
    ])
    expect(positions.size).toBe(5)
    expect(positions.get(2)!.x).toBe(positions.get(1)!.x - ZONE_MAP_GRID_SIZE)
    expect(positions.get(11)!.y).toBe(positions.get(10)!.y - ZONE_MAP_GRID_SIZE)
    expect(positions.get(12)!.y).toBe(positions.get(11)!.y - ZONE_MAP_GRID_SIZE)
  })

  it('finds a free cell after exhausting the old fixed collision neighborhood', () => {
    const rooms = [room(0)]
    for (let vnum = 1; vnum <= 80; vnum++) rooms.push(room(vnum, { east: 0 }))
    const positions = layoutZoneRooms(rooms)
    expect(positions.size).toBe(rooms.length)
    expect(new Set([...positions.values()].map(({ x, y }) => `${x},${y}`)).size).toBe(rooms.length)
  })

  it('retains every room in cycles, vertical links, conflicting constraints and self-loops', () => {
    const rooms = [
      room(1, { north: 2, up: 3, west: 999 }),
      room(2, { north: 3, south: 1 }),
      room(3, { north: 1, down: 1, east: 3 }),
      room(4),
    ]
    const positions = layoutZoneRooms(rooms)
    expect([...positions.keys()].sort()).toEqual([1, 2, 3, 4])
    const values = [...positions.values()]
    expect(values.every(({ x, y }) => Number.isFinite(x) && Number.isFinite(y))).toBe(true)
    for (let i = 0; i < values.length; i++) {
      for (let j = i + 1; j < values.length; j++) {
        expect(
          Math.max(Math.abs(values[i].x - values[j].x), Math.abs(values[i].y - values[j].y)),
        ).toBeGreaterThanOrEqual(ZONE_MAP_GRID_SIZE)
      }
    }
  })

  it('is deterministic when room and exit enumeration order changes, without mutating input', () => {
    const rooms = [room(3, { north: 1, west: 2 }), room(1), room(2), room(10)]
    const original = structuredClone(rooms)
    const reverse = [...rooms].reverse().map((value) => ({
      ...value,
      exits: Object.fromEntries(Object.entries(value.exits ?? {}).reverse()),
    }))
    expect(layoutZoneRooms(reverse)).toEqual(layoutZoneRooms(rooms))
    expect(rooms).toEqual(original)
  })

  it('uses panel proportions for packing instead of a fixed eleven-column orphan grid', () => {
    const rooms = Array.from({ length: 952 }, (_, index) => room(index))
    const wide = layoutZoneRooms(rooms, 2)
    const narrow = layoutZoneRooms(rooms, 0.5)
    expect(wide.size).toBe(952)
    expect(new Set([...wide.values()].map(({ x, y }) => `${x},${y}`)).size).toBe(952)
    expect(bounds(wide).width).toBeGreaterThan(bounds(wide).height)
    expect(bounds(narrow).height).toBeGreaterThan(bounds(narrow).width)
  })

  it('handles empty and single-room inputs and invalid panel dimensions', () => {
    expect(layoutZoneRooms([]).size).toBe(0)
    expect(layoutZoneRooms([room(1)], Number.NaN)).toEqual(new Map([[1, { x: 0, y: 0 }]]))
    expect(layoutZoneRooms([room(1)], Number.POSITIVE_INFINITY)).toEqual(layoutZoneRooms([room(1)]))
  })
})

describe('zone-room connections', () => {
  it('retains one-way, reciprocal, multiple-direction and vertical exit semantics', () => {
    const rooms = [
      room(1, { north: 2, up: 2, east: 1, south: -1, west: 999 }),
      room(2, { south: 1, down: 1, east: 3 }),
      room(3, { west: 1 }),
    ]
    const connections = getZoneMapConnections(rooms)
    const exits = connections.flatMap((connection) => [
      ...connection.sourceDirections.map((direction) =>
        [Number(connection.source), direction, Number(connection.target)].join(':'),
      ),
      ...connection.targetDirections.map((direction) =>
        [Number(connection.target), direction, Number(connection.source)].join(':'),
      ),
    ])
    expect(exits.sort()).toEqual([
      '1:east:1',
      '1:north:2',
      '1:up:2',
      '2:down:1',
      '2:east:3',
      '2:south:1',
      '3:west:1',
    ])
    expect(connections.find((connection) => connection.id === 'edge-1-2')).toMatchObject({
      sourceDirections: ['north', 'up'],
      targetDirections: ['down', 'south'],
      vertical: true,
    })
    expect(connections.find((connection) => connection.id === 'edge-1-3')).toMatchObject({
      sourceDirections: [],
      targetDirections: ['west'],
      vertical: false,
    })
  })
})
