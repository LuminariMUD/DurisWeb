<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import {
  surfacePositionToVnum,
  surfaceVnumToPosition,
  SURFACE_IMAGE_SIZE,
} from '@/utils/surfaceMapCoordinates'
import { buildIllustratedSurfaceMap } from '@/utils/surfaceMapIllustration'

type MapStyle = 'classic' | 'illustrated'
type Labels = 'auto' | 'all' | 'none'
interface Zone {
  vnum: number
  name: string
}
interface TravelStop {
  start: number
  name: string
}
interface SurfaceData {
  zones: Zone[]
  dragonRoutes: TravelStop[]
  ferryRoutes: TravelStop[]
}

const classicUrl = '/surface-map/20261028_Duris_Surface_Map1600x1600.wld.png'
const bounds: L.LatLngBoundsExpression = [
  [0, 0],
  [SURFACE_IMAGE_SIZE, SURFACE_IMAGE_SIZE],
]
const mapRoot = ref<HTMLDivElement | null>(null)
const mapStyle = ref<MapStyle>('classic')
const rendering = ref(false)
const labelMode = ref<Labels>('auto')
const showZoneMarkers = ref(true)
const showFerries = ref(true)
const showDragons = ref(true)
const search = ref('')
const loadError = ref('')
const zones = ref<Zone[]>([])
const ferryRoutes = ref<TravelStop[]>([])
const dragonRoutes = ref<TravelStop[]>([])
const selectedVnum = ref<number | null>(null)
const matches = computed(() => {
  const term = search.value.trim().toLowerCase()
  return zones.value.filter((zone) => zone.name.toLowerCase().includes(term))
})

let map: L.Map | null = null
let basemap: L.ImageOverlay | null = null
let zoneLayer: L.LayerGroup | null = null
let ferryLayer: L.LayerGroup | null = null
let dragonLayer: L.LayerGroup | null = null
let resizeObserver: ResizeObserver | null = null
let dataRequest: AbortController | null = null
let illustratedUrl: string | null = null
let fitZoom = 0
let disposed = false

function htmlEscape(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

function popupText(value: string): HTMLElement {
  const node = document.createElement('div')
  for (const [index, part] of value.split(/<br\s*\/?\s*>/i).entries()) {
    if (index) node.append(document.createElement('br'))
    const line = document.createElement('span')
    line.textContent = part
    node.append(line)
  }
  return node
}

function zonePopup(zone: Zone): HTMLElement {
  const node = document.createElement('div')
  const heading = document.createElement('strong')
  heading.textContent = zone.name
  const line = document.createElement('p')
  line.textContent = 'World VNUM: ' + zone.vnum
  node.append(heading, line)
  return node
}

function focusZone(zone: Zone) {
  if (!map) return
  const position = surfaceVnumToPosition(zone.vnum)
  map.setView(position, Math.min(map.getMaxZoom(), fitZoom + 3))
  L.popup().setLatLng(position).setContent(zonePopup(zone)).openOn(map)
}

function searchZones() {
  if (!map || matches.value.length === 0) return
  if (matches.value.length === 1) {
    focusZone(matches.value[0]!)
    return
  }
  const positions = matches.value.map((zone) => surfaceVnumToPosition(zone.vnum))
  map.fitBounds(L.latLngBounds(positions), {
    padding: [50, 50],
    maxZoom: Math.min(map.getMaxZoom(), fitZoom + 3),
  })
}

function renderZones() {
  if (!map) return
  zoneLayer?.remove()
  const layer = L.layerGroup()
  zoneLayer = layer
  if (!showZoneMarkers.value) return
  const allNames = labelMode.value === 'all'
  const namesVisible = allNames || (labelMode.value === 'auto' && map.getZoom() >= fitZoom + 2)
  const clustering = !allNames && map.getZoom() < fitZoom + 3
  const groups = new Map<string, Zone[]>()
  for (const zone of zones.value) {
    const point = map.latLngToContainerPoint(surfaceVnumToPosition(zone.vnum))
    const key = clustering
      ? Math.floor(point.x / 64) + ':' + Math.floor(point.y / 58)
      : zone.vnum + ':' + zone.name
    const group = groups.get(key)
    if (group) group.push(zone)
    else groups.set(key, [zone])
  }
  for (const group of groups.values()) {
    if (clustering && group.length > 1) {
      const positions = group.map((zone) => L.latLng(surfaceVnumToPosition(zone.vnum)))
      const centre: L.LatLngExpression = [
        positions.reduce((total, pos) => total + pos.lat, 0) / positions.length,
        positions.reduce((total, pos) => total + pos.lng, 0) / positions.length,
      ]
      const icon = L.divIcon({
        className: 'atlas-cluster',
        html: '<span>' + group.length + '</span>',
        iconSize: [32, 32],
        iconAnchor: [16, 16],
      })
      L.marker(centre, { icon })
        .on('click', () => {
          if (!map) return
          map.fitBounds(L.latLngBounds(positions).pad(0.7), {
            maxZoom: Math.min(map.getMaxZoom(), map.getZoom() + 1.5),
          })
        })
        .bindTooltip(group.length + ' nearby zone entries. Click to zoom.')
        .addTo(layer)
      continue
    }
    const zone = group[0]!
    const label = namesVisible
      ? '<span class="atlas-name">' + htmlEscape(zone.name) + '</span>'
      : ''
    const icon = L.divIcon({
      className: 'atlas-zone',
      html: '<span class="atlas-zone-dot"></span>' + label,
      iconSize: [namesVisible ? 180 : 18, namesVisible ? 32 : 18],
      iconAnchor: [9, namesVisible ? 16 : 9],
    })
    L.marker(surfaceVnumToPosition(zone.vnum), { icon })
      .on('click', () => focusZone(zone))
      .bindTooltip(zone.name, { direction: 'top' })
      .addTo(layer)
  }
  layer.addTo(map)
}

function routeLayer(stops: TravelStop[], category: 'ferry' | 'dragon'): L.LayerGroup {
  const layer = L.layerGroup()
  const file = category === 'ferry' ? 'helm.png' : 'dragon.png'
  const icon = L.icon({
    iconUrl: '/surface-map/' + file,
    iconSize: [24, 24],
    iconAnchor: [12, 22],
    popupAnchor: [0, -15],
  })
  for (const stop of stops) {
    L.marker(surfaceVnumToPosition(stop.start), { icon })
      .bindTooltip(category === 'ferry' ? 'Ferry departure' : 'Dragon flight')
      .bindPopup(popupText((category === 'ferry' ? 'Ferry: ' : 'Fly to: ') + stop.name))
      .addTo(layer)
  }
  return layer
}

function syncTravelLayers() {
  if (!map) return
  if (ferryLayer) {
    if (showFerries.value) ferryLayer.addTo(map)
    else ferryLayer.remove()
  }
  if (dragonLayer) {
    if (showDragons.value) dragonLayer.addTo(map)
    else dragonLayer.remove()
  }
}

async function loadData() {
  const request = new AbortController()
  dataRequest = request
  try {
    const response = await fetch('/surface-map/data.json', { signal: request.signal })
    if (!response.ok) throw new Error('Map data HTTP ' + response.status)
    const data: SurfaceData = await response.json()
    if (!map || request.signal.aborted) return
    zones.value = data.zones
    ferryRoutes.value = data.ferryRoutes
    dragonRoutes.value = data.dragonRoutes
    ferryLayer = routeLayer(data.ferryRoutes, 'ferry')
    dragonLayer = routeLayer(data.dragonRoutes, 'dragon')
    syncTravelLayers()
    renderZones()
  } catch {
    if (!request.signal.aborted)
      loadError.value = 'The original zone and travel data could not be loaded.'
  }
}

async function changeStyle(next: MapStyle) {
  if (!basemap || rendering.value || next === mapStyle.value) return
  if (next === 'classic') {
    mapStyle.value = 'classic'
    basemap.setUrl(classicUrl)
    return
  }
  if (illustratedUrl) {
    mapStyle.value = 'illustrated'
    basemap.setUrl(illustratedUrl)
    return
  }
  rendering.value = true
  loadError.value = ''
  try {
    await nextTick()
    const url = await buildIllustratedSurfaceMap(classicUrl)
    if (disposed || !basemap) {
      URL.revokeObjectURL(url)
      return
    }
    illustratedUrl = url
    mapStyle.value = 'illustrated'
    basemap.setUrl(url)
  } catch (error) {
    loadError.value =
      error instanceof Error ? error.message : 'The illustrated artwork could not be prepared.'
  } finally {
    rendering.value = false
  }
}

watch([labelMode, showZoneMarkers], renderZones)
watch([showFerries, showDragons], syncTravelLayers)

onMounted(() => {
  if (!mapRoot.value) return
  const leaflet = L.map(mapRoot.value, {
    crs: L.CRS.Simple,
    zoomAnimation: false,
    zoomDelta: 0.5,
    zoomSnap: 0.25,
    wheelPxPerZoomLevel: 75,
  })
  map = leaflet
  basemap = L.imageOverlay(classicUrl, bounds)
    .on('error', () => {
      loadError.value = 'The original map image could not be loaded.'
    })
    .addTo(leaflet)
  leaflet.fitBounds(bounds)
  fitZoom = leaflet.getBoundsZoom(bounds)
  leaflet.setMinZoom(fitZoom - 1)
  leaflet.setMaxZoom(fitZoom + 4)
  leaflet.on('zoomend', renderZones)
  leaflet.on('click', (event: L.LeafletMouseEvent) => {
    const vnum = surfacePositionToVnum(event.latlng.lat, event.latlng.lng)
    if (vnum === null) return
    selectedVnum.value = vnum
    L.popup()
      .setLatLng(event.latlng)
      .setContent(popupText('World VNUM: ' + vnum))
      .openOn(leaflet)
  })
  resizeObserver = new ResizeObserver(() => map?.invalidateSize())
  resizeObserver.observe(mapRoot.value)
  void loadData()
})
onUnmounted(() => {
  disposed = true
  dataRequest?.abort()
  resizeObserver?.disconnect()
  map?.remove()
  map = null
  basemap = null
  zoneLayer = null
  ferryLayer = null
  dragonLayer = null
  if (illustratedUrl) URL.revokeObjectURL(illustratedUrl)
  illustratedUrl = null
})
</script>

<template>
  <section class="surface-atlas flex h-full min-h-0 flex-col bg-background">
    <header class="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-card px-5 py-3">
      <div>
        <div class="text-xs tracking-widest text-warning">THE WORLD OF DURIS · 28 OCTOBER 2026</div>
        <h1 class="text-2xl text-warning">Surface Atlas</h1>
        <p class="text-xs text-muted-foreground">Drevarr's original geography · locally hosted snapshot</p>
      </div>
      <div class="flex gap-1 border border-border p-1" role="group" aria-label="Map appearance">
        <button type="button" class="px-4 py-2 text-sm" :class="mapStyle === 'classic' ? 'bg-muted text-warning' : 'text-muted-foreground'" :disabled="rendering" @click="changeStyle('classic')">Classic</button>
        <button type="button" class="px-4 py-2 text-sm" :class="mapStyle === 'illustrated' ? 'bg-muted text-warning' : 'text-muted-foreground'" :disabled="rendering" @click="changeStyle('illustrated')">Illustrated</button>
      </div>
    </header>
    <div class="flex min-h-0 flex-1 flex-col md:flex-row">
      <aside class="flex h-56 shrink-0 flex-col gap-4 overflow-y-auto border-b border-border bg-card p-4 md:h-auto md:w-64 md:border-b-0 md:border-r">
        <div>
          <h2 class="mb-2 text-sm text-warning">SEARCH ZONES</h2>
          <div class="flex gap-2">
            <input v-model="search" aria-label="Zone name" type="search" placeholder="Find zone..." class="min-w-0 flex-1 border border-border bg-background px-2 py-1 text-sm" @keydown.enter="searchZones" />
            <button type="button" class="border border-border px-3 text-sm" @click="searchZones">Find</button>
          </div>
          <p class="mt-2 text-xs text-muted-foreground">{{ matches.length }} matching entries</p>
          <div v-if="search.trim()" class="mt-2 max-h-40 overflow-y-auto border border-border">
            <button v-for="zone in matches.slice(0, 40)" :key="zone.name + zone.vnum" type="button" class="block w-full px-2 py-1 text-left text-xs hover:bg-muted" @click="focusZone(zone)">{{ zone.name }}</button>
          </div>
        </div>
        <div class="space-y-3 border-t border-border pt-4">
          <h2 class="text-sm text-warning">MAP LAYERS</h2>
          <label class="flex items-center justify-between gap-2 text-sm">Zone markers <input v-model="showZoneMarkers" type="checkbox" /></label>
          <label class="flex items-center justify-between gap-2 text-sm">Ferry docks ({{ ferryRoutes.length }}) <input v-model="showFerries" type="checkbox" /></label>
          <label class="flex items-center justify-between gap-2 text-sm">Dragon flights ({{ dragonRoutes.length }}) <input v-model="showDragons" type="checkbox" /></label>
        </div>
        <div class="space-y-2 border-t border-border pt-4">
          <h2 class="text-sm text-warning">ZONE LABELS</h2>
          <div class="flex w-full gap-1 border border-border p-1">
            <button v-for="mode in (['auto', 'all', 'none'] as const)" :key="mode" type="button" class="flex-1 px-2 py-2 text-xs capitalize" :class="labelMode === mode ? 'bg-muted text-warning' : 'text-muted-foreground'" @click="labelMode = mode">{{ mode }}</button>
          </div>
          <p class="text-xs text-muted-foreground">Auto clusters nearby entries. All shows every real zone name, even if labels overlap.</p>
        </div>
        <div class="border-t border-border pt-4 text-xs text-muted-foreground">
          <p>Blue circles: zones · Numbers: clusters · Anchor: ferry · Dragon: flight</p>
          <p class="mt-2">Illustrated terrain is painted from the original pixels. Locations remain unchanged.</p>
          <a href="https://drevarr.github.io/20261028_Wipe_Duris_Surface_Map.html" class="mt-3 inline-block underline" target="_blank" rel="noopener noreferrer">Source map by Drevarr ↗</a>
          <p class="mt-2">Icon credits: Icongeek26 and Freepik (Flaticon).</p>
        </div>
      </aside>
      <div class="relative min-h-0 flex-1 bg-black">
        <div ref="mapRoot" class="absolute inset-0 z-0" aria-label="Interactive Duris surface map" />
        <p v-if="rendering" role="status" class="absolute left-4 top-4 z-[600] border border-warning bg-card px-3 py-2 text-sm">Painting original Duris terrain into an illustrated atlas…</p>
        <p v-if="loadError" role="alert" class="absolute left-4 top-16 z-[600] border border-danger bg-card px-3 py-2 text-sm text-danger">{{ loadError }}</p>
        <div class="pointer-events-none absolute bottom-3 left-3 z-[500] bg-background/90 px-3 py-2 text-xs">
          <span>{{ mapStyle === 'classic' ? 'CLASSIC' : 'ILLUSTRATED' }}</span>
          <span v-if="selectedVnum !== null"> · VNUM {{ selectedVnum }}</span>
          · Click for room VNUM · Drag to pan · Scroll to zoom
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
.surface-atlas :deep(.atlas-zone) {
  display: flex;
  align-items: center;
  gap: 4px;
  border: 0;
  background: transparent;
}
.surface-atlas :deep(.atlas-zone-dot) {
  display: inline-block;
  height: 13px;
  width: 13px;
  flex-shrink: 0;
  border: 2px solid #f9f5e7;
  border-radius: 50%;
  background: #1686c9;
  box-shadow: 0 0 0 2px #115982, 0 1px 8px #081a2c;
}
.surface-atlas :deep(.atlas-name) {
  max-width: 155px;
  color: #fff2c9;
  font: bold 11px/1.15 Georgia, serif;
  text-shadow: 0 1px 3px black, 1px 1px 4px black;
}
.surface-atlas :deep(.atlas-cluster) {
  border: 0;
  background: transparent;
}
.surface-atlas :deep(.atlas-cluster span) {
  display: flex;
  height: 32px;
  width: 32px;
  align-items: center;
  justify-content: center;
  border: 2px solid #c4eaff;
  border-radius: 50%;
  background: #104f76;
  color: white;
  font: bold 12px system-ui, sans-serif;
}
.surface-atlas :deep(.leaflet-popup-content-wrapper) {
  border: 1px solid #ae8957;
  border-radius: 4px;
  background: #1d2629;
  color: #f6edda;
}
.surface-atlas :deep(.leaflet-popup-tip) { background: #1d2629; }
</style>
