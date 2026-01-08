/**
 * IndexedDB cache for world map images
 * Persists the PNG blob across browser sessions for instant map loading
 */

const DB_NAME = 'duris-worldmap-cache'
const DB_VERSION = 1
const IMAGE_STORE = 'images'
const CACHE_TTL = 24 * 60 * 60 * 1000 // 24 hours in ms

interface CachedImage {
  key: string
  blob: Blob
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
      if (!database.objectStoreNames.contains(IMAGE_STORE)) {
        database.createObjectStore(IMAGE_STORE, { keyPath: 'key' })
      }
    }
  })

  return dbPromise
}

// Pre-initialize IndexedDB on module load
openDB()

/**
 * Get cached world map image from IndexedDB
 * @param layer - The map layer (0 = surface, -1 = underdark, etc.)
 * @returns The cached Blob or null if not found/expired
 */
export async function getCachedWorldMap(layer: number = 0): Promise<Blob | null> {
  try {
    const database = await openDB()
    if (!database) {
      return null
    }

    const key = `worldmap:${layer}`

    return new Promise((resolve) => {
      const transaction = database.transaction(IMAGE_STORE, 'readonly')
      const store = transaction.objectStore(IMAGE_STORE)
      const request = store.get(key)

      request.onsuccess = () => {
        const result = request.result as CachedImage | undefined
        if (!result) {
          resolve(null)
          return
        }

        // Check if cache is stale
        if (Date.now() - result.timestamp > CACHE_TTL) {
          resolve(null)
          return
        }

        resolve(result.blob)
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
 * Store world map image in IndexedDB
 * @param layer - The map layer (0 = surface, -1 = underdark, etc.)
 * @param blob - The PNG blob to cache
 */
export async function setCachedWorldMap(layer: number, blob: Blob): Promise<void> {
  try {
    const database = await openDB()
    if (!database) return

    const key = `worldmap:${layer}`

    return new Promise((resolve) => {
      const transaction = database.transaction(IMAGE_STORE, 'readwrite')
      const store = transaction.objectStore(IMAGE_STORE)

      const cached: CachedImage = {
        key,
        blob,
        timestamp: Date.now(),
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
 * Clear all cached world map images
 */
export async function clearWorldMapCache(): Promise<void> {
  try {
    const database = await openDB()
    if (!database) return

    return new Promise((resolve) => {
      const transaction = database.transaction(IMAGE_STORE, 'readwrite')
      const store = transaction.objectStore(IMAGE_STORE)
      const request = store.clear()
      request.onsuccess = () => resolve()
      request.onerror = () => resolve()
    })
  } catch {
    // Fail silently
  }
}
