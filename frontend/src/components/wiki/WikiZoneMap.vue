<script setup lang="ts">
import { ref, watch, onMounted, onUnmounted, nextTick } from 'vue'
import cytoscape, { type Core, type NodeSingular, type ElementDefinition } from 'cytoscape'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { ZoomIn, ZoomOut, Maximize2, LayoutGrid, Info, Fullscreen, X } from '@lucide/vue'
import { parseAnsiToHtml } from '@/utils/ansiParser'

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
const cyRef = ref<Core | null>(null)

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
        sourceLabel: connection.sourceDirections.join(', '),
        targetLabel: connection.targetDirections.join(', '),
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
    selector: 'node:selected',
    style: {
      'background-color': '#16a34a', // green-600
      'border-color': '#4ade80', // green-400
      'border-width': 2,
    },
  },
  {
    selector: 'node.highlighted',
    style: {
      'background-color': '#16a34a', // green-600
      'border-color': '#4ade80', // green-400
      'border-width': 2,
    },
  },
  {
    selector: 'edge',
    style: {
      width: 2,
      'line-color': '#52525b', // zinc-600
      'target-arrow-color': '#52525b',
      'target-arrow-shape': 'none',
      'source-arrow-shape': 'none',
      'source-arrow-color': '#52525b',
      'curve-style': 'bezier',
      'arrow-scale': 0.8,
    },
  },
  { selector: 'edge.to-target', style: { 'target-arrow-shape': 'triangle' } },
  { selector: 'edge.to-source', style: { 'source-arrow-shape': 'triangle' } },
]

// Initialize Cytoscape
function initCytoscape() {
  if (!containerRef.value) return
  if (props.rooms.length === 0) return

  // Ensure container has dimensions
  const container = containerRef.value
  if (container.clientWidth === 0 || container.clientHeight === 0) {
    setTimeout(() => initCytoscape(), 100)
    return
  }

  const elements = buildElements()

  try {
    cyRef.value = cytoscape({
      container: container,
      elements,
      style: stylesheet,
      layout: { name: 'grid', rows: 1 },
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
    tooltipX.value = renderedPos.x
    tooltipY.value = renderedPos.y - NODE_SIZE - 8
    tooltipVisible.value = true
  })

  cy.on('mouseout', 'node', () => {
    tooltipVisible.value = false
  })

  // Event: zoom change
  cy.on('zoom', () => {
    zoom.value = Math.round(cy.zoom() * 100)
    tooltipVisible.value = false
  })

  // Event: pan
  cy.on('pan', () => {
    tooltipVisible.value = false
  })

  // Run auto-layout
  nextTick(() => {
    runAutoLayout()
  })
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
  cy.fit(undefined, 50)
  zoom.value = Math.round(cy.zoom() * 100)
}

// Update selected room highlight
function updateSelectedRoom(vnum: number | null) {
  const cy = cyRef.value
  if (!cy) return

  // Remove highlight from all nodes
  cy.nodes().removeClass('highlighted')

  // Add highlight to selected node (without changing map position)
  if (vnum !== null) {
    const node = cy.getElementById(String(vnum))
    if (node.length) {
      node.addClass('highlighted')
    }
  }
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

function handleFitToView() {
  const cy = cyRef.value
  if (!cy) return
  cy.fit(undefined, 50)
  zoom.value = Math.round(cy.zoom() * 100)
}

function handleAutoLayout() {
  runAutoLayout()
}

// Fullscreen handlers
function toggleFullscreen() {
  isFullscreen.value = !isFullscreen.value
  nextTick(() => {
    const cy = cyRef.value
    if (cy) {
      cy.resize()
      cy.fit(undefined, 50)
      zoom.value = Math.round(cy.zoom() * 100)
    }
  })
}

// Watch for selected room changes
watch(
  () => props.selectedRoomVnum,
  (newVnum) => {
    updateSelectedRoom(newVnum)
  },
)

// Watch for room changes
watch(
  () => props.rooms,
  () => {
    const cy = cyRef.value
    if (cy) {
      cy.destroy()
    }
    nextTick(() => {
      initCytoscape()
      if (props.selectedRoomVnum !== null) {
        updateSelectedRoom(props.selectedRoomVnum)
      }
    })
  },
  { deep: true },
)

// Lifecycle
onMounted(() => {
  initCytoscape()
  if (props.selectedRoomVnum !== null) {
    nextTick(() => {
      updateSelectedRoom(props.selectedRoomVnum)
    })
  }
})

onUnmounted(() => {
  const cy = cyRef.value
  if (cy) {
    cy.destroy()
  }
})
</script>

<template>
  <div
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
          @click="toggleFullscreen"
          :disabled="rooms.length === 0"
        >
          <X v-if="isFullscreen" class="h-5 w-5" />
          <Fullscreen v-else class="h-3.5 w-3.5 text-faint" />
        </Button>
        <Popover v-if="!isFullscreen">
          <PopoverTrigger asChild>
            <Button variant="ghost" size="icon" class="h-5 w-5" title="Sector Legend">
              <Info class="h-3.5 w-3.5 text-faint" />
            </Button>
          </PopoverTrigger>
          <PopoverContent class="w-48 p-2" align="end">
            <div class="text-xs font-medium mb-2 text-muted-foreground">Sector Types</div>
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

      <!-- Custom Tooltip -->
      <div
        v-if="tooltipVisible"
        class="absolute pointer-events-none z-50 px-2 py-1 bg-ink-high border border-border rounded text-sm shadow-lg"
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
        <Button variant="ghost" size="icon" class="h-7 w-7" @click="handleZoomOut">
          <ZoomOut class="h-4 w-4" />
        </Button>
        <span class="text-xs text-muted-foreground w-10 text-center">{{ zoom }}%</span>
        <Button variant="ghost" size="icon" class="h-7 w-7" @click="handleZoomIn">
          <ZoomIn class="h-4 w-4" />
        </Button>
        <div class="border-l border-border ml-1 pl-2 flex gap-1">
          <Button
            variant="ghost"
            size="icon"
            class="h-7 w-7"
            title="Fit to View"
            @click="handleFitToView"
          >
            <Maximize2 class="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            class="h-7 w-7"
            title="Auto-Layout"
            @click="handleAutoLayout"
          >
            <LayoutGrid class="h-4 w-4" />
          </Button>
        </div>
      </div>

      <!-- Fullscreen Legend (bottom-right) -->
      <div
        v-if="isFullscreen"
        class="absolute bottom-20 right-4 bg-card border border-border rounded-lg p-3 z-10"
      >
        <div class="text-xs font-medium mb-2 text-muted-foreground">Sector Types</div>
        <div class="space-y-1.5">
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
