import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h, ref, nextTick } from 'vue'
import { mount, type VueWrapper } from '@vue/test-utils'
import { emptyMapSnapshot, parseRoomInfo } from '../../utils/playMap.js'
import { useMapBroadcastReceiver, useMapBroadcastSender } from '../useMapBroadcast.js'

class Channel {
  static channels: Channel[] = []
  onmessage: ((event: MessageEvent<unknown>) => void) | null = null
  closed = false
  constructor(readonly name: string) {
    Channel.channels.push(this)
  }
  postMessage(message: unknown) {
    for (const target of Channel.channels)
      if (target !== this && target.name === this.name && !target.closed)
        target.onmessage?.({ data: JSON.parse(JSON.stringify(message)) } as MessageEvent<unknown>)
  }
  close() {
    this.closed = true
  }
}
const wrappers: VueWrapper[] = []
function use<T>(setup: () => T): T {
  let result: T
  wrappers.push(
    mount(
      defineComponent({
        setup() {
          result = setup()
          return () => h('div')
        },
      }),
    ),
  )
  return result!
}
beforeEach(() => {
  Channel.channels = []
  vi.stubGlobal('BroadcastChannel', Channel)
  vi.spyOn(window, 'open').mockImplementation(() => null)
})
afterEach(() => {
  wrappers.splice(0).forEach((wrapper) => wrapper.unmount())
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  vi.useRealTimers()
  window.location.hash = ''
})
function makeSender() {
  const snapshot = ref({
    ...emptyMapSnapshot(),
    room: parseRoomInfo({ num: 1, zone: 1, name: 'Room', exits: {} }),
    roomRevision: 1,
    graphRevision: 1,
  })
  const epoch = ref(0)
  const request = vi.fn()
  const sender = use(() => useMapBroadcastSender(snapshot, request, () => epoch.value))
  sender.openPopOutWindow()
  const href = vi.mocked(window.open).mock.calls.at(-1)![0]!.toString()
  return { snapshot, epoch, request, sender, href }
}
describe('map pop-out session synchronization', () => {
  it('isolates simultaneous game tabs, validates requests and never opens a game connection', async () => {
    const first = makeSender(),
      second = makeSender()
    expect(first.href).not.toBe(second.href)
    window.location.hash = first.href.split('#')[1]!
    const receiver = use(useMapBroadcastReceiver)
    expect(receiver.isConnected.value).toBe(true)
    receiver.requestAction('walk', 2)
    expect(first.request).toHaveBeenCalledWith({ action: 'walk', target: 2, roomRevision: 1 })
    expect(second.request).not.toHaveBeenCalled()
    const receiverChannel = Channel.channels.at(-1)!
    receiverChannel.postMessage({
      type: 'action',
      data: { action: 'walk', target: 3, roomRevision: 0 },
    })
    receiverChannel.postMessage({ type: 'action', data: { action: 'quit', roomRevision: 1 } })
    receiverChannel.postMessage({
      type: 'action',
      data: { action: 'walk', target: '2;quit', roomRevision: 1 },
    })
    expect(first.request).toHaveBeenCalledTimes(1)
    receiverChannel.postMessage({ type: 'action', data: { action: 'stop', roomRevision: 0 } })
    expect(first.request).toHaveBeenLastCalledWith({
      action: 'stop',
      target: undefined,
      roomRevision: 0,
    })
    first.snapshot.value = { ...first.snapshot.value, roomRevision: 2 }
    await nextTick()
    expect(receiver.snapshot.value.roomRevision).toBe(2)
    first.epoch.value++
    expect(receiver.isConnected.value).toBe(false)
    expect(receiver.snapshot.value.room).toBeNull()
    first.sender.openPopOutWindow()
    expect(vi.mocked(window.open).mock.calls.at(-1)![0]).not.toBe(first.href)
  })
  it('clears stale data if the owning window disappears without a close message', async () => {
    vi.useFakeTimers()
    const first = makeSender()
    window.location.hash = first.href.split('#')[1]!
    const receiver = use(useMapBroadcastReceiver)
    expect(receiver.isConnected.value).toBe(true)
    Channel.channels[0]!.closed = true
    Channel.channels[0]!.postMessage = () => {}
    Channel.channels[0]!.onmessage = null
    await vi.advanceTimersByTimeAsync(8001)
    expect(receiver.isConnected.value).toBe(false)
    expect(receiver.snapshot.value.graph).toBeNull()
  })
})
