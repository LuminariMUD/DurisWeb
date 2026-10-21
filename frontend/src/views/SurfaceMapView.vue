<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import {
  surfacePositionToVnum,
  surfaceVnumToPosition,
  SURFACE_IMAGE_SIZE,
} from '@/utils/surfaceMapCoordinates'

interface Zone {
  vnum: number
  name: string
}

interface RouteMarker {
  start: number
  name: string
}

interface SurfaceMapData {
  zones: Zone[]
  dragonRoutes: RouteMarker[]
  ferryRoutes: RouteMarker[]
}

const imageUrl = '/surface-map/20261028_Duris_Surface_Map1600x1600.wld.png'
const mapRoot = ref<HTMLDivElement | null>(null)
const zones = ref<Zone[]>([])
const query = ref('')
const showZoneLabels = ref(true)
const loadError = ref('')
const filteredZones = computed(() => {
  const term = query.value.trim().toLowerCase()
  return zones.value.filter((zone) => zone.name.toLowerCase().includes(term))
})

let map: L.Map | null = null
let zoneLayer: L.LayerGroup | null = null
let resizeObserver: ResizeObserver | null = null
let dataRequest: AbortController | null = null
const imageBounds: L.LatLngBoundsExpression = [
  [0, 0],
  [SURFACE_IMAGE_SIZE, SURFACE_IMAGE_SIZE],
]

function createPopupLines(description: string): HTMLElement {
  const wrapper = document.createElement('div')
  for (const [index, line] of description.split('<br>').entries()) {
    if (index > 0) wrapper.append(document.createElement('br'))
    const text = document.createElement('span')
    text.textContent = line
    wrapper.append(text)
  }
  return wrapper
}

function addRouteMarkers(routes: RouteMarker[], filename: string, prefix: string) {
  if (!map) return
  const icon = L.icon({
    iconUrl: '/surface-map/' + filename,
    iconSize: [24, 24],
    iconAnchor: [0, 24],
  })
  for (const route of routes) {
    L.marker(surfaceVnumToPosition(route.start), { icon })
      .addTo(map)
      .bindPopup(createPopupLines(prefix + route.name))
  }
}

function updateLabelScale() {
  if (!map || !zoneLayer) return
  const zoom = map.getZoom()
  zoneLayer.eachLayer((layer) => {
    if (!(layer instanceof L.Marker)) return
    const element = layer.getElement()
    if (!element) return
    element.style.display = zoom < 1 ? 'none' : 'block'
    element.style.fontSize = Math.max(8, Math.min(13, (9 * zoom) / 3)) + 'px'
  })
}

function addZoneLabels(items: Zone[]) {
  if (!map) return
  zoneLayer = L.layerGroup()
  for (const zone of items) {
    const label = document.createElement('span')
    label.textContent = zone.name
    const marker = L.marker(surfaceVnumToPosition(zone.vnum), {
      interactive: false,
      icon: L.divIcon({
        className: 'surface-zone-label',
        html: label,
        iconSize: [110, 16],
        iconAnchor: [55, 8],
      }),
    })
    zoneLayer.addLayer(marker)
  }
  if (showZoneLabels.value) zoneLayer.addTo(map)
  updateLabelScale()
}

function focusZone(zone: Zone) {
  if (!map) return
  const position = surfaceVnumToPosition(zone.vnum)
  map.setView(position, 2)
  L.popup().setLatLng(position).setContent(createPopupLines(zone.name)).openOn(map)
}

function searchZones() {
  if (!map || filteredZones.value.length === 0) return
  if (filteredZones.value.length === 1) {
    focusZone(filteredZones.value[0]!)
    return
  }
  const bounds = L.latLngBounds(
    filteredZones.value.map((zone) => surfaceVnumToPosition(zone.vnum)),
  )
  if (bounds.isValid()) map.fitBounds(bounds, { padding: [50, 50] })
}

function resetView() {
  map?.fitBounds(imageBounds)
}

watch(showZoneLabels, (show) => {
  if (!map || !zoneLayer) return
  if (show) {
    zoneLayer.addTo(map)
    updateLabelScale()
  } else {
    map.removeLayer(zoneLayer)
  }
})

async function loadMapData() {
  const controller = new AbortController()
  dataRequest = controller
  try {
    const response = await fetch('/surface-map/data.json', { signal: controller.signal })
    if (!response.ok) throw new Error('Map data is unavailable')
    const data: SurfaceMapData = await response.json()
    if (controller.signal.aborted) return
    zones.value = data.zones
    addZoneLabels(data.zones)
    addRouteMarkers(data.dragonRoutes, 'dragon.png', 'Fly to: ')
    addRouteMarkers(data.ferryRoutes, 'helm.png', '')
  } catch {
    if (!controller.signal.aborted) loadError.value = 'Zone and travel markers could not be loaded.'
  }
}

onMounted(() => {
  if (!mapRoot.value) return
  const leafletMap = L.map(mapRoot.value, {
    crs: L.CRS.Simple,
    zoomAnimation: false,
    zoomDelta: 0.25,
    zoomSnap: 0.25,
    wheelPxPerZoomLevel: 75,
  })
  map = leafletMap
  L.imageOverlay(imageUrl, imageBounds)
    .on('error', () => {
      loadError.value = 'The surface map image could not be loaded.'
    })
    .addTo(leafletMap)
  leafletMap.fitBounds(imageBounds)
  const fitZoom = leafletMap.getBoundsZoom(imageBounds)
  leafletMap.setMinZoom(fitZoom - 2)
  leafletMap.setMaxZoom(fitZoom + 2)
  leafletMap.on('click', (event: L.LeafletMouseEvent) => {
    const { lat, lng } = event.latlng
    const vnum = surfacePositionToVnum(lat, lng)
    if (vnum === null) return
    const tileX = Math.floor(lng / 4)
    const tileY = Math.floor(lat / 4)
    const details = document.createElement('div')
    details.textContent = 'Pixel: (' + Math.floor(lng) + ', ' + Math.floor(lat) + ')'
    details.append(document.createElement('br'), 'Tile: (' + tileX + ', ' + tileY + ')')
    details.append(document.createElement('br'), 'World VNUM: ' + vnum)
    L.popup().setLatLng(event.latlng).setContent(details).openOn(leafletMap)
  })
  leafletMap.on('zoomend', updateLabelScale)
  resizeObserver = new ResizeObserver(() => map?.invalidateSize())
  resizeObserver.observe(mapRoot.value)
  void loadMapData()
})

onUnmounted(() => {
  dataRequest?.abort()
  resizeObserver?.disconnect()
  map?.remove()
  map = null
  zoneLayer = null
})
</script>

<template>
  <div class="surface-map flex h-full min-h-0 flex-col bg-background">
    <div class="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3">
      <div>
        <h1 class="text-xl font-semibold">Surface Map — October 28, 2026 Wipe</h1>
        <p class="text-xs text-muted-foreground">
          Map by
          <a
            href="https://drevarr.github.io/20261028_Wipe_Duris_Surface_Map.html"
            target="_blank"
            rel="noopener noreferrer"
            class="underline"
          >Drevarr</a>
          · Locally hosted snapshot
        </p>
      </div>
      <button
        type="button"
        class="border border-border px-3 py-2 text-sm hover:bg-muted"
        @click="resetView"
      >
        Reset view
      </button>
    </div>
    <div class="flex min-h-0 flex-1 flex-col md:flex-row">
      <aside
        class="flex h-52 shrink-0 flex-col gap-2 overflow-hidden border-b border-border bg-card p-3 md:h-auto md:w-64 md:border-b-0 md:border-r"
      >
        <label class="text-sm font-medium" for="surface-zone-search">Search zones</label>
        <div class="flex gap-2">
          <input
            id="surface-zone-search"
            v-model="query"
            type="search"
            placeholder="Zone name"
            class="min-w-0 flex-1 border border-input bg-background px-2 py-1 text-sm"
            @keydown.enter="searchZones"
          />
          <button
            type="button"
            class="border border-border px-3 py-1 text-sm hover:bg-muted"
            @click="searchZones"
          >
            Find
          </button>
        </div>
        <label class="flex items-center gap-2 text-sm">
          <input v-model="showZoneLabels" type="checkbox" />
          Show zone labels
        </label>
        <p v-if="loadError" role="alert" class="text-xs text-destructive">{{ loadError }}</p>
        <p class="text-xs text-muted-foreground">{{ filteredZones.length }} zones listed</p>
        <ul class="min-h-0 flex-1 overflow-y-auto text-sm">
          <li v-for="zone in filteredZones" :key="zone.vnum + '-' + zone.name">
            <button
              type="button"
              class="w-full px-1 py-1 text-left hover:bg-muted"
              @click="focusZone(zone)"
            >
              {{ zone.name }}
            </button>
          </li>
        </ul>
        <div class="hidden border-t border-border pt-2 text-xs text-muted-foreground md:block">
          <p>Dragon flight and ferry markers are clickable.</p>
          <p>Dragon icon: Icongeek26 · Ferry icon: Freepik (Flaticon).</p>
        </div>
      </aside>
      <div class="relative min-h-0 flex-1 bg-black">
        <div
          ref="mapRoot"
          class="absolute inset-0 z-0"
          aria-label="Interactive Duris surface map"
        />
        <p
          class="pointer-events-none absolute bottom-2 left-2 z-[500] bg-background/85 px-2 py-1 text-xs"
        >
          Click a map square for its room VNUM · Drag to pan · Scroll to zoom
        </p>
      </div>
    </div>
  </div>
</template>

<style scoped>
.surface-map :deep(.surface-zone-label) {
  color: white;
  font-weight: bold;
  line-height: 0.9;
  text-align: center;
  text-shadow: 0 0 4px black, 0 0 6px black;
  white-space: normal;
  overflow: visible;
  pointer-events: none;
}
</style>
