import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h } from 'vue'
import { mount, type VueWrapper } from '@vue/test-utils'

const { store, storeMudCredentials, clearMudCredentials, getMudCredentials, sockets } = vi.hoisted(() => ({
  store: {
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
  },
  storeMudCredentials: vi.fn(),
  clearMudCredentials: vi.fn(),
  getMudCredentials: vi.fn(() => null),
  sockets: [] as FakeSocket[],
}))

class FakeSocket {
  static OPEN = 1
  readyState = FakeSocket.OPEN
  onmessage: ((event: { data: string }) => void) | null = null
  onclose: (() => void) | null = null
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
    this.onclose?.()
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

vi.mock('@/composables/useSiteConfig', async () => {
  const { ref } = await import('vue')
  return {
    useSiteConfig: () => ({
      mudWsUrl: ref('ws://mud.test'),
      loadConfig: vi.fn(),
      isLoaded: ref(true),
    }),
  }
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
  generateDurisWebSignature: vi.fn(async () => 'test-signature'),
}))

import { useMudConnection } from '../useMudConnection'

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
    sockets.length = 0
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
})
