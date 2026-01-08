/**
 * BroadcastChannel composable for sharing map data between main client and pop-out windows
 * Simpler implementation - each window manages its own channel instance
 */
import { ref, onUnmounted, toRaw } from 'vue'
import type { MudRoom } from '@/types/mud'

const CHANNEL_NAME = 'duris-map-sync'

export interface MapSyncData {
  room: MudRoom | null
  visitedRooms: [number, MudRoom][]
  wildernessMap: string | null
  zoneNumber: number | null
}

/**
 * Used by the main game window to broadcast map data to pop-out windows
 */
export function useMapBroadcastSender(
  getRoom: () => MudRoom | null,
  getVisitedRooms: () => Map<number, MudRoom>,
  getWildernessMap: () => string | null,
  getZoneNumber: () => number | null
) {
  const channel = new BroadcastChannel(CHANNEL_NAME)

  function sendSync() {
    // Convert reactive objects to plain objects for structured clone
    const room = getRoom()
    const visitedRooms = getVisitedRooms()

    // Deep clone to remove Vue reactivity
    const data: MapSyncData = {
      room: room ? JSON.parse(JSON.stringify(toRaw(room))) : null,
      visitedRooms: Array.from(visitedRooms.entries()).map(([k, v]) => [k, JSON.parse(JSON.stringify(toRaw(v)))]),
      wildernessMap: getWildernessMap(),
      zoneNumber: getZoneNumber()
    }
    channel.postMessage({ type: 'sync', data })
  }

  // Callback for speedwalk requests from pop-out
  let onSpeedwalkRequest: ((targetVnum: number) => void) | null = null

  // Listen for messages from pop-out windows
  channel.onmessage = (event) => {
    if (event.data?.type === 'request_sync') {
      sendSync()
    } else if (event.data?.type === 'speedwalk_request' && onSpeedwalkRequest) {
      onSpeedwalkRequest(event.data.targetVnum)
    }
  }

  function setSpeedwalkHandler(handler: (targetVnum: number) => void) {
    onSpeedwalkRequest = handler
  }

  function openPopOutWindow() {
    const width = 600
    const height = 700
    const left = window.screen.width - width - 50
    const top = 50

    window.open(
      '/play/map',
      'duris-map-popout',
      `width=${width},height=${height},left=${left},top=${top},resizable=yes,scrollbars=no`
    )
  }

  onUnmounted(() => {
    channel.close()
  })

  return {
    sendSync,
    openPopOutWindow,
    setSpeedwalkHandler
  }
}

/**
 * Used by the pop-out window to receive map data from main window
 */
export function useMapBroadcastReceiver() {
  const channel = new BroadcastChannel(CHANNEL_NAME)

  const room = ref<MudRoom | null>(null)
  const visitedRooms = ref<Map<number, MudRoom>>(new Map())
  const wildernessMap = ref<string | null>(null)
  const zoneNumber = ref<number | null>(null)
  const isConnected = ref(false)
  const hasData = ref(false)

  channel.onmessage = (event) => {
    if (event.data?.type === 'sync') {
      const data = event.data.data as MapSyncData
      room.value = data.room
      visitedRooms.value = new Map(data.visitedRooms)
      wildernessMap.value = data.wildernessMap
      zoneNumber.value = data.zoneNumber
      isConnected.value = true
      hasData.value = true
    }
  }

  function requestSync() {
    channel.postMessage({ type: 'request_sync' })
  }

  function requestSpeedwalk(targetVnum: number) {
    channel.postMessage({ type: 'speedwalk_request', targetVnum })
  }

  // Request sync periodically
  const interval = setInterval(() => {
    requestSync()
  }, 2000)

  // Initial request
  requestSync()

  onUnmounted(() => {
    clearInterval(interval)
    channel.close()
  })

  return {
    room,
    visitedRooms,
    wildernessMap,
    zoneNumber,
    isConnected,
    hasData,
    requestSync,
    requestSpeedwalk
  }
}
