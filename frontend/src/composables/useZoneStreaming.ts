// Zone Streaming Composable
// WebSocket client for streaming zone data (rooms, mobs, objects, resets)

import { ref, computed, onUnmounted, type Ref, type ComputedRef } from 'vue'
import type { RoomIndex, MobIndex, ObjIndex, ResetWithMetadata } from '@/types'
import { useGlobalProgress } from './useGlobalProgress'
import { frontendConfiguration } from '@/config/environment'

export interface StreamState<T> {
  isStreaming: boolean
  isComplete: boolean
  total: number
  loaded: number
  items: T[]
  error: string | null
}

function createInitialState<T>(): StreamState<T> {
  return {
    isStreaming: false,
    isComplete: false,
    total: 0,
    loaded: 0,
    items: [],
    error: null,
  }
}

export type StreamType = 'rooms' | 'mobs' | 'objects' | 'resets'

export interface UseZoneStreamingReturn {
  // State
  roomState: Ref<StreamState<RoomIndex>>
  mobState: Ref<StreamState<MobIndex>>
  objectState: Ref<StreamState<ObjIndex>>
  resetState: Ref<StreamState<ResetWithMetadata>>

  // Progress computed
  roomProgress: ComputedRef<number>
  mobProgress: ComputedRef<number>
  objectProgress: ComputedRef<number>
  resetProgress: ComputedRef<number>
  isAnyStreaming: ComputedRef<boolean>

  // Actions
  streamRooms: (zoneId: string) => void
  streamMobs: (zoneId: string) => void
  streamObjects: (zoneId: string) => void
  streamResets: (zoneId: string) => void
  cancelStream: (type?: StreamType) => void
  clearState: (type?: StreamType) => void
}

export function useZoneStreaming(): UseZoneStreamingReturn {
  const WS_URL = frontendConfiguration.websocketUrl
  const { addTask, updateTask, completeTask, removeTask } = useGlobalProgress()

  // State for each type
  const roomState = ref<StreamState<RoomIndex>>(createInitialState())
  const mobState = ref<StreamState<MobIndex>>(createInitialState())
  const objectState = ref<StreamState<ObjIndex>>(createInitialState())
  const resetState = ref<StreamState<ResetWithMetadata>>(createInitialState())

  // WebSocket instance (shared)
  let ws: WebSocket | null = null
  let wsConnected = false
  let pendingStreams: Array<{ zoneId: string; type: StreamType }> = []

  // Track active streams to clean up
  const activeStreams = new Set<string>()

  // Progress computed
  const roomProgress = computed(() =>
    roomState.value.total > 0
      ? Math.round((roomState.value.loaded / roomState.value.total) * 100)
      : 0,
  )

  const mobProgress = computed(() =>
    mobState.value.total > 0 ? Math.round((mobState.value.loaded / mobState.value.total) * 100) : 0,
  )

  const objectProgress = computed(() =>
    objectState.value.total > 0
      ? Math.round((objectState.value.loaded / objectState.value.total) * 100)
      : 0,
  )

  const resetProgress = computed(() =>
    resetState.value.total > 0
      ? Math.round((resetState.value.loaded / resetState.value.total) * 100)
      : 0,
  )

  const isAnyStreaming = computed(
    () =>
      roomState.value.isStreaming ||
      mobState.value.isStreaming ||
      objectState.value.isStreaming ||
      resetState.value.isStreaming,
  )

  // Get state ref by type
  function getStateByType(type: StreamType): Ref<StreamState<any>> {
    switch (type) {
      case 'rooms':
        return roomState
      case 'mobs':
        return mobState
      case 'objects':
        return objectState
      case 'resets':
        return resetState
    }
  }

  // Handle WebSocket message
  function handleMessage(event: MessageEvent) {
    try {
      const data = JSON.parse(event.data)

      // Handle zone stream start (rooms, mobs, objects)
      if (data.type === 'ZONE_STREAM_START') {
        const state = getStateByType(data.streamType)
        state.value.total = data.total
      }

      // Handle zone stream progress (rooms, mobs, objects)
      if (data.type === 'ZONE_STREAM_PROGRESS') {
        const state = getStateByType(data.streamType)
        const taskId = `zone-${data.zoneId}-${data.streamType}`

        state.value.loaded = data.loaded
        // Replace items array to ensure reactivity
        state.value.items = [...state.value.items, ...data.items]

        // Update global progress
        const progress = data.total > 0 ? Math.round((data.loaded / data.total) * 100) : 0
        updateTask(taskId, progress)
      }

      // Handle zone stream complete (rooms, mobs, objects)
      if (data.type === 'ZONE_STREAM_COMPLETE') {
        const state = getStateByType(data.streamType)
        const taskId = `zone-${data.zoneId}-${data.streamType}`

        state.value.isStreaming = false
        state.value.isComplete = true
        completeTask(taskId)
        activeStreams.delete(`${data.zoneId}-${data.streamType}`)
      }

      // Handle zone stream error (rooms, mobs, objects)
      if (data.type === 'ZONE_STREAM_ERROR') {
        const state = getStateByType(data.streamType)
        const taskId = `zone-${data.zoneId}-${data.streamType}`

        state.value.error = data.message || 'Unknown error'
        state.value.isStreaming = false
        removeTask(taskId)
        activeStreams.delete(`${data.zoneId}-${data.streamType}`)
      }

      // Handle resets stream start
      if (data.type === 'ZONE_RESETS_STREAM_START') {
        resetState.value.total = data.total
      }

      // Handle resets stream progress
      if (data.type === 'ZONE_RESETS_STREAM_PROGRESS') {
        const taskId = `zone-${data.zoneId}-resets`

        resetState.value.loaded = data.loaded
        resetState.value.items = [...resetState.value.items, ...data.items]

        const progress = data.total > 0 ? Math.round((data.loaded / data.total) * 100) : 0
        updateTask(taskId, progress)
      }

      // Handle resets stream complete
      if (data.type === 'ZONE_RESETS_STREAM_COMPLETE') {
        const taskId = `zone-${data.zoneId}-resets`

        resetState.value.isStreaming = false
        resetState.value.isComplete = true
        completeTask(taskId)
        activeStreams.delete(`${data.zoneId}-resets`)
      }

      // Handle resets stream error
      if (data.type === 'ZONE_RESETS_STREAM_ERROR') {
        const taskId = `zone-${data.zoneId}-resets`

        resetState.value.error = data.message || 'Unknown error'
        resetState.value.isStreaming = false
        removeTask(taskId)
        activeStreams.delete(`${data.zoneId}-resets`)
      }
    } catch (err) {
      console.error('Error parsing WebSocket message:', err)
    }
  }

  // Connect WebSocket
  function connectWebSocket(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (ws && wsConnected) {
        resolve()
        return
      }

      ws = new WebSocket(WS_URL)

      ws.onopen = () => {
        wsConnected = true
        // Process any pending streams
        pendingStreams.forEach(({ zoneId, type }) => {
          sendStreamRequest(zoneId, type)
        })
        pendingStreams = []
        resolve()
      }

      ws.onmessage = handleMessage

      ws.onerror = (error) => {
        console.error('WebSocket error:', error)
        reject(error)
      }

      ws.onclose = () => {
        wsConnected = false
        ws = null
      }
    })
  }

  // Send stream request
  function sendStreamRequest(zoneId: string, type: StreamType) {
    if (ws && wsConnected) {
      // Resets use a different message type
      if (type === 'resets') {
        ws.send(
          JSON.stringify({
            type: 'ZONE_RESETS_STREAM_START',
            zoneId,
          }),
        )
      } else {
        ws.send(
          JSON.stringify({
            type: 'ZONE_STREAM_START',
            zoneId,
            streamType: type,
          }),
        )
      }
    }
  }

  // Generic stream function
  async function streamData(zoneId: string, type: StreamType): Promise<void> {
    const state = getStateByType(type)
    const streamKey = `${zoneId}-${type}`

    // Cancel existing stream for this type
    if (activeStreams.has(streamKey)) {
      return
    }

    // Reset state
    state.value = {
      isStreaming: true,
      isComplete: false,
      total: 0,
      loaded: 0,
      items: [],
      error: null,
    }

    const taskId = `zone-${zoneId}-${type}`
    addTask(taskId, `Loading ${type}...`)
    activeStreams.add(streamKey)

    // Connect WebSocket if needed, then send request
    if (!ws || !wsConnected) {
      pendingStreams.push({ zoneId, type })
      try {
        await connectWebSocket()
      } catch {
        state.value.error = 'Failed to connect'
        state.value.isStreaming = false
        removeTask(taskId)
        activeStreams.delete(streamKey)
      }
    } else {
      sendStreamRequest(zoneId, type)
    }
  }

  // Stream functions for each type
  const streamRooms = (zoneId: string): void => {
    streamData(zoneId, 'rooms')
  }

  const streamMobs = (zoneId: string): void => {
    streamData(zoneId, 'mobs')
  }

  const streamObjects = (zoneId: string): void => {
    streamData(zoneId, 'objects')
  }

  const streamResets = (zoneId: string): void => {
    streamData(zoneId, 'resets')
  }

  // Cancel stream (not really possible to cancel WebSocket mid-stream, but we can ignore results)
  const cancelStream = (type?: StreamType): void => {
    if (type) {
      const state = getStateByType(type)
      state.value.isStreaming = false
    } else {
      roomState.value.isStreaming = false
      mobState.value.isStreaming = false
      objectState.value.isStreaming = false
      resetState.value.isStreaming = false
    }
  }

  // Clear state (renamed to avoid conflict with resetState ref)
  const clearState = (type?: StreamType): void => {
    if (type === 'rooms' || !type) {
      roomState.value = createInitialState()
    }
    if (type === 'mobs' || !type) {
      mobState.value = createInitialState()
    }
    if (type === 'objects' || !type) {
      objectState.value = createInitialState()
    }
    if (type === 'resets' || !type) {
      resetState.value = createInitialState()
    }
  }

  // Cleanup on unmount
  onUnmounted(() => {
    cancelStream()
    if (ws) {
      ws.close()
      ws = null
    }
  })

  return {
    roomState,
    mobState,
    objectState,
    resetState,
    roomProgress,
    mobProgress,
    objectProgress,
    resetProgress,
    isAnyStreaming,
    streamRooms,
    streamMobs,
    streamObjects,
    streamResets,
    cancelStream,
    clearState,
  }
}
