import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h } from 'vue'
import { mount, type VueWrapper } from '@vue/test-utils'

const textGag = vi.hoisted(() => ({ active: false }))
const stopAllTimers = vi.hoisted(() => vi.fn())

const {
  store,
  storeMudCredentials,
  clearMudCredentials,
  getMudCredentials,
  sockets,
  siteConfiguration,
} = vi.hoisted(() => ({
  store: {
    connectionError: null as string | null,
    connectionState: 'disconnected',
    setCloseDiagnostic: vi.fn(),
    retireMap: vi.fn(),
    clearChargenState: vi.fn(),
    recoveryState: 'idle',
    emailVerificationState: 'idle',
    accountInfo: { email: 'old@example.test' },
    setAccountInfo: vi.fn(),
    setAccountError: vi.fn(),
    copyoverInProgress: false,
    copyoverCharacterName: null,
    chargenLoading: false,
    setConnectionState: vi.fn(),
    setAccount: vi.fn(),
    clearCopyoverState: vi.fn(),
    setCharacter: vi.fn(),
    setLatency: vi.fn(),
    reset: vi.fn(),
    openReconnectDialog: vi.fn(),
    addLogEntry: vi.fn(),
    addApprovalMessage: vi.fn(),
    clearApprovalMessages: vi.fn(),
    startApprovalWait: vi.fn(),
    addChatMessage: vi.fn(),
  },
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
  onclose: ((event: { code: number; reason: string; wasClean: boolean }) => void) | null = null
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
    this.onclose?.({ code: 1000, reason: 'test reconnect', wasClean: true })
  }
}

vi.mock('@/stores/mudStore', () => ({
  useMudStore: () => store,
}))

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
    stopAllTimers,
    setSendCommand: vi.fn(),
    setAddLogEntry: vi.fn(),
  }),
}))

vi.mock('@/composables/useTriggers', () => ({
  useTriggers: () => ({
    processLine: vi.fn((line: string) => ({
      gagged: textGag.active && line.includes('weather'),
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
import outputFixtures from '../../components/mud/__tests__/fixtures/output-presentation-v1.json'
import chatFixtures from '../../components/mud/__tests__/fixtures/chat-presentation-v1.json'

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

describe('useMudConnection credential lifecycle', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.clearAllMocks()
    textGag.active = false
    store.connectionError = null
    store.setConnectionState.mockImplementation((_state: string, error?: string) => {
      store.connectionState = _state
      store.connectionError = error ?? null
    })
    store.recoveryState = 'idle'
    store.emailVerificationState = 'idle'
    sockets.length = 0
    siteConfiguration.mudWsUrl.value = 'wss://mud.test'
    siteConfiguration.isLoaded.value = true
    siteConfiguration.isAvailable.value = true
    siteConfiguration.loadConfig.mockResolvedValue()
    const storage = new Map<string, string>()
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
      removeItem: (key: string) => storage.delete(key),
      clear: () => storage.clear(),
    })
    window.__mudWebSocket = null
    window.__mudLoggingIn = false
    window.__mudConnecting = false
    vi.stubGlobal('WebSocket', FakeSocket)
  })

  afterEach(() => {
    activeWrapper?.unmount()
    activeWrapper = null
    window.__mudWebSocket = null
    vi.unstubAllGlobals()
    vi.useRealTimers()
  })

  it('waits for the inbox acknowledgement before publishing an email change', async () => {
    const connection = createConnection()
    await connection.connect()
    expect(connection.changeEmail('new@example.test')).toBe(true)
    expect(store.emailVerificationState).toBe('requesting')
    expect(store.setAccountInfo).not.toHaveBeenCalled()
    sockets[0]!.onmessage?.({
      data: JSON.stringify({ type: 'account', action: 'email_verification_requested' }),
    })
    expect(store.emailVerificationState).toBe('requested')
    expect(store.setAccountInfo).not.toHaveBeenCalled()
    connection.confirmEmail('inbox-code')
    expect(JSON.parse(sockets[0]!.sent.at(-1)!)).toEqual({
      type: 'cmd',
      cmd: 'confirm_email',
      data: { code: 'inbox-code' },
    })
    sockets[0]!.onmessage?.({
      data: JSON.stringify({
        type: 'account',
        action: 'email_changed',
        data: { email: 'new@example.test' },
      }),
    })
    expect(store.emailVerificationState).toBe('verified')
    expect(store.setAccountInfo).toHaveBeenCalledWith({ email: 'new@example.test' })
  })

  it('recovers through server acknowledgements without storing reset credentials', async () => {
    const connection = createConnection()
    await connection.requestReset('Returning')
    expect(store.recoveryState).toBe('requesting')
    sockets[0]!.onmessage?.({
      data: JSON.stringify({ type: 'account', action: 'reset_requested' }),
    })
    expect(store.recoveryState).toBe('requested')
    await connection.completeReset('Returning', 'inbox-code', 'new-password')
    expect(store.recoveryState).toBe('completing')
    expect(JSON.parse(sockets[0]!.sent.at(-1)!)).toEqual({
      type: 'cmd',
      cmd: 'complete_reset',
      data: { account: 'Returning', code: 'inbox-code', newPassword: 'new-password' },
    })
    sockets[0]!.onmessage?.({
      data: JSON.stringify({
        type: 'account',
        action: 'error',
        error: 'Failed to save password change',
      }),
    })
    expect(store.recoveryState).toBe('requested')
    expect(store.setAccountError).toHaveBeenLastCalledWith('Failed to save password change')
    sockets[0]!.onmessage?.({
      data: JSON.stringify({ type: 'account', action: 'reset_completed' }),
    })
    expect(store.recoveryState).toBe('completed')
    expect(clearMudCredentials).toHaveBeenCalled()
    expect(storeMudCredentials).not.toHaveBeenCalled()
  })

  it('releases recovery controls after an interrupted connection without claiming success', async () => {
    const connection = createConnection()
    await connection.requestReset('Returning')
    expect(store.recoveryState).toBe('requesting')
    sockets[0]!.close()
    expect(store.recoveryState).toBe('ready')
    expect(store.setAccountError).toHaveBeenCalledWith(
      expect.stringContaining('Connection interrupted'),
    )
    expect(storeMudCredentials).not.toHaveBeenCalled()
  })

  it('sends non-privileged client metadata on connection open', async () => {
    const connection = createConnection()
    await connection.connect()
    sockets[0]!.onopen?.()

    expect(JSON.parse(sockets[0]!.sent[0]!)).toEqual({
      type: 'gmcp',
      package: 'Client.Info',
      data: { client: 'DurisWeb', version: '1.0.0' },
    })
    expect(JSON.parse(sockets[0]!.sent[0]!).data).not.toHaveProperty('sig')
  })

  it('clears the connecting state when site configuration is unavailable', async () => {
    siteConfiguration.mudWsUrl.value = null
    siteConfiguration.isLoaded.value = false
    siteConfiguration.isAvailable.value = false
    const connection = createConnection()

    await connection.connect()

    expect(window.__mudConnecting).toBe(false)
    expect(store.setConnectionState).toHaveBeenLastCalledWith('error', 'Failed to connect')
    expect(sockets).toHaveLength(0)

    siteConfiguration.mudWsUrl.value = 'wss://mud.test'
    siteConfiguration.isAvailable.value = true
    await connection.connect()
    expect(sockets).toHaveLength(1)
  })

  it('preserves each blank continuation and pager control as exactly one game frame', async () => {
    const connection = createConnection()
    await connection.connect()
    const commands = ['help combat', '', '', '2', 'r', 'b', 'q', 'look']

    for (const command of commands) {
      expect(connection.sendGameCommand(command)).toBe(true)
    }

    expect(sockets[0]!.sent.map((frame) => JSON.parse(frame))).toEqual(
      commands.map((data) => ({ type: 'cmd', cmd: 'game', data })),
    )
  })

  it('does not queue a disconnected continuation for replay after reconnect', async () => {
    const connection = createConnection()
    expect(connection.sendGameCommand('')).toBe(false)
    await connection.connect()
    expect(sockets[0]!.sent).toEqual([])
  })

  it('stores pending credentials only after a successful auth response', async () => {
    const connection = createConnection()
    await connection.login('Cwial', 'temporary-password')

    expect(storeMudCredentials).not.toHaveBeenCalled()
    expect(sockets).toHaveLength(1)

    sockets[0]!.onmessage?.({
      data: JSON.stringify({
        type: 'auth',
        status: 'success',
        data: { account: 'Cwial', characters: [] },
      }),
    })

    expect(storeMudCredentials).toHaveBeenCalledWith('Cwial', 'temporary-password')
    expect(clearMudCredentials).not.toHaveBeenCalled()
  })

  it('clears stored credentials after a failed auth response', async () => {
    const connection = createConnection()
    await connection.login('Cwial', 'temporary-password')

    sockets[0]!.onmessage?.({
      data: JSON.stringify({
        type: 'auth',
        status: 'failed',
        error: 'Invalid credentials',
      }),
    })

    expect(storeMudCredentials).not.toHaveBeenCalled()
    expect(clearMudCredentials).toHaveBeenCalledTimes(1)
  })

  it('retains the launch refusal when the server closes after authentication failure', async () => {
    const connection = createConnection()
    await connection.login('Cwial', 'temporary-password')
    const reason = 'The new season is being prepared. Reconnect at 2026-10-28 18:00:00 UTC.'
    sockets[0]!.onmessage?.({
      data: JSON.stringify({ type: 'auth', status: 'failed', error: reason }),
    })
    sockets[0]!.close()

    expect(store.setConnectionState).toHaveBeenLastCalledWith('disconnected', reason)
    expect(store.connectionError).toBe(reason)
    expect(store.openReconnectDialog).toHaveBeenCalledTimes(1)
    expect(storeMudCredentials).not.toHaveBeenCalled()
  })

  it('keeps the generic reconnect message when the server supplies no error', async () => {
    const connection = createConnection()
    await connection.connect()
    sockets[0]!.close()

    expect(store.setConnectionState).toHaveBeenLastCalledWith('disconnected', undefined)
    expect(store.connectionError).toBeNull()
    expect(store.openReconnectDialog).toHaveBeenCalledTimes(1)
  })

  it('uses close diagnostics after a transport error instead of retaining the generic error', async () => {
    const connection = createConnection()
    await connection.connect()
    sockets[0]!.onerror?.(new Event('error'))
    sockets[0]!.onclose?.({ code: 1006, reason: '', wasClean: false })
    expect(store.connectionError).toBeNull()
    expect(store.setCloseDiagnostic.mock.lastCall?.[0]).toMatchObject({ category: 'abnormal' })
  })

  it('preserves a real server refusal even when an error precedes the final close', async () => {
    const connection = createConnection()
    await connection.connect()
    sockets[0]!.onmessage?.({
      data: JSON.stringify({ type: 'auth', status: 'failed', error: 'Reconnect at 18:00 UTC.' }),
    })
    sockets[0]!.onerror?.(new Event('error'))
    sockets[0]!.onclose?.({ code: 1006, reason: '', wasClean: false })
    expect(store.connectionError).toBe('Reconnect at 18:00 UTC.')
  })

  it('keeps arbitrary peer close text and transport details out of the console', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    const connection = createConnection()
    await connection.connect()
    sockets[0]!.onerror?.({ url: 'wss://192.0.2.1/?token=PRIVATE_SENTINEL' })
    sockets[0]!.onclose?.({ code: 1006, reason: 'PRIVATE_SENTINEL 192.0.2.1', wasClean: false })
    expect(JSON.stringify([...log.mock.calls, ...error.mock.calls])).not.toMatch(
      /PRIVATE_SENTINEL|192\.0\.2\.1/,
    )
    log.mockRestore()
    error.mockRestore()
  })

  it.each(['login', 'register'] as const)(
    'settles %s when connection setup fails instead of polling forever',
    async (method) => {
      siteConfiguration.isAvailable.value = false
      const connection = createConnection()
      let result: boolean | undefined
      const pending = (
        method === 'login'
          ? connection.login('Fixture', 'synthetic')
          : connection.register('Fixture', 'synthetic', 'fixture@example.invalid')
      ).then((value) => {
        result = value
      })
      await vi.advanceTimersByTimeAsync(10_100)
      expect(result).toBe(false)
      await pending
      expect(sockets).toHaveLength(0)
    },
  )

  it.each(['closed', 'replaced'])(
    'does not send pending credentials after the captured socket is %s',
    async (mode) => {
      vi.stubGlobal(
        'WebSocket',
        class extends FakeSocket {
          constructor(url: string) {
            super(url)
            this.readyState = 0
          }
        },
      )
      const connection = createConnection()
      let result: boolean | undefined
      const pending = connection.login('Fixture', 'synthetic').then((value) => {
        result = value
      })
      await vi.advanceTimersByTimeAsync(0)
      const old = sockets[0]!
      old.readyState = 3
      old.onclose?.({ code: 1006, reason: '', wasClean: false })
      if (mode === 'replaced') {
        await connection.connect()
        sockets[1]!.readyState = FakeSocket.OPEN
        sockets[1]!.onopen?.()
      }
      await vi.advanceTimersByTimeAsync(100)
      expect(result).toBe(false)
      await pending
      expect(
        sockets.every((socket) => socket.sent.every((frame) => !frame.includes('synthetic'))),
      ).toBe(true)
    },
  )

  it('expires setup on the first delayed background timer instead of counting 200 ticks', async () => {
    let elapsed = 0
    const clock = vi.spyOn(performance, 'now').mockImplementation(() => elapsed)
    vi.stubGlobal(
      'WebSocket',
      class extends FakeSocket {
        constructor(url: string) {
          super(url)
          this.readyState = 0
        }
      },
    )
    const connection = createConnection()
    let result: boolean | undefined
    const pending = connection.login('Fixture', 'synthetic').then((value) => {
      result = value
    })
    await vi.advanceTimersByTimeAsync(0)
    elapsed = 20_000
    await vi.advanceTimersByTimeAsync(50)
    expect(result).toBe(false)
    await pending
    expect(sockets[0]!.sent).toEqual([])
    clock.mockRestore()
  })

  it.each(['login', 'register'] as const)(
    'leaves an actionable error after an asynchronous %s socket timeout',
    async (method) => {
      vi.stubGlobal(
        'WebSocket',
        class extends FakeSocket {
          constructor(url: string) {
            super(url)
            this.readyState = 0
          }
          close() {
            this.readyState = 2
            setTimeout(() => {
              this.readyState = 3
              this.onclose?.({ code: 1006, reason: '', wasClean: false })
            }, 1)
          }
        },
      )
      const connection = createConnection()
      const pending =
        method === 'login'
          ? connection.login('Fixture', 'synthetic')
          : connection.register('Fixture', 'synthetic', 'fixture@example.invalid')
      await vi.advanceTimersByTimeAsync(10_050)
      await expect(pending).resolves.toBe(false)
      expect(store.connectionState).toBe('error')
      expect(store.connectionError).toBe('Connection timed out. Please try again.')
      expect(stopAllTimers).toHaveBeenCalled()
      expect(window.__mudWebSocket).toBeNull()
      await vi.advanceTimersByTimeAsync(50)
      expect(store.connectionState).toBe('error')
      expect(store.openReconnectDialog).not.toHaveBeenCalled()
      expect(window.__mudConnecting).toBe(false)
      await connection.connect()
      expect(sockets).toHaveLength(2)
    },
  )

  it('bounds a connection that never opens and sends no credentials after it expires', async () => {
    vi.stubGlobal(
      'WebSocket',
      class extends FakeSocket {
        constructor(url: string) {
          super(url)
          this.readyState = 0
        }
      },
    )
    const connection = createConnection()
    let result: boolean | undefined
    const pending = connection.login('Fixture', 'synthetic').then((value) => {
      result = value
    })
    await vi.advanceTimersByTimeAsync(10_100)
    expect(result).toBe(false)
    await pending
    expect(sockets[0]!.sent).toEqual([])
    expect(window.__mudWebSocket).toBeNull()
    expect(window.__mudLoggingIn).toBe(false)
  })

  it('summarizes an abrupt 1006 close with activity ages and no peer text', async () => {
    vi.setSystemTime(new Date('2026-11-12T18:00:00Z'))
    const connection = createConnection()
    await connection.connect()
    const socket = sockets[0]!
    socket.onopen?.()
    vi.advanceTimersByTime(30_000) // JSON keepalive send
    socket.onmessage?.({ data: JSON.stringify({ type: 'pong' }) })
    vi.advanceTimersByTime(5_000)
    socket.onclose?.({ code: 1006, reason: 'secret peer text', wasClean: false })

    const diagnostic = store.setCloseDiagnostic.mock.lastCall?.[0]
    expect(diagnostic).toMatchObject({
      closedAt: '2026-11-12T18:00:35.000Z',
      code: 1006,
      wasClean: false,
      category: 'abnormal',
      connectedForMs: 35_000,
      lastSentAgoMs: 5_000,
      lastReceivedAgoMs: 5_000,
    })
    expect(JSON.stringify(diagnostic)).not.toContain('secret')
    expect(store.openReconnectDialog).toHaveBeenCalledTimes(1)
  })

  it('classifies the server heartbeat timeout and session replacement closes', async () => {
    const connection = createConnection()
    await connection.connect()
    sockets[0]!.onclose?.({ code: 1001, reason: 'Ping timeout', wasClean: true })
    expect(store.setCloseDiagnostic.mock.lastCall?.[0]).toMatchObject({
      category: 'heartbeat_timeout',
    })

    await connection.connect()
    sockets[1]!.onclose?.({ code: 1000, reason: 'Duplicate session', wasClean: true })
    expect(store.setCloseDiagnostic.mock.lastCall?.[0]).toMatchObject({
      category: 'session_replaced',
    })
  })

  it('records no diagnostic for a copyover close or a stale socket callback', async () => {
    const connection = createConnection()
    await connection.connect()
    const stale = sockets[0]!
    stale.onopen?.()
    stale.readyState = 3
    await connection.connect()
    // The fake fires onclose synchronously during replacement; browsers fire it later.
    store.setCloseDiagnostic.mockClear()
    store.openReconnectDialog.mockClear()
    stale.onclose?.({ code: 1006, reason: '', wasClean: false })
    expect(store.setCloseDiagnostic.mock.calls.every(([diagnostic]) => diagnostic === null)).toBe(
      true,
    )

    store.copyoverInProgress = true
    try {
      expect(sockets).toHaveLength(2)
      sockets[1]!.onclose?.({ code: 1006, reason: '', wasClean: false })
      expect(store.setCloseDiagnostic.mock.calls.every(([diagnostic]) => diagnostic === null)).toBe(
        true,
      )
      expect(store.openReconnectDialog).not.toHaveBeenCalled()
    } finally {
      store.copyoverInProgress = false
      connection.disconnect()
    }
  })

  it('delivers one presentation snapshot per packet through reconnect and default reset', async () => {
    const connection = createConnection()
    await connection.connect()
    for (const fixture of chatFixtures.filter((entry) => entry.recipient === 'Bob')) {
      const packet = {
        type: 'gmcp',
        package: 'Comm.Channel',
        data: { ...fixture.packet, timestamp: 1 },
      }
      sockets.at(-1)!.onmessage?.({ data: JSON.stringify(packet) })
      expect(store.addChatMessage).toHaveBeenLastCalledWith(
        fixture.packet.channel,
        fixture.packet.sender,
        fixture.packet.text,
        undefined,
        undefined,
        fixture.packet.presentation,
        undefined,
      )
      if (fixture.case === 'selected') {
        connection.disconnect()
        await connection.connect()
      }
    }
    expect(store.addChatMessage).toHaveBeenCalledTimes(9)
    const socket = sockets.at(-1)!
    socket.onmessage?.({
      data: JSON.stringify({
        type: 'gmcp',
        package: 'Comm.Channel',
        data: { channel: 'say', sender: {}, text: 'invalid' },
      }),
    })
    expect(store.addChatMessage).toHaveBeenCalledTimes(9)
    socket.onmessage?.({
      data: JSON.stringify({
        type: 'gmcp',
        package: 'Comm.Channel',
        data: { channel: 'say', sender: 'Bob', text: 'old server' },
      }),
    })
    expect(store.addChatMessage).toHaveBeenCalledTimes(10)
    expect(store.addChatMessage).toHaveBeenLastCalledWith(
      'say',
      'Bob',
      'old server',
      undefined,
      undefined,
      undefined,
      undefined,
    )
  })
  it('negotiates the link decoder and pairs per-line metadata without automatic commands', async () => {
    const connection = createConnection()
    await connection.connect()
    sockets[0]!.onopen?.()
    expect(JSON.parse(sockets[0]!.sent[1]!)).toEqual({
      type: 'gmcp',
      package: 'Core.Supports.Set',
      data: ['Duris.Capabilities 1', 'Duris.Links 1'],
    })
    sockets[0]!.onmessage?.({ data: JSON.stringify(outputFixtures[0]) })
    const entries = store.addLogEntry.mock.calls
    const linked = entries.find((entry) => String(entry[1]).includes('weather'))
    expect(linked?.[3]).toMatchObject({
      links: [{ start: 2, end: 9, kind: 'command', target: 'help weather' }, { kind: 'url' }],
    })
    expect(linked?.[4]).toBe(true)
    expect(sockets[0]!.sent.filter((packet) => JSON.parse(packet).type === 'cmd')).toHaveLength(0)
    store.addLogEntry.mockClear()
    textGag.active = true
    sockets[0]!.onmessage?.({ data: JSON.stringify(outputFixtures[0]) })
    expect(store.addLogEntry.mock.calls.some((entry) => String(entry[1]).includes('weather'))).toBe(
      false,
    )
    expect(store.addLogEntry.mock.calls.some((entry) => String(entry[1]).startsWith('xxxxx'))).toBe(
      true,
    )
  })

  it('renegotiates only decoder support on each fresh socket', async () => {
    const connection = createConnection()
    await connection.connect()
    sockets.at(-1)!.onopen?.()
    connection.disconnect()
    await connection.connect()
    sockets.at(-1)!.onopen?.()
    for (const socket of sockets.slice(-2)) {
      const sent = socket.sent.map((packet) => JSON.parse(packet))
      expect(sent.filter((packet) => packet.package === 'Core.Supports.Set')).toEqual([
        {
          type: 'gmcp',
          package: 'Core.Supports.Set',
          data: ['Duris.Capabilities 1', 'Duris.Links 1'],
        },
      ])
      expect(sent.some((packet) => packet.package === 'Duris.Subscribe')).toBe(false)
    }
  })

  it('keeps Unicode metadata aligned after a preceding gag and a blank line', async () => {
    const connection = createConnection()
    await connection.connect()
    textGag.active = true
    sockets.at(-1)!.onmessage?.({
      data: JSON.stringify({
        type: 'text',
        category: 'info',
        data: 'weather hidden\r\n\r\n🧭 visible\r\n',
        presentation: {
          version: 1,
          text: 'weather hidden\n\n🧭 visible\n',
          underline: false,
          runs: [[0, 26, 19, 0]],
          links: [{ start: 18, end: 25, kind: 'command', target: 'help visible' }],
        },
      }),
    })
    expect(store.addLogEntry.mock.calls.some((entry) => String(entry[1]).includes('hidden'))).toBe(
      false,
    )
    expect(store.addLogEntry).toHaveBeenCalledWith(
      'info',
      '🧭 visible',
      undefined,
      {
        version: 1,
        text: '🧭 visible',
        underline: false,
        runs: [[0, 9, 19, 0]],
        links: [{ start: 2, end: 9, kind: 'command', target: 'help visible' }],
      },
      true,
    )
  })

  it('displays truncated and undecorated packets once without reconstructing links', async () => {
    const connection = createConnection()
    await connection.connect()
    const socket = sockets.at(-1)!
    const original = outputFixtures[0]!
    socket.onmessage?.({ data: JSON.stringify({ ...original, data: 'kept prefix' }) })
    socket.onmessage?.({
      data: JSON.stringify({
        type: 'text',
        category: 'info',
        data: 'https://example.test/?x=1&no-cache',
      }),
    })
    expect(store.addLogEntry.mock.calls).toEqual([
      ['info', 'kept prefix', undefined, undefined, true],
      ['info', 'https://example.test/?x=1&no-cache', undefined, undefined, true],
    ])
    expect(socket.sent.some((packet) => JSON.parse(packet).cmd === 'game')).toBe(false)
  })
})
