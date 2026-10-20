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

import { useMudConnection } from '../useMudConnection'
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
      races: [],
      statMethods: ['default', 'advanced'],
      bonusCount: 4,
    })
    store.setChargenHometowns([{ id: 1, name: 'Old hometown' }], true)
    expect(connection.getHometowns(1)).toBe(true)
    expect(store.chargenLoading).toBe(true)
    expect(store.chargenHometowns).toEqual([])
    expect(connection.getHometowns(5)).toBe(false)
    receive({ type: 'system', data: { status: 'error', message: 'Hometown lookup failed' } })
    expect(store.chargenLoading).toBe(false)
    expect(connection.getHometowns(1)).toBe(true)
    receive({
      type: 'hometowns',
      race: 1,
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
})
