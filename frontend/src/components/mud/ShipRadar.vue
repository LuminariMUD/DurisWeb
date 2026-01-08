<script setup lang="ts">
import { computed, ref, watch, onMounted } from 'vue'
import { useMudStore } from '@/stores/mudStore'
import { useMudConnection } from '@/composables/useMudConnection'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Slider } from '@/components/ui/slider'
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
  ContextMenuSeparator,
} from '@/components/ui/context-menu'
import {
  ZoomIn,
  ZoomOut,
  ExternalLink,
  AlertCircle,
  Crosshair,
  Map,
  Radar,
  Loader2,
  Home,
} from 'lucide-vue-next'

import type { MudShipContact } from '@/types/mud'
import type { WikiMapBounds } from '@/types'
import { wikiApi } from '@/services/api'
import { getCachedWorldMap, setCachedWorldMap } from '@/utils/worldMapCache'
import { parseAnsiToHtml, stripAnsiCodes } from '@/utils/ansiParser'

const emit = defineEmits<{
  detach: []
}>()

const store = useMudStore()
const { sendGameCommand } = useMudConnection()

const shipContacts = computed(() => store.shipContacts)
const shipInfo = computed(() => store.shipInfo)
const wildernessMap = computed(() => store.wildernessMap)

// If we're receiving Ship.Contacts GMCP, we're on a ship
const isOnShip = computed(() => shipContacts.value !== null)

// Parse wilderness map for radar background
interface MapCell {
  char: string
  color: string
  x: number
  y: number
}

const mapCellSize = 12 // Size of each cell in SVG units

const parsedMap = computed((): { cells: MapCell[]; shipX: number; shipY: number } => {
  if (!wildernessMap.value) return { cells: [], shipX: 0, shipY: 0 }

  const cells: MapCell[] = []
  let shipX = -1
  let shipY = -1

  // Color mapping for ANSI codes
  const colorMap: Record<string, string> = {
    '&+y': '#eab308', // yellow (mountains, hills)
    '&+g': '#22c55e', // green (grass)
    '&+b': '#3b82f6', // blue
    '&+c': '#06b6d4', // cyan
    '&+W': '#ffffff', // white
    '&+L': '#9ca3af', // gray
    '&+r': '#ef4444', // red
    '&=b': '#1e3a5a', // blue background (water)
    '&n': '#6b7280', // normal/reset
  }

  const lines = wildernessMap.value.split('\n').filter(l => l.trim())
  let currentColor = '#6b7280'
  let maxCol = 0

  lines.forEach((line, row) => {
    let col = 0
    let i = 0

    while (i < line.length) {
      // Check for ANSI codes
      if (line[i] === '&') {
        // Check for background codes (&=b, &=r, etc)
        if (line[i + 1] === '=') {
          const bgCode = line.substring(i, i + 3)
          if (colorMap[bgCode]) {
            currentColor = colorMap[bgCode]
          }
          i += 3
          continue
        }
        // Check for 3-char codes (&+y, &+g, etc)
        const code3 = line.substring(i, i + 3)
        if (colorMap[code3]) {
          currentColor = colorMap[code3]
          i += 3
          continue
        }
        // Check for 2-char codes (&n)
        const code2 = line.substring(i, i + 2)
        if (colorMap[code2]) {
          currentColor = colorMap[code2]
          i += 2
          continue
        }
      }

      // Regular character
      const char = line[i]
      if (char && char !== ' ') {
        // Check if this is the ship marker (white color, direction chars)
        if ((char === '^' || char === '>' || char === '<' || char === 'v') && currentColor === '#ffffff') {
          shipX = col
          shipY = row
        }

        cells.push({
          char,
          color: currentColor,
          x: col,
          y: row,
        })
      }

      col++
      i++
    }

    if (col > maxCol) maxCol = col
  })

  // If ship marker not found, use map center as fallback
  if (shipX === -1) {
    shipX = Math.floor(maxCol / 2)
    shipY = Math.floor(lines.length / 2)
  }

  return { cells, shipX, shipY }
})

// Get map cell position on radar (map is already centered on ship in MUD)
function getMapCellPosition(cell: MapCell): { x: number; y: number } | null {
  const { shipX, shipY } = parsedMap.value

  // Calculate offset from map center (which is ship position)
  const offsetX = cell.x - shipX
  const offsetY = cell.y - shipY

  // Convert to radar coordinates
  const x = radarCenter + offsetX * mapCellSize
  const y = radarCenter + offsetY * mapCellSize

  // Only return if within radar bounds (with some margin)
  if (x < -mapCellSize || x > radarSize + mapCellSize || y < -mapCellSize || y > radarSize + mapCellSize) {
    return null
  }

  return { x: x - mapCellSize / 2, y: y - mapCellSize / 2 }
}

// Radar settings
const radarSize = 300 // SVG viewBox size
const radarCenter = radarSize / 2
const maxRange = ref(50) // Max range in nautical miles (adjustable with zoom)

// Zoom controls
function zoomIn() {
  maxRange.value = Math.max(10, maxRange.value - 10)
}

function zoomOut() {
  maxRange.value = Math.min(100, maxRange.value + 10)
}

// armor/hull bar colors based on percentage
function getArmorColor(arr: [number, number]) {
  const pct = arr[0] / arr[1]
  if (pct > 0.6) return 'bg-green-500'
  if (pct > 0.3) return 'bg-yellow-500'
  return 'bg-red-500'
}

function getHullColor(arr: [number, number]) {
  const pct = arr[0] / arr[1]
  if (pct > 0.6) return 'bg-blue-500'
  if (pct > 0.3) return 'bg-orange-500'
  return 'bg-red-600'
}

// Speed slider
const maxSpeed = computed(() => shipInfo.value?.maxSpeed ?? 100) // From Ship.Info GMCP
const sliderSpeed = ref(0) // Local state for immediate UI response

// Parsed ship status (parse ANSI for HTML display)
const shipStatusHtml = computed(() => shipInfo.value?.status ? parseAnsiToHtml(shipInfo.value.status) : '')

// debug: log when shipInfo changes
watch(shipInfo, (info) => {
  console.log('[ShipRadar] shipInfo updated:', info)
  console.log('[ShipRadar] maxSpeed is now:', info?.maxSpeed ?? 100)
}, { immediate: true })

// Sync slider with GMCP speed when it changes externally
const currentSpeed = computed(() => shipContacts.value?.speed ?? 0)

// Update local slider when GMCP speed changes (but not during drag)
let isDragging = false
let debounceTimer: ReturnType<typeof setTimeout> | null = null

watch(currentSpeed, (newSpeed) => {
  if (!isDragging) {
    sliderSpeed.value = newSpeed
  }
}, { immediate: true })

function handleSpeedChange(value: number[] | undefined) {
  if (!value) return
  const newSpeed = value[0] ?? 0
  sliderSpeed.value = newSpeed
  isDragging = true

  // Debounce: only send command after user stops dragging for 300ms
  if (debounceTimer) {
    clearTimeout(debounceTimer)
  }
  debounceTimer = setTimeout(() => {
    sendGameCommand(`order speed ${newSpeed}`)
    isDragging = false
  }, 300)
}

// Click on radar to set heading (north-up mode)
function handleRadarClick(event: MouseEvent) {
  const svg = event.currentTarget as SVGSVGElement
  const rect = svg.getBoundingClientRect()

  // Get click position relative to SVG center
  const clickX = ((event.clientX - rect.left) / rect.width) * radarSize - radarCenter
  const clickY = ((event.clientY - rect.top) / rect.height) * radarSize - radarCenter

  // Calculate angle from center (0° = up/north, clockwise)
  let angle = Math.atan2(clickX, -clickY) * (180 / Math.PI)
  if (angle < 0) angle += 360

  // In north-up mode, the angle IS the absolute heading
  const absoluteHeading = Math.round(angle)

  // Send heading command
  sendGameCommand(`order heading ${absoluteHeading}`)
}

// Calculate contact position on radar (north-up orientation)
function getContactPosition(contact: MudShipContact): { x: number; y: number } {
  if (!shipContacts.value) return { x: radarCenter, y: radarCenter }

  // Use absolute bearing (north-up: 0° = up, 90° = right)
  // Subtract 90 to make 0° point up instead of right
  const bearingRad = ((contact.bearing - 90) * Math.PI) / 180

  // Scale range to radar size (leave margin for labels)
  const rangeScale = (radarCenter - 30) / maxRange.value
  const scaledRange = Math.min(contact.range, maxRange.value) * rangeScale

  return {
    x: radarCenter + Math.cos(bearingRad) * scaledRange,
    y: radarCenter + Math.sin(bearingRad) * scaledRange,
  }
}

// Get compass label positions (fixed north-up)
function getCompassPosition(direction: number): { x: number; y: number } {
  // Fixed position: N=0° at top, E=90° at right, etc.
  // Subtract 90 to make 0° point up instead of right
  const angleRad = ((direction - 90) * Math.PI) / 180
  const radius = radarCenter - 15

  return {
    x: radarCenter + Math.cos(angleRad) * radius,
    y: radarCenter + Math.sin(angleRad) * radius,
  }
}

// Get contact color based on race and threat status
function getContactColor(contact: MudShipContact): string {
  if (contact.targeting_you) return '#ef4444' // red-500
  switch (contact.race) {
    case 'good': return '#22c55e' // green-500
    case 'evil': return '#ef4444' // red-500
    case 'undead': return '#a855f7' // purple-500
    case 'squid': return '#f97316' // orange-500
    default: return '#6b7280' // gray-500
  }
}

// Get contact fill (solid if targeting you, outline otherwise)
function getContactFill(contact: MudShipContact): string {
  return contact.targeting_you ? getContactColor(contact) : 'none'
}

// Range rings
const rangeRings = computed(() => {
  const rings = []
  const step = maxRange.value / 4
  for (let i = 1; i <= 4; i++) {
    rings.push({
      range: Math.round(step * i),
      radius: ((radarCenter - 30) / 4) * i,
    })
  }
  return rings
})

// Helper functions for display
const getRaceColor = (race: MudShipContact['race']): string => {
  switch (race) {
    case 'good': return 'text-green-400 border-green-400/50'
    case 'evil': return 'text-red-400 border-red-400/50'
    case 'undead': return 'text-purple-400 border-purple-400/50'
    case 'squid': return 'text-orange-400 border-orange-400/50'
    default: return 'text-gray-400 border-gray-400/50'
  }
}

const getStatusColor = (status: MudShipContact['status']): string => {
  switch (status) {
    case 'flying': return 'text-blue-400 border-blue-400/50'
    case 'sinking': return 'text-red-400 border-red-400/50 animate-pulse'
    case 'docked': return 'text-gray-400 border-gray-400/50'
    case 'anchored': return 'text-amber-400 border-amber-400/50'
    default: return 'text-gray-400 border-gray-400/50'
  }
}

const bearingToCompass = (bearing: number): string => {
  const directions = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'] as const
  const index = Math.round(bearing / 45) % 8
  return directions[index] ?? 'N'
}

// Execute ship action
const executeShipAction = (command: string, contact: MudShipContact) => {
  sendGameCommand(`${command} ${contact.id}`)
}

// Selected contact for highlighting
const selectedContactId = ref<string | null>(null)

function selectContact(id: string) {
  selectedContactId.value = selectedContactId.value === id ? null : id
}

// =============================================================================
// World Map View
// =============================================================================

// View mode: 'radar' or 'map'
const viewMode = ref<'radar' | 'map'>('radar')

// World map state
const worldMapImageUrl = ref<string | null>(null)
const worldMapLoading = ref(false)
const worldMapError = ref<string | null>(null)
const worldMapBounds = ref<WikiMapBounds | null>(null)

// Map zoom and pan
const mapZoom = ref(1) // Start at 1x zoom (full map view)
const mapPan = ref({ x: 0, y: 0 }) // Pan offset in percentage
const isDraggingMap = ref(false)
const dragStart = ref({ x: 0, y: 0 })

// Player ship (identified by id="**")
const playerShip = computed(() =>
  shipContacts.value?.contacts.find(c => c.id === '**')
)

// Other contacts (excluding player ship)
const otherContacts = computed(() =>
  shipContacts.value?.contacts.filter(c => c.id !== '**') ?? []
)

// Check if we have world coordinates (verified web client)
const hasWorldCoords = computed(() =>
  shipContacts.value?.worldX !== undefined && shipContacts.value?.worldY !== undefined
)

// Get world position for a contact
// tactical coords are 0-99 with player at (50, 50)
function getContactWorldPosition(contact: MudShipContact): { x: number; y: number } {
  if (!hasWorldCoords.value || !shipContacts.value) {
    return { x: contact.x, y: contact.y }
  }
  return {
    x: shipContacts.value.worldX! + (contact.x - 50),
    y: shipContacts.value.worldY! + (contact.y - 50),
  }
}

// Get player ship world position
const playerWorldPosition = computed(() => {
  if (hasWorldCoords.value && shipContacts.value) {
    return { x: shipContacts.value.worldX!, y: shipContacts.value.worldY! }
  }
  return playerShip.value ? { x: playerShip.value.x, y: playerShip.value.y } : { x: 50, y: 50 }
})

// Check if we can show the map (have world coords even without contacts)
const canShowMapPosition = computed(() => hasWorldCoords.value && shipContacts.value)

// Contact detection radius from Ship.Info GMCP (35 + crew modifier)
const contactRadius = computed(() => shipInfo.value?.contactRange ?? 35)

// Map container ref (for potential future use)
const mapContainerRef = ref<HTMLElement | null>(null)

// Get contact radius as percentage of map width (circle diameter = 2 * radius)
const contactRadiusPercent = computed(() => {
  if (!worldMapBounds.value) return 5 // fallback 5%
  const { minX, maxX } = worldMapBounds.value
  const mapWidth = maxX - minX + 1
  return (contactRadius.value / mapWidth) * 100
})

// Load world map image
async function loadWorldMap() {
  if (worldMapImageUrl.value) return // Already loaded

  worldMapLoading.value = true
  worldMapError.value = null

  try {
    // Check cache first
    const cached = await getCachedWorldMap(0)
    if (cached) {
      worldMapImageUrl.value = URL.createObjectURL(cached)
    } else {
      // Fetch from API
      const blob = await wikiApi.getWorldMapImage(0)
      await setCachedWorldMap(0, blob)
      worldMapImageUrl.value = URL.createObjectURL(blob)
    }

    // Also fetch bounds for coordinate mapping
    worldMapBounds.value = await wikiApi.getMapBounds(0)
  } catch (e) {
    console.error('Failed to load world map:', e)
    worldMapError.value = 'Failed to load world map'
  } finally {
    worldMapLoading.value = false
  }
}

// Convert ship x,y coordinates to percentage position on map image
function getMapPosition(x: number, y: number): { x: number; y: number } {
  if (!worldMapBounds.value) return { x: 50, y: 50 }

  const { minX, maxX, minY, maxY } = worldMapBounds.value
  const mapWidth = maxX - minX + 1
  const mapHeight = maxY - minY + 1

  return {
    x: ((x - minX) / mapWidth) * 100,
    y: ((y - minY) / mapHeight) * 100,
  }
}

// Get race color class for map markers
function getRaceColorClass(race: MudShipContact['race']): string {
  switch (race) {
    case 'good': return 'bg-green-500 border-green-300'
    case 'evil': return 'bg-red-500 border-red-300'
    case 'undead': return 'bg-purple-500 border-purple-300'
    case 'squid': return 'bg-orange-500 border-orange-300'
    default: return 'bg-gray-500 border-gray-300'
  }
}

// Toggle view mode
function toggleViewMode() {
  if (viewMode.value === 'radar') {
    viewMode.value = 'map'
    loadWorldMap()
  } else {
    viewMode.value = 'radar'
  }
}

// Calculate radar background image positioning (shows PNG cropped to player area)
const radarMapTransform = computed(() => {
  if (!worldMapBounds.value || !hasWorldCoords.value || !shipContacts.value) {
    return null
  }

  const { minX, maxX, minY, maxY } = worldMapBounds.value
  const mapWidth = maxX - minX + 1
  const mapHeight = maxY - minY + 1

  // Player position as percentage of map
  const playerX = shipContacts.value.worldX!
  const playerY = shipContacts.value.worldY!
  const playerPctX = (playerX - minX) / mapWidth
  const playerPctY = (playerY - minY) / mapHeight

  // How much of the map to show (based on maxRange)
  // maxRange is in game units, map dimensions are also in game units
  const visibleRange = maxRange.value * 2 // diameter
  const scaleX = mapWidth / visibleRange
  const scaleY = mapHeight / visibleRange

  // Use the larger scale to maintain aspect ratio
  const scale = Math.max(scaleX, scaleY)

  // Image dimensions scaled up
  const imgWidth = radarSize * scale
  const imgHeight = radarSize * scale

  // Position to center on player
  const imgX = radarCenter - (playerPctX * imgWidth)
  const imgY = radarCenter - (playerPctY * imgHeight)

  return { x: imgX, y: imgY, width: imgWidth, height: imgHeight }
})

// Map zoom controls
function mapZoomIn() {
  mapZoom.value = Math.min(8, mapZoom.value + 1)
}

function mapZoomOut() {
  mapZoom.value = Math.max(1, mapZoom.value - 1)
  // Reset pan when zooming out to 1x
  if (mapZoom.value === 1) {
    mapPan.value = { x: 0, y: 0 }
  }
}

// Center map on player ship
function centerOnPlayer() {
  if (!hasWorldCoords.value) return
  const pos = getMapPosition(playerWorldPosition.value.x, playerWorldPosition.value.y)
  mapPan.value = {
    x: 50 - pos.x,
    y: 50 - pos.y,
  }
}

// Reset map to default view (1x zoom, no pan)
function resetMapView() {
  mapZoom.value = 1
  mapPan.value = { x: 0, y: 0 }
}

// Waypoint marker (where user clicked to navigate)
const waypoint = ref<{ x: number; y: number } | null>(null)

// Handle click on map to set heading (Anno 1800 style)
function handleMapClick(event: MouseEvent) {
  if (!worldMapBounds.value || !hasWorldCoords.value || !shipContacts.value) return

  const container = mapContainerRef.value
  if (!container) return

  const rect = container.getBoundingClientRect()

  // Get click position as percentage of container (accounting for zoom and pan)
  const clickXPct = ((event.clientX - rect.left) / rect.width) * 100
  const clickYPct = ((event.clientY - rect.top) / rect.height) * 100

  // Reverse the zoom/pan transform to get actual map percentage
  // transform: scale(zoom) translate(panX%, panY%)
  // So actual = (visual - 50) / zoom - pan + 50
  const actualXPct = (clickXPct - 50) / mapZoom.value - mapPan.value.x + 50
  const actualYPct = (clickYPct - 50) / mapZoom.value - mapPan.value.y + 50

  // Convert percentage to world coordinates
  const { minX, maxX, minY, maxY } = worldMapBounds.value
  const mapWidth = maxX - minX + 1
  const mapHeight = maxY - minY + 1

  const targetX = minX + (actualXPct / 100) * mapWidth
  const targetY = minY + (actualYPct / 100) * mapHeight

  // Calculate bearing from player position to target
  const playerX = shipContacts.value.worldX!
  const playerY = shipContacts.value.worldY!

  const dx = targetX - playerX
  const dy = targetY - playerY

  // Calculate angle (0° = north/up, clockwise)
  // In this coordinate system, Y increases downward on the map
  let bearing = Math.atan2(dx, -dy) * (180 / Math.PI)
  if (bearing < 0) bearing += 360
  bearing = Math.round(bearing)

  // Set waypoint for visual display
  waypoint.value = { x: targetX, y: targetY }

  // Send heading command
  sendGameCommand(`order heading ${bearing}`)
}

// Map drag handlers
let dragMoved = false

function handleMapMouseDown(event: MouseEvent) {
  dragMoved = false
  if (mapZoom.value <= 1) return
  isDraggingMap.value = true
  dragStart.value = { x: event.clientX, y: event.clientY }
}

function handleMapMouseMove(event: MouseEvent) {
  if (!isDraggingMap.value) return

  const dx = event.clientX - dragStart.value.x
  const dy = event.clientY - dragStart.value.y

  // Track if mouse moved significantly (for click vs drag detection)
  if (Math.abs(dx) > 3 || Math.abs(dy) > 3) {
    dragMoved = true
  }

  dragStart.value = { x: event.clientX, y: event.clientY }

  // Convert pixel movement to percentage (based on container size ~280px)
  const scale = 100 / (280 * mapZoom.value)
  mapPan.value = {
    x: mapPan.value.x + dx * scale,
    y: mapPan.value.y + dy * scale,
  }
}

function handleMapMouseUp(event: MouseEvent, isLeave = false) {
  const wasDragging = isDraggingMap.value
  isDraggingMap.value = false

  // If it was a click (not a drag), set heading - but not on mouseleave
  if (!dragMoved && !wasDragging && !isLeave) {
    handleMapClick(event)
  }
  dragMoved = false
}

function handleMapMouseLeave(event: MouseEvent) {
  handleMapMouseUp(event, true)
}

// Handle mouse wheel zoom on map
function handleMapWheel(event: WheelEvent) {
  event.preventDefault()
  if (event.deltaY < 0) {
    mapZoomIn()
  } else {
    mapZoomOut()
  }
}

// load world map on mount for radar background
onMounted(() => {
  loadWorldMap()
})
</script>

<template>
  <Card class="flex flex-col h-full">
    <CardHeader class="py-2 px-3 shrink-0 flex flex-row items-center justify-between border-b">
      <div class="flex items-center gap-2">
        <span class="font-semibold text-sm">Ship Radar</span>
        <template v-if="shipContacts">
          <Badge variant="outline" class="text-xs font-mono">
            HDG {{ shipContacts.heading }}°
          </Badge>
          <Badge variant="outline" class="text-xs font-mono">
            SPD {{ shipContacts.speed }}
          </Badge>
        </template>
      </div>
      <div class="flex items-center gap-1">
        <Button
          variant="ghost"
          size="icon"
          class="h-6 w-6"
          :title="viewMode === 'radar' ? 'Switch to World Map' : 'Switch to Radar'"
          @click="toggleViewMode"
        >
          <Map v-if="viewMode === 'radar'" class="h-3.5 w-3.5" />
          <Radar v-else class="h-3.5 w-3.5" />
        </Button>
        <!-- Radar zoom controls -->
        <Button
          v-if="viewMode === 'radar'"
          variant="ghost"
          size="icon"
          class="h-6 w-6"
          title="Zoom in (decrease range)"
          :disabled="maxRange <= 10"
          @click="zoomIn"
        >
          <ZoomIn class="h-3.5 w-3.5" />
        </Button>
        <Button
          v-if="viewMode === 'radar'"
          variant="ghost"
          size="icon"
          class="h-6 w-6"
          title="Zoom out (increase range)"
          :disabled="maxRange >= 100"
          @click="zoomOut"
        >
          <ZoomOut class="h-3.5 w-3.5" />
        </Button>
        <!-- Map zoom controls -->
        <Button
          v-if="viewMode === 'map'"
          variant="ghost"
          size="icon"
          class="h-6 w-6"
          title="Zoom in"
          :disabled="mapZoom >= 8"
          @click="mapZoomIn"
        >
          <ZoomIn class="h-3.5 w-3.5" />
        </Button>
        <Button
          v-if="viewMode === 'map'"
          variant="ghost"
          size="icon"
          class="h-6 w-6"
          title="Zoom out"
          :disabled="mapZoom <= 1"
          @click="mapZoomOut"
        >
          <ZoomOut class="h-3.5 w-3.5" />
        </Button>
        <Button
          v-if="viewMode === 'map'"
          variant="ghost"
          size="icon"
          class="h-6 w-6"
          title="Center on your ship"
          @click="centerOnPlayer"
        >
          <Crosshair class="h-3.5 w-3.5" />
        </Button>
        <Button
          v-if="viewMode === 'map'"
          variant="ghost"
          size="icon"
          class="h-6 w-6"
          title="Reset view (fit to screen)"
          @click="resetMapView"
        >
          <Home class="h-3.5 w-3.5" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          class="h-6 w-6"
          title="Detach/Dock"
          @click="emit('detach')"
        >
          <ExternalLink class="h-3.5 w-3.5" />
        </Button>
      </div>
    </CardHeader>

    <CardContent class="flex-1 p-2 overflow-hidden flex flex-col gap-2">
      <!-- World Map View -->
      <div v-if="viewMode === 'map'" class="flex-1 flex flex-col min-h-0">
        <!-- Speed slider (horizontal, at top) -->
        <div class="flex items-center gap-2 px-2 py-1 shrink-0">
          <span class="text-xs text-muted-foreground w-6">0</span>
          <Slider
            :model-value="[sliderSpeed]"
            :max="maxSpeed"
            :min="0"
            :step="1"
            class="flex-1"
            @update:model-value="handleSpeedChange"
          />
          <span class="text-xs text-muted-foreground w-6 text-right">{{ maxSpeed }}</span>
          <span class="text-sm font-mono font-bold w-8 text-right">{{ sliderSpeed }}</span>
        </div>

        <!-- Map container -->
        <div class="flex-1 flex justify-center min-h-0">
          <div
            ref="mapContainerRef"
          class="relative w-full max-h-full aspect-square bg-black rounded-lg overflow-hidden select-none cursor-crosshair"
          :class="{ 'cursor-grab': mapZoom > 1 && !isDraggingMap, 'cursor-grabbing': isDraggingMap }"
          @mousedown="handleMapMouseDown"
          @mousemove="handleMapMouseMove"
          @mouseup="handleMapMouseUp"
          @mouseleave="handleMapMouseLeave"
          @wheel="handleMapWheel"
        >
          <!-- Loading state -->
          <div v-if="worldMapLoading" class="absolute inset-0 flex items-center justify-center">
            <Loader2 class="h-8 w-8 animate-spin text-muted-foreground" />
          </div>

          <!-- Error state -->
          <div v-else-if="worldMapError" class="absolute inset-0 flex items-center justify-center text-red-500 text-sm p-4 text-center">
            {{ worldMapError }}
          </div>

          <!-- Map with overlays (zoomable/pannable container) -->
          <div
            v-else-if="worldMapImageUrl"
            class="absolute inset-0 transition-transform duration-100"
            :style="{
              transform: `scale(${mapZoom}) translate(${mapPan.x}%, ${mapPan.y}%)`,
              transformOrigin: 'center center',
            }"
          >
            <img
              :src="worldMapImageUrl"
              class="w-full h-full"
              style="image-rendering: pixelated;"
              alt="World Map"
              draggable="false"
            />

            <!-- Contact radius circle (percentage-based, scales with map) -->
            <div
              v-if="(canShowMapPosition || playerShip) && worldMapBounds"
              class="absolute rounded-full border border-gray-400/50 bg-gray-400/20 pointer-events-none"
              :style="{
                left: `${getMapPosition(playerWorldPosition.x, playerWorldPosition.y).x}%`,
                top: `${getMapPosition(playerWorldPosition.x, playerWorldPosition.y).y}%`,
                width: `${contactRadiusPercent * 2}%`,
                height: `${contactRadiusPercent * 2}%`,
                transform: 'translate(-50%, -50%)',
              }"
            />

            <!-- Player ship marker (blue triangle) -->
            <div
              v-if="canShowMapPosition || playerShip"
              class="absolute -translate-x-1/2 -translate-y-1/2 z-10"
              :style="{
                left: `${getMapPosition(playerWorldPosition.x, playerWorldPosition.y).x}%`,
                top: `${getMapPosition(playerWorldPosition.x, playerWorldPosition.y).y}%`,
                width: `${16 / mapZoom}px`,
                height: `${16 / mapZoom}px`,
              }"
              :title="`Your ship: ${shipInfo?.name ?? 'Unknown'} (${playerWorldPosition.x}, ${playerWorldPosition.y})`"
            >
              <svg viewBox="0 0 16 16" class="w-full h-full drop-shadow-lg" :style="{ transform: `rotate(${shipContacts?.heading ?? 0}deg)` }">
                <polygon points="8,0 2,14 8,11 14,14" fill="#3b82f6" stroke="#93c5fd" stroke-width="1" />
              </svg>
            </div>

            <!-- Other ship markers -->
            <div
              v-for="contact in otherContacts"
              :key="contact.id"
              class="absolute -translate-x-1/2 -translate-y-1/2 cursor-pointer z-10 flex items-center gap-0.5"
              :style="{
                left: `${getMapPosition(getContactWorldPosition(contact).x, getContactWorldPosition(contact).y).x}%`,
                top: `${getMapPosition(getContactWorldPosition(contact).x, getContactWorldPosition(contact).y).y}%`,
              }"
              :title="`${stripAnsiCodes(contact.name)} [${contact.id}] (${getContactWorldPosition(contact).x}, ${getContactWorldPosition(contact).y})`"
              @click.stop="selectContact(contact.id)"
            >
              <div
                class="rounded-full border-2 shrink-0"
                :class="[
                  contact.targeting_you ? 'animate-pulse' : '',
                  getRaceColorClass(contact.race),
                ]"
                :style="{
                  width: `${12 / mapZoom}px`,
                  height: `${12 / mapZoom}px`,
                }"
              />
              <span
                class="font-bold drop-shadow-[0_1px_1px_rgba(0,0,0,0.8)]"
                :style="{ fontSize: `${10 / mapZoom}px` }"
                :class="contact.targeting_you ? 'text-red-500' : {
                  'text-yellow-400': contact.race === 'good',
                  'text-red-800': contact.race === 'evil',
                  'text-gray-900': contact.race === 'undead',
                  'text-white': contact.race !== 'good' && contact.race !== 'evil' && contact.race !== 'undead',
                }"
              >{{ contact.id }}</span>
            </div>

            <!-- Waypoint marker (navigation target) -->
            <div
              v-if="waypoint && worldMapBounds"
              class="absolute -translate-x-1/2 -translate-y-1/2 z-20 pointer-events-none"
              :style="{
                left: `${getMapPosition(waypoint.x, waypoint.y).x}%`,
                top: `${getMapPosition(waypoint.x, waypoint.y).y}%`,
              }"
            >
              <!-- Waypoint X marker -->
              <svg
                :style="{ width: `${20 / mapZoom}px`, height: `${20 / mapZoom}px` }"
                viewBox="0 0 20 20"
                class="drop-shadow-lg"
              >
                <line x1="4" y1="4" x2="16" y2="16" stroke="#fbbf24" stroke-width="3" stroke-linecap="round" />
                <line x1="16" y1="4" x2="4" y2="16" stroke="#fbbf24" stroke-width="3" stroke-linecap="round" />
                <line x1="4" y1="4" x2="16" y2="16" stroke="#000" stroke-width="1" stroke-linecap="round" />
                <line x1="16" y1="4" x2="4" y2="16" stroke="#000" stroke-width="1" stroke-linecap="round" />
              </svg>
            </div>

            <!-- Line from ship to waypoint -->
            <svg
              v-if="waypoint && worldMapBounds && (canShowMapPosition || playerShip)"
              class="absolute inset-0 w-full h-full pointer-events-none z-5"
              preserveAspectRatio="none"
            >
              <line
                :x1="`${getMapPosition(playerWorldPosition.x, playerWorldPosition.y).x}%`"
                :y1="`${getMapPosition(playerWorldPosition.x, playerWorldPosition.y).y}%`"
                :x2="`${getMapPosition(waypoint.x, waypoint.y).x}%`"
                :y2="`${getMapPosition(waypoint.x, waypoint.y).y}%`"
                stroke="#fbbf24"
                stroke-width="2"
                stroke-dasharray="8 4"
                opacity="0.8"
              />
            </svg>
          </div>

          <!-- Overlays (fixed position, not affected by zoom) -->
          <template v-if="worldMapImageUrl && !worldMapLoading">
            <!-- Ship label overlay (top-left) -->
            <div v-if="canShowMapPosition || shipInfo" class="absolute top-2 left-2 bg-background/80 backdrop-blur px-2 py-1 rounded text-xs font-mono z-20">
              <span v-html="parseAnsiToHtml(shipInfo?.name ?? 'Your Ship')" /> ({{ playerWorldPosition.x }}, {{ playerWorldPosition.y }})
            </div>

            <!-- Zoom level and contacts count (top-right) -->
            <div class="absolute top-2 right-2 bg-background/80 backdrop-blur px-2 py-1 rounded text-xs z-20">
              {{ mapZoom }}x | {{ otherContacts.length }} contact{{ otherContacts.length !== 1 ? 's' : '' }}
            </div>

            <!-- Hint (bottom) -->
            <div v-if="mapZoom > 1" class="absolute bottom-2 left-1/2 -translate-x-1/2 bg-background/80 backdrop-blur px-2 py-1 rounded text-xs text-muted-foreground z-20">
              Drag to pan
            </div>
          </template>
        </div>
        </div>
      </div>

      <!-- Radar Display with Speed Slider -->
      <div v-else class="flex-1 flex justify-center gap-2 min-h-0">
        <svg
          :viewBox="`0 0 ${radarSize} ${radarSize}`"
          class="w-full max-h-full aspect-square bg-black rounded-lg cursor-crosshair"
          @click="handleRadarClick"
        >
          <!-- Radar background grid -->
          <defs>
            <radialGradient id="radarGradient" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stop-color="#1D4071" />
              <stop offset="100%" stop-color="#1D4071" />
            </radialGradient>
            <clipPath id="radarClip">
              <circle :cx="radarCenter" :cy="radarCenter" :r="radarCenter - 5" />
            </clipPath>
          </defs>
          <circle :cx="radarCenter" :cy="radarCenter" :r="radarCenter - 5" fill="url(#radarGradient)" />

          <!-- World map PNG background (clipped to radar circle) -->
          <image
            v-if="worldMapImageUrl && radarMapTransform"
            :href="worldMapImageUrl"
            :x="radarMapTransform.x"
            :y="radarMapTransform.y"
            :width="radarMapTransform.width"
            :height="radarMapTransform.height"
            clip-path="url(#radarClip)"
            opacity="0.5"
            style="image-rendering: pixelated;"
          />

          <!-- Wilderness map fallback (only when PNG not available) -->
          <g v-if="parsedMap.cells.length > 0 && !radarMapTransform" opacity="0.6">
            <rect
              v-for="cell in parsedMap.cells.filter(c => !(c.x === parsedMap.shipX && c.y === parsedMap.shipY))"
              :key="`map-${cell.x}-${cell.y}`"
              :x="getMapCellPosition(cell)?.x"
              :y="getMapCellPosition(cell)?.y"
              :width="mapCellSize - 1"
              :height="mapCellSize - 1"
              :fill="cell.color"
              stroke="none"
            />
          </g>

          <!-- Range rings -->
          <circle
            v-for="ring in rangeRings"
            :key="ring.range"
            :cx="radarCenter"
            :cy="radarCenter"
            :r="ring.radius"
            fill="none"
            stroke="#4ade80"
            stroke-opacity="0.4"
            stroke-width="1"
            stroke-dasharray="4 4"
          />
          <!-- Range labels -->
          <text
            v-for="ring in rangeRings"
            :key="`label-${ring.range}`"
            :x="radarCenter + ring.radius + 2"
            :y="radarCenter - 2"
            fill="#4ade80"
            fill-opacity="0.7"
            font-size="8"
            font-family="monospace"
          >
            {{ ring.range }}
          </text>

          <!-- Cross hairs -->
          <line
            :x1="radarCenter"
            :y1="10"
            :x2="radarCenter"
            :y2="radarSize - 10"
            stroke="#4ade80"
            stroke-opacity="0.3"
            stroke-width="1"
          />
          <line
            :x1="10"
            :y1="radarCenter"
            :x2="radarSize - 10"
            :y2="radarCenter"
            stroke="#4ade80"
            stroke-opacity="0.3"
            stroke-width="1"
          />

          <!-- Compass labels (fixed position at edge) -->
          <template v-if="shipContacts">
            <text
              v-for="(dir, idx) in ['N', 'E', 'S', 'W']"
              :key="dir"
              :x="getCompassPosition(idx * 90).x"
              :y="getCompassPosition(idx * 90).y"
              fill="#ef4444"
              font-size="14"
              font-weight="bold"
              text-anchor="middle"
              dominant-baseline="middle"
              stroke="#000000"
              stroke-width="3"
              paint-order="stroke"
            >
              {{ dir }}
            </text>
          </template>

          <!-- Your ship (center, rotates to show heading) -->
          <g :transform="`rotate(${shipContacts?.heading ?? 0}, ${radarCenter}, ${radarCenter})`">
            <polygon
              :points="`${radarCenter},${radarCenter - 10} ${radarCenter - 6},${radarCenter + 6} ${radarCenter + 6},${radarCenter + 6}`"
              fill="#fbbf24"
              stroke="#000000"
              stroke-width="2"
            >
              <title>Your Ship - HDG {{ shipContacts?.heading ?? 0 }}°</title>
            </polygon>
            <!-- Nautical direction labels (rotate with ship, closer to center) -->
            <text :x="radarCenter" :y="45" fill="#ffffff" font-size="10" font-weight="bold" text-anchor="middle" stroke="#000000" stroke-width="2.5" paint-order="stroke">BOW</text>
            <text :x="radarCenter" :y="radarSize - 40" fill="#ffffff" font-size="10" font-weight="bold" text-anchor="middle" stroke="#000000" stroke-width="2.5" paint-order="stroke">STERN</text>
            <text :x="radarSize - 40" :y="radarCenter + 3" fill="#ffffff" font-size="10" font-weight="bold" text-anchor="end" stroke="#000000" stroke-width="2.5" paint-order="stroke">STBD</text>
            <text :x="40" :y="radarCenter + 3" fill="#ffffff" font-size="10" font-weight="bold" text-anchor="start" stroke="#000000" stroke-width="2.5" paint-order="stroke">PORT</text>
          </g>

          <!-- Contact markers -->
          <template v-if="shipContacts">
            <g
              v-for="contact in shipContacts.contacts"
              :key="contact.id"
              class="cursor-pointer"
              @click="selectContact(contact.id)"
            >
              <!-- Tooltip -->
              <title>{{ stripAnsiCodes(contact.name) }} [{{ contact.id }}]
{{ contact.range.toFixed(1) }}nm @ {{ contact.bearing }}° {{ bearingToCompass(contact.bearing) }}
HDG {{ contact.heading }}° SPD {{ contact.speed }}
({{ contact.x }}, {{ contact.y }}) | {{ contact.race }} | {{ contact.status || 'sailing' }}</title>
              <!-- Contact circle -->
              <circle
                :cx="getContactPosition(contact).x"
                :cy="getContactPosition(contact).y"
                r="6"
                :fill="getContactFill(contact)"
                :stroke="getContactColor(contact)"
                stroke-width="2"
                :class="{ 'animate-pulse': contact.targeting_you }"
              />
              <!-- Contact ID label -->
              <text
                :x="getContactPosition(contact).x + 10"
                :y="getContactPosition(contact).y + 3"
                :fill="getContactColor(contact)"
                font-size="10"
                font-family="monospace"
                font-weight="bold"
              >
                {{ contact.id }}
              </text>
              <!-- Selection ring -->
              <circle
                v-if="selectedContactId === contact.id"
                :cx="getContactPosition(contact).x"
                :cy="getContactPosition(contact).y"
                r="10"
                fill="none"
                stroke="#fbbf24"
                stroke-width="2"
                stroke-dasharray="3 2"
              />
            </g>
          </template>
        </svg>

        <!-- Speed Slider (vertical) -->
        <div class="flex flex-col items-center gap-1 py-2 self-stretch">
          <span class="text-[10px] text-muted-foreground shrink-0" title="Max speed">
            {{ maxSpeed }}
          </span>
          <div class="flex-1 flex items-center min-h-[100px]">
            <Slider
              :model-value="[sliderSpeed]"
              :max="maxSpeed"
              :min="0"
              :step="1"
              orientation="vertical"
              class="h-full"
              @update:model-value="handleSpeedChange"
            />
          </div>
          <span class="text-xs font-mono font-bold">{{ sliderSpeed }}</span>
        </div>
      </div>

      <!-- Ship Status (from Ship.Info GMCP) -->
      <div v-if="shipInfo && viewMode === 'radar'" class="border-t border-border px-3 py-2 space-y-2 text-xs">
        <!-- Ship Name & Status Row -->
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-2">
            <span class="font-semibold text-sm" v-html="parseAnsiToHtml(shipInfo.name)" />
            <span class="text-muted-foreground">[{{ shipInfo.id }}]</span>
          </div>
          <div class="flex items-center gap-1">
            <Badge variant="outline" class="text-[10px]"><span v-html="shipStatusHtml" /></Badge>
            <Badge v-if="shipInfo.frags > 0" variant="destructive" class="text-[10px]">{{ shipInfo.frags }} frags</Badge>
          </div>
        </div>

        <!-- Armor & Hull Grid -->
        <div class="grid grid-cols-4 gap-1">
          <!-- Headers -->
          <div class="text-muted-foreground text-center"></div>
          <div class="text-muted-foreground text-center">Armor</div>
          <div class="text-muted-foreground text-center">Hull</div>
          <div></div>

          <!-- Bow -->
          <div class="text-right text-muted-foreground">Bow</div>
          <div class="flex items-center gap-1">
            <div class="flex-1 h-2 bg-muted rounded-sm overflow-hidden">
              <div class="h-full transition-all" :class="getArmorColor(shipInfo.armor.bow)" :style="{ width: `${(shipInfo.armor.bow[0] / shipInfo.armor.bow[1]) * 100}%` }" />
            </div>
            <span class="w-6 font-mono text-right">{{ shipInfo.armor.bow[0] }}</span>
          </div>
          <div class="flex items-center gap-1">
            <div class="flex-1 h-2 bg-muted rounded-sm overflow-hidden">
              <div class="h-full transition-all" :class="getHullColor(shipInfo.internal.bow)" :style="{ width: `${(shipInfo.internal.bow[0] / shipInfo.internal.bow[1]) * 100}%` }" />
            </div>
            <span class="w-6 font-mono text-right">{{ shipInfo.internal.bow[0] }}</span>
          </div>
          <div></div>

          <!-- Port -->
          <div class="text-right text-muted-foreground">Port</div>
          <div class="flex items-center gap-1">
            <div class="flex-1 h-2 bg-muted rounded-sm overflow-hidden">
              <div class="h-full transition-all" :class="getArmorColor(shipInfo.armor.port)" :style="{ width: `${(shipInfo.armor.port[0] / shipInfo.armor.port[1]) * 100}%` }" />
            </div>
            <span class="w-6 font-mono text-right">{{ shipInfo.armor.port[0] }}</span>
          </div>
          <div class="flex items-center gap-1">
            <div class="flex-1 h-2 bg-muted rounded-sm overflow-hidden">
              <div class="h-full transition-all" :class="getHullColor(shipInfo.internal.port)" :style="{ width: `${(shipInfo.internal.port[0] / shipInfo.internal.port[1]) * 100}%` }" />
            </div>
            <span class="w-6 font-mono text-right">{{ shipInfo.internal.port[0] }}</span>
          </div>
          <div></div>

          <!-- Starboard -->
          <div class="text-right text-muted-foreground">Star</div>
          <div class="flex items-center gap-1">
            <div class="flex-1 h-2 bg-muted rounded-sm overflow-hidden">
              <div class="h-full transition-all" :class="getArmorColor(shipInfo.armor.starboard)" :style="{ width: `${(shipInfo.armor.starboard[0] / shipInfo.armor.starboard[1]) * 100}%` }" />
            </div>
            <span class="w-6 font-mono text-right">{{ shipInfo.armor.starboard[0] }}</span>
          </div>
          <div class="flex items-center gap-1">
            <div class="flex-1 h-2 bg-muted rounded-sm overflow-hidden">
              <div class="h-full transition-all" :class="getHullColor(shipInfo.internal.starboard)" :style="{ width: `${(shipInfo.internal.starboard[0] / shipInfo.internal.starboard[1]) * 100}%` }" />
            </div>
            <span class="w-6 font-mono text-right">{{ shipInfo.internal.starboard[0] }}</span>
          </div>
          <div></div>

          <!-- Stern -->
          <div class="text-right text-muted-foreground">Stern</div>
          <div class="flex items-center gap-1">
            <div class="flex-1 h-2 bg-muted rounded-sm overflow-hidden">
              <div class="h-full transition-all" :class="getArmorColor(shipInfo.armor.stern)" :style="{ width: `${(shipInfo.armor.stern[0] / shipInfo.armor.stern[1]) * 100}%` }" />
            </div>
            <span class="w-6 font-mono text-right">{{ shipInfo.armor.stern[0] }}</span>
          </div>
          <div class="flex items-center gap-1">
            <div class="flex-1 h-2 bg-muted rounded-sm overflow-hidden">
              <div class="h-full transition-all" :class="getHullColor(shipInfo.internal.stern)" :style="{ width: `${(shipInfo.internal.stern[0] / shipInfo.internal.stern[1]) * 100}%` }" />
            </div>
            <span class="w-6 font-mono text-right">{{ shipInfo.internal.stern[0] }}</span>
          </div>
          <div></div>
        </div>

        <!-- Resources Row -->
        <div class="grid grid-cols-4 gap-2 pt-1 border-t border-border/50">
          <div class="flex flex-col items-center">
            <span class="text-muted-foreground text-[10px]">Sail</span>
            <div class="w-full h-1.5 bg-muted rounded-full overflow-hidden">
              <div class="h-full bg-sky-500" :style="{ width: `${(shipInfo.sail / shipInfo.maxSail) * 100}%` }" />
            </div>
            <span class="font-mono">{{ shipInfo.sail }}</span>
          </div>
          <div class="flex flex-col items-center">
            <span class="text-muted-foreground text-[10px]">Crew</span>
            <div class="w-full h-1.5 bg-muted rounded-full overflow-hidden">
              <div class="h-full bg-amber-500" :style="{ width: `${(shipInfo.crewStamina / shipInfo.maxCrewStamina) * 100}%` }" />
            </div>
            <span class="font-mono">{{ shipInfo.crewStamina }}</span>
          </div>
          <div class="flex flex-col items-center">
            <span class="text-muted-foreground text-[10px]">Repair</span>
            <span class="font-mono text-sm">{{ shipInfo.repairStock }}</span>
          </div>
          <div class="flex flex-col items-center">
            <span class="text-muted-foreground text-[10px]">People</span>
            <span class="font-mono text-sm">{{ shipInfo.people }}/{{ shipInfo.maxPeople }}</span>
          </div>
        </div>

        <!-- Crew Type & Skills -->
        <div v-if="shipInfo.crewType" class="pt-1 border-t border-border/50">
          <div class="flex items-center justify-between mb-1">
            <span class="text-muted-foreground">Crew</span>
            <span v-html="parseAnsiToHtml(shipInfo.crewType)" />
          </div>
          <div v-if="shipInfo.skills" class="grid gap-0.5 text-[11px]">
            <!-- Sail skill -->
            <div class="flex items-center gap-2 px-1">
              <span class="w-12 text-muted-foreground">Sail</span>
              <span class="font-mono w-12">{{ shipInfo.skills.sail }}<span v-if="shipInfo.skillMods?.sail" class="text-green-500">(+{{ shipInfo.skillMods.sail }})</span></span>
              <span v-if="shipInfo.chiefs?.sail" class="flex-1 truncate" v-html="parseAnsiToHtml(shipInfo.chiefs.sail)" />
            </div>
            <!-- Guns skill -->
            <div class="flex items-center gap-2 px-1">
              <span class="w-12 text-muted-foreground">Guns</span>
              <span class="font-mono w-12">{{ shipInfo.skills.guns }}<span v-if="shipInfo.skillMods?.guns" class="text-green-500">(+{{ shipInfo.skillMods.guns }})</span></span>
              <span v-if="shipInfo.chiefs?.guns" class="flex-1 truncate" v-html="parseAnsiToHtml(shipInfo.chiefs.guns)" />
            </div>
            <!-- Repair skill -->
            <div class="flex items-center gap-2 px-1">
              <span class="w-12 text-muted-foreground">Repair</span>
              <span class="font-mono w-12">{{ shipInfo.skills.repair }}<span v-if="shipInfo.skillMods?.repair" class="text-green-500">(+{{ shipInfo.skillMods.repair }})</span></span>
              <span v-if="shipInfo.chiefs?.repair" class="flex-1 truncate" v-html="parseAnsiToHtml(shipInfo.chiefs.repair)" />
            </div>
          </div>
        </div>

        <!-- Weapons -->
        <div v-if="shipInfo.weapons.length > 0" class="pt-1 border-t border-border/50">
          <div class="grid gap-1">
            <div
              v-for="w in shipInfo.weapons"
              :key="w.slot"
              class="flex items-center gap-2 px-1.5 py-0.5 rounded"
              :class="w.damage > 0 ? 'bg-red-950/40' : w.ready ? 'bg-green-950/30' : 'bg-yellow-950/30'"
            >
              <span class="w-10 text-muted-foreground capitalize">{{ w.position }}</span>
              <span class="flex-1 truncate" v-html="parseAnsiToHtml(w.name)" />
              <span class="font-mono w-10 text-right">{{ w.ammo }}/{{ w.maxAmmo }}</span>
              <Badge v-if="w.damage > 0" variant="destructive" class="text-[9px] px-1">DMG</Badge>
              <Badge v-else-if="!w.ready" variant="secondary" class="text-[9px] px-1">LOAD</Badge>
            </div>
          </div>
        </div>

        <!-- Equipment -->
        <div v-if="shipInfo.equipment?.length > 0" class="pt-1 border-t border-border/50">
          <div class="flex items-center justify-between mb-1">
            <span class="text-muted-foreground">Equipment</span>
          </div>
          <div class="grid gap-0.5">
            <div
              v-for="e in shipInfo.equipment"
              :key="e.slot"
              class="flex items-center gap-2 px-1"
            >
              <span class="flex-1 truncate" v-html="parseAnsiToHtml(e.name)" />
              <Badge v-if="e.ready" variant="outline" class="text-[9px] px-1 text-green-500">Ready</Badge>
            </div>
          </div>
        </div>

        <!-- Cargo -->
        <div v-if="shipInfo.cargo.max > 0" class="pt-1 border-t border-border/50">
          <div class="flex items-center justify-between mb-1">
            <span class="text-muted-foreground">Cargo</span>
            <span class="font-mono">{{ shipInfo.cargo.current }}/{{ shipInfo.cargo.max }}</span>
          </div>
          <div v-if="shipInfo.cargo.items.length > 0" class="grid gap-0.5">
            <div
              v-for="c in shipInfo.cargo.items"
              :key="c.slot"
              class="flex items-center gap-2 px-1"
              :class="c.contraband ? 'text-red-400' : ''"
            >
              <span class="flex-1 truncate" v-html="parseAnsiToHtml(c.name)" />
              <span class="font-mono">{{ c.crates }}</span>
              <span v-if="c.contraband" class="text-[9px] text-red-500">!</span>
            </div>
          </div>
        </div>
      </div>

      <!-- Contact List (radar view only) -->
      <ScrollArea v-if="viewMode === 'radar'" class="flex-1">
        <div v-if="!isOnShip" class="text-sm text-muted-foreground text-center py-4">
          Not on a ship
        </div>

        <div v-else-if="!shipContacts || shipContacts.contacts.length === 0" class="text-sm text-muted-foreground text-center py-4">
          No contacts in range
        </div>

        <div v-else class="space-y-1">
          <ContextMenu v-for="contact in shipContacts.contacts" :key="contact.id">
            <ContextMenuTrigger as-child>
              <div
                class="p-2 rounded-md cursor-pointer transition-colors"
                :class="[
                  contact.targeting_you ? 'bg-red-950/40 hover:bg-red-950/60' : 'bg-muted/30 hover:bg-muted/50',
                  selectedContactId === contact.id ? 'ring-1 ring-yellow-500' : '',
                ]"
                @click="selectContact(contact.id)"
              >
                <!-- Contact Header Row -->
                <div class="flex items-center gap-2 mb-1">
                  <Badge variant="outline" class="font-mono text-xs px-1.5">
                    {{ contact.id }}
                  </Badge>
                  <span class="text-sm font-medium truncate flex-1" v-html="parseAnsiToHtml(contact.name)" />
                  <AlertCircle
                    v-if="contact.targeting_you"
                    class="h-4 w-4 text-red-500 shrink-0"
                    title="Targeting you!"
                  />
                  <Crosshair
                    v-if="contact.you_targeting"
                    class="h-4 w-4 text-yellow-500 shrink-0"
                    title="You are targeting"
                  />
                </div>

                <!-- Contact Details Row -->
                <div class="flex items-center gap-2 text-xs">
                  <span class="font-mono text-muted-foreground">
                    {{ contact.range.toFixed(1) }}nm @ {{ contact.bearing }}° {{ bearingToCompass(contact.bearing) }}
                  </span>
                  <span class="text-muted-foreground">|</span>
                  <span class="font-mono text-muted-foreground">
                    HDG {{ contact.heading }}° SPD {{ contact.speed }}
                  </span>
                  <span class="text-muted-foreground">|</span>
                  <span class="font-mono text-muted-foreground">
                    ({{ contact.x }}, {{ contact.y }})
                  </span>
                </div>

                <!-- Status Badges Row -->
                <div class="flex items-center gap-1 mt-1">
                  <Badge variant="outline" class="text-xs capitalize" :class="getRaceColor(contact.race)">
                    {{ contact.race }}
                  </Badge>
                  <Badge v-if="contact.status" variant="outline" class="text-xs capitalize" :class="getStatusColor(contact.status)">
                    {{ contact.status }}
                  </Badge>
                  <Badge v-if="contact.arc" variant="outline" class="text-xs font-mono">
                    {{ contact.arc }}
                  </Badge>
                </div>
              </div>
            </ContextMenuTrigger>
            <ContextMenuContent class="w-48">
              <ContextMenuItem @click="executeShipAction('target', contact)">
                <Crosshair class="h-3.5 w-3.5 mr-2" />
                Target
              </ContextMenuItem>
              <ContextMenuItem @click="executeShipAction('fire', contact)">
                Fire
              </ContextMenuItem>
              <ContextMenuSeparator />
              <ContextMenuItem @click="executeShipAction('scan', contact)">
                Scan
              </ContextMenuItem>
              <ContextMenuItem @click="executeShipAction('hail', contact)">
                Hail
              </ContextMenuItem>
            </ContextMenuContent>
          </ContextMenu>
        </div>
      </ScrollArea>
    </CardContent>
  </Card>
</template>
