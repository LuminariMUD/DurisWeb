import { describe, it, expect } from 'vitest'
import { parseRoomInfo, parseMapGraph, emptyMapSnapshot, parseMapSnapshot } from '../playMap.js'
import { layoutPlayMap, applyPlayMapPositions } from '../playMapLayout.js'
import { parseMapText } from '../mapText.js'

const graph = {
  nodes: [1, 2, 3, 4, 9].map((id) => ({ id, name: `Room ${id}`, sectorType: 0 })),
  edges: [
    { from: 1, to: 2, direction: 'north' },
    { from: 2, to: 1, direction: 'south' },
    { from: 2, to: 3, direction: 'up' },
    { from: 3, to: 2, direction: 'down' },
    { from: 3, to: 4, direction: 'northeast' },
  ],
}
describe('play map boundaries and layout', () => {
  it('normalizes real wire fields, boolean wilderness exits, legacy doors and explicit door precedence', () => {
    const room = parseRoomInfo({
      num: 0,
      zone: 600,
      name: 'Open plains',
      exits: { n: true, s: false, e: true, junk: 2 },
    })!
    expect(room.mapKind).toBe('wilderness')
    expect(room.exits).toEqual({ north: { vnum: 0 }, east: { vnum: 0 } })
    const inside = parseRoomInfo({
      num: 101,
      zone: 1,
      name: 'Room',
      exits: { 'East#': 102, u: 103 },
      doors: { e: { name: 'gate', closed: false, locked: false }, up: { name: ' ', closed: true } },
      coords: { z: 2 },
      npcs: [{ name: 'orc', vnum: 9, keyword: 'orc' }],
    })!
    expect(inside.mapKind).toBe('zone')
    expect(inside.exits.east).toEqual({ vnum: 102, door: 'gate', closed: false, locked: false })
    expect(inside.npcs[0]?.keyword).toBe('orc')
    expect(inside.exits.up).toEqual({ vnum: 103, door: 'up', closed: true })
    expect(parseRoomInfo({ num: true, zone: 1, name: 'bad' })).toBeNull()
  })
  it('refuses invalid graphs and keeps all directions and external destinations', () => {
    expect(parseMapGraph({ ...graph, nodes: [...graph.nodes, graph.nodes[0]] })).toBeNull()
    expect(
      parseMapGraph({ ...graph, edges: [{ from: 1, to: 2, direction: 'east;quit' }] }),
    ).toBeNull()
    expect(
      parseMapGraph({ ...graph, nodes: [{ id: 1, name: 'bad', sectorType: 0, x: Infinity }] }),
    ).toBeNull()
    expect(
      parseMapGraph({ ...graph, edges: [{ from: 1, to: 999, direction: 'NE' }] })?.edges[0]
        ?.direction,
    ).toBe('northeast')
    expect(parseMapSnapshot(emptyMapSnapshot())).toEqual(emptyMapSnapshot())
    expect(parseMapSnapshot({ ...emptyMapSnapshot(), roomRevision: -1 })).toBeNull()
    expect(
      parseMapGraph({ ...graph, nodes: [{ id: 1, name: '', sectorType: 0, x: 1e308 }] }),
    ).toBeNull()
  })
  it('preserves compass, vertical and diagonal placement, sections, determinism and immutable input', () => {
    const input = parseMapGraph(graph)!
    const original = structuredClone(input)
    const layout = layoutPlayMap(input)
    const one = layout.positions.get(1)!,
      two = layout.positions.get(2)!,
      three = layout.positions.get(3)!,
      four = layout.positions.get(4)!
    expect(two.y).toBe(one.y - 1)
    expect(three.z).toBe(two.z + 1)
    expect(four.x).toBe(three.x + 1)
    expect(four.y).toBe(three.y - 1)
    expect(layout.positions.get(9)?.section).not.toBe(one.section)
    expect(
      layoutPlayMap({ nodes: [...input.nodes].reverse(), edges: [...input.edges].reverse() }),
    ).toEqual(layout)
    expect(input).toEqual(original)
  })
  it('keeps incoming-only rooms and collision cells unique, and reports contradictory levels', () => {
    const input = parseMapGraph({
      nodes: [1, 2, 3, 4].map((id) => ({ id, name: '', sectorType: 0 })),
      edges: [
        { from: 1, to: 2, direction: 'east' },
        { from: 1, to: 3, direction: 'east' },
        { from: 4, to: 1, direction: 'up' },
        { from: 1, to: 4, direction: 'up' },
      ],
    })!
    const result = layoutPlayMap(input)
    expect(result.positions.size).toBe(4)
    expect(new Set([...result.positions.values()].map((p) => `${p.x},${p.y},${p.z}`)).size).toBe(4)
    expect(result.ambiguousSections.size).toBe(1)
  })
  it('resets terrain colors on every boundary, preserves spaces and treats markup literally', () => {
    const runs = parseMapText('&=bY^&+g.\nplain&] reset\\nlegacy\r\n&+lblack &-r <tag>')
    expect(runs.map((run) => run.text).join('')).toBe('^.\nplain reset\nlegacy\nblack  <tag>')
    expect(runs.find((run) => run.text.includes('plain'))?.background).toBeUndefined()
    expect(runs.find((run) => run.text.includes('black'))?.foreground).toBe('rgb(0,0,0)')
    expect(runs.find((run) => run.text.includes('<tag>'))?.background).toBe('rgb(80,0,0)')
    expect(parseMapText('uncolored')).toEqual([
      { text: 'uncolored', foreground: undefined, background: undefined },
    ])
  })
  it('reserves partial authored layouts before placing generated rooms without overlaps', () => {
    const input = parseMapGraph({
      nodes: [
        { id: 1, name: 'Generated', sectorType: 0 },
        { id: 2, name: 'Saved', sectorType: 0, x: 0, y: 0 },
        { id: 3, name: 'Generated', sectorType: 0 },
      ],
      edges: [],
    })!
    const fallback = new Map([
      [1, { x: 0, y: 0 }],
      [2, { x: 56, y: 0 }],
      [3, { x: 0, y: 56 }],
    ])
    const positions = applyPlayMapPositions(input, fallback)
    expect(positions.get(2)).toEqual({ x: 0, y: 0 })
    expect(positions.get(1)).not.toEqual(positions.get(2))
    expect(fallback.get(1)).toEqual({ x: 0, y: 0 })
    const points = [...positions.values()]
    for (let i = 0; i < points.length; i++)
      for (let j = i + 1; j < points.length; j++) {
        expect(
          Math.max(Math.abs(points[i]!.x - points[j]!.x), Math.abs(points[i]!.y - points[j]!.y)),
        ).toBeGreaterThanOrEqual(32)
      }
    expect(
      applyPlayMapPositions({ ...input, nodes: [...input.nodes].reverse() }, fallback),
    ).toEqual(positions)
  })
  it('flags a vertical self-loop as an ambiguous inferred level', () => {
    const result = layoutPlayMap(
      parseMapGraph({
        nodes: [{ id: 1, name: '', sectorType: 0 }],
        edges: [{ from: 1, to: 1, direction: 'up' }],
      })!,
    )
    expect(result.ambiguousSections.has(result.positions.get(1)!.section)).toBe(true)
  })
})
