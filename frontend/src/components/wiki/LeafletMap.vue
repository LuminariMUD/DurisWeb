<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch, nextTick } from 'vue'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { wikiApi } from '@/services/api'
import type { WikiZoneEntrance, WikiMapBounds } from '@/types'
import { stripAnsiCodes } from '@/utils/ansiParser'

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
let imageOverlay: L.ImageOverlay | null = null
let entranceLayer: L.LayerGroup | null = null

// Toggle state for visibility
const showMarkers = ref(props.initialShowMarkers)
const showZoneNames = ref(props.initialShowZoneNames)

// Entrance cache
const entranceCache = new Map<string, WikiZoneEntrance[]>()

// Convert MUD Y to Leaflet lat (negate because MUD Y increases south, Leaflet lat increases north)
function mudYToLat(mudY: number): number {
  return -mudY
}

// Convert Leaflet lat to MUD Y
function latToMudY(lat: number): number {
  return -lat
}

// Get static map image URL (local proxy in dev, R2 CDN in prod)
function getMapImageUrl(layer: number): string {
  const staticUrl = import.meta.env.VITE_STATIC_URL
  if (staticUrl) {
    return `${staticUrl}/duris/maps/layer-${layer}.png`
  }
  return `/maps/layer-${layer}.png`
}

// Load entrances for a region
async function loadEntrances(bounds: L.LatLngBounds): Promise<WikiZoneEntrance[]> {
  const validMinX = props.bounds?.minX ?? 0
  const validMaxX = props.bounds?.maxX ?? 399
  const validMinY = props.bounds?.minY ?? 0
  const validMaxY = props.bounds?.maxY ?? 399

  const minX = Math.max(validMinX, Math.floor(bounds.getWest()))
  const maxX = Math.min(validMaxX, Math.ceil(bounds.getEast()))
  const minY = Math.max(validMinY, Math.floor(latToMudY(bounds.getNorth())))
  const maxY = Math.min(validMaxY, Math.ceil(latToMudY(bounds.getSouth())))

  if (minX > maxX || minY > maxY) {
    return []
  }

  const cacheKey = `${minX}:${maxX}:${minY}:${maxY}:${props.layer}`

  if (entranceCache.has(cacheKey)) {
    return entranceCache.get(cacheKey)!
  }

  try {
    const entrances = await wikiApi.getZoneEntrances({ minX, maxX, minY, maxY }, props.layer)
    entranceCache.set(cacheKey, entrances)
    return entrances
  } catch (error) {
    console.error('Failed to load entrances:', error)
    entranceCache.set(cacheKey, [])
    return []
  }
}

// Create a custom icon for zone entrances
const entranceIcon = L.divIcon({
  className: 'zone-entrance-marker',
  iconSize: [12, 12],
  iconAnchor: [6, 6],
})

const hiddenIcon = L.divIcon({
  className: 'zone-entrance-hidden',
  iconSize: [1, 1],
  iconAnchor: [0, 0],
})

// Update entrance markers
async function updateEntrances() {
  if (!map || !entranceLayer) return

  entranceLayer.clearLayers()

  if (!showMarkers.value && !showZoneNames.value) return

  const bounds = map.getBounds()
  const entrances = await loadEntrances(bounds)

  for (const entrance of entrances) {
    if (entrance.x === null || entrance.y === null) continue

    const icon = showMarkers.value ? entranceIcon : hiddenIcon
    const marker = L.marker([mudYToLat(entrance.y), entrance.x], { icon })

    const rawZoneName = entrance.toZoneName || `Zone ${entrance.toZoneNumber}`
    const zoneName = stripAnsiCodes(rawZoneName)

    if (showZoneNames.value) {
      marker.bindTooltip(zoneName, {
        permanent: true,
        direction: 'right',
        offset: showMarkers.value ? [8, 0] : [0, 0],
        className: 'zone-label',
      })
    }

    if (showMarkers.value) {
      marker.bindPopup(`<div class="zone-popup"><strong>${zoneName}</strong><br/>Zone #${entrance.toZoneNumber}</div>`, {
        closeButton: false,
        className: 'zone-popup-container',
      })

      marker.on('mouseover', () => marker.openPopup())
      marker.on('mouseout', () => marker.closePopup())
      marker.on('click', () => emit('zoneClick', entrance.toZoneNumber, zoneName))
    }

    entranceLayer.addLayer(marker)
  }
}

// Initialize map
function initMap() {
  if (!mapContainer.value || !props.bounds) return

  const centerX = (props.bounds.minX + props.bounds.maxX) / 2
  const centerY = (props.bounds.minY + props.bounds.maxY) / 2

  const maxBounds = L.latLngBounds(
    [mudYToLat(props.bounds.maxY) - 100, props.bounds.minX - 100],
    [mudYToLat(props.bounds.minY) + 100, props.bounds.maxX + 100]
  )

  const imageBounds = L.latLngBounds(
    [mudYToLat(props.bounds.maxY), props.bounds.minX],
    [mudYToLat(props.bounds.minY), props.bounds.maxX]
  )

  map = L.map(mapContainer.value, {
    crs: L.CRS.Simple,
    center: [mudYToLat(centerY), centerX],
    zoom: 0,
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

  // Add static image overlay
  imageOverlay = L.imageOverlay(getMapImageUrl(props.layer), imageBounds)
  imageOverlay.addTo(map)

  map.fitBounds(imageBounds)

  // Add entrance layer
  entranceLayer = L.layerGroup()
  entranceLayer.addTo(map)

  // Event handlers
  let moveEndTimeout: ReturnType<typeof setTimeout> | null = null
  map.on('moveend', () => {
    if (moveEndTimeout) clearTimeout(moveEndTimeout)
    moveEndTimeout = setTimeout(() => {
      updateEntrances()
      emitPositionChange()
    }, 100)
  })

  map.on('zoomend', () => {
    emit('zoomChange', map!.getZoom())
  })

  map.on('mousemove', (e: L.LeafletMouseEvent) => {
    const x = Math.round(e.latlng.lng)
    const y = Math.round(latToMudY(e.latlng.lat))
    emit('roomHover', null, x, y)
  })

  emit('zoomChange', map.getZoom())
  emitPositionChange()
  updateEntrances()
}

function emitPositionChange() {
  if (!map) return
  const center = map.getCenter()
  emit('positionChange', Math.round(center.lng), Math.round(latToMudY(center.lat)))
}

// Public methods
function panTo(x: number, y: number) {
  if (!map) return
  map.panTo([mudYToLat(y), x])
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

defineExpose({ panTo, setZoom, zoomIn, zoomOut, fitBounds })

// Watch for layer changes
watch(() => props.layer, () => {
  if (!map || !imageOverlay || !props.bounds) return

  // Update image URL
  imageOverlay.setUrl(getMapImageUrl(props.layer))

  // Clear entrance cache
  entranceCache.clear()
  updateEntrances()
})

// Watch for bounds changes
watch(() => props.bounds, (newBounds) => {
  if (!map || !imageOverlay || !newBounds) return

  const maxBounds = L.latLngBounds(
    [mudYToLat(newBounds.maxY + 50), newBounds.minX - 50],
    [mudYToLat(newBounds.minY - 50), newBounds.maxX + 50]
  )
  map.setMaxBounds(maxBounds)

  const imageBounds = L.latLngBounds(
    [mudYToLat(newBounds.maxY), newBounds.minX],
    [mudYToLat(newBounds.minY), newBounds.maxX]
  )
  imageOverlay.setBounds(imageBounds)
  map.fitBounds(imageBounds)
}, { deep: true })

// Watch for toggle changes
watch([showMarkers, showZoneNames], () => {
  updateEntrances()
})

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
.leaflet-container {
  background: #0f172a;
  font-family: inherit;
  z-index: 0;
}

.leaflet-tooltip {
  background: rgba(0, 0, 0, 0.9);
  border: 1px solid #374151;
  color: #f3f4f6;
  padding: 4px 8px;
  font-size: 12px;
  border-radius: 4px;
}

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

.zone-entrance-hidden {
  width: 1px !important;
  height: 1px !important;
  background: transparent;
  border: none;
}

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
