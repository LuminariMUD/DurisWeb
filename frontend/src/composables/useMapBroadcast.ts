import { ref, onUnmounted, watch, type Ref } from 'vue'
import {
  emptyMapSnapshot,
  isRecord,
  isVnum,
  parseMapSnapshot,
  type PlayMapSnapshot,
} from '../utils/playMap.js'

export type MapAction = 'walk' | 'stop' | 'pause' | 'resume' | 'reload'
export interface MapRequest {
  action: MapAction
  target?: number
  roomRevision: number
}
const actions: MapAction[] = ['walk', 'stop', 'pause', 'resume', 'reload']
const validSession = (value: string) => /^[a-zA-Z0-9-]{16,80}$/.test(value)

export function useMapBroadcastSender(
  snapshot: Ref<PlayMapSnapshot>,
  request: (value: MapRequest) => void,
  epoch: () => number,
) {
  const supported =
    typeof BroadcastChannel !== 'undefined' && typeof globalThis.crypto?.randomUUID === 'function'
  let session = supported ? crypto.randomUUID() : ''
  let channel = supported ? new BroadcastChannel(`duris-map-${session}`) : null
  function sendSync() {
    channel?.postMessage({ type: 'sync', data: JSON.parse(JSON.stringify(snapshot.value)) })
  }
  function receive(event: MessageEvent<unknown>) {
    const message = event.data
    if (!isRecord(message)) return
    if (message.type === 'request_sync') {
      sendSync()
      return
    }
    if (message.type !== 'action' || !isRecord(message.data)) return
    const data = message.data
    const action = actions.find((entry) => entry === data.action)
    if (
      !action ||
      !isVnum(data.roomRevision) ||
      (action === 'walk' && data.roomRevision !== snapshot.value.roomRevision) ||
      (data.target !== undefined && !isVnum(data.target))
    )
      return
    request({ action, roomRevision: data.roomRevision, target: data.target })
  }
  function listen() {
    const owner = channel
    if (owner)
      owner.onmessage = (event) => {
        if (channel === owner) receive(event)
      }
  }
  listen()
  watch(
    epoch,
    () => {
      channel?.postMessage({ type: 'closed' })
      channel?.close()
      session = supported ? crypto.randomUUID() : ''
      channel = supported ? new BroadcastChannel(`duris-map-${session}`) : null
      listen()
    },
    { flush: 'sync' },
  )
  watch(snapshot, sendSync)
  const heartbeat = setInterval(sendSync, 2000)
  function openPopOutWindow() {
    if (!supported) return
    window.open(
      `/play/map#${session}`,
      `duris-map-${session}`,
      'width=600,height=700,resizable=yes,scrollbars=no',
    )
    sendSync()
  }
  onUnmounted(() => {
    clearInterval(heartbeat)
    channel?.postMessage({ type: 'closed' })
    channel?.close()
  })
  return { openPopOutWindow, supported }
}

export function useMapBroadcastReceiver() {
  const snapshot = ref<PlayMapSnapshot>(emptyMapSnapshot())
  const isConnected = ref(false)
  const hasData = ref(false)
  const session = window.location.hash.slice(1)
  const channel =
    validSession(session) && typeof BroadcastChannel !== 'undefined'
      ? new BroadcastChannel(`duris-map-${session}`)
      : null
  let lastMessage = 0
  function retire() {
    isConnected.value = false
    snapshot.value = emptyMapSnapshot()
  }
  if (channel)
    channel.onmessage = (event: MessageEvent<unknown>) => {
      if (!isRecord(event.data)) return
      if (event.data.type === 'closed') {
        retire()
        return
      }
      if (event.data.type !== 'sync') return
      const parsed = parseMapSnapshot(event.data.data)
      if (!parsed) return
      if (
        parsed.graph !== null &&
        snapshot.value.graph !== null &&
        parsed.graphRevision === snapshot.value.graphRevision &&
        parsed.zoneNumber === snapshot.value.zoneNumber
      )
        parsed.graph = snapshot.value.graph
      snapshot.value = parsed
      lastMessage = Date.now()
      hasData.value = true
      isConnected.value = parsed.room !== null
    }
  function requestSync() {
    channel?.postMessage({ type: 'request_sync' })
  }
  function requestAction(action: MapAction, target?: number) {
    if (!isConnected.value) return
    channel?.postMessage({
      type: 'action',
      data: { action, target, roomRevision: snapshot.value.roomRevision },
    })
  }
  const interval = setInterval(() => {
    if (lastMessage && Date.now() - lastMessage > 6500) retire()
    requestSync()
  }, 2000)
  requestSync()
  onUnmounted(() => {
    clearInterval(interval)
    channel?.close()
  })
  return { snapshot, isConnected, hasData, requestSync, requestAction }
}
