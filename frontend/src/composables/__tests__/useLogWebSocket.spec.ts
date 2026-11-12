import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { effectScope, nextTick, ref, shallowRef } from 'vue'

const isConnected = ref(false)
const socket = shallowRef<WebSocket | null>(null)
const sendMessage = vi.fn()
const getSubscriptionToken = vi.fn<() => Promise<string | null>>()
vi.mock('../useWebSocket', () => ({
  useWebSocket: () => ({ socket, isConnected, sendMessage, getSubscriptionToken }),
}))
const { LIVE_LOG_LINE_LIMIT, useLogWebSocket } = await import('../useLogWebSocket')

class Socket extends EventTarget {
  readyState: number = WebSocket.OPEN
  receive(message: unknown) {
    this.dispatchEvent(new MessageEvent('message', { data: JSON.stringify(message) }))
  }
}
const scopes: ReturnType<typeof effectScope>[] = []
const flush = async () => {
  for (let i = 0; i < 5; i++) await nextTick()
}
function mount(category: 'runtime' | 'player' = 'runtime', name = 'syslog') {
  const selection = {
    category: ref<'runtime' | 'player' | null>(category),
    logName: ref<string | null>(name),
    enabled: ref(true),
  }
  const scope = effectScope()
  scopes.push(scope)
  const log = scope.run(() =>
    useLogWebSocket(selection.category, selection.logName, selection.enabled),
  )!
  return { ...selection, log, scope }
}
async function connect() {
  const current = new Socket()
  socket.value = current as unknown as WebSocket
  isConnected.value = true
  await flush()
  return current
}
const subscriptions = () =>
  sendMessage.mock.calls.filter(([message]) => message.type === 'SUBSCRIBE_LOG')
beforeEach(() => {
  isConnected.value = false
  socket.value = null
  sendMessage.mockReset()
  getSubscriptionToken.mockReset().mockResolvedValue('ws-capability')
})
afterEach(() => {
  for (const scope of scopes.splice(0)) scope.stop()
})

describe('live log subscription ownership', () => {
  it('subscribes with a capability and waits for acknowledgement before showing Live', async () => {
    const { log } = mount()
    const ws = await connect()
    expect(sendMessage).toHaveBeenCalledWith({
      type: 'SUBSCRIBE_LOG',
      token: 'ws-capability',
      category: 'runtime',
      logName: 'syslog',
    })
    expect(log.isSubscribed.value).toBe(false)
    ws.receive({ type: 'LOG_SUBSCRIBED', category: 'runtime', logName: 'syslog' })
    expect(log.isSubscribed.value).toBe(true)
    ws.receive({
      type: 'LOG_UPDATE',
      category: 'runtime',
      logName: 'syslog',
      newLines: ['new line'],
    })
    expect(log.newLines.value).toEqual(['new line'])
  })
  it('does not subscribe without a capability', async () => {
    getSubscriptionToken.mockResolvedValueOnce(null)
    const { log } = mount()
    await connect()
    expect(sendMessage).not.toHaveBeenCalled()
    expect(log.isSubscribed.value).toBe(false)
  })
  it('ignores a token fetched for a stale selection', async () => {
    let release!: (token: string) => void
    getSubscriptionToken.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          release = resolve
        }),
    )
    const view = mount()
    await connect()
    view.logName.value = 'game.log'
    await flush()
    release('old-capability')
    await flush()
    expect(subscriptions().map(([message]) => message.logName)).toEqual(['game.log'])
  })
  it('invalidates an old request even when a selection changes A to B to A', async () => {
    let release!: (token: string) => void
    getSubscriptionToken.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          release = resolve
        }),
    )
    const view = mount()
    await connect()
    view.logName.value = 'game.log'
    await flush()
    view.logName.value = 'syslog'
    await flush()
    release('old-capability')
    await flush()
    expect(subscriptions().map(([message]) => [message.logName, message.token])).toEqual([
      ['game.log', 'ws-capability'],
      ['syslog', 'ws-capability'],
    ])
  })
  it('ignores a token from a retired connection after reconnecting', async () => {
    let release!: (token: string) => void
    getSubscriptionToken.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          release = resolve
        }),
    )
    mount()
    const old = await connect()
    old.readyState = WebSocket.CLOSED
    isConnected.value = false
    await flush()
    await connect()
    release('old-capability')
    await flush()
    expect(subscriptions()).toHaveLength(1)
    expect(subscriptions()[0][0].token).toBe('ws-capability')
  })
  it('invalidates pending work on disposal even if disconnected', async () => {
    let release!: (token: string) => void
    getSubscriptionToken.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          release = resolve
        }),
    )
    const view = mount()
    const ws = await connect()
    ws.readyState = WebSocket.CLOSED
    isConnected.value = false
    await flush()
    view.scope.stop()
    release('old-capability')
    await flush()
    expect(subscriptions()).toHaveLength(0)
    expect(view.log.isSubscribed.value).toBe(false)
  })
  it('unsubscribes the captured old selection before subscribing to the new one', async () => {
    const view = mount()
    await connect()
    view.logName.value = 'game.log'
    await flush()
    expect(sendMessage.mock.calls.map(([message]) => [message.type, message.logName])).toEqual([
      ['SUBSCRIBE_LOG', 'syslog'],
      ['UNSUBSCRIBE_LOG', 'syslog'],
      ['SUBSCRIBE_LOG', 'game.log'],
    ])
    view.scope.stop()
    expect(sendMessage).toHaveBeenLastCalledWith({
      type: 'UNSUBSCRIBE_LOG',
      category: 'runtime',
      logName: 'game.log',
    })
  })
  it('attaches immediately when mounted on an already-open socket', async () => {
    const ws = await connect()
    const view = mount()
    await flush()
    ws.receive({ type: 'LOG_SUBSCRIBED', category: 'runtime', logName: 'syslog' })
    ws.receive({
      type: 'LOG_UPDATE',
      category: 'runtime',
      logName: 'syslog',
      newLines: ['current line'],
    })
    expect(view.log.newLines.value).toEqual(['current line'])
  })
  it('clears Live on a scoped denial and ignores other subscriptions or malformed updates', async () => {
    const view = mount()
    const ws = await connect()
    ws.receive({ type: 'LOG_SUBSCRIBED', category: 'runtime', logName: 'syslog' })
    ws.receive({ type: 'LOG_UPDATE', category: 'runtime', logName: 'syslog', newLines: [7] })
    ws.receive({ type: 'ERROR', category: 'player', logName: 'other', message: 'Denied' })
    expect(view.log.isSubscribed.value).toBe(true)
    expect(view.log.newLines.value).toEqual([])
    ws.receive({
      type: 'ERROR',
      category: 'runtime',
      logName: 'syslog',
      message: 'Log unavailable',
    })
    expect(view.log.isSubscribed.value).toBe(false)
  })
  it('clears state when disabled and refuses late updates or acknowledgements', async () => {
    const view = mount()
    const ws = await connect()
    ws.receive({ type: 'LOG_SUBSCRIBED', category: 'runtime', logName: 'syslog' })
    view.enabled.value = false
    await flush()
    ws.receive({ type: 'LOG_SUBSCRIBED', category: 'runtime', logName: 'syslog' })
    ws.receive({ type: 'LOG_UPDATE', category: 'runtime', logName: 'syslog', newLines: ['stale'] })
    expect(view.log.isSubscribed.value).toBe(false)
    expect(view.log.newLines.value).toEqual([])
  })
  it('keeps the newest same-log request through old unsubscribe/error acknowledgements', async () => {
    const view = mount()
    const ws = await connect()
    ws.receive({ type: 'LOG_SUBSCRIBED', category: 'runtime', logName: 'syslog' })
    await view.log.subscribe()
    expect(view.log.isSubscribed.value).toBe(false)
    ws.receive({ type: 'LOG_UNSUBSCRIBED', category: 'runtime', logName: 'syslog' })
    ws.receive({ type: 'ERROR', category: 'runtime', logName: 'syslog', message: 'Older failure' })
    ws.receive({ type: 'LOG_SUBSCRIBED', category: 'runtime', logName: 'syslog' })
    ws.receive({
      type: 'LOG_UPDATE',
      category: 'runtime',
      logName: 'syslog',
      newLines: ['newest request'],
    })
    expect(view.log.isSubscribed.value).toBe(true)
    expect(view.log.newLines.value).toEqual(['newest request'])
  })
  it('retains consecutive chunks in a bounded recent window', async () => {
    const view = mount()
    const ws = await connect()
    ws.receive({ type: 'LOG_SUBSCRIBED', category: 'runtime', logName: 'syslog' })
    for (let index = 0; index < LIVE_LOG_LINE_LIMIT + 2; index++) {
      ws.receive({
        type: 'LOG_UPDATE',
        category: 'runtime',
        logName: 'syslog',
        newLines: [String(index)],
      })
    }
    expect(view.log.newLines.value).toEqual(
      Array.from({ length: LIVE_LOG_LINE_LIMIT }, (_, index) => String(index + 2)),
    )
    ws.receive({
      type: 'LOG_UPDATE',
      category: 'runtime',
      logName: 'syslog',
      newLines: Array.from({ length: 10 }, () => 'x'.repeat(65536)),
    })
    expect(
      view.log.newLines.value.reduce((total, line) => total + line.length, 0),
    ).toBeLessThanOrEqual(256 * 1024)
  })
})
