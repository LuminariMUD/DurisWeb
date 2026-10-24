import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { useWebSocket } from '../useWebSocket'

class Socket {
  static readonly CONNECTING = 0
  static readonly OPEN = 1
  static readonly CLOSED = 3
  static instances: Socket[] = []
  static failNext = false
  readyState = Socket.CONNECTING
  onopen: (() => void) | null = null
  onclose: (() => void) | null = null
  onerror: (() => void) | null = null
  onmessage: ((event: { data: string }) => void) | null = null
  send = vi.fn()
  close = vi.fn(() => {
    this.readyState = Socket.CLOSED
  })

  constructor() {
    if (Socket.failNext) {
      Socket.failNext = false
      throw new Error('Synthetic construction failure')
    }
    Socket.instances.push(this)
  }
  open() {
    this.readyState = Socket.OPEN
    this.onopen?.()
  }
  end() {
    this.readyState = Socket.CLOSED
    this.onclose?.()
  }
  receive(data: string) {
    this.onmessage?.({ data })
  }
}
let api: ReturnType<typeof useWebSocket>
beforeEach(async () => {
  vi.resetModules()
  vi.useFakeTimers()
  vi.spyOn(Math, 'random').mockReturnValue(0)
  vi.stubGlobal('WebSocket', Socket)
  Socket.instances = []
  Socket.failNext = false
  api = (await import('../useWebSocket')).useWebSocket()
})
afterEach(() => {
  api.disconnect()
  vi.useRealTimers()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('application socket reconnection', () => {
  it('backs off through flapping connections and caps the retry window', () => {
    api.connect()
    for (const delay of [2500, 5000, 10000, 15000, 15000]) {
      const count = Socket.instances.length
      Socket.instances.at(-1)!.open()
      Socket.instances.at(-1)!.end()
      vi.advanceTimersByTime(delay - 1)
      expect(Socket.instances).toHaveLength(count)
      vi.advanceTimersByTime(1)
      expect(Socket.instances).toHaveLength(count + 1)
      expect(vi.getTimerCount()).toBe(0)
    }
  })

  it('uses jitter inside the retry window', () => {
    vi.mocked(Math.random).mockReturnValue(0.8)
    api.connect()
    Socket.instances[0].end()
    vi.advanceTimersByTime(4499)
    expect(Socket.instances).toHaveLength(1)
    vi.advanceTimersByTime(1)
    expect(Socket.instances).toHaveLength(2)
  })

  it('resets the retry window after thirty seconds of stable connection', () => {
    api.connect()
    Socket.instances[0].end()
    vi.advanceTimersByTime(2500)
    Socket.instances[1].open()
    vi.advanceTimersByTime(30000)
    Socket.instances[1].end()
    vi.advanceTimersByTime(2499)
    expect(Socket.instances).toHaveLength(2)
    vi.advanceTimersByTime(1)
    expect(Socket.instances).toHaveLength(3)
  })

  it('cancels a scheduled retry and resets manual reconnection after disconnect', () => {
    api.connect()
    Socket.instances[0].end()
    expect(vi.getTimerCount()).toBe(1)
    api.disconnect()
    vi.advanceTimersByTime(60000)
    expect(Socket.instances).toHaveLength(1)
    api.connect()
    Socket.instances[1].end()
    vi.advanceTimersByTime(2500)
    expect(Socket.instances).toHaveLength(3)
  })

  it('ignores late close/message events from a retired connection', () => {
    const event = vi.fn()
    api.onNewEvent(event)
    api.connect()
    const old = Socket.instances[0]
    old.open()
    api.disconnect()
    api.connect()
    const current = Socket.instances[1]
    current.open()
    old.end()
    old.receive(JSON.stringify({ type: 'NEW_PVP_EVENT', data: { id: 1 } }))
    expect(api.isConnected.value).toBe(true)
    expect(event).not.toHaveBeenCalled()
    current.receive(JSON.stringify({ type: 'NEW_PVP_EVENT', data: { id: 2 } }))
    expect(event).toHaveBeenCalledWith({ id: 2 })
    expect(vi.getTimerCount()).toBe(0)
  })

  it('keeps at most one connecting socket and one retry when close events repeat', () => {
    api.connect()
    api.connect()
    expect(Socket.instances).toHaveLength(1)
    Socket.instances[0].end()
    Socket.instances[0].end()
    expect(vi.getTimerCount()).toBe(1)
    vi.advanceTimersByTime(2500)
    expect(Socket.instances).toHaveLength(2)
  })

  it('retries a synchronous construction failure without a hot loop', () => {
    Socket.failNext = true
    api.connect()
    expect(Socket.instances).toHaveLength(0)
    expect(vi.getTimerCount()).toBe(1)
    vi.advanceTimersByTime(2500)
    expect(Socket.instances).toHaveLength(1)
  })
})
