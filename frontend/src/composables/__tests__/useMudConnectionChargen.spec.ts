import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h } from 'vue'
import { mount, type VueWrapper } from '@vue/test-utils'

const { storeMudCredentials, clearMudCredentials, getMudCredentials, sockets, siteConfiguration } =
  vi.hoisted(() => ({
    storeMudCredentials: vi.fn(),
    clearMudCredentials: vi.fn(),
    getMudCredentials: vi.fn(() => null),
    sockets: [] as FakeSocket[],
    siteConfiguration: {
      mudWsUrl: { value: 'wss://mud.test' as string | null },
      loadConfig: vi.fn<() => Promise<void>>(),
      isLoaded: { value: true },
      isAvailable: { value: true },
    },
  }))

class FakeSocket {
  static OPEN = 1
  readyState = FakeSocket.OPEN
  onopen: (() => void) | null = null
  onmessage: ((event: { data: string }) => void) | null = null
  onclose: ((event: { code: number; reason: string }) => void) | null = null
  onerror: ((error: unknown) => void) | null = null
  sent: string[] = []

  constructor(public readonly url: string) {
    sockets.push(this)
  }

  send(data: string) {
    this.sent.push(data)
  }

  close() {
    this.readyState = 3
    this.onclose?.({ code: 1000, reason: 'test reconnect' })
  }
}

vi.mock('@/composables/useAuth', () => ({
  useAuth: () => ({
    storeMudCredentials,
    clearMudCredentials,
    getMudCredentials,
  }),
}))

vi.mock('@/composables/useSiteConfig', () => {
  return { useSiteConfig: () => siteConfiguration }
})

vi.mock('@/composables/useTimers', () => ({
  useTimers: () => ({
    startAllTimers: vi.fn(),
    stopAllTimers: vi.fn(),
    setSendCommand: vi.fn(),
    setAddLogEntry: vi.fn(),
  }),
}))

vi.mock('@/composables/useTriggers', () => ({
  useTriggers: () => ({
    processLine: vi.fn(() => ({
      gagged: false,
      highlightClass: undefined,
      soundsToPlay: [],
      commandsToSend: [],
      echoTexts: [],
      matchedTriggers: [],
    })),
    playSounds: vi.fn(),
    evaluateGmcpTriggers: vi.fn(() => ({
      soundsToPlay: [],
      commandsToSend: [],
      echoTexts: [],
    })),
    echoTriggers: vi.fn(),
  }),
}))

vi.mock('@/utils/duriswebAuth', () => ({
  buildDurisWebClientInfo: vi.fn(() => ({ client: 'DurisWeb', version: '1.0.0' })),
}))

import { useMudConnection } from '../useMudConnection.js'
import { createPinia, setActivePinia } from 'pinia'
import { useMudStore } from '@/stores/mudStore'
import type { MudStatLabels } from '@/types/mud'

let activeWrapper: VueWrapper | null = null
function createConnection() {
  const Harness = defineComponent({
    setup() {
      return useMudConnection()
    },
    render() {
      return h('div')
    },
  })

  activeWrapper = mount(Harness)
  return activeWrapper.vm as unknown as ReturnType<typeof useMudConnection>
}

const labels: MudStatLabels = {
  str: 'excellent',
  dex: 'good',
  agi: 'good',
  con: 'good',
  pow: 'good',
  int: 'good',
  wis: 'good',
  cha: 'good',
  luk: 'good',
  kar: 'good',
}

describe('creation socket lifecycle', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    sockets.length = 0
    window.__mudWebSocket = null
    window.__mudConnecting = false
    window.__mudLoggingIn = false
    vi.stubGlobal('WebSocket', FakeSocket)
  })
  afterEach(() => {
    activeWrapper?.unmount()
    activeWrapper = null
    window.__mudWebSocket = null
    vi.unstubAllGlobals()
    vi.useRealTimers()
  })
  it('serializes mutations, preserves state on errors and waits for reset acknowledgement', async () => {
    const connection = createConnection()
    await connection.connect()
    const socket = sockets[0]!
    socket.onopen?.()
    const receive = (message: unknown) => socket.onmessage?.({ data: JSON.stringify(message) })
    receive({
      type: 'chargen_options',
      races: [],
      statMethods: ['default', 'advanced'],
      bonusCount: 4,
    })
    const store = useMudStore()
    expect(store.chargenBonusCount).toBe(4)
    expect(connection.rollStats(1, 'advanced')).toBe(true)
    expect(connection.addBonus('str')).toBe(false)
    expect(connection.resetChargen()).toBe(false)
    expect(JSON.parse(socket.sent.at(-1)!)).toEqual({
      type: 'cmd',
      cmd: 'roll_stats',
      data: { race: 1, method: 'advanced' },
    })
    receive({
      type: 'roll_stats',
      stats: labels,
      bonusRemaining: 4,
      method: 'advanced',
      phase: 'rolling',
    })
    expect(store.chargenStats?.phase).toBe('rolling')
    expect(connection.acceptStats()).toBe(true)
    expect(connection.rollStats(1, 'advanced')).toBe(false)
    receive({
      type: 'stats_accepted',
      stats: labels,
      bonusRemaining: 4,
      method: 'advanced',
      phase: 'bonuses',
    })
    expect(connection.addBonus('str')).toBe(true)
    const before = store.chargenStats
    receive({ type: 'system', data: { status: 'error', message: 'Stat is already at maximum' } })
    expect(store.chargenStats).toBe(before)
    expect(store.chargenError).toContain('maximum')
    expect(store.chargenPending).toBeNull()
    expect(connection.addBonus('dex')).toBe(true)
    receive({
      type: 'bonus_added',
      stats: labels,
      bonusRemaining: 3,
      method: 'advanced',
      phase: 'bonuses',
      boostedStat: 'dex',
    })
    expect(store.chargenStats?.bonusRemaining).toBe(3)
    expect(store.chargenLoading).toBe(false)
    expect(connection.resetChargen()).toBe(true)
    expect(store.chargenStats?.bonusRemaining).toBe(3)
    // Unrelated metadata must not allow a mutation to overtake reset.
    receive({
      type: 'chargen_options',
      races: [],
      statMethods: ['default', 'advanced'],
      bonusCount: 4,
    })
    expect(connection.rollStats(1, 'default')).toBe(false)
    receive({ type: 'system', data: { status: 'error', message: 'Reset could not complete' } })
    expect(store.chargenPending).toBeNull()
    expect(store.chargenStats?.bonusRemaining).toBe(3)
    expect(connection.resetChargen()).toBe(true)
    receive({ type: 'chargen_reset' })
    expect(store.chargenStats).toBeNull()
    expect(store.chargenResetSequence).toBe(1)
    expect(connection.rollStats(1, 'default')).toBe(true)
    receive({
      type: 'roll_stats',
      stats: labels,
      bonusRemaining: 4,
      method: 'default',
      phase: 'bonuses',
    })
    socket.close()
    expect(store.chargenStats).toBeNull()
    expect(store.chargenStatMethods).toEqual([])
    expect(store.chargenPending).toBeNull()
  })

  it('waits for race hometown metadata and does not duplicate options requests', async () => {
    const connection = createConnection()
    await connection.connect()
    const socket = sockets[0]!
    socket.onopen?.()
    const receive = (message: unknown) => socket.onmessage?.({ data: JSON.stringify(message) })
    const store = useMudStore()
    expect(connection.requestChargenOptions()).toBe(true)
    expect(connection.requestChargenOptions()).toBe(false)
    receive({
      type: 'chargen_options',
      races: [{ id: 1, name: 'Human', ansi: 'Human', faction: 'good', classes: [] }],
      statMethods: ['default', 'advanced'],
      bonusCount: 4,
    })
    store.setChargenHometowns([{ id: 1, name: 'Old hometown' }], true)
    expect(connection.getHometowns(1)).toBe(true)
    expect(store.chargenLoading).toBe(true)
    expect(store.chargenHometowns).toEqual([])
    expect(connection.getHometowns(1)).toBe(false)
    receive({ type: 'system', data: { status: 'error', message: 'Hometown lookup failed' } })
    expect(store.chargenLoading).toBe(false)
    expect(connection.getHometowns(1)).toBe(true)
    receive({
      type: 'hometowns',
      race: 1,
      alignment: 'good',
      options: [{ id: 1, name: 'New hometown' }],
      hasChoice: false,
    })
    expect(store.chargenLoading).toBe(false)
    expect(store.chargenHometowns).toEqual([{ id: 1, name: 'New hometown' }])
    expect(store.chargenHasHometownChoice).toBe(false)
  })

  it('retains legacy wire commands and rejects malformed authoritative metadata', async () => {
    const connection = createConnection()
    await connection.connect()
    const socket = sockets[0]!
    socket.onopen?.()
    const receive = (message: unknown) => socket.onmessage?.({ data: JSON.stringify(message) })
    const store = useMudStore()
    receive({ type: 'chargen_options', races: [] })
    expect(store.chargenStatMethods).toEqual([])
    expect(store.chargenBonusCount).toBe(5)
    connection.rollStats(1)
    expect(JSON.parse(socket.sent.at(-1)!)).toEqual({
      type: 'cmd',
      cmd: 'roll_stats',
      data: { race: 1 },
    })
    receive({ type: 'roll_stats', stats: labels, bonusRemaining: 5 })
    expect(store.chargenStats?.bonusRemaining).toBe(5)
    receive({
      type: 'chargen_options',
      races: [],
      statMethods: ['default', 'advanced'],
      bonusCount: 4,
    })
    connection.rollStats(1, 'default')
    receive({ type: 'roll_stats', stats: {}, bonusRemaining: 4, method: 'bogus', phase: 'bonuses' })
    expect(store.chargenError).toContain('Invalid stat selection response')
    expect(store.chargenStats?.bonusRemaining).toBe(5)
    expect(store.chargenPending).toBeNull()
  })

  it('refreshes side-dependent hometowns and ignores previous race or alignment replies', async () => {
    const connection = createConnection()
    await connection.connect()
    const socket = sockets[0]!
    const receive = (message: unknown) => socket.onmessage?.({ data: JSON.stringify(message) })
    const store = useMudStore()
    receive({
      type: 'chargen_options',
      races: [
        { id: 14, name: 'Thri-kreen', ansi: 'Thri-kreen', faction: 'neutral', classes: [] },
        { id: 36, name: 'Firbolg', ansi: 'Firbolg', faction: 'good', classes: [] },
      ],
    })
    expect(connection.getHometowns(14, 'evil')).toBe(true)
    expect(JSON.parse(socket.sent.at(-1)!)).toEqual({
      type: 'cmd',
      cmd: 'get_hometowns',
      data: { race: 14, alignment: 'evil' },
    })
    expect(connection.getHometowns(14, 'good')).toBe(true)
    receive({
      type: 'hometowns',
      race: 14,
      alignment: 'evil',
      options: [{ id: 25, name: 'Wutvr' }],
      hasChoice: true,
    })
    expect(store.chargenHometowns).toEqual([])
    expect(store.chargenHometownsReady).toBe(false)
    expect(store.chargenLoading).toBe(true)
    receive({
      type: 'hometowns',
      race: 14,
      alignment: 'good',
      options: [
        { id: 22, name: 'Ailvio' },
        { id: 18, name: 'Payang' },
      ],
      hasChoice: true,
    })
    expect(store.chargenHometownsReady).toBe(true)
    expect(store.chargenHometowns.map((home) => home.id)).toEqual([22, 18])
    expect(connection.getHometowns(36)).toBe(true)
    receive({
      type: 'hometowns',
      race: 14,
      alignment: 'good',
      options: [{ id: 18, name: 'Payang' }],
      hasChoice: false,
    })
    expect(store.chargenLoading).toBe(true)
    receive({
      type: 'hometowns',
      race: 36,
      alignment: 'good',
      options: [
        { id: 11, name: 'Ugta' },
        { id: 22, name: 'Ailvio' },
        { id: 23, name: 'Plane of Life' },
      ],
      hasChoice: true,
    })
    expect(store.chargenHometowns.map((home) => home.id)).toEqual([11, 22, 23])
    expect(store.chargenLoading).toBe(false)
    expect(connection.getHometowns(14)).toBe(true)
    receive({
      type: 'hometowns',
      race: 14,
      alignment: null,
      options: [{ id: 18, name: 'Payang' }],
      hasChoice: false,
    })
    expect(store.chargenHometowns.map((home) => home.id)).toEqual([18])
    store.clearChargenState()
    expect(store.chargenHometownRequest).toBeNull()
    expect(store.chargenHometownsReady).toBe(false)
  })

  it('omits an unspecified hometown and sends an explicit valid selection unchanged', async () => {
    const connection = createConnection()
    await connection.connect()
    const socket = sockets[0]!
    expect(connection.createCharacter('Pupil', 1, 1, 1, 'good')).toBe(true)
    expect(JSON.parse(socket.sent.at(-1)!).data).not.toHaveProperty('hometown')
    useMudStore().setChargenPending(null)
    expect(connection.createCharacter('Pupil', 1, 1, 1, 'good', 22)).toBe(true)
    expect(JSON.parse(socket.sent.at(-1)!).data.hometown).toBe(22)
  })

  it.each(['chargen_options', 'hometowns'])(
    'handles mutation errors after %s metadata',
    async (type) => {
      const connection = createConnection()
      await connection.connect()
      const socket = sockets[0]!
      const store = useMudStore()
      store.setChargenStats(labels, 3, 'advanced', 'bonuses')
      const previous = store.chargenStats
      expect(connection.addBonus('dex')).toBe(true)
      socket.onmessage?.({
        data: JSON.stringify({ type, races: [], options: [], hasChoice: false }),
      })
      expect(store.chargenLoading).toBe(type === 'hometowns')
      expect(store.chargenPending).toBe('add_bonus')
      socket.onmessage?.({
        data: JSON.stringify({
          type: 'system',
          data: { status: 'error', message: 'Bonus refused' },
        }),
      })
      expect(store.chargenError).toBe('Bonus refused')
      expect(store.chargenPending).toBeNull()
      expect(store.chargenStats).toBe(previous)
      expect(connection.addBonus('str')).toBe(true)
    },
  )

  describe.each([
    ['modern', 'roll_stats'],
    ['modern', 'stats_accepted'],
    ['modern', 'bonus_added'],
    ['modern', 'stats_swapped'],
    ['legacy', 'roll_stats'],
    ['legacy', 'bonus_added'],
    ['legacy', 'stats_swapped'],
  ])('%s %s validation', (server, type) => {
    const modern = server === 'modern'
    it.each<[string, Record<string, unknown>]>([
      ['missing stats', { stats: undefined }],
      ['null stats', { stats: null }],
      ['incomplete labels', { stats: { str: 'good' } }],
      ['numeric label', { stats: { ...labels, luk: 85 } }],
      ...(modern
        ? ([
            ['missing method', { method: undefined }],
            ['missing phase', { phase: undefined }],
            ['unknown method', { method: 'unknown' }],
            ['unknown phase', { phase: 'unknown' }],
          ] satisfies [string, Record<string, unknown>][])
        : []),
      ...(type === 'stats_accepted'
        ? ([
            ['rolling acceptance', { phase: 'rolling' }],
            ['ready acceptance while pending', { phase: 'ready' }],
          ] satisfies [string, Record<string, unknown>][])
        : []),
      ...(type === 'stats_swapped'
        ? []
        : ([
            ['missing counter', { bonusRemaining: undefined }],
            ['null counter', { bonusRemaining: null }],
            ['string counter', { bonusRemaining: '4' }],
            ['fractional counter', { bonusRemaining: 1.5 }],
            ['negative counter', { bonusRemaining: -1 }],
            ['excess counter', { bonusRemaining: modern ? 5 : 6 }],
          ] satisfies [string, Record<string, unknown>][])),
    ])('rejects %s and allows retry without changing stats', async (_name, invalid) => {
      const connection = createConnection()
      await connection.connect()
      const socket = sockets[0]!
      const store = useMudStore()
      store.setChargenOptions(
        [],
        modern ? ['default', 'advanced'] : undefined,
        modern ? 4 : undefined,
      )
      store.setChargenStats(
        labels,
        3,
        modern ? 'advanced' : undefined,
        modern ? 'bonuses' : undefined,
      )
      const previous = store.chargenStats
      const send = () => {
        switch (type) {
          case 'roll_stats':
            return connection.rollStats(1, modern ? 'advanced' : undefined)
          case 'stats_accepted':
            return connection.acceptStats()
          case 'bonus_added':
            return connection.addBonus('dex')
          default:
            return connection.swapStats('str', 'dex')
        }
      }
      expect(send()).toBe(true)
      socket.onmessage?.({
        data: JSON.stringify({
          type,
          stats: labels,
          ...(modern ? { method: 'advanced', phase: 'bonuses' } : {}),
          bonusRemaining: 3,
          ...invalid,
        }),
      })
      expect(store.chargenError).toContain('Invalid stat selection response')
      expect(store.chargenStats).toBe(previous)
      expect(store.chargenPending).toBeNull()
      expect(store.chargenLoading).toBe(false)
      expect(send()).toBe(true)
      socket.onmessage?.({
        data: JSON.stringify({
          type,
          stats: labels,
          ...(modern ? { method: 'advanced', phase: 'bonuses' } : {}),
          ...(type === 'stats_swapped' ? {} : { bonusRemaining: 2 }),
        }),
      })
      expect(store.chargenError).toBeNull()
      expect(store.chargenPending).toBeNull()
      expect(store.chargenStats?.bonusRemaining).toBe(type === 'stats_swapped' ? 3 : 2)
    })
  })

  it('retains ready duplicate acceptance acknowledgements outside pending acceptance', async () => {
    const connection = createConnection()
    await connection.connect()
    const store = useMudStore()
    store.setChargenOptions([], ['default', 'advanced'], 4)
    store.setChargenStats(labels, 0, 'advanced', 'ready')
    sockets[0]!.onmessage?.({
      data: JSON.stringify({
        type: 'stats_accepted',
        stats: labels,
        bonusRemaining: 0,
        method: 'advanced',
        phase: 'ready',
      }),
    })
    expect(store.chargenError).toBeNull()
    expect(store.chargenPending).toBeNull()
    expect(store.chargenStats?.phase).toBe('ready')
    expect(store.chargenStats?.bonusRemaining).toBe(0)
  })

  it.each([
    'roll_stats',
    'accept_stats',
    'add_bonus',
    'swap_stats',
    'reset_chargen',
    'create_character',
  ] as const)(
    'clears %s on copyover close and permits a fresh attempt after authentication',
    async (command) => {
      vi.useFakeTimers()
      const connection = createConnection()
      await connection.connect()
      const socket = sockets[0]!
      const store = useMudStore()
      store.setChargenOptions([], ['default', 'advanced'], 4)
      store.setChargenStats(labels, 3, 'advanced', 'bonuses')
      store.setChargenPending(command)
      socket.onmessage?.({
        data: JSON.stringify({
          type: 'system',
          data: { status: 'copyover', message: 'Server updating' },
        }),
      })
      socket.close()
      expect(store.copyoverInProgress).toBe(true)
      expect(store.chargenPending).toBeNull()
      expect(store.chargenStats).toBeNull()
      expect(store.chargenStatMethods).toEqual([])
      expect(store.chargenLoading).toBe(false)
      await vi.advanceTimersByTimeAsync(100)
      const reconnected = sockets[1]!
      reconnected.onmessage?.({
        data: JSON.stringify({
          type: 'auth',
          status: 'success',
          data: { account: 'test-account', characters: [] },
        }),
      })
      expect(store.connectionState).toBe('authenticated')
      expect(connection.requestChargenOptions()).toBe(true)
      reconnected.onmessage?.({
        data: JSON.stringify({
          type: 'chargen_options',
          races: [],
          statMethods: ['default', 'advanced'],
          bonusCount: 4,
        }),
      })
      expect(connection.rollStats(1, 'default')).toBe(true)
    },
  )

  it('uses four awards, preserves a failed creation for retry and clears a completed attempt', async () => {
    const connection = createConnection()
    await connection.connect()
    const socket = sockets[0]!
    socket.onopen?.()
    const receive = (message: unknown) => socket.onmessage?.({ data: JSON.stringify(message) })
    const store = useMudStore()
    receive({
      type: 'chargen_options',
      races: [],
      statMethods: ['default', 'advanced'],
      bonusCount: 4,
    })
    expect(connection.rollStats(1, 'default')).toBe(true)
    receive({
      type: 'roll_stats',
      stats: labels,
      bonusRemaining: 4,
      method: 'default',
      phase: 'bonuses',
    })
    for (let remaining = 3; remaining >= 0; remaining--) {
      expect(connection.addBonus('dex')).toBe(true)
      receive({
        type: 'bonus_added',
        stats: labels,
        bonusRemaining: remaining,
        method: 'default',
        phase: remaining === 0 ? 'ready' : 'bonuses',
      })
      expect(store.chargenStats?.bonusRemaining).toBe(remaining)
    }
    expect(connection.swapStats('str', 'luk')).toBe(true)
    receive({
      type: 'stats_swapped',
      stats: { ...labels, str: labels.luk, luk: labels.str },
      method: 'default',
      phase: 'ready',
    })
    expect(store.chargenStats?.stats.luk).toBe(labels.str)
    expect(store.chargenStats?.bonusRemaining).toBe(0)
    const before = store.chargenStats
    expect(connection.createCharacter('Testhero', 1, 1, 1, 'good')).toBe(true)
    expect(connection.createCharacter('Testhero', 1, 1, 1, 'good')).toBe(false)
    receive({ type: 'create_character', status: 'error', message: 'Name already taken' })
    expect(store.chargenStats).toBe(before)
    expect(store.chargenError).toBe('Name already taken')
    expect(connection.createCharacter('Newhero', 1, 1, 1, 'good')).toBe(true)
    receive({
      type: 'create_character',
      status: 'created',
      message: 'Welcome',
      name: 'Newhero',
      race: 'Human',
      class: 'Warrior',
      faction: 'good',
    })
    expect(store.connectionState).toBe('in_game')
    expect(store.chargenStats).toBeNull()
    expect(store.chargenStatMethods).toEqual([])
    expect(store.chargenPending).toBeNull()
  })

  it('releases pending state when the socket cannot send', () => {
    const connection = createConnection()
    expect(connection.rollStats(1, 'default')).toBe(false)
    const store = useMudStore()
    expect(store.chargenPending).toBeNull()
    expect(store.chargenLoading).toBe(false)
    expect(store.chargenError).toContain('Connection unavailable')
  })
  it('normalizes live room packets, retires maps and cancels manual overrides without cancelling map sends', async () => {
    const connection = createConnection()
    await connection.connect()
    const socket = sockets[0]!
    socket.onopen?.()
    const receive = (data: unknown) => socket.onmessage?.({ data: JSON.stringify(data) })
    const store = useMudStore()
    receive({
      type: 'gmcp',
      package: 'Room.Info',
      data: {
        num: 101,
        zone: 1,
        name: 'Gate',
        exits: { e: 102 },
        doors: { e: { name: 'gate', closed: false, locked: false } },
      },
    })
    expect(store.room?.exits.east).toEqual({
      vnum: 102,
      door: 'gate',
      closed: false,
      locked: false,
    })
    const stop = vi.fn()
    store.startSpeedwalk('Room 102', 1, stop)
    connection.sendGameCommand('east', 'map')
    expect(stop).not.toHaveBeenCalled()
    connection.sendGameCommand('north')
    expect(stop).toHaveBeenCalledOnce()
    receive({ type: 'gmcp', package: 'Room.Map', data: { map: '~@~' } })
    receive({
      type: 'gmcp',
      package: 'Room.Info',
      data: { num: 0, zone: 600, name: 'Sea', exits: { n: true } },
    })
    expect(store.room?.mapKind).toBe('wilderness')
    expect(store.wildernessMap).toBe('~@~')
    receive({ type: 'gmcp', package: 'Room.Info', data: { num: true, zone: 1, name: 'Invalid' } })
    expect(store.room).toBeNull()
    expect(store.wildernessMap).toBeNull()
    const epoch = store.mapEpoch
    socket.close()
    expect(store.mapEpoch).toBeGreaterThan(epoch)
    receive({ type: 'gmcp', package: 'Room.Info', data: { num: 101, zone: 1, name: 'Stale' } })
    expect(store.room).toBeNull()
  })
})
