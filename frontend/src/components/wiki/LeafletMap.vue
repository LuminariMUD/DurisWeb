<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch, nextTick } from 'vue'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { wikiApi } from '@/services/api'
import type { WikiMapTile, WikiZoneEntrance, WikiMapBounds } from '@/types'
import { stripAnsiCodes } from '@/utils/ansiParser'
import { getCachedTiles, setCachedTiles, getCachedEntrances, setCachedEntrances } from '@/utils/mapTileCache'

const props = withDefaults(defineProps<{
  bounds: WikiMapBounds | null
  initialZoom?: number
  layer?: number
  initialShowMarkers?: boolean
  initialShowZoneNames?: boolean
  hideControls?: boolean
  minZoom?: number
  zoomSnap?: number
}>(), {
  initialZoom: 0,
  layer: 0,
  initialShowMarkers: true,
  initialShowZoneNames: true,
  hideControls: false,
  minZoom: -2,
  zoomSnap: 0.1,
})

const emit = defineEmits<{
  (e: 'zoneClick', zoneNumber: number, zoneName: string): void
  (e: 'roomHover', vnum: number | null, x: number, y: number): void
  (e: 'zoomChange', zoom: number): void
  (e: 'positionChange', x: number, y: number): void
}>()

// Map container ref
const mapContainer = ref<HTMLDivElement | null>(null)
let map: L.Map | null = null
let tileLayer: L.GridLayer | null = null
let entranceLayer: L.LayerGroup | null = null

// Toggle state for visibility
const showMarkers = ref(props.initialShowMarkers)
const showZoneNames = ref(props.initialShowZoneNames)

// Sector type colors (from MUD defines.h - same as WorldMap.vue)
const SECTOR_COLORS: Record<number, string> = {
  0: '#78716c',   // SECT_INSIDE - stone gray
  1: '#ffffff',   // SECT_CITY - white
  2: '#4ade80',   // SECT_FIELD - green
  3: '#16a34a',   // SECT_FOREST - darker green
  4: '#eab308',   // SECT_HILLS - yellow
  5: '#a16207',   // SECT_MOUNTAIN - brown
  6: '#22d3ee',   // SECT_WATER_SWIM - cyan
  7: '#3b82f6',   // SECT_WATER_NOSWIM - blue
  8: '#7dd3fc',   // SECT_NO_GROUND - sky blue (air)
  9: '#1d4ed8',   // SECT_UNDERWATER - dark blue
  10: '#1e40af',  // SECT_UNDERWATER_GR - darker blue
  11: '#ef4444',  // SECT_FIREPLANE - red/orange
  12: '#1e3a8a',  // SECT_OCEAN - deep blue
  13: '#7e22ce',  // SECT_UNDRWLD_WILD - dark purple
  14: '#d8b4fe',  // SECT_UNDRWLD_CITY - light purple
  15: '#44403c',  // SECT_UNDRWLD_INSIDE - dark stone
  16: '#6366f1',  // SECT_UNDRWLD_WATER - indigo
  17: '#4f46e5',  // SECT_UNDRWLD_NOSWIM - indigo darker
  18: '#1c1917',  // SECT_UNDRWLD_NOGROUND - near black
  19: '#7dd3fc',  // SECT_AIR_PLANE - sky blue
  20: '#06b6d4',  // SECT_WATER_PLANE - cyan
  21: '#78716c',  // SECT_EARTH_PLANE - stone
  22: '#c4b5fd',  // SECT_ETHEREAL - light violet
  23: '#a78bfa',  // SECT_ASTRAL - violet
  24: '#fef08a',  // SECT_DESERT - light yellow
  25: '#f1f5f9',  // SECT_ARCTIC - white/light gray
  26: '#a855f7',  // SECT_SWAMP - purple
  27: '#581c87',  // SECT_UNDRWLD_MOUNTAIN - dark purple
  28: '#84cc16',  // SECT_UNDRWLD_SLIME - lime
  29: '#581c87',  // SECT_UNDRWLD_LOWCEIL - dark purple
}

// Tile cache
const tileCache = new Map<string, WikiMapTile[]>()
const entranceCache = new Map<string, WikiZoneEntrance[]>()

// Track loading promises to avoid duplicate requests
const loadingPromises = new Map<string, Promise<WikiMapTile[]>>()

// Track pending tile loads for deferred entrance rendering
let pendingTileLoads = 0
let entranceUpdatePending = false

// Create custom CRS for MUD coordinates
// Use simple CRS where lat=y, lng=x (both positive, y increases downward on screen)
function createMudCRS() {
  return L.CRS.Simple
}

// Chunk size - must result in area <= 10000 tiles (backend limit)
// 100x100 = 10,000 tiles max per chunk
const CHUNK_SIZE = 100

// Convert MUD Y to Leaflet lat (negate because MUD Y increases south, Leaflet lat increases north)
function mudYToLat(mudY: number): number {
  return -mudY
}

// Convert Leaflet lat to MUD Y
function latToMudY(lat: number): number {
  return -lat
}

// Load a single chunk
async function loadChunk(chunkX: number, chunkY: number, layer: number): Promise<WikiMapTile[]> {
  const key = `${chunkX}:${chunkY}:${layer}`

  // Return from memory cache if available
  if (tileCache.has(key)) {
    return tileCache.get(key)!
  }

  // Return existing promise if already loading
  if (loadingPromises.has(key)) {
    return loadingPromises.get(key)!
  }

  // Check IndexedDB cache
  const cachedTiles = await getCachedTiles(key)
  if (cachedTiles) {
    tileCache.set(key, cachedTiles)
    return cachedTiles
  }

  // Get valid map bounds
  const validMinX = props.bounds?.minX ?? 0
  const validMaxX = props.bounds?.maxX ?? 399
  const validMinY = props.bounds?.minY ?? 0
  const validMaxY = props.bounds?.maxY ?? 399

  // Clamp request to valid bounds
  const reqMinX = Math.max(validMinX, chunkX)
  const reqMaxX = Math.min(validMaxX, chunkX + CHUNK_SIZE)
  const reqMinY = Math.max(validMinY, chunkY)
  const reqMaxY = Math.min(validMaxY, chunkY + CHUNK_SIZE)

  // Skip if request would have zero width or height
  if (reqMaxX <= reqMinX || reqMaxY <= reqMinY) {
    tileCache.set(key, [])
    return []
  }

  // Create and store the promise
  const promise = wikiApi.getMapTiles({
    minX: reqMinX,
    maxX: reqMaxX,
    minY: reqMinY,
    maxY: reqMaxY,
  }, layer).then(async tiles => {
    tileCache.set(key, tiles)
    loadingPromises.delete(key)
    // Store in IndexedDB for future sessions
    await setCachedTiles(key, tiles)
    return tiles
  }).catch(error => {
    console.error('Failed to load chunk:', key, error)
    tileCache.set(key, [])
    loadingPromises.delete(key)
    return []
  })

  loadingPromises.set(key, promise)
  return promise
}

// Load tiles for a region
async function loadTiles(bounds: L.LatLngBounds): Promise<WikiMapTile[]> {
  // Get valid map bounds
  const validMinX = props.bounds?.minX ?? 0
  const validMaxX = props.bounds?.maxX ?? 399
  const validMinY = props.bounds?.minY ?? 0
  const validMaxY = props.bounds?.maxY ?? 399

  // Convert Leaflet bounds to MUD coordinates
  const minX = Math.max(validMinX, Math.floor(bounds.getWest()))
  const maxX = Math.min(validMaxX, Math.ceil(bounds.getEast()))
  const minY = Math.max(validMinY, Math.floor(latToMudY(bounds.getNorth())))
  const maxY = Math.min(validMaxY, Math.ceil(latToMudY(bounds.getSouth())))

  // If requested area is entirely outside valid bounds, return empty
  if (minX > maxX || minY > maxY) {
    return []
  }

  // Find all chunks needed and load them in parallel
  const chunkPromises: Promise<WikiMapTile[]>[] = []

  for (let x = Math.floor(minX / CHUNK_SIZE) * CHUNK_SIZE; x <= maxX; x += CHUNK_SIZE) {
    for (let y = Math.floor(minY / CHUNK_SIZE) * CHUNK_SIZE; y <= maxY; y += CHUNK_SIZE) {
      if (x < 0 || y < 0) continue
      chunkPromises.push(loadChunk(x, y, props.layer))
    }
  }

  // Wait for all chunks to load
  const chunkResults = await Promise.all(chunkPromises)

  // Flatten and filter to requested bounds
  const allTiles: WikiMapTile[] = []
  for (const tiles of chunkResults) {
    allTiles.push(...tiles.filter(t =>
      t.x >= minX && t.x <= maxX &&
      t.y >= minY && t.y <= maxY
    ))
  }

  return allTiles
}

// Load entrances for a region
async function loadEntrances(bounds: L.LatLngBounds): Promise<WikiZoneEntrance[]> {
  // Get valid map bounds
  const validMinX = props.bounds?.minX ?? 0
  const validMaxX = props.bounds?.maxX ?? 399
  const validMinY = props.bounds?.minY ?? 0
  const validMaxY = props.bounds?.maxY ?? 399

  // Clamp to valid bounds (convert lat back to MUD Y)
  const minX = Math.max(validMinX, Math.floor(bounds.getWest()))
  const maxX = Math.min(validMaxX, Math.ceil(bounds.getEast()))
  const minY = Math.max(validMinY, Math.floor(latToMudY(bounds.getNorth())))
  const maxY = Math.min(validMaxY, Math.ceil(latToMudY(bounds.getSouth())))

  // If entirely outside valid bounds, return empty
  if (minX > maxX || minY > maxY) {
    return []
  }

  const cacheKey = `${minX}:${maxX}:${minY}:${maxY}:${props.layer}`

  // Check memory cache first
  if (entranceCache.has(cacheKey)) {
    return entranceCache.get(cacheKey)!
  }

  // Check IndexedDB cache
  const cachedEntrances = await getCachedEntrances(cacheKey)
  if (cachedEntrances) {
    entranceCache.set(cacheKey, cachedEntrances)
    return cachedEntrances
  }

  // Fetch from API
  try {
    const entrances = await wikiApi.getZoneEntrances({
      minX, maxX, minY, maxY
    }, props.layer)
    entranceCache.set(cacheKey, entrances)
    // Store in IndexedDB for future sessions
    await setCachedEntrances(cacheKey, entrances)
    return entrances
  } catch (error) {
    console.error('Failed to load entrances:', error)
    entranceCache.set(cacheKey, [])
    return []
  }
}

// Helper to check if deferred entrance update should run
function checkDeferredEntranceUpdate() {
  if (pendingTileLoads === 0 && entranceUpdatePending) {
    entranceUpdatePending = false
    updateEntrances()
  }
}

// Create custom tile layer
function createTileLayer(): L.GridLayer {
  const CanvasTileLayer = L.GridLayer.extend({
    createTile: function(coords: L.Coords, done: (error: Error | null, tile: HTMLElement) => void) {
      const tile = document.createElement('canvas')
      const tileSize = this.getTileSize()
      tile.width = tileSize.x
      tile.height = tileSize.y

      const ctx = tile.getContext('2d')
      if (!ctx) {
        done(null, tile)
        return tile
      }

      // Track this tile load
      pendingTileLoads++

      // Calculate world bounds for this tile
      const nwPoint = coords.scaleBy(tileSize)
      const sePoint = nwPoint.add(tileSize)

      // Convert to lat/lng (which are our MUD coordinates due to CRS)
      const nw = map!.unproject(nwPoint, coords.z)
      const se = map!.unproject(sePoint, coords.z)

      // Calculate the world coordinate range this tile covers
      // In CRS.Simple: nw has higher lat (north), se has lower lat (south)
      const worldWidth = se.lng - nw.lng
      const worldHeight = nw.lat - se.lat

      // Calculate pixels per world unit
      const pixelsPerUnitX = tileSize.x / Math.abs(worldWidth)
      const pixelsPerUnitY = tileSize.y / Math.abs(worldHeight)

      // Load tiles for this region
      const tileBounds = L.latLngBounds(se, nw) // ensure proper order

      loadTiles(tileBounds).then((tiles) => {
        if (tiles.length === 0) {
          done(null, tile)
          pendingTileLoads--
          checkDeferredEntranceUpdate()
          return
        }

        // Size of each room pixel (at least 1px, grows with zoom)
        const roomSize = Math.max(1, Math.min(pixelsPerUnitX, pixelsPerUnitY))
        const roomSizeCeil = Math.ceil(roomSize)

        // Group tiles by sector type for batch rendering
        const tilesBySector = new Map<number, Array<{ px: number; py: number }>>()

        for (const t of tiles) {
          const px = Math.floor((t.x - nw.lng) * pixelsPerUnitX)
          const tileLatY = mudYToLat(t.y)
          const py = Math.floor((nw.lat - tileLatY) * pixelsPerUnitY)

          if (!tilesBySector.has(t.sectorType)) {
            tilesBySector.set(t.sectorType, [])
          }
          tilesBySector.get(t.sectorType)!.push({ px, py })
        }

        // Draw all tiles of each sector type in one batch
        for (const [sectorType, positions] of tilesBySector) {
          ctx.fillStyle = SECTOR_COLORS[sectorType] || '#333333'
          for (const { px, py } of positions) {
            ctx.fillRect(px, py, roomSizeCeil, roomSizeCeil)
          }
        }

        done(null, tile)
        pendingTileLoads--
        checkDeferredEntranceUpdate()
      }).catch((error) => {
        console.error('Error loading tiles:', error)
        done(null, tile)
        pendingTileLoads--
        checkDeferredEntranceUpdate()
      })

      return tile
    }
  })

  return new CanvasTileLayer()
}

// Create a custom icon for zone entrances (fixed pixel size)
const entranceIcon = L.divIcon({
  className: 'zone-entrance-marker',
  iconSize: [12, 12],
  iconAnchor: [6, 6],
})

// Invisible icon for when markers are hidden but labels should show
const hiddenIcon = L.divIcon({
  className: 'zone-entrance-hidden',
  iconSize: [1, 1],
  iconAnchor: [0, 0],
})

// Update entrance markers
async function updateEntrances() {
  if (!map || !entranceLayer) return

  // Clear existing markers
  entranceLayer.clearLayers()

  // Skip if both toggles are off
  if (!showMarkers.value && !showZoneNames.value) return

  const bounds = map.getBounds()
  const entrances = await loadEntrances(bounds)

  // Add markers for each entrance
  for (const entrance of entrances) {
    if (entrance.x === null || entrance.y === null) continue

    // Use visible or hidden icon based on showMarkers toggle
    const icon = showMarkers.value ? entranceIcon : hiddenIcon

    // Convert MUD Y to Leaflet lat (negate)
    const marker = L.marker(
      [mudYToLat(entrance.y), entrance.x], // lat=-mudY, lng=x
      { icon }
    )

    // Tooltip with zone name (strip ANSI codes)
    const rawZoneName = entrance.toZoneName || `Zone ${entrance.toZoneNumber}`
    const zoneName = stripAnsiCodes(rawZoneName)

    // Permanent label showing zone name (only if showZoneNames is enabled)
    if (showZoneNames.value) {
      marker.bindTooltip(zoneName, {
        permanent: true,
        direction: 'right',
        offset: showMarkers.value ? [8, 0] : [0, 0],
        className: 'zone-label',
      })
    }

    // Only add hover/click behavior when markers are visible
    if (showMarkers.value) {
      // Hover popup showing zone number
      marker.bindPopup(`<div class="zone-popup"><strong>${zoneName}</strong><br/>Zone #${entrance.toZoneNumber}</div>`, {
        closeButton: false,
        className: 'zone-popup-container',
      })

      // Show popup on hover
      marker.on('mouseover', () => {
        marker.openPopup()
      })
      marker.on('mouseout', () => {
        marker.closePopup()
      })

      // Click handler
      marker.on('click', () => {
        emit('zoneClick', entrance.toZoneNumber, zoneName)
      })
    }

    entranceLayer.addLayer(marker)
  }
}

// Initialize map
function initMap() {
  if (!mapContainer.value || !props.bounds) return

  // Create map with custom CRS
  const mudCRS = createMudCRS()

  // Calculate center - convert MUD Y to Leaflet lat (negate)
  const centerX = (props.bounds.minX + props.bounds.maxX) / 2
  const centerY = (props.bounds.minY + props.bounds.maxY) / 2

  // Create map bounds (restrict panning to valid areas)
  // MUD Y is negated for Leaflet lat, so maxY becomes more negative (south)
  const maxBounds = L.latLngBounds(
    [mudYToLat(props.bounds.maxY) - 100, props.bounds.minX - 100], // SW corner (maxY is south)
    [mudYToLat(props.bounds.minY) + 100, props.bounds.maxX + 100]  // NE corner (minY is north)
  )

  // Create the map bounds for fitting
  const fitBoundsTarget = L.latLngBounds(
    [mudYToLat(props.bounds.maxY), props.bounds.minX],
    [mudYToLat(props.bounds.minY), props.bounds.maxX]
  )

  map = L.map(mapContainer.value, {
    crs: mudCRS,
    center: [mudYToLat(centerY), centerX],
    zoom: 0, // Start with a default, will be overridden by fitBounds
    minZoom: props.minZoom,
    maxZoom: 6,
    maxBounds: maxBounds,
    maxBoundsViscosity: 0.8,
    zoomControl: false,
    attributionControl: false,
    zoomSnap: props.zoomSnap,
    zoomDelta: 0.25,
    wheelPxPerZoomLevel: 120,
  })

  // Add tile layer first
  tileLayer = createTileLayer()
  tileLayer.addTo(map)

  // Fit to bounds after tile layer is added
  map.fitBounds(fitBoundsTarget)

  // Add entrance layer
  entranceLayer = L.layerGroup()
  entranceLayer.addTo(map)

  // Event handlers - debounce to reduce rapid fire requests
  let moveEndTimeout: ReturnType<typeof setTimeout> | null = null
  map.on('moveend', () => {
    if (moveEndTimeout) clearTimeout(moveEndTimeout)
    moveEndTimeout = setTimeout(() => {
      // Defer entrance update if tiles are still loading
      if (pendingTileLoads > 0) {
        entranceUpdatePending = true
      } else {
        updateEntrances()
      }
      emitPositionChange()
    }, 100)
  })

  map.on('zoomend', () => {
    emit('zoomChange', map!.getZoom())
    entranceUpdatePending = true
  })

  map.on('mousemove', (e: L.LeafletMouseEvent) => {
    const x = Math.round(e.latlng.lng)
    const y = Math.round(latToMudY(e.latlng.lat)) // Convert Leaflet lat back to MUD Y
    emit('roomHover', null, x, y)
  })

  emit('zoomChange', map.getZoom())
  emitPositionChange()

  // Don't load entrances on init - wait for user to pan/zoom
}

function emitPositionChange() {
  if (!map) return
  const center = map.getCenter()
  // Convert Leaflet lat back to MUD Y (negate)
  emit('positionChange', Math.round(center.lng), Math.round(latToMudY(center.lat)))
}

// Public methods
function panTo(x: number, y: number) {
  if (!map) return
  // Convert MUD Y to Leaflet lat (negate)
  map.panTo([mudYToLat(y), x]) // [lat=-mudY, lng=x]
}

function setZoom(zoom: number) {
  if (!map) return
  map.setZoom(zoom)
}

function zoomIn() {
  if (!map) return
  map.zoomIn()
}

function zoomOut() {
  if (!map) return
  map.zoomOut()
}

function fitBounds() {
  if (!map || !props.bounds) return
  map.invalidateSize()
  const bounds = L.latLngBounds(
    [mudYToLat(props.bounds.maxY), props.bounds.minX],
    [mudYToLat(props.bounds.minY), props.bounds.maxX]
  )
  map.fitBounds(bounds)
}

// Expose methods
defineExpose({ panTo, setZoom, zoomIn, zoomOut, fitBounds })

// Watch for layer changes
watch(() => props.layer, () => {
  // Clear caches for layer change
  tileCache.clear()
  entranceCache.clear()

  // Redraw
  if (tileLayer) {
    tileLayer.redraw()
  }
  updateEntrances()
})

// Watch for bounds changes (when switching layers)
watch(() => props.bounds, (newBounds) => {
  if (!map || !newBounds) return

  // Update map maxBounds to the new layer bounds
  const maxBounds = L.latLngBounds(
    [mudYToLat(newBounds.maxY + 50), newBounds.minX - 50],
    [mudYToLat(newBounds.minY - 50), newBounds.maxX + 50]
  )
  map.setMaxBounds(maxBounds)

  // Fit to the new bounds
  const fitBoundsTarget = L.latLngBounds(
    [mudYToLat(newBounds.maxY), newBounds.minX],
    [mudYToLat(newBounds.minY), newBounds.maxX]
  )
  map.fitBounds(fitBoundsTarget)
}, { deep: true })

// Watch for toggle changes - refresh entrances to apply new visibility
watch([showMarkers, showZoneNames], () => {
  updateEntrances()
})

// Lifecycle
onMounted(() => {
  nextTick(() => {
    initMap()
  })
})

onUnmounted(() => {
  if (map) {
    map.remove()
    map = null
  }
})
</script>

<template>
  <div class="w-full h-full relative">
    <div ref="mapContainer" class="w-full h-full" />
    <!-- toggle controls -->
    <div v-if="!hideControls" class="absolute top-2 right-2 bg-slate-800/90 rounded px-2 py-1.5 text-xs text-slate-200 flex flex-col gap-1 z-[1000]">
      <label class="flex items-center gap-1.5 cursor-pointer hover:text-white">
        <input
          v-model="showMarkers"
          type="checkbox"
          class="w-3 h-3 rounded border-slate-500 bg-slate-700 text-amber-500 focus:ring-amber-500 focus:ring-offset-0"
        />
        markers
      </label>
      <label class="flex items-center gap-1.5 cursor-pointer hover:text-white">
        <input
          v-model="showZoneNames"
          type="checkbox"
          class="w-3 h-3 rounded border-slate-500 bg-slate-700 text-amber-500 focus:ring-amber-500 focus:ring-offset-0"
        />
        zone names
      </label>
    </div>
  </div>
</template>

<style>
/* Override Leaflet's default styles to match our dark theme */
.leaflet-container {
  background: #0f172a;
  font-family: inherit;
  z-index: 0; /* Keep map below overlays like legend */
}

.leaflet-tooltip {
  background: rgba(0, 0, 0, 0.9);
  border: 1px solid #374151;
  color: #f3f4f6;
  padding: 4px 8px;
  font-size: 12px;
  border-radius: 4px;
}

.leaflet-tooltip-top:before {
  border-top-color: rgba(0, 0, 0, 0.9);
}

/* Zone entrance marker - fixed size red circle */
.zone-entrance-marker {
  width: 12px !important;
  height: 12px !important;
  background-color: #ef4444;
  border: 2px solid #ffffff;
  border-radius: 50%;
  cursor: pointer;
}

.zone-entrance-marker:hover {
  background-color: #f59e0b;
  transform: scale(1.2);
}

/* Hidden marker (invisible anchor for zone labels) */
.zone-entrance-hidden {
  width: 1px !important;
  height: 1px !important;
  background: transparent;
  border: none;
}

/* Permanent zone label */
.zone-label {
  background: transparent;
  border: none;
  box-shadow: none;
  color: #ffffff;
  font-size: 11px;
  font-weight: 500;
  text-shadow: 1px 1px 2px #000, -1px -1px 2px #000, 1px -1px 2px #000, -1px 1px 2px #000;
  white-space: nowrap;
  padding: 0;
}

.zone-label::before {
  display: none;
}

/* Zone popup on hover */
.zone-popup-container .leaflet-popup-content-wrapper {
  background: rgba(0, 0, 0, 0.95);
  border: 1px solid #374151;
  border-radius: 6px;
  color: #f3f4f6;
}

.zone-popup-container .leaflet-popup-tip {
  background: rgba(0, 0, 0, 0.95);
  border: 1px solid #374151;
}

.zone-popup {
  font-size: 12px;
  padding: 4px;
  text-align: center;
}
</style>
