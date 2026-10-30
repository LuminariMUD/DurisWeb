import type { MudDirection, MudExit, MudRoom, RoomNpc, RoomItem } from '../types/mud.js'
import { MUD_DIRECTIONS } from '../types/mud.js'

export interface PlayMapNode {
  id: number
  name: string
  sectorType: number
  x?: number
  y?: number
}
export interface PlayMapEdge {
  from: number
  to: number
  direction: MudDirection
}
export interface PlayMapGraph {
  nodes: PlayMapNode[]
  edges: PlayMapEdge[]
}
export interface PlayMapSnapshot {
  room: MudRoom | null
  roomRevision: number
  rooms: MudRoom[]
  zoneNumber: number | null
  wildernessMap: string | null
  graph: PlayMapGraph | null
  graphRevision: number
  loading: boolean
  error: string | null
  paused: boolean
  walking: boolean
  stepsRemaining: number
  target: string
  cachedZones: number
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
export function isVnum(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
}
export function mapDirection(value: string): MudDirection | null {
  const key = value.toLowerCase().replace(/[\s#]/g, '')
  const short: Record<string, MudDirection> = {
    n: 'north',
    e: 'east',
    s: 'south',
    w: 'west',
    u: 'up',
    d: 'down',
    ne: 'northeast',
    nw: 'northwest',
    se: 'southeast',
    sw: 'southwest',
  }
  return (
    MUD_DIRECTIONS.find((direction) => direction === key) ??
    (Object.hasOwn(short, key) ? (short[key] ?? null) : null)
  )
}
export function isWildernessZone(zone: number): boolean {
  return zone === 600 || (zone >= 1200 && zone <= 1238) || (zone >= 5000 && zone <= 8599)
}
function finite(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}
function text(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback
}

/** The wire room and the normalized UI room are deliberately different contracts. */
export function parseRoomInfo(value: unknown): MudRoom | null {
  if (
    !isRecord(value) ||
    !isVnum(value.num) ||
    !isVnum(value.zone) ||
    typeof value.name !== 'string'
  )
    return null
  const exits: Record<string, MudExit> = {}
  let booleanExits = false
  const doors = new Map<MudDirection, Record<string, unknown>>()
  if (isRecord(value.doors)) {
    for (const [key, door] of Object.entries(value.doors)) {
      const direction = mapDirection(key)
      if (direction && isRecord(door)) doors.set(direction, door)
    }
  }
  if (isRecord(value.exits)) {
    for (const [key, destination] of Object.entries(value.exits)) {
      const direction = mapDirection(key)
      if (!direction || (!isVnum(destination) && typeof destination !== 'boolean')) continue
      if (typeof destination === 'boolean') booleanExits = true
      if (destination === false) continue
      const exit: MudExit = { vnum: typeof destination === 'boolean' ? 0 : destination }
      const door = doors.get(direction)
      if (key.includes('#')) {
        exit.door = direction
        exit.closed = true
      }
      if (isRecord(door)) {
        exit.door = text(door.name).trim() || direction
        if (typeof door.closed === 'boolean') exit.closed = door.closed
        if (typeof door.locked === 'boolean') exit.locked = door.locked
      }
      exits[direction] = exit
    }
  }
  const coords = isRecord(value.coords) ? value.coords : {}
  const players = Array.isArray(value.players)
    ? value.players
        .filter(isRecord)
        .flatMap((entry) => (typeof entry.name === 'string' ? [{ name: entry.name }] : []))
    : []
  const entities = (items: unknown): RoomItem[] =>
    Array.isArray(items)
      ? items.filter(isRecord).flatMap((entry) =>
          typeof entry.name === 'string' && isVnum(entry.vnum)
            ? [
                {
                  name: entry.name,
                  vnum: entry.vnum,
                  colored_name:
                    typeof entry.colored_name === 'string' ? entry.colored_name : undefined,
                },
              ]
            : [],
        )
      : []
  const npcs: RoomNpc[] = Array.isArray(value.npcs)
    ? value.npcs.filter(isRecord).flatMap((entry) =>
        typeof entry.name === 'string' && isVnum(entry.vnum)
          ? [
              {
                name: entry.name,
                vnum: entry.vnum,
                colored_name:
                  typeof entry.colored_name === 'string' ? entry.colored_name : undefined,
                keyword: typeof entry.keyword === 'string' ? entry.keyword : undefined,
                fighting: typeof entry.fighting === 'string' ? entry.fighting : undefined,
              },
            ]
          : [],
      )
    : []
  return {
    vnum: value.num,
    name: value.name,
    colored_name: typeof value.colored_name === 'string' ? value.colored_name : undefined,
    area: text(value.area),
    colored_area: typeof value.colored_area === 'string' ? value.colored_area : undefined,
    description: text(value.description),
    zoneNumber: value.zone,
    terrain: text(value.environment),
    x: finite(coords.x) ? coords.x : 0,
    y: finite(coords.y) ? coords.y : 0,
    z: finite(coords.z) ? coords.z : 0,
    section: isVnum(value.section) ? value.section : 0,
    exits,
    players,
    npcs,
    items: entities(value.items),
    mapKind:
      value.num === 0 || booleanExits || isWildernessZone(value.zone) ? 'wilderness' : 'zone',
  }
}

export function parseMapGraph(value: unknown): PlayMapGraph | null {
  if (
    !isRecord(value) ||
    !Array.isArray(value.nodes) ||
    !Array.isArray(value.edges) ||
    value.nodes.length > 20000 ||
    value.edges.length > 200000
  )
    return null
  const nodes: PlayMapNode[] = []
  const edges: PlayMapEdge[] = []
  const ids = new Set<number>()
  for (const node of value.nodes) {
    if (
      !isRecord(node) ||
      !isVnum(node.id) ||
      ids.has(node.id) ||
      typeof node.name !== 'string' ||
      node.name.length > 4096 ||
      !isVnum(node.sectorType)
    )
      return null
    if (
      (node.x !== undefined && (!finite(node.x) || !Number.isFinite(node.x * 25))) ||
      (node.y !== undefined && (!finite(node.y) || !Number.isFinite(node.y * 25)))
    )
      return null
    ids.add(node.id)
    nodes.push({ id: node.id, name: node.name, sectorType: node.sectorType, x: node.x, y: node.y })
  }
  for (const edge of value.edges) {
    if (
      !isRecord(edge) ||
      !isVnum(edge.from) ||
      !(isVnum(edge.to) || edge.to === -1) ||
      typeof edge.direction !== 'string'
    )
      return null
    const direction = mapDirection(edge.direction)
    if (!direction || !ids.has(edge.from)) return null
    edges.push({ from: edge.from, to: edge.to, direction })
  }
  return { nodes, edges }
}

export function emptyMapSnapshot(): PlayMapSnapshot {
  return {
    room: null,
    roomRevision: 0,
    rooms: [],
    zoneNumber: null,
    wildernessMap: null,
    graph: null,
    graphRevision: 0,
    loading: false,
    error: null,
    paused: false,
    walking: false,
    stepsRemaining: 0,
    target: '',
    cachedZones: 0,
  }
}

/** Broadcast data is an external boundary too; rebuild rooms through the wire parser. */
function parseUiRoom(value: unknown): MudRoom | null {
  if (!isRecord(value) || !isRecord(value.exits)) return null
  const exits: Record<string, number> = {}
  const doors: Record<string, unknown> = {}
  for (const [direction, exit] of Object.entries(value.exits)) {
    if (!isRecord(exit) || !isVnum(exit.vnum)) return null
    exits[direction] = exit.vnum
    if (exit.door !== undefined)
      doors[direction] = { name: exit.door, closed: exit.closed, locked: exit.locked }
  }
  const room = parseRoomInfo({
    ...value,
    num: value.vnum,
    zone: value.zoneNumber,
    environment: value.terrain,
    coords: { x: value.x, y: value.y, z: value.z },
    exits,
    doors,
  })
  if (room && value.mapKind === 'wilderness') room.mapKind = 'wilderness'
  return room
}
export function parseMapSnapshot(value: unknown): PlayMapSnapshot | null {
  if (!isRecord(value) || !Array.isArray(value.rooms) || value.rooms.length > 20000) return null
  const room = value.room === null ? null : parseUiRoom(value.room)
  const rooms = value.rooms.map(parseUiRoom)
  const graph = value.graph === null ? null : parseMapGraph(value.graph)
  if (
    (value.room !== null && !room) ||
    rooms.some((entry) => !entry) ||
    (value.graph !== null && !graph)
  )
    return null
  if (
    ![value.roomRevision, value.graphRevision, value.stepsRemaining, value.cachedZones].every(
      isVnum,
    )
  )
    return null
  if (value.zoneNumber !== null && !isVnum(value.zoneNumber)) return null
  if (
    value.wildernessMap !== null &&
    (typeof value.wildernessMap !== 'string' || value.wildernessMap.length > 2000000)
  )
    return null
  if (value.error !== null && typeof value.error !== 'string') return null
  if (
    typeof value.target !== 'string' ||
    !['loading', 'paused', 'walking'].every((key) => typeof value[key] === 'boolean')
  )
    return null
  return {
    room,
    rooms: rooms.filter((entry): entry is MudRoom => entry !== null),
    graph,
    roomRevision: Number(value.roomRevision),
    graphRevision: Number(value.graphRevision),
    stepsRemaining: Number(value.stepsRemaining),
    cachedZones: Number(value.cachedZones),
    zoneNumber: value.zoneNumber,
    wildernessMap: value.wildernessMap,
    error: value.error,
    target: value.target,
    loading: value.loading === true,
    paused: value.paused === true,
    walking: value.walking === true,
  }
}
