import { describe, it, expect, vi, afterEach } from 'vitest'
import { createMapNavigator, findMapPath } from '../mapNavigation.js'
import { parseMapGraph, parseRoomInfo } from '../playMap.js'
import type { MudRoom } from '../../types/mud.js'
const graph = parseMapGraph({
  nodes: [1, 2, 3].map((id) => ({ id, name: `Room ${id}`, sectorType: 0 })),
  edges: [
    { from: 1, to: 2, direction: 'east' },
    { from: 2, to: 3, direction: 'east' },
  ],
})!
function room(id: number, closed = false, locked = false): MudRoom {
  return parseRoomInfo({
    num: id,
    zone: 1,
    name: 'Room',
    exits: id < 3 ? { e: id + 1 } : {},
    doors: { e: { name: 'gate', closed, locked } },
  })!
}
function setup(initial = room(1)) {
  let current = initial
  let allowed = true
  const send = vi.fn(() => true),
    finish = vi.fn(),
    log = vi.fn(),
    start = vi.fn(),
    progress = vi.fn()
  const navigator = createMapNavigator({
    room: () => current,
    rooms: () => [],
    graph: () => graph,
    canWalk: () => allowed,
    send,
    finish,
    log,
    start,
    progress,
    timeoutMs: 1000,
  })
  return {
    ...navigator,
    send,
    finish,
    log,
    start,
    progress,
    receive(next: MudRoom | null) {
      current = next!
      navigator.observeRoom(next)
    },
    block() {
      allowed = false
      navigator.stop()
    },
  }
}
afterEach(() => vi.useRealTimers())
describe('acknowledged map navigation', () => {
  it('sends only one movement until its destination is confirmed; reports complete only on arrival', async () => {
    const h = setup()
    const walking = h.walk(3)
    expect(h.send.mock.calls).toEqual([['east']])
    h.receive(room(1))
    await Promise.resolve()
    expect(h.send).toHaveBeenCalledTimes(1)
    h.receive(room(2))
    await Promise.resolve()
    expect(h.send.mock.calls).toEqual([['east'], ['east']])
    expect(h.log).not.toHaveBeenCalledWith(expect.stringContaining('complete'))
    h.receive(room(3))
    await walking
    expect(h.log).toHaveBeenCalledWith('Speedwalk complete: destination confirmed.')
    expect(h.finish).toHaveBeenCalledTimes(1)
  })
  it('queues door opening before one move and waits for arrival, rather than an unsupported door-only packet', async () => {
    const h = setup(room(1, true))
    const walking = h.walk(2)
    expect(h.send.mock.calls).toEqual([['open east'], ['east']])
    h.receive(room(2))
    await walking
    expect(h.finish).toHaveBeenCalledTimes(1)
  })
  it('stops on timeout, wrong destination, cancellation, lost connection or combat', async () => {
    vi.useFakeTimers()
    const h = setup()
    const timed = h.walk(3)
    await vi.advanceTimersByTimeAsync(1001)
    await timed
    expect(h.send).toHaveBeenCalledTimes(1)
    expect(h.log).toHaveBeenCalledWith(expect.stringContaining('not confirmed'))
    const wrong = setup(),
      wrongWalk = wrong.walk(3)
    wrong.receive(room(99))
    await wrongWalk
    expect(wrong.send).toHaveBeenCalledTimes(1)
    expect(wrong.log).toHaveBeenCalledWith(expect.stringContaining('unexpectedly'))
    for (const stop of ['stop', 'block'] as const) {
      const h = setup(),
        walking = h.walk(3)
      h[stop]()
      h.receive(room(2))
      await walking
      expect(h.send).toHaveBeenCalledTimes(1)
      expect(h.log).not.toHaveBeenCalledWith(expect.stringContaining('complete'))
    }
  })
  it('rejects locked or unknown exits and respects live empty exits and one-way topology', async () => {
    expect(findMapPath(1, 3, graph, [room(1, true, true)])).toBeNull()
    expect(findMapPath(3, 1, graph, [])).toBeNull()
    expect(findMapPath(1, 3, graph, [{ ...room(1), exits: {} }])).toBeNull()
    const h = setup(room(1, true, true))
    await h.walk(3)
    expect(h.send).not.toHaveBeenCalled()
  })
  it('refuses duplicate navigation while a move is in flight, including after manual stop', async () => {
    const h = setup()
    const walking = h.walk(3)
    await h.walk(2)
    expect(h.send).toHaveBeenCalledTimes(1)
    h.stop()
    await walking
    await h.walk(2)
    expect(h.send).toHaveBeenCalledTimes(1)
    h.receive(room(2))
    const resumed = h.walk(3)
    h.receive(room(3))
    await resumed
    expect(h.send).toHaveBeenCalledTimes(2)
    expect(h.log.mock.calls.filter(([text]) => String(text).includes('complete'))).toHaveLength(1)
  })
})
