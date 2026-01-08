/**
 * IndexedDB cache for map tiles and zone entrances
 * Persists data across browser sessions for instant map loading
 */

import type { WikiMapTile, WikiZoneEntrance } from '@/types'

const DB_NAME = 'duris-map-cache'
const DB_VERSION = 2
const TILES_STORE = 'tiles'
const ENTRANCES_STORE = 'entrances'
const CACHE_TTL = 24 * 60 * 60 * 1000 // 24 hours in ms

interface CachedChunk {
  key: string
  tiles: WikiMapTile[]
  timestamp: number
}

interface CachedEntrances {
  key: string
  entrances: WikiZoneEntrance[]
  timestamp: number
}

let db: IDBDatabase | null = null
let dbPromise: Promise<IDBDatabase | null> | null = null
let dbFailed = false

/**
 * Initialize IndexedDB connection
 */
function openDB(): Promise<IDBDatabase | null> {
  if (dbFailed) return Promise.resolve(null)
  if (db) return Promise.resolve(db)
  if (dbPromise) return dbPromise

  dbPromise = new Promise((resolve) => {
    if (typeof indexedDB === 'undefined') {
      console.warn('IndexedDB not supported in this browser')
      dbFailed = true
      resolve(null)
      return
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION)

    request.onerror = () => {
      console.warn('IndexedDB error:', request.error)
      dbFailed = true
      resolve(null)
    }

    request.onsuccess = () => {
      db = request.result
      resolve(db)
    }

    request.onupgradeneeded = (event) => {
      const database = (event.target as IDBOpenDBRequest).result
      if (!database.objectStoreNames.contains(TILES_STORE)) {
        database.createObjectStore(TILES_STORE, { keyPath: 'key' })
      }
      if (!database.objectStoreNames.contains(ENTRANCES_STORE)) {
        database.createObjectStore(ENTRANCES_STORE, { keyPath: 'key' })
      }
    }
  })

  return dbPromise
}

// Pre-initialize IndexedDB on module load
openDB()

/**
 * Get cached tiles from IndexedDB
 */
export async function getCachedTiles(key: string): Promise<WikiMapTile[] | null> {
  try {
    const database = await openDB()
    if (!database) {
      return null
    }

    return new Promise((resolve) => {
      const transaction = database.transaction(TILES_STORE, 'readonly')
      const store = transaction.objectStore(TILES_STORE)
      const request = store.get(key)

      request.onsuccess = () => {
        const result = request.result as CachedChunk | undefined
        if (!result) {
          resolve(null)
          return
        }

        // Check if cache is stale
        if (Date.now() - result.timestamp > CACHE_TTL) {
          resolve(null)
          return
        }

        resolve(result.tiles)
      }

      request.onerror = () => {
        resolve(null)
      }
    })
  } catch {
    return null
  }
}

/**
 * Store tiles in IndexedDB
 */
export async function setCachedTiles(key: string, tiles: WikiMapTile[]): Promise<void> {
  try {
    const database = await openDB()
    if (!database) return

    return new Promise((resolve) => {
      const transaction = database.transaction(TILES_STORE, 'readwrite')
      const store = transaction.objectStore(TILES_STORE)

      const chunk: CachedChunk = {
        key,
        tiles,
        timestamp: Date.now()
      }

      const request = store.put(chunk)
      request.onsuccess = () => resolve()
      request.onerror = () => resolve()
    })
  } catch {
    // Fail silently - cache is optional
  }
}

/**
 * Clear all cached tiles (useful when map data is updated)
 */
export async function clearTileCache(): Promise<void> {
  try {
    const database = await openDB()
    if (!database) return

    return new Promise((resolve) => {
      const transaction = database.transaction(TILES_STORE, 'readwrite')
      const store = transaction.objectStore(TILES_STORE)
      const request = store.clear()
      request.onsuccess = () => resolve()
      request.onerror = () => resolve()
    })
  } catch {
    // Fail silently
  }
}

/**
 * Get cached entrances from IndexedDB
 */
export async function getCachedEntrances(key: string): Promise<WikiZoneEntrance[] | null> {
  try {
    const database = await openDB()
    if (!database) {
      return null
    }

    return new Promise((resolve) => {
      const transaction = database.transaction(ENTRANCES_STORE, 'readonly')
      const store = transaction.objectStore(ENTRANCES_STORE)
      const request = store.get(key)

      request.onsuccess = () => {
        const result = request.result as CachedEntrances | undefined
        if (!result) {
          resolve(null)
          return
        }

        // Check if cache is stale
        if (Date.now() - result.timestamp > CACHE_TTL) {
          resolve(null)
          return
        }

        resolve(result.entrances)
      }

      request.onerror = () => {
        resolve(null)
      }
    })
  } catch {
    return null
  }
}

/**
 * Store entrances in IndexedDB
 */
export async function setCachedEntrances(key: string, entrances: WikiZoneEntrance[]): Promise<void> {
  try {
    const database = await openDB()
    if (!database) return

    return new Promise((resolve) => {
      const transaction = database.transaction(ENTRANCES_STORE, 'readwrite')
      const store = transaction.objectStore(ENTRANCES_STORE)

      const cached: CachedEntrances = {
        key,
        entrances,
        timestamp: Date.now()
      }

      const request = store.put(cached)
      request.onsuccess = () => resolve()
      request.onerror = () => resolve()
    })
  } catch {
    // Fail silently - cache is optional
  }
}

/**
 * Clear all cached entrances
 */
export async function clearEntranceCache(): Promise<void> {
  try {
    const database = await openDB()
    if (!database) return

    return new Promise((resolve) => {
      const transaction = database.transaction(ENTRANCES_STORE, 'readwrite')
      const store = transaction.objectStore(ENTRANCES_STORE)
      const request = store.clear()
      request.onsuccess = () => resolve()
      request.onerror = () => resolve()
    })
  } catch {
    // Fail silently
  }
}
