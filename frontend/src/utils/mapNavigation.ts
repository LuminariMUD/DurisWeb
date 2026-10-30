import type { MudDirection, MudRoom } from '../types/mud.js'
import { mapDirection, type PlayMapGraph } from './playMap.js'

export interface MapStep {
  from: number
  to: number
  direction: MudDirection
}
export function findMapPath(
  from: number,
  to: number,
  graph: PlayMapGraph | null,
  rooms: readonly MudRoom[],
): MapStep[] | null {
  const adjacency = new Map<number, MapStep[]>()
  for (const edge of graph?.edges ?? []) {
    if (!adjacency.has(edge.from)) adjacency.set(edge.from, [])
    adjacency.get(edge.from)!.push(edge)
  }
  // Later snapshots override earlier observations, including an empty exit set.
  for (const room of rooms) {
    adjacency.set(
      room.vnum,
      Object.entries(room.exits).flatMap(([key, exit]) => {
        const direction = mapDirection(key)
        return direction && exit.vnum > 0 && !(exit.closed && exit.locked)
          ? [{ from: room.vnum, to: exit.vnum, direction }]
          : []
      }),
    )
  }
  const previous = new Map<number, MapStep | null>([[from, null]])
  const queue = [from]
  for (let index = 0; index < queue.length; index++) {
    const id = queue[index]!
    if (id === to) {
      const path: MapStep[] = []
      let step = previous.get(to)
      while (step) {
        path.push(step)
        step = previous.get(step.from)
      }
      return path.reverse()
    }
    for (const step of adjacency.get(id) ?? []) {
      if (previous.has(step.to)) continue
      previous.set(step.to, step)
      queue.push(step.to)
    }
  }
  return null
}

interface NavigationOptions {
  room: () => MudRoom | null
  rooms: () => MudRoom[]
  graph: () => PlayMapGraph | null
  canWalk: () => boolean
  send: (command: string) => boolean
  start: (target: string, steps: number, stop: () => void) => void
  progress: (steps: number) => void
  finish: () => void
  log: (message: string) => void
  timeoutMs?: number
}
/** Exactly one owner per game session. Rendering and BroadcastChannel never send moves. */
export function createMapNavigator(options: NavigationOptions) {
  let active: AbortController | null = null
  let pendingSource: number | null = null
  let observe: ((room: MudRoom | null) => void) | null = null
  function stop() {
    active?.abort()
  }
  function waitForRoom(source: number, expected: number, signal: AbortSignal): Promise<void> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(
        () => done(new Error('Movement was not confirmed; walk stopped.')),
        options.timeoutMs ?? 8000,
      )
      function aborted() {
        done(new Error('Walk cancelled.'))
      }
      function done(error?: Error) {
        clearTimeout(timer)
        signal.removeEventListener('abort', aborted)
        observe = null
        if (error) reject(error)
        else resolve()
      }
      observe = (room) => {
        if (!room || (room.vnum !== source && room.vnum !== expected)) {
          done(new Error('Position changed unexpectedly; walk stopped.'))
          return
        }
        if (room.vnum === expected) done()
      }
      signal.addEventListener('abort', aborted, { once: true })
      if (signal.aborted) aborted()
    })
  }
  async function walk(target: number) {
    if (active) {
      options.log('A walk is already active. Stop it before choosing another destination.')
      return
    }
    if (pendingSource !== null) {
      options.log('Position is not yet confirmed. Move manually before starting another walk.')
      return
    }
    if (!options.canWalk()) {
      options.log('Map movement is unavailable.')
      return
    }
    const initial = options.room()
    if (!initial || initial.vnum === target || target <= 0) return
    const path = findMapPath(initial.vnum, target, options.graph(), [...options.rooms(), initial])
    if (!path?.length) {
      options.log('No traversable path to that room.')
      return
    }
    const controller = new AbortController()
    active = controller
    const targetName =
      options.graph()?.nodes.find((node) => node.id === target)?.name ?? `Room #${target}`
    options.start(targetName, path.length, stop)
    options.log(`Speedwalk started: ${targetName}`)
    try {
      for (let count = 0; count < 20000; count++) {
        if (controller.signal.aborted || !options.canWalk()) throw new Error('Walk cancelled.')
        const room = options.room()
        if (!room) throw new Error('Current position is unavailable; walk stopped.')
        if (room.vnum === target) {
          options.log('Speedwalk complete: destination confirmed.')
          return
        }
        const remaining = findMapPath(room.vnum, target, options.graph(), [
          ...options.rooms(),
          room,
        ])
        const step = remaining?.[0]
        if (!step) throw new Error('No alternative route; walk stopped.')
        const exit = room.exits[step.direction]
        if (!exit || exit.vnum !== step.to) throw new Error('Exit changed; walk stopped.')
        options.progress(remaining.length)
        const arrived = waitForRoom(room.vnum, step.to, controller.signal)
        pendingSource = room.vnum
        // do_open does not emit Room.Info. Queue the opener before this one move,
        // then require the destination acknowledgement before any further move.
        try {
          if (exit.closed && !options.send(`open ${step.direction}`)) controller.abort()
          if (!controller.signal.aborted && !options.send(step.direction)) controller.abort()
        } catch {
          controller.abort()
        }
        await arrived
        options.progress(Math.max(0, remaining.length - 1))
      }
      throw new Error('Route exceeded the movement limit; walk stopped.')
    } catch (error) {
      if (active === controller)
        options.log(error instanceof Error ? error.message : 'Walk stopped.')
    } finally {
      if (active === controller) {
        active = null
        options.finish()
      }
    }
  }
  return {
    walk,
    stop,
    reset: () => {
      stop()
      pendingSource = null
    },
    observeRoom: (room: MudRoom | null) => {
      if (room && room.vnum !== pendingSource) pendingSource = null
      observe?.(room)
    },
  }
}
