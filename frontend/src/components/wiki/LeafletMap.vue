<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch } from 'vue'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { wikiApi } from '@/services/api'
import type { WikiZoneEntrance, WikiMapBounds } from '@/types'
import { stripAnsiCodes } from '@/utils/ansiParser'
import { frontendConfiguration } from '@/config/environment'
import { resolveMapLayerImageUrl } from '@/utils/mapLayerImageUrl'
import { SURFACE_PORTS, surfaceContinents } from '@/utils/paintedMap/worldFeatures'
import {
  PaintedMapLayer,
  canPaintMap,
  type PaintProgress,
  type PaintedLayerSource,
} from './paintedMapLayer'

const props = withDefaults(
  defineProps<{
    bounds: WikiMapBounds | null
    initialZoom?: number
    layer?: number
    initialShowMarkers?: boolean
    initialShowZoneNames?: boolean
    /** Start with the painted terrain view (when the browser can paint it). */
    initialPainted?: boolean
    /** Start with port anchors shown on the surface. */
    initialShowDocks?: boolean
    hideControls?: boolean
    minZoom?: number
    zoomSnap?: number
  }>(),
  {
    initialZoom: 0,
    layer: 0,
    initialShowMarkers: true,
    initialShowZoneNames: true,
    initialPainted: false,
    initialShowDocks: false,
    hideControls: false,
    minZoom: -2,
    zoomSnap: 0.1,
  },
)

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
const paintingAvailable = canPaintMap()
const painted = ref(props.initialPainted && paintingAvailable)
const showDocks = ref(props.initialShowDocks)
const paintProgress = ref<PaintProgress | null>(null)
const paintError = ref('')
let paintedLayer: PaintedMapLayer | null = null
let dockLayer: L.LayerGroup | null = null
let paintVersion = 0
const paintSources = new Map<number, Promise<PaintedLayerSource>>()

// Room coordinates use 2^zoom screen pixels per room. Never shrink names at overview.
const READING_ZOOM = 3
const CLOSE_ZOOM = 4
let requestVersion = 0
let refreshTimer: ReturnType<typeof setTimeout> | null = null
let resizeObserver: ResizeObserver | null = null
let finePointer: MediaQueryList | null = null
let reducedMotion = false
let refreshingEntrances = false
let openEntrance: { key: string; focusedZone: number | null } | null = null
const entranceCache = new Map<string, Promise<WikiZoneEntrance[]>>()

function mudYToLat(mudY: number): number {
  return -mudY
}

function latToMudY(lat: number): number {
  return -lat
}

function getMapImageUrl(layer: number): string {
  return resolveMapLayerImageUrl(frontendConfiguration, layer)
}

async function loadEntrances(bounds: L.LatLngBounds): Promise<WikiZoneEntrance[]> {
  const minX = Math.max(props.bounds?.minX ?? 0, Math.floor(bounds.getWest()))
  const maxX = Math.min(props.bounds?.maxX ?? 399, Math.ceil(bounds.getEast()))
  const minY = Math.max(props.bounds?.minY ?? 0, Math.floor(latToMudY(bounds.getNorth())))
  const maxY = Math.min(props.bounds?.maxY ?? 399, Math.ceil(latToMudY(bounds.getSouth())))
  if (minX > maxX || minY > maxY) return []

  const layer = props.layer
  const cacheKey = `${minX}:${maxX}:${minY}:${maxY}:${layer}`
  let pending = entranceCache.get(cacheKey)
  if (!pending) {
    pending = wikiApi.getZoneEntrances({ minX, maxX, minY, maxY }, layer).catch(() => {
      entranceCache.delete(cacheKey)
      console.error('Failed to load map entrances')
      return []
    })
    entranceCache.set(cacheKey, pending)
  }
  return pending
}

function zoneName(entrance: WikiZoneEntrance): string {
  return stripAnsiCodes(entrance.toZoneName || `Zone ${entrance.toZoneNumber}`)
}

function labelElement(text: string): HTMLSpanElement {
  const label = document.createElement('span')
  label.className = 'zone-name'
  label.textContent = text
  return label
}

// Keep complete names inside the viewport without moving the entrance itself.
function containLabel(label: HTMLElement, marker: L.Marker) {
  if (!mapContainer.value) return
  label.style.transform = ''
  const viewport = mapContainer.value.getBoundingClientRect()
  let box = label.getBoundingClientRect()
  const tooltip = marker.getTooltip()
  if (tooltip && box.top < viewport.top + 6) {
    tooltip.options.direction = 'bottom'
    tooltip.options.offset = L.point(0, 8)
    tooltip.update()
    box = label.getBoundingClientRect()
  }
  const dx = Math.max(viewport.left + 6 - box.left, Math.min(0, viewport.right - 6 - box.right))
  const dy = Math.max(viewport.top + 6 - box.top, Math.min(0, viewport.bottom - 6 - box.bottom))
  label.style.transform = `translate(${dx}px, ${dy}px)`
}

// Keep every entrance, but label each destination once within the visible map.
async function updateEntrances() {
  const version = ++requestVersion
  if (!map || !entranceLayer) return
  if (!showMarkers.value && !showZoneNames.value) {
    entranceLayer.clearLayers()
    return
  }

  const entrances = await loadEntrances(map.getBounds())
  if (version !== requestVersion || !map || !entranceLayer) return
  const focusedCoordinate =
    document.activeElement instanceof HTMLElement
      ? document.activeElement.dataset.entranceCoordinate
      : undefined
  refreshingEntrances = true
  entranceLayer.clearLayers()
  refreshingEntrances = false
  let restoredPopup = false
  mapContainer.value?.classList.toggle('wiki-map-close', map.getZoom() >= CLOSE_ZOOM)

  const coordinates = new Map<string, WikiZoneEntrance[]>()
  for (const entrance of entrances) {
    if (entrance.x === null || entrance.y === null) continue
    const key = `${entrance.x}:${entrance.y}`
    const group = coordinates.get(key) ?? []
    group.push(entrance)
    coordinates.set(key, group)
  }

  // Coordinate order keeps the chosen label stable when API row order changes.
  const groups = [...coordinates.values()].sort(
    (a, b) => a[0]!.y! - b[0]!.y! || a[0]!.x! - b[0]!.x!,
  )
  const labelledZones = new Set<number>()
  for (const group of groups) {
    const first = group[0]!
    const coordinateKey = `${first.x}:${first.y}`
    const destinations = [...new Map(group.map((row) => [row.toZoneNumber, row])).values()]
    const labelledDestinations = destinations.filter((destination) => {
      if (labelledZones.has(destination.toZoneNumber)) return false
      labelledZones.add(destination.toZoneNumber)
      return true
    })
    if (!showMarkers.value && labelledDestinations.length === 0) continue

    const labelText = labelledDestinations.map(zoneName).join(' / ')
    const text = destinations.length === 1 ? zoneName(first) : `${destinations.length} destinations`
    const content = document.createElement('span')
    content.className = 'zone-dot'
    content.setAttribute('aria-hidden', 'true')
    const icon = L.divIcon({
      className: showMarkers.value ? 'zone-entrance-marker' : 'zone-entrance-name',
      html: showMarkers.value ? content : labelElement(labelText),
      iconSize: showMarkers.value ? [24, 24] : [160, 24],
      iconAnchor: showMarkers.value ? [12, 12] : [80, -8],
    })
    const marker = L.marker([mudYToLat(first.y!), first.x!], {
      icon,
      title: text,
      alt: text,
      keyboard: true,
    })

    if (showMarkers.value) {
      const permanent =
        showZoneNames.value &&
        labelledDestinations.length > 0 &&
        (!finePointer?.matches || map.getZoom() >= READING_ZOOM)
      const label = labelElement(permanent ? labelText : text)
      marker.bindTooltip(label, {
        permanent,
        direction: 'top',
        offset: [0, -8],
        opacity: 1,
        className: 'zone-label',
      })
      marker.on('tooltipopen', () => containLabel(label, marker))
    }

    if (destinations.length > 1) {
      const popup = document.createElement('div')
      popup.className = 'zone-popup'
      const heading = document.createElement('p')
      heading.textContent = 'Choose a destination'
      popup.append(heading)
      for (const destination of destinations) {
        const button = document.createElement('button')
        button.type = 'button'
        button.dataset.zone = String(destination.toZoneNumber)
        button.addEventListener('focus', () => {
          if (openEntrance?.key === coordinateKey)
            openEntrance.focusedZone = destination.toZoneNumber
        })
        button.textContent = zoneName(destination)
        button.addEventListener('click', () =>
          emit('zoneClick', destination.toZoneNumber, zoneName(destination)),
        )
        popup.append(button)
      }
      marker.bindPopup(popup, { className: 'zone-popup-container', maxWidth: 280 })
      marker.on('popupopen', () => {
        const focusedZone = openEntrance?.key === coordinateKey ? openEntrance.focusedZone : null
        openEntrance = { key: coordinateKey, focusedZone }
        const target =
          focusedZone === null
            ? popup.querySelector('button')
            : popup.querySelector<HTMLButtonElement>(`[data-zone="${focusedZone}"]`)
        target?.focus({ preventScroll: true })
      })
      marker.on('popupclose', () => {
        if (refreshingEntrances) return
        openEntrance = null
        if (popup.contains(document.activeElement))
          marker.getElement()?.focus({ preventScroll: true })
      })
    } else {
      marker.on('click', () => emit('zoneClick', first.toZoneNumber, zoneName(first)))
    }
    entranceLayer.addLayer(marker)
    if (openEntrance?.key === coordinateKey && destinations.length > 1) {
      marker.openPopup()
      restoredPopup = true
    }
    const element = marker.getElement()
    if (!showMarkers.value) {
      const label = element?.querySelector<HTMLElement>('.zone-name')
      if (label) containLabel(label, marker)
    }
    element?.setAttribute('aria-label', text)
    if (element) {
      element.dataset.entranceCoordinate = coordinateKey
      if (focusedCoordinate === coordinateKey) element.focus({ preventScroll: true })
    }
    if (destinations.length > 1) element?.setAttribute('aria-haspopup', 'dialog')
    element?.addEventListener('keydown', (event) => {
      if (event.key === ' ') {
        event.preventDefault()
        marker.fire('click')
      }
    })
  }
  if (!restoredPopup) openEntrance = null
}

// Decode a layer's sector grid and add the world features the painter draws.
async function loadPaintSource(layer: number): Promise<PaintedLayerSource> {
  const data = await wikiApi.getMapSectors(layer)
  if (
    !Number.isSafeInteger(data.width) ||
    !Number.isSafeInteger(data.height) ||
    !Number.isSafeInteger(data.minX) ||
    !Number.isSafeInteger(data.minY) ||
    data.width < 1 ||
    data.height < 1 ||
    data.width * data.height > 1_000_000 ||
    typeof data.sectors !== 'string'
  ) {
    throw new Error('Malformed sector grid')
  }
  const binary = atob(data.sectors)
  const sectors = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) sectors[i] = binary.charCodeAt(i)
  if (sectors.length !== data.width * data.height) throw new Error('Malformed sector grid')
  const surface = layer >= 0
  const ports =
    layer === 0
      ? SURFACE_PORTS.map((port) => ({ x: port.x - data.minX, y: port.y - data.minY })).filter(
          (port) => port.x >= 0 && port.y >= 0 && port.x < data.width && port.y < data.height,
        )
      : []
  return {
    layer,
    minX: data.minX,
    minY: data.minY,
    width: data.width,
    height: data.height,
    surface,
    sectors,
    continents:
      layer === 0
        ? surfaceContinents(sectors, data.width, data.height, data.minX, data.minY)
        : null,
    ports,
  }
}

async function updatePainted() {
  const version = ++paintVersion
  if (!map) return
  paintedLayer?.hide()
  if (!painted.value) {
    paintedLayer?.hide()
    return
  }
  paintError.value = ''
  paintedLayer ??= new PaintedMapLayer(
    map,
    (progress) => (paintProgress.value = progress),
    () => {
      paintError.value = 'The painted map could not be loaded. Showing the original map.'
    },
  )
  const layer = props.layer
  let pending = paintSources.get(layer)
  if (!pending) {
    pending = loadPaintSource(layer)
    paintSources.set(layer, pending)
  }
  try {
    const source = await pending
    if (version !== paintVersion || !painted.value || !paintedLayer) return
    paintedLayer.show(source)
  } catch {
    paintSources.delete(layer)
    if (version !== paintVersion) return
    paintedLayer?.hide()
    paintError.value = 'The painted map could not be loaded. Showing the original map.'
  }
}

const ANCHOR_ICON =
  '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="5" r="2.2"/><path d="M12 7.2V21M7.5 11h9M4.5 14.5c0 3.6 3.4 6.5 7.5 6.5s7.5-2.9 7.5-6.5M3 15.5l1.5-1.5 1.5 1.5M18 15.5l1.5-1.5 1.5 1.5"/></svg>'

// Port anchors: labels only, so they add no tab stops beside the entrances.
function updateDocks() {
  if (!dockLayer) return
  dockLayer.clearLayers()
  if (!showDocks.value || props.layer !== 0) return
  for (const port of SURFACE_PORTS) {
    const label = document.createElement('span')
    label.className = 'port-name'
    label.innerHTML = `<span class="port-anchor">${ANCHOR_ICON}</span>`
    label.append(port.name)
    dockLayer.addLayer(
      L.marker([mudYToLat(port.y), port.x], {
        icon: L.divIcon({ className: 'dock-marker', html: label, iconAnchor: [11, 11] }),
        pane: 'dockMarkers',
        interactive: false,
        keyboard: false,
      }),
    )
  }
}

function scheduleRefresh() {
  ++requestVersion
  if (refreshTimer) clearTimeout(refreshTimer)
  refreshTimer = setTimeout(() => {
    refreshTimer = null
    paintedLayer?.refresh()
    void updateEntrances()
    emitPositionChange()
  }, 100)
}

// Initialize map
function initMap() {
  if (!mapContainer.value || !props.bounds) return

  const centerX = (props.bounds.minX + props.bounds.maxX) / 2
  const centerY = (props.bounds.minY + props.bounds.maxY) / 2

  const maxBounds = L.latLngBounds(
    [mudYToLat(props.bounds.maxY) - 100, props.bounds.minX - 100],
    [mudYToLat(props.bounds.minY) + 100, props.bounds.maxX + 100],
  )

  const imageBounds = L.latLngBounds(
    [mudYToLat(props.bounds.maxY), props.bounds.minX],
    [mudYToLat(props.bounds.minY), props.bounds.maxX],
  )

  finePointer = window.matchMedia('(hover: hover) and (pointer: fine)')
  reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  finePointer.addEventListener('change', scheduleRefresh)
  map = L.map(mapContainer.value, {
    zoomAnimation: !reducedMotion,
    fadeAnimation: false,
    markerZoomAnimation: !reducedMotion,
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

  map.createPane('dockMarkers').style.zIndex = '590'
  dockLayer = L.layerGroup().addTo(map)
  updateDocks()
  void updatePainted()

  map.on('moveend', scheduleRefresh)
  map.on('zoomend', () => {
    emit('zoomChange', map!.getZoom())
    scheduleRefresh()
  })
  resizeObserver = new ResizeObserver(() => map?.invalidateSize({ animate: false }))
  resizeObserver.observe(mapContainer.value)

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
  map.panTo([mudYToLat(y), x], { animate: !reducedMotion })
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
    [mudYToLat(props.bounds.minY), props.bounds.maxX],
  )
  map.fitBounds(bounds, { animate: !reducedMotion })
}

defineExpose({ panTo, setZoom, zoomIn, zoomOut, fitBounds })

// A layer and its bounds arrive together from the view. Invalidate old work immediately.
watch(
  [() => props.layer, () => props.bounds],
  () => {
    ++requestVersion
    entranceLayer?.clearLayers()
    if (!map) {
      initMap()
      return
    }
    if (!imageOverlay || !props.bounds) return
    imageOverlay.setUrl(getMapImageUrl(props.layer))
    const bounds = props.bounds
    map.setMaxBounds(
      L.latLngBounds(
        [mudYToLat(bounds.maxY) - 50, bounds.minX - 50],
        [mudYToLat(bounds.minY) + 50, bounds.maxX + 50],
      ),
    )
    imageOverlay.setBounds(
      L.latLngBounds([mudYToLat(bounds.maxY), bounds.minX], [mudYToLat(bounds.minY), bounds.maxX]),
    )
    fitBounds()
    void updateEntrances()
    updateDocks()
    void updatePainted()
  },
  { deep: true },
)

watch(painted, () => void updatePainted())
watch(showDocks, updateDocks)

watch([showMarkers, showZoneNames], () => {
  entranceLayer?.clearLayers()
  void updateEntrances()
})

onMounted(initMap)
onUnmounted(() => {
  ++requestVersion
  if (refreshTimer) clearTimeout(refreshTimer)
  finePointer?.removeEventListener('change', scheduleRefresh)
  resizeObserver?.disconnect()
  entranceCache.clear()
  ++paintVersion
  paintedLayer?.destroy()
  paintedLayer = null
  map?.remove()
  map = null
  entranceLayer = null
})
</script>

<template>
  <div class="wiki-leaflet-map w-full h-full relative">
    <div ref="mapContainer" class="w-full h-full" aria-label="World map" />
    <fieldset v-if="!hideControls" class="absolute top-3 right-3 border border-border bg-background px-3 py-2 text-sm text-foreground flex flex-col gap-1 z-[1000]">
      <legend class="sr-only">Map visibility</legend>
      <label class="flex min-h-7 items-center gap-2 cursor-pointer">
        <input v-model="showMarkers" type="checkbox" class="h-4 w-4 accent-vermilion" />
        Markers
      </label>
      <label class="flex min-h-7 items-center gap-2 cursor-pointer">
        <input v-model="showZoneNames" type="checkbox" class="h-4 w-4 accent-vermilion" />
        Zone names
      </label>
      <label v-if="layer === 0" class="flex min-h-7 items-center gap-2 cursor-pointer">
        <input v-model="showDocks" type="checkbox" class="h-4 w-4 accent-vermilion" />
        Docks
      </label>
      <label v-if="paintingAvailable" class="flex min-h-7 items-center gap-2 cursor-pointer">
        <input v-model="painted" type="checkbox" class="h-4 w-4 accent-vermilion" />
        Painted map
      </label>
      <p v-if="painted && paintProgress" role="status" class="m-0 text-xs text-muted-foreground">
        Painting map… {{ Math.round((paintProgress.done / paintProgress.total) * 100) }}%
      </p>
      <p v-if="paintError" role="alert" class="m-0 max-w-48 text-xs text-destructive">
        {{ paintError }}
      </p>
    </fieldset>
  </div>
</template>

<style scoped>
.wiki-leaflet-map :deep(.leaflet-container) {
  background: var(--color-ink-raised);
  font-family: var(--font-sans);
  z-index: 0;
}

.wiki-leaflet-map :deep(.zone-entrance-marker) {
  display: grid;
  place-items: center;
  background: none;
  border: none;
  cursor: pointer;
}

.wiki-leaflet-map :deep(.zone-dot) {
  display: block;
  width: 12px;
  height: 12px;
  background: var(--color-vermilion);
  border: 2px solid var(--color-bone);
  border-radius: 50%;
  box-shadow: 0 0 0 1px var(--color-ink);
}

.wiki-leaflet-map :deep(.zone-entrance-marker:hover .zone-dot),
.wiki-leaflet-map :deep(.zone-entrance-marker:focus .zone-dot) {
  background: var(--color-ember);
}

.wiki-leaflet-map :deep(.zone-label),
.wiki-leaflet-map :deep(.zone-entrance-name) {
  background: transparent;
  border: none;
  border-radius: 0;
  box-shadow: none;
  padding: 0;
  white-space: normal;
  text-align: center;
}

.wiki-leaflet-map :deep(.zone-entrance-name) {
  height: auto !important;
  cursor: pointer;
}

.wiki-leaflet-map :deep(.zone-name) {
  display: block;
  width: 10rem;
  color: var(--color-bone);
  font-size: 0.875rem;
  font-weight: 600;
  line-height: 1.25;
  overflow-wrap: anywhere;
  text-wrap: balance;
  /* A compact solid outline separates complete glyphs from snow and sand. */
  text-shadow: -1px -1px 0 var(--color-ink), 0 -1px 0 var(--color-ink),
    1px -1px 0 var(--color-ink), 1px 0 0 var(--color-ink),
    1px 1px 0 var(--color-ink), 0 1px 0 var(--color-ink),
    -1px 1px 0 var(--color-ink), -1px 0 0 var(--color-ink),
    0 2px 0 var(--color-ink);
}

.wiki-leaflet-map :deep(.wiki-map-close .zone-name) {
  font-size: 1rem;
}

.wiki-leaflet-map :deep(.zone-label::before) {
  display: none;
}

.wiki-leaflet-map :deep(.zone-entrance-marker:focus-visible),
.wiki-leaflet-map :deep(.zone-entrance-name:focus-visible .zone-name) {
  outline: 2px solid var(--color-bone);
  outline-offset: 3px;
  background: var(--color-ink);
  z-index: 10000 !important;
}

.wiki-leaflet-map :deep(.zone-entrance-name:focus-visible) {
  z-index: 10000 !important;
}

.wiki-leaflet-map :deep(.zone-popup-container .leaflet-popup-content-wrapper),
.wiki-leaflet-map :deep(.zone-popup-container .leaflet-popup-tip) {
  background: var(--color-ink);
  border: 1px solid var(--color-rule);
  border-radius: 0;
  color: var(--color-bone);
}

.wiki-leaflet-map :deep(.zone-popup) {
  display: grid;
  gap: 0.5rem;
  font-size: 0.875rem;
  line-height: 1.4;
}

.wiki-leaflet-map :deep(.zone-popup p) {
  margin: 0 0 0.25rem;
}

.wiki-leaflet-map :deep(.zone-popup button) {
  border: 1px solid var(--color-rule);
  padding: 0.5rem 0.75rem;
  text-align: left;
  overflow-wrap: anywhere;
  cursor: pointer;
}

.wiki-leaflet-map :deep(.zone-popup button:hover) {
  background: var(--color-ink-high);
}

.wiki-leaflet-map :deep(.dock-marker) {
  background: none;
  border: none;
  width: auto !important;
  height: auto !important;
}

.wiki-leaflet-map :deep(.port-name) {
  display: flex;
  align-items: center;
  gap: 0.25rem;
  white-space: nowrap;
  padding: 0.125rem 0.5rem 0.125rem 0.125rem;
  border: 1px solid var(--color-rule);
  background: var(--color-ink);
  color: var(--color-bone);
  font-size: 0.8125rem;
  font-weight: 600;
}

.wiki-leaflet-map :deep(.port-anchor) {
  display: grid;
  place-items: center;
  width: 1.125rem;
  height: 1.125rem;
  border-radius: 50%;
  background: var(--color-bone);
  color: var(--color-ink);
}
</style>
