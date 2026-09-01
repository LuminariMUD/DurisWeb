import { ref, computed } from 'vue'
import type { Room, Mobile, ZoneObject, ResetCommand, ZoneMapData } from '@/types'

// Cache keys
const CACHE_PREFIX = 'durisbuild'
const MAX_CACHED_ITEMS = 20

interface CacheEntry<T> {
  data: T
  timestamp: number
}

export type EntityType = 'room' | 'mob' | 'object' | 'resets'
export type DirtyAction = 'modified' | 'created' | 'deleted'

export interface DirtyEntry {
  type: EntityType
  vnum: number
  action: DirtyAction
  data: Room | Mobile | ZoneObject | ResetCommand[] | null // null for deleted items
  timestamp: number
}

// LRU caches for each entity type
const roomCache = ref<Map<string, CacheEntry<Room>>>(new Map())
const mobCache = ref<Map<string, CacheEntry<Mobile>>>(new Map())
const objectCache = ref<Map<string, CacheEntry<ZoneObject>>>(new Map())

// Dirty tracking - shared across all instances
const dirtyItems = ref<Map<string, DirtyEntry>>(new Map())

function getDirtyKey(type: EntityType, vnum: number | 'all'): string {
  return `${type}_${vnum}`
}

export function useZoneCache(zoneId: string) {
  const cacheKey = (key: string) => `${CACHE_PREFIX}_zone_${zoneId}_${key}`

  // Get zone index from localStorage
  function getZoneIndex(): ZoneMapData | null {
    try {
      const stored = localStorage.getItem(cacheKey('index'))
      if (stored) {
        const entry: CacheEntry<ZoneMapData> = JSON.parse(stored)
        return entry.data
      }
    } catch (e) {
      console.error('Failed to read zone index from cache:', e)
    }
    return null
  }

  // Save zone index to localStorage
  function setZoneIndex(data: ZoneMapData): void {
    try {
      const entry: CacheEntry<ZoneMapData> = {
        data,
        timestamp: Date.now(),
      }
      localStorage.setItem(cacheKey('index'), JSON.stringify(entry))
    } catch (e) {
      console.error('Failed to save zone index to cache:', e)
    }
  }

  // Generic LRU cache add
  function addToCache<T>(cache: Map<string, CacheEntry<T>>, key: string, data: T): void {
    if (cache.has(key)) {
      cache.delete(key)
    }
    if (cache.size >= MAX_CACHED_ITEMS) {
      const oldestKey = cache.keys().next().value
      if (oldestKey) {
        cache.delete(oldestKey)
      }
    }
    cache.set(key, { data, timestamp: Date.now() })
  }

  // ========== ROOM OPERATIONS ==========

  function getRoom(vnum: number): Room | null {
    const memKey = `${zoneId}_${vnum}`
    const memEntry = roomCache.value.get(memKey)
    if (memEntry) return memEntry.data

    try {
      const stored = localStorage.getItem(cacheKey(`room_${vnum}`))
      if (stored) {
        const entry: CacheEntry<Room> = JSON.parse(stored)
        addToCache(roomCache.value, memKey, entry.data)
        return entry.data
      }
    } catch (e) {
      console.error('Failed to read room from cache:', e)
    }
    return null
  }

  function setRoom(room: Room): void {
    const memKey = `${zoneId}_${room.vnum}`
    addToCache(roomCache.value, memKey, room)
    try {
      const entry: CacheEntry<Room> = { data: room, timestamp: Date.now() }
      localStorage.setItem(cacheKey(`room_${room.vnum}`), JSON.stringify(entry))
    } catch (e) {
      console.error('Failed to save room to cache:', e)
    }
  }

  function removeRoom(vnum: number): void {
    const memKey = `${zoneId}_${vnum}`
    roomCache.value.delete(memKey)
    localStorage.removeItem(cacheKey(`room_${vnum}`))
  }

  // ========== MOB OPERATIONS ==========

  function getMob(vnum: number): Mobile | null {
    const memKey = `${zoneId}_mob_${vnum}`
    const memEntry = mobCache.value.get(memKey)
    if (memEntry) return memEntry.data

    try {
      const stored = localStorage.getItem(cacheKey(`mob_${vnum}`))
      if (stored) {
        const entry: CacheEntry<Mobile> = JSON.parse(stored)
        addToCache(mobCache.value, memKey, entry.data)
        return entry.data
      }
    } catch (e) {
      console.error('Failed to read mob from cache:', e)
    }
    return null
  }

  function setMob(mob: Mobile): void {
    const memKey = `${zoneId}_mob_${mob.vnum}`
    addToCache(mobCache.value, memKey, mob)
    try {
      const entry: CacheEntry<Mobile> = { data: mob, timestamp: Date.now() }
      localStorage.setItem(cacheKey(`mob_${mob.vnum}`), JSON.stringify(entry))
    } catch (e) {
      console.error('Failed to save mob to cache:', e)
    }
  }

  function removeMob(vnum: number): void {
    const memKey = `${zoneId}_mob_${vnum}`
    mobCache.value.delete(memKey)
    localStorage.removeItem(cacheKey(`mob_${vnum}`))
  }

  // ========== OBJECT OPERATIONS ==========

  function getObject(vnum: number): ZoneObject | null {
    const memKey = `${zoneId}_obj_${vnum}`
    const memEntry = objectCache.value.get(memKey)
    if (memEntry) return memEntry.data

    try {
      const stored = localStorage.getItem(cacheKey(`obj_${vnum}`))
      if (stored) {
        const entry: CacheEntry<ZoneObject> = JSON.parse(stored)
        addToCache(objectCache.value, memKey, entry.data)
        return entry.data
      }
    } catch (e) {
      console.error('Failed to read object from cache:', e)
    }
    return null
  }

  function setObject(obj: ZoneObject): void {
    const memKey = `${zoneId}_obj_${obj.vnum}`
    addToCache(objectCache.value, memKey, obj)
    try {
      const entry: CacheEntry<ZoneObject> = { data: obj, timestamp: Date.now() }
      localStorage.setItem(cacheKey(`obj_${obj.vnum}`), JSON.stringify(entry))
    } catch (e) {
      console.error('Failed to save object to cache:', e)
    }
  }

  function removeObject(vnum: number): void {
    const memKey = `${zoneId}_obj_${vnum}`
    objectCache.value.delete(memKey)
    localStorage.removeItem(cacheKey(`obj_${vnum}`))
  }

  // ========== RESETS OPERATIONS ==========

  function getResets(): ResetCommand[] | null {
    try {
      const stored = localStorage.getItem(cacheKey('resets'))
      if (stored) {
        const entry: CacheEntry<ResetCommand[]> = JSON.parse(stored)
        return entry.data
      }
    } catch (e) {
      console.error('Failed to read resets from cache:', e)
    }
    return null
  }

  function setResets(resets: ResetCommand[]): void {
    try {
      const entry: CacheEntry<ResetCommand[]> = { data: resets, timestamp: Date.now() }
      localStorage.setItem(cacheKey('resets'), JSON.stringify(entry))
    } catch (e) {
      console.error('Failed to save resets to cache:', e)
    }
  }

  function removeResets(): void {
    localStorage.removeItem(cacheKey('resets'))
  }

  // ========== DIRTY TRACKING ==========

  function markDirty(
    type: EntityType,
    vnum: number,
    action: DirtyAction,
    data: Room | Mobile | ZoneObject | ResetCommand[] | null,
  ): void {
    const key = getDirtyKey(type, vnum)
    dirtyItems.value.set(key, {
      type,
      vnum,
      action,
      data,
      timestamp: Date.now(),
    })

    // Also save to localStorage
    if (data) {
      if (type === 'room') setRoom(data as Room)
      else if (type === 'mob') setMob(data as Mobile)
      else if (type === 'object') setObject(data as ZoneObject)
      else if (type === 'resets') setResets(data as ResetCommand[])
    }

    saveDirtyList()
  }

  function markRoomDirty(room: Room, action: DirtyAction = 'modified'): void {
    markDirty('room', room.vnum, action, room)
  }

  function markMobDirty(mob: Mobile, action: DirtyAction = 'modified'): void {
    markDirty('mob', mob.vnum, action, mob)
  }

  function markObjectDirty(obj: ZoneObject, action: DirtyAction = 'modified'): void {
    markDirty('object', obj.vnum, action, obj)
  }

  function markResetsDirty(resets: ResetCommand[]): void {
    // Resets use special vnum 0 since they're not vnum-based
    markDirty('resets', 0, 'modified', resets)
  }

  function clearDirty(type: EntityType, vnum: number): void {
    const key = getDirtyKey(type, vnum)
    dirtyItems.value.delete(key)
    saveDirtyList()
  }

  function clearAllDirty(): void {
    // Clear only items for this zone
    for (const [key, entry] of dirtyItems.value.entries()) {
      // Check if this dirty item belongs to this zone by checking localStorage
      const storageKey =
        entry.type === 'resets' ? cacheKey('resets') : cacheKey(`${entry.type}_${entry.vnum}`)
      if (localStorage.getItem(storageKey) !== null) {
        dirtyItems.value.delete(key)
      }
    }
    saveDirtyList()
  }

  function isDirty(type: EntityType, vnum: number): boolean {
    return dirtyItems.value.has(getDirtyKey(type, vnum))
  }

  function isRoomDirty(vnum: number): boolean {
    return isDirty('room', vnum)
  }

  function isMobDirty(vnum: number): boolean {
    return isDirty('mob', vnum)
  }

  function isObjectDirty(vnum: number): boolean {
    return isDirty('object', vnum)
  }

  function isResetsDirty(): boolean {
    return isDirty('resets', 0)
  }

  function getDirtyList(): DirtyEntry[] {
    // Return only items that belong to this zone
    const result: DirtyEntry[] = []
    for (const entry of dirtyItems.value.values()) {
      // Check if we have the corresponding cached data for this zone
      const storageKey =
        entry.type === 'resets'
          ? cacheKey('resets')
          : cacheKey(
              `${entry.type === 'room' ? 'room' : entry.type === 'mob' ? 'mob' : 'obj'}_${entry.vnum}`,
            )
      if (localStorage.getItem(storageKey) !== null || entry.action === 'deleted') {
        result.push(entry)
      }
    }
    return result
  }

  function getDirtyRooms(): DirtyEntry[] {
    return getDirtyList().filter((e) => e.type === 'room')
  }

  function getDirtyMobs(): DirtyEntry[] {
    return getDirtyList().filter((e) => e.type === 'mob')
  }

  function getDirtyObjects(): DirtyEntry[] {
    return getDirtyList().filter((e) => e.type === 'object')
  }

  // Save dirty list to localStorage
  function saveDirtyList(): void {
    try {
      const entries = getDirtyList().map((e) => ({
        type: e.type,
        vnum: e.vnum,
        action: e.action,
      }))
      localStorage.setItem(cacheKey('dirty'), JSON.stringify(entries))
    } catch (e) {
      console.error('Failed to save dirty list:', e)
    }
  }

  // Load dirty list from localStorage
  function loadDirtyList(): void {
    try {
      const stored = localStorage.getItem(cacheKey('dirty'))
      if (stored) {
        const entries: Array<{ type: EntityType; vnum: number; action: DirtyAction }> =
          JSON.parse(stored)
        for (const entry of entries) {
          let data: Room | Mobile | ZoneObject | ResetCommand[] | null = null

          if (entry.action !== 'deleted') {
            if (entry.type === 'room') data = getRoom(entry.vnum)
            else if (entry.type === 'mob') data = getMob(entry.vnum)
            else if (entry.type === 'object') data = getObject(entry.vnum)
            else if (entry.type === 'resets') data = getResets()
          }

          if (data || entry.action === 'deleted') {
            const key = getDirtyKey(entry.type, entry.vnum)
            dirtyItems.value.set(key, {
              type: entry.type,
              vnum: entry.vnum,
              action: entry.action,
              data,
              timestamp: Date.now(),
            })
          }
        }
      }
    } catch (e) {
      console.error('Failed to load dirty list:', e)
    }
  }

  // Clear all cache for this zone
  function clearCache(): void {
    // Clear memory caches for this zone
    for (const key of roomCache.value.keys()) {
      if (key.startsWith(`${zoneId}_`)) {
        roomCache.value.delete(key)
      }
    }
    for (const key of mobCache.value.keys()) {
      if (key.startsWith(`${zoneId}_`)) {
        mobCache.value.delete(key)
      }
    }
    for (const key of objectCache.value.keys()) {
      if (key.startsWith(`${zoneId}_`)) {
        objectCache.value.delete(key)
      }
    }

    // Clear localStorage for this zone
    const keysToRemove: string[] = []
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (key && key.startsWith(cacheKey(''))) {
        keysToRemove.push(key)
      }
    }
    keysToRemove.forEach((key) => localStorage.removeItem(key))

    // Clear dirty items for this zone
    clearAllDirty()
  }

  // Get last sync timestamp
  function getLastSync(): number | null {
    try {
      const stored = localStorage.getItem(cacheKey('lastSync'))
      return stored ? parseInt(stored, 10) : null
    } catch {
      return null
    }
  }

  // Set last sync timestamp
  function setLastSync(timestamp: number = Date.now()): void {
    localStorage.setItem(cacheKey('lastSync'), timestamp.toString())
  }

  // Computed: total dirty count for this zone
  const dirtyCount = computed(() => getDirtyList().length)

  // Computed: has any dirty items
  const hasDirtyItems = computed(() => dirtyCount.value > 0)

  // Computed: dirty rooms count
  const dirtyRoomCount = computed(() => getDirtyRooms().length)

  // Computed: dirty mobs count
  const dirtyMobCount = computed(() => getDirtyMobs().length)

  // Computed: dirty objects count
  const dirtyObjectCount = computed(() => getDirtyObjects().length)

  // Initialize by loading dirty list
  loadDirtyList()

  return {
    // Zone index
    getZoneIndex,
    setZoneIndex,

    // Room operations
    getRoom,
    setRoom,
    removeRoom,
    markRoomDirty,
    isRoomDirty,
    getDirtyRooms,

    // Mob operations
    getMob,
    setMob,
    removeMob,
    markMobDirty,
    isMobDirty,
    getDirtyMobs,

    // Object operations
    getObject,
    setObject,
    removeObject,
    markObjectDirty,
    isObjectDirty,
    getDirtyObjects,

    // Resets operations
    getResets,
    setResets,
    removeResets,
    markResetsDirty,
    isResetsDirty,

    // Generic dirty tracking
    markDirty,
    clearDirty,
    clearAllDirty,
    isDirty,
    getDirtyList,

    // Computed
    dirtyCount,
    hasDirtyItems,
    dirtyRoomCount,
    dirtyMobCount,
    dirtyObjectCount,

    // Backward compatibility
    hasDirtyRooms: computed(() => dirtyRoomCount.value > 0),

    // Cache management
    clearCache,
    getLastSync,
    setLastSync,
    loadDirtyList,
  }
}
