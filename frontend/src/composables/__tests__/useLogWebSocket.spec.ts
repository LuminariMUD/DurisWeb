import { beforeEach, describe, expect, it, vi } from 'vitest'
import { effectScope, nextTick, ref, shallowRef } from 'vue'

const isConnected = ref(false)
const sendMessage = vi.fn()
const getSubscriptionToken = vi.fn<() => Promise<string | null>>()

vi.mock('../useWebSocket', () => ({
  useWebSocket: () => ({
    socket: shallowRef(null),
    isConnected,
    sendMessage,
    getSubscriptionToken,
  }),
}))

const { useLogWebSocket } = await import('../useLogWebSocket')

const flush = async () => {
  for (let i = 0; i < 5; i++) await nextTick()
}

function mount(category = 'runtime' as const, logName = 'syslog') {
  const selection = { category: ref<'runtime' | 'player' | null>(category), logName: ref(logName) }
  const scope = effectScope()
  const log = scope.run(() => useLogWebSocket(selection.category, selection.logName, ref(true)))!
  return { ...selection, log, scope }
}

describe('useLogWebSocket', () => {
  beforeEach(() => {
    isConnected.value = false
    sendMessage.mockReset()
    getSubscriptionToken.mockReset().mockResolvedValue('ws-capability')
  })

  it('subscribes with a websocket capability, and again after a reconnect', async () => {
    const { scope } = mount()
    isConnected.value = true
    await flush()
    expect(sendMessage).toHaveBeenCalledWith({
      type: 'SUBSCRIBE_LOG',
      token: 'ws-capability',
      category: 'runtime',
      logName: 'syslog',
    })

    isConnected.value = false
    await flush()
    isConnected.value = true
    await flush()
    expect(sendMessage.mock.calls.filter(([m]) => m.type === 'SUBSCRIBE_LOG')).toHaveLength(2)
    scope.stop()
  })

  it('does not subscribe without a capability or for a stale selection', async () => {
    getSubscriptionToken.mockResolvedValueOnce(null)
    const first = mount()
    isConnected.value = true
    await flush()
    expect(sendMessage).not.toHaveBeenCalled()
    expect(first.log.isSubscribed.value).toBe(false)
    first.scope.stop()

    isConnected.value = false
    let release!: (token: string) => void
    getSubscriptionToken.mockImplementationOnce(() => new Promise((resolve) => (release = resolve)))
    const second = mount()
    isConnected.value = true
    await flush()
    second.logName.value = 'game.log'
    await flush()
    release('ws-capability')
    await flush()
    const logNames = sendMessage.mock.calls
      .filter(([m]) => m.type === 'SUBSCRIBE_LOG')
      .map(([m]) => m.logName)
    expect(logNames).toEqual(['game.log'])
    second.scope.stop()
  })
})
