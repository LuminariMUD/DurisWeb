import {
  computed,
  onUnmounted,
  provide,
  ref,
  shallowRef,
  watch,
  type InjectionKey,
  type Ref,
} from 'vue'
import { useMudStore } from '../stores/mudStore.js'
import { useMudConnection } from './useMudConnection.js'
import { useAuth } from './useAuth.js'
import { frontendConfiguration } from '../config/environment.js'
import { useMapBroadcastSender, type MapAction, type MapRequest } from './useMapBroadcast.js'
import { createMapNavigator } from '../utils/mapNavigation.js'
import { parseMapGraph, type PlayMapGraph, type PlayMapSnapshot } from '../utils/playMap.js'

export interface PlayMapContext {
  preferences: Ref<PlayMapPreferences>
  snapshot: Ref<PlayMapSnapshot>
  action: (action: MapAction, target?: number) => void
  popOut: () => void
  canPopOut: boolean
}
export interface PlayMapPreferences {
  view: 'local' | 'overview'
  showAllFloors: boolean
  clickToWalk: boolean
  roomSize: number
  asciiSize: number
  follow: boolean
  selectedId: number | null
  overviewZoom: number | null
  overviewZone: number | null
  overviewPan: { x: number; y: number } | null
}
export function defaultMapPreferences(): PlayMapPreferences {
  return {
    view: 'local',
    showAllFloors: false,
    clickToWalk: false,
    roomSize: 14,
    asciiSize: 18,
    follow: true,
    selectedId: null,
    overviewZoom: null,
    overviewZone: null,
    overviewPan: null,
  }
}
export const playMapKey: InjectionKey<PlayMapContext> = Symbol('play-map')

/** One controller per game session; dock/mobile/floating maps only render it. */
export function usePlayMap() {
  const store = useMudStore()
  const { sendGameCommand } = useMudConnection()
  const { accountName } = useAuth()
  const graph = shallowRef<PlayMapGraph | null>(null)
  const graphRevision = ref(0)
  const loading = ref(false)
  const error = ref<string | null>(null)
  const paused = ref(false)
  const preferences = ref(defaultMapPreferences())
  const cache = new Map<number, PlayMapGraph>()
  const accepted = shallowRef({
    room: store.room,
    roomRevision: store.roomRevision,
    wildernessMap: store.wildernessMap,
    rooms: [...store.visitedRooms.values()],
  })
  let serial = 0
  let download: AbortController | null = null
  let activeZone: number | null = null
  function cancelDownload() {
    serial++
    download?.abort()
    download = null
    loading.value = false
  }
  async function loadZone(zone: number) {
    cancelDownload()
    const generation = serial
    const controller = new AbortController()
    download = controller
    graph.value = null
    error.value = null
    loading.value = true
    const timeout = setTimeout(() => controller.abort(), 15000)
    try {
      // Warm entries are still reauthorized before becoming visible on zone entry.
      const response = await fetch(
        `${frontendConfiguration.apiUrl}/api/wiki/zones/${zone}/map-data`,
        {
          signal: controller.signal,
          cache: 'no-store',
          credentials: 'include',
        },
      )
      if (!response.ok)
        throw new Error(
          response.status === 401 || response.status === 403
            ? 'Website login is required for this map.'
            : `Map unavailable (${response.status}). Use Reload to retry.`,
        )
      const parsed = parseMapGraph(await response.json())
      if (!parsed) throw new Error('Invalid map data. Use Reload to retry.')
      if (generation !== serial || controller.signal.aborted) return
      const cached = cache.get(zone)
      const acceptedGraph =
        cached && JSON.stringify(cached) === JSON.stringify(parsed) ? cached : parsed
      cache.delete(zone)
      cache.set(zone, acceptedGraph)
      if (cache.size > 12) cache.delete(cache.keys().next().value!)
      graph.value = acceptedGraph
      graphRevision.value++
    } catch (failure) {
      if (generation === serial) {
        graph.value = null
        error.value = controller.signal.aborted
          ? 'Map request timed out. Use Reload to retry.'
          : failure instanceof Error
            ? failure.message
            : 'Map unavailable. Use Reload to retry.'
        cache.clear()
      }
    } finally {
      clearTimeout(timeout)
      if (generation === serial) {
        loading.value = false
        download = null
      }
    }
  }
  const navigator = createMapNavigator({
    room: () => store.room,
    rooms: () => [...store.visitedRooms.values()],
    graph: () => graph.value,
    canWalk: () =>
      graph.value !== null &&
      !loading.value &&
      !error.value &&
      !store.wildernessMap &&
      !paused.value &&
      !store.isFighting &&
      !store.copyoverInProgress &&
      store.connectionState === 'in_game' &&
      store.room?.mapKind !== 'wilderness',
    send: (command) => sendGameCommand(command, 'map'),
    start: (target, steps, stop) => store.startSpeedwalk(target, steps, stop),
    progress: (steps) => store.updateSpeedwalkSteps(steps),
    finish: () => store.clearSpeedwalk(),
    log: (message) => store.addLogEntry('system', message),
  })
  function acceptRoom() {
    if (paused.value) return
    const room = store.room
    accepted.value = {
      room,
      roomRevision: store.roomRevision,
      wildernessMap: store.wildernessMap,
      rooms: [...store.visitedRooms.values()],
    }
    const zone =
      room && room.mapKind !== 'wilderness' && !store.wildernessMap ? room.zoneNumber : null
    if (zone !== activeZone) {
      activeZone = zone
      graph.value = null
      error.value = null
      graphRevision.value++
      if (zone !== null) void loadZone(zone)
      else cancelDownload()
    }
  }
  function reload() {
    cancelDownload()
    cache.clear()
    graph.value = null
    error.value = null
    activeZone = null
    acceptRoom()
  }
  watch(
    () => store.roomRevision,
    () => {
      navigator.observeRoom(store.room)
      acceptRoom()
    },
    { flush: 'sync' },
  )
  watch(() => store.wildernessMap, acceptRoom, { flush: 'sync' })
  watch(
    () => [store.connectionState, store.copyoverInProgress, store.isFighting],
    () => {
      if (store.connectionState !== 'in_game' || store.copyoverInProgress || store.isFighting)
        navigator.stop()
      if (store.connectionState !== 'in_game' || store.copyoverInProgress) {
        cancelDownload()
        cache.clear()
        graph.value = null
        graphRevision.value++
        activeZone = null
        accepted.value = {
          room: null,
          roomRevision: store.roomRevision,
          wildernessMap: null,
          rooms: [],
        }
      } else acceptRoom()
    },
    { flush: 'sync' },
  )
  watch(
    () => store.mapEpoch,
    () => {
      navigator.reset()
      paused.value = false
      reload()
    },
    { flush: 'sync' },
  )
  watch(accountName, () => {
    navigator.stop()
    paused.value = false
    reload()
  })
  const snapshot = computed<PlayMapSnapshot>(() => ({
    ...accepted.value,
    rooms: accepted.value.rooms.filter(
      (room) => room.zoneNumber === accepted.value.room?.zoneNumber,
    ),
    zoneNumber: accepted.value.room?.zoneNumber ?? null,
    graph: graph.value,
    graphRevision: graphRevision.value,
    loading: loading.value,
    error: error.value,
    paused: paused.value,
    walking: store.isSpeedwalking,
    stepsRemaining: store.speedwalkStepsRemaining,
    target: store.speedwalkTarget,
    cachedZones: cache.size,
  }))
  function action(type: MapAction, target?: number) {
    if (type === 'stop') {
      navigator.stop()
      return
    }
    if (type === 'pause') {
      navigator.stop()
      cancelDownload()
      paused.value = true
      return
    }
    if (type === 'resume') {
      paused.value = false
      reload()
      return
    }
    if (type === 'reload') {
      navigator.stop()
      paused.value = false
      reload()
      if (
        (store.room?.mapKind === 'wilderness' || store.wildernessMap) &&
        store.connectionState === 'in_game' &&
        !store.copyoverInProgress
      )
        sendGameCommand('look', 'map')
      return
    }
    if (target !== undefined) void navigator.walk(target)
  }
  const broadcast = useMapBroadcastSender(
    snapshot,
    (request: MapRequest) => action(request.action, request.target),
    () => store.mapEpoch,
  )
  const context: PlayMapContext = {
    preferences,
    snapshot,
    action,
    popOut: broadcast.openPopOutWindow,
    canPopOut: broadcast.supported,
  }
  provide(playMapKey, context)
  function reauthorize() {
    if (document.visibilityState !== 'visible') return
    if (!paused.value) reload()
    else {
      // Pause freezes game snapshots, not website authorization. Recheck the frozen zone.
      const room = accepted.value.room
      if (room && room.mapKind !== 'wilderness' && !accepted.value.wildernessMap)
        void loadZone(room.zoneNumber)
    }
  }
  window.addEventListener('focus', reauthorize)
  acceptRoom()
  onUnmounted(() => {
    cancelDownload()
    navigator.stop()
    cache.clear()
    window.removeEventListener('focus', reauthorize)
  })
  return context
}
