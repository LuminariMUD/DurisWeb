<script setup lang="ts">
import { ref, shallowRef, computed, watch, onMounted, onUnmounted, nextTick } from 'vue'
import cytoscape, { type Core, type NodeSingular, type ElementDefinition } from 'cytoscape'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { ZoomIn, ZoomOut, Maximize2, LayoutGrid, Info, Fullscreen, X, MapPin } from '@lucide/vue'
import { parseAnsiToHtml } from '@/utils/ansiParser'
import { chartTheme } from '@/utils/chartTheme'

import {
  getZoneMapConnections,
  layoutZoneRooms,
  ZONE_MAP_NODE_SIZE,
  type WikiMapRoom,
} from '@/utils/wikiZoneMapLayout'

const props = defineProps<{
  rooms: WikiMapRoom[]
  selectedRoomVnum: number | null
  zoneName?: string
}>()

const emit = defineEmits<{
  (e: 'select-room', vnum: number): void
}>()

// Constants
const NODE_SIZE = ZONE_MAP_NODE_SIZE

// Container refs
const containerRef = ref<HTMLElement | null>(null)
const cyRef = shallowRef<Core | null>(null)
let resizeObserver: ResizeObserver | undefined
let resizeFrame = 0
let fitted = true
let adjustingViewport = false
let fullscreenCamera: { zoom: number; pan: { x: number; y: number }; fitted: boolean } | null = null
const selectedRoom = computed(() =>
  props.rooms.find((room) => room.vnum === props.selectedRoomVnum),
)
const selectedPosition = ref<{ x: number; y: number } | null>(null)

// State
const zoom = ref(100)
const isFullscreen = ref(false)

// Tooltip state
const tooltipVisible = ref(false)
const tooltipX = ref(0)
const tooltipY = ref(0)
const tooltipContent = ref('')
const tooltipVnum = ref(0)

// Default sector color
const DEFAULT_SECTOR_COLOR = { bg: '#3f3f46', border: '#52525b' }

// Sector colors map
const SECTOR_COLORS: Record<number, { bg: string; border: string }> = {
  0: { bg: '#3f3f46', border: '#52525b' }, // SECT_INSIDE (zinc-700/zinc-600)
  1: { bg: '#78350f', border: '#b45309' }, // SECT_CITY (amber-900/amber-700)
  2: { bg: '#14532d', border: '#15803d' }, // SECT_FIELD (green-900/green-700)
  3: { bg: '#166534', border: '#16a34a' }, // SECT_FOREST (green-800/green-600)
  4: { bg: '#44403c', border: '#57534e' }, // SECT_HILLS (stone-700/stone-600)
  5: { bg: '#52525b', border: '#71717a' }, // SECT_MOUNTAIN (gray-600/gray-500)
  6: { bg: '#1e3a8a', border: '#1d4ed8' }, // SECT_WATER_SWIM (blue-900/blue-700)
  7: { bg: '#1e40af', border: '#2563eb' }, // SECT_WATER_NOSWIM (blue-800/blue-600)
  8: { bg: '#164e63', border: '#0e7490' }, // SECT_UNDERWATER (cyan-900/cyan-700)
  9: { bg: '#0c4a6e', border: '#0284c7' }, // SECT_AIR (sky-900/sky-700)
  10: { bg: '#713f12', border: '#a16207' }, // SECT_DESERT (yellow-900/yellow-700)
  11: { bg: '#7f1d1d', border: '#b91c1c' }, // SECT_ARENA (red-900/red-700)
  12: { bg: '#1e3a8a', border: '#1d4ed8' }, // SECT_OCEAN (blue)
  13: { bg: '#581c87', border: '#7c3aed' }, // SECT_UNDRWLD_WILD (purple)
  14: { bg: '#6b21a8', border: '#a855f7' }, // SECT_UNDRWLD_CITY (purple light)
  15: { bg: '#27272a', border: '#3f3f46' }, // SECT_UNDRWLD_INSIDE (dark)
  24: { bg: '#ca8a04', border: '#eab308' }, // SECT_DESERT (yellow)
  25: { bg: '#e2e8f0', border: '#f8fafc' }, // SECT_ARCTIC (white/slate)
  26: { bg: '#7c3aed', border: '#a78bfa' }, // SECT_SWAMP (purple)
  37: { bg: '#525252', border: '#737373' }, // SECT_ROAD (neutral)
}

// Sector type names for legend
const SECTOR_NAMES: Record<number, string> = {
  0: 'Inside',
  1: 'City',
  2: 'Field',
  3: 'Forest',
  4: 'Hills',
  5: 'Mountain',
  6: 'Water (Swim)',
  7: 'Water (No Swim)',
  12: 'Ocean',
  13: 'UD Wild',
  14: 'UD City',
  15: 'UD Inside',
  24: 'Desert',
  25: 'Arctic',
  26: 'Swamp',
  37: 'Road',
}

// Get sector color for node
function getSectorColor(sectorType?: number): { bg: string; border: string } {
  const key = sectorType ?? 0
  return SECTOR_COLORS[key] ?? DEFAULT_SECTOR_COLOR
}

const directionLabels: Record<string, string> = {
  north: 'N',
  east: 'E',
  south: 'S',
  west: 'W',
  up: 'U',
  down: 'D',
  northeast: 'NE',
  northwest: 'NW',
  southeast: 'SE',
  southwest: 'SW',
}

// Build Cytoscape elements from rooms
function buildElements(): ElementDefinition[] {
  const elements: ElementDefinition[] = []

  // Add nodes
  for (const room of props.rooms) {
    const colors = getSectorColor(room.sectorType)

    elements.push({
      group: 'nodes',
      data: {
        id: String(room.vnum),
        vnum: room.vnum,
        name: room.name,
        sectorType: room.sectorType,
        bgColor: colors.bg,
        borderColor: colors.border,
      },
    })
  }

  for (const connection of getZoneMapConnections(props.rooms)) {
    elements.push({
      group: 'edges',
      data: {
        ...connection,
        sourceLabel: connection.sourceDirections
          .map((direction) => directionLabels[direction] ?? direction)
          .join('/'),
        targetLabel: connection.targetDirections
          .map((direction) => directionLabels[direction] ?? direction)
          .join('/'),
      },
      classes: [
        connection.vertical ? 'vertical' : '',
        connection.sourceDirections.length ? 'to-target' : '',
        connection.targetDirections.length ? 'to-source' : '',
      ].join(' '),
    })
  }

  return elements
}

// Cytoscape stylesheet
const stylesheet: cytoscape.StylesheetStyle[] = [
  {
    selector: 'node',
    style: {
      width: NODE_SIZE,
      height: NODE_SIZE,
      'background-color': 'data(bgColor)',
      'border-width': 2,
      'border-color': 'data(borderColor)',
      shape: 'round-rectangle',
      label: '',
    },
  },
  {
    selector: 'node.highlighted',
    style: {
      'border-color': chartTheme.text,
      'border-width': 4,
      shape: 'diamond',
      'z-index': 3,
    },
  },
  {
    selector: 'edge',
    style: {
      width: 2,
      'line-color': chartTheme.neutralSeries,
      'target-arrow-color': chartTheme.neutralSeries,
      'target-arrow-shape': 'none',
      'source-arrow-shape': 'none',
      'source-arrow-color': chartTheme.neutralSeries,
      'curve-style': 'bezier',
      'control-point-step-size': 36,
      'arrow-scale': 0.8,
    },
  },
  { selector: 'edge.to-target', style: { 'target-arrow-shape': 'triangle' } },
  { selector: 'edge.to-source', style: { 'source-arrow-shape': 'triangle' } },
  { selector: 'edge.vertical', style: { 'line-style': 'dashed' } },
  {
    selector: 'edge.highlighted',
    style: {
      width: 3,
      'line-color': chartTheme.text,
      'source-arrow-color': chartTheme.text,
      'target-arrow-color': chartTheme.text,
      'source-label': 'data(sourceLabel)',
      'target-label': 'data(targetLabel)',
      'source-text-offset': 8,
      'target-text-offset': 8,
      'font-size': 12,
      color: chartTheme.text,
      'text-background-color': chartTheme.tooltip.backgroundColor,
      'text-background-opacity': 1,
      'text-background-padding': '2px',
      'min-zoomed-font-size': 8,
      'z-index': 2,
    },
  },
]

// Initialize Cytoscape
function initCytoscape() {
  if (!containerRef.value) return
  if (props.rooms.length === 0) return

  // Ensure container has dimensions
  const container = containerRef.value
  if (container.clientWidth === 0 || container.clientHeight === 0) return

  const elements = buildElements()

  try {
    cyRef.value = cytoscape({
      container: container,
      elements,
      style: stylesheet,
      layout: { name: 'preset' },
      autounselectify: true,
      autoungrabify: true,
      minZoom: 0.02,
      maxZoom: 2,
    })
  } catch (error) {
    console.error('Failed to initialize Cytoscape:', error)
    return
  }

  const cy = cyRef.value

  // Event: node click
  cy.on('tap', 'node', (e) => {
    const node = e.target as NodeSingular
    const vnum = node.data('vnum') as number
    emit('select-room', vnum)
  })

  // Event: mouseover for tooltip
  cy.on('mouseover', 'node', (e) => {
    const node = e.target as NodeSingular
    const vnum = node.data('vnum') as number
    const name = node.data('name') as string

    const renderedPos = node.renderedPosition()

    tooltipVnum.value = vnum
    tooltipContent.value = name
    tooltipX.value = Math.max(100, Math.min(container.clientWidth - 100, renderedPos.x))
    tooltipY.value = Math.max(48, renderedPos.y - NODE_SIZE - 8)
    tooltipVisible.value = true
  })

  cy.on('mouseout', 'node', () => {
    tooltipVisible.value = false
  })

  cy.on('zoom pan', () => {
    zoom.value = Math.round(cy.zoom() * 100)
    tooltipVisible.value = false
    if (!adjustingViewport) fitted = false
    updateSelectedPosition()
  })

  runAutoLayout()
  updateSelectedRoom(props.selectedRoomVnum)
}

function updateSelectedPosition() {
  const cy = cyRef.value
  const node = cy?.getElementById(String(props.selectedRoomVnum))
  if (!cy || !node?.length) {
    selectedPosition.value = null
    return
  }
  const position = node.renderedPosition()
  selectedPosition.value =
    position.x >= 0 && position.x <= cy.width() && position.y >= 0 && position.y <= cy.height()
      ? { x: position.x, y: position.y }
      : null
}

function handleFitToView() {
  const cy = cyRef.value
  if (!cy) return
  fitted = true
  adjustingViewport = true
  // Clear the 46px toolbar, its 16px inset, and the screen-size selection marker.
  cy.fit(undefined, 70)
  adjustingViewport = false
  updateSelectedPosition()
}

// Layout all components before fitting; the panel controls packing, not room scale.
function runAutoLayout() {
  const cy = cyRef.value
  const container = containerRef.value
  if (!cy || !container) return
  const positions = layoutZoneRooms(props.rooms, container.clientWidth / container.clientHeight)
  cy.batch(() => {
    for (const [vnum, position] of positions) {
      cy.getElementById(String(vnum)).position(position)
    }
  })
  handleFitToView()
}

// Update selected room highlight
function updateSelectedRoom(vnum: number | null) {
  const cy = cyRef.value
  if (!cy) return

  // Remove highlight from all nodes
  cy.elements().removeClass('highlighted')

  // Add highlight to selected node (without changing map position)
  if (vnum !== null) {
    const node = cy.getElementById(String(vnum))
    if (node.length) {
      node.addClass('highlighted')
      node.connectedEdges().addClass('highlighted')
    }
  }
  updateSelectedPosition()
}

// Control handlers
function handleZoomIn() {
  const cy = cyRef.value
  if (!cy) return
  cy.zoom({
    level: cy.zoom() * 1.25,
    renderedPosition: {
      x: containerRef.value!.clientWidth / 2,
      y: containerRef.value!.clientHeight / 2,
    },
  })
}

function handleZoomOut() {
  const cy = cyRef.value
  if (!cy) return
  cy.zoom({
    level: cy.zoom() * 0.8,
    renderedPosition: {
      x: containerRef.value!.clientWidth / 2,
      y: containerRef.value!.clientHeight / 2,
    },
  })
}

function focusSelectedRoom() {
  const cy = cyRef.value
  const node = cy?.getElementById(String(props.selectedRoomVnum))
  if (!cy || !node?.length) return
  cy.zoom(Math.max(1, cy.zoom()))
  cy.center(node)
}

function handleAutoLayout() {
  runAutoLayout()
}

function resizeMap() {
  const container = containerRef.value
  if (!container?.clientWidth || !container.clientHeight) return
  if (!cyRef.value) {
    initCytoscape()
    return
  }
  cyRef.value.resize()
  if (fitted) handleFitToView()
  else updateSelectedPosition()
}

async function toggleFullscreen() {
  const cy = cyRef.value
  if (!cy) return
  if (!isFullscreen.value) fullscreenCamera = { zoom: cy.zoom(), pan: { ...cy.pan() }, fitted }
  isFullscreen.value = !isFullscreen.value
  await nextTick()
  cy.resize()
  if (isFullscreen.value || !fullscreenCamera || fullscreenCamera.fitted) {
    handleFitToView()
  } else if (fullscreenCamera) {
    fitted = false
    cy.viewport({ zoom: fullscreenCamera.zoom, pan: fullscreenCamera.pan })
    updateSelectedPosition()
  }
}

function handleEscape(event: KeyboardEvent) {
  if (event.key === 'Escape' && isFullscreen.value) {
    event.preventDefault()
    void toggleFullscreen()
  }
}

// Watch for selected room changes
watch(
  () => props.selectedRoomVnum,
  (newVnum) => {
    updateSelectedRoom(newVnum)
  },
)

// Hidden desktop/mobile instances initialize only when their container becomes visible.
watch(
  () => props.rooms,
  async () => {
    cyRef.value?.destroy()
    cyRef.value = null
    selectedPosition.value = null
    fullscreenCamera = null
    await nextTick()
    resizeMap()
  },
  { deep: true },
)

onMounted(() => {
  resizeObserver = new ResizeObserver(() => {
    cancelAnimationFrame(resizeFrame)
    resizeFrame = requestAnimationFrame(resizeMap)
  })
  if (containerRef.value) resizeObserver.observe(containerRef.value)
  resizeMap()
  window.addEventListener('keydown', handleEscape)
})

onUnmounted(() => {
  resizeObserver?.disconnect()
  cancelAnimationFrame(resizeFrame)
  window.removeEventListener('keydown', handleEscape)
  cyRef.value?.destroy()
  cyRef.value = null
})
</script>

<template>
  <div
    role="region"
    aria-label="Zone room map"
    :class="[
      'flex flex-col bg-background',
      isFullscreen ? 'fixed inset-0 z-50' : 'h-full'
    ]"
  >
    <!-- Map Header -->
    <div class="px-3 py-2 border-b border-border flex items-center justify-between shrink-0">
      <div v-if="isFullscreen">
        <h2 class="text-lg font-semibold text-foreground" v-html="zoneName ? parseAnsiToHtml(zoneName) : 'Zone Map'" />
        <span class="text-xs text-faint">{{ rooms.length }} rooms</span>
      </div>
      <span v-else class="text-sm text-muted-foreground">Zone Map</span>
      <div class="flex items-center gap-2">
        <span v-if="!isFullscreen" class="text-xs text-faint">{{ rooms.length }} rooms</span>
        <Button
          variant="ghost"
          size="icon"
          :class="isFullscreen ? 'h-8 w-8' : 'h-5 w-5'"
          :title="isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'"
          :aria-label="isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'"
          @click="toggleFullscreen"
          :disabled="rooms.length === 0"
        >
          <X v-if="isFullscreen" class="h-5 w-5" />
          <Fullscreen v-else class="h-3.5 w-3.5 text-faint" />
        </Button>
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="ghost" size="icon" class="h-8 w-8" title="Sector Legend" aria-label="Sector Legend">
              <Info class="h-3.5 w-3.5 text-faint" />
            </Button>
          </PopoverTrigger>
          <PopoverContent class="w-48 p-2" align="end">
            <div class="text-xs font-medium mb-2 text-muted-foreground">Sector Types</div>
            <p class="text-xs text-muted-foreground mb-2">Dashed connections have up/down exits. U means up; D means down.</p>
            <div class="space-y-1">
              <div
                v-for="(name, sectorId) in SECTOR_NAMES"
                :key="sectorId"
                class="flex items-center gap-2"
              >
                <div
                  class="w-4 h-4 rounded border-2"
                  :style="{
                    backgroundColor: SECTOR_COLORS[Number(sectorId)]?.bg || DEFAULT_SECTOR_COLOR.bg,
                    borderColor: SECTOR_COLORS[Number(sectorId)]?.border || DEFAULT_SECTOR_COLOR.border,
                  }"
                />
                <span class="text-xs text-bone-muted">{{ name }}</span>
              </div>
            </div>
          </PopoverContent>
        </Popover>
      </div>
    </div>

    <!-- Map Canvas -->
    <div class="flex-1 relative overflow-hidden">
      <!-- Cytoscape Container -->
      <div
        ref="containerRef"
        class="absolute inset-0 w-full h-full"
      />

      <div
        v-if="selectedPosition"
        data-selected-marker
        class="absolute pointer-events-none h-4 w-4 border-2 border-vermilion"
        :style="{ left: `${selectedPosition.x}px`, top: `${selectedPosition.y}px`, transform: 'translate(-50%, -50%) rotate(45deg)' }"
      />

      <Button
        v-if="selectedRoom"
        variant="outline"
        class="absolute top-2 left-2 right-2 h-auto py-2 justify-start bg-card gap-2 text-xs"
        :aria-label="`Find selected room #${selectedRoom.vnum}`"
        @click="focusSelectedRoom"
      >
        <MapPin class="h-4 w-4 shrink-0" aria-hidden="true" />
        <span class="font-mono shrink-0">#{{ selectedRoom.vnum }}</span>
        <span class="truncate text-left" v-html="parseAnsiToHtml(selectedRoom.name)" />
        <span class="ml-auto shrink-0 text-muted-foreground">Find</span>
      </Button>

      <!-- Custom Tooltip -->
      <div
        v-if="tooltipVisible"
        class="absolute pointer-events-none z-50 max-w-[calc(100%-1rem)] px-2 py-1 bg-ink-high border border-border rounded text-sm shadow-lg"
        :style="{
          left: `${tooltipX}px`,
          top: `${tooltipY}px`,
          transform: 'translate(-50%, -100%)',
        }"
      >
        <span class="font-mono text-muted-foreground">#{{ tooltipVnum }}</span>
        <span class="mx-1">-</span>
        <span v-html="parseAnsiToHtml(tooltipContent)" />
      </div>

      <!-- Zoom Controls -->
      <div class="absolute bottom-4 left-4 flex items-center gap-2 bg-card border border-border rounded-lg p-2">
        <Button variant="ghost" size="icon" class="h-7 w-7" aria-label="Zoom out" :disabled="rooms.length === 0" @click="handleZoomOut">
          <ZoomOut class="h-4 w-4" />
        </Button>
        <span class="text-xs text-muted-foreground w-10 text-center">{{ zoom }}%</span>
        <Button variant="ghost" size="icon" class="h-7 w-7" aria-label="Zoom in" :disabled="rooms.length === 0" @click="handleZoomIn">
          <ZoomIn class="h-4 w-4" />
        </Button>
        <div class="border-l border-border ml-1 pl-2 flex gap-1">
          <Button
            variant="ghost"
            size="icon"
            class="h-7 w-7"
            title="Fit to View"
            aria-label="Fit to View"
            :disabled="rooms.length === 0"
            @click="handleFitToView"
          >
            <Maximize2 class="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            class="h-7 w-7"
            title="Auto-Layout"
            aria-label="Auto-Layout"
            :disabled="rooms.length === 0"
            @click="handleAutoLayout"
          >
            <LayoutGrid class="h-4 w-4" />
          </Button>
        </div>
      </div>

      <!-- Empty State -->
      <div
        v-if="rooms.length === 0"
        class="absolute inset-0 flex items-center justify-center text-faint"
      >
        <div class="text-center">
          <LayoutGrid class="h-12 w-12 mx-auto mb-2 opacity-50" />
          <p class="text-sm">No rooms in this zone</p>
        </div>
      </div>
    </div>
  </div>
</template>
