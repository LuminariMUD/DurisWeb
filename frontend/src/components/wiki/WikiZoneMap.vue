<script setup lang="ts">
import { ref, watch, onMounted, onUnmounted, nextTick } from 'vue'
import cytoscape, { type Core, type NodeSingular, type ElementDefinition } from 'cytoscape'
import { Button } from '@/components/ui/button'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import {
  ZoomIn,
  ZoomOut,
  Maximize2,
  LayoutGrid,
  Info,
  Fullscreen,
  X,
} from 'lucide-vue-next'
import { parseAnsiToHtml } from '@/utils/ansiParser'

interface WikiMapRoom {
  vnum: number
  name: string
  sectorType: number
  exits?: Record<string, number>
}

const props = defineProps<{
  rooms: WikiMapRoom[]
  selectedRoomVnum: number | null
  zoneName?: string
}>()

const emit = defineEmits<{
  (e: 'select-room', vnum: number): void
}>()

// Constants
const GRID_SIZE = 50
const NODE_SIZE = 24

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

// Direction offsets for auto-layout
const DIRECTION_OFFSETS: Record<string, { x: number; y: number }> = {
  north: { x: 0, y: -GRID_SIZE },
  south: { x: 0, y: GRID_SIZE },
  east: { x: GRID_SIZE, y: 0 },
  west: { x: -GRID_SIZE, y: 0 },
  northeast: { x: GRID_SIZE, y: -GRID_SIZE },
  northwest: { x: -GRID_SIZE, y: -GRID_SIZE },
  southeast: { x: GRID_SIZE, y: GRID_SIZE },
  southwest: { x: -GRID_SIZE, y: GRID_SIZE },
  up: { x: GRID_SIZE, y: -GRID_SIZE },
  down: { x: GRID_SIZE, y: GRID_SIZE },
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

  // Add edges
  const addedEdges = new Set<string>()
  for (const room of props.rooms) {
    if (!room.exits) continue

    for (const [dir, toVnum] of Object.entries(room.exits)) {
      if (toVnum === undefined || toVnum === -1) continue

      // Check if destination exists in our zone
      const destRoom = props.rooms.find(r => r.vnum === toVnum)
      if (!destRoom) continue

      // Avoid duplicate edges (sort to ensure consistent key)
      const edgeKey = [room.vnum, toVnum].sort().join('-')
      if (addedEdges.has(edgeKey)) continue
      addedEdges.add(edgeKey)

      elements.push({
        group: 'edges',
        data: {
          id: `edge-${room.vnum}-${toVnum}`,
          source: String(room.vnum),
          target: String(toVnum),
          direction: dir,
        },
      })
    }
  }

  return elements
}

// Cytoscape stylesheet
const stylesheet: cytoscape.StylesheetStyle[] = [
  {
    selector: 'node',
    style: {
      'width': NODE_SIZE,
      'height': NODE_SIZE,
      'background-color': 'data(bgColor)',
      'border-width': 2,
      'border-color': 'data(borderColor)',
      'shape': 'round-rectangle',
      'label': '',
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
      'width': 2,
      'line-color': '#52525b', // zinc-600
      'target-arrow-color': '#52525b',
      'target-arrow-shape': 'triangle',
      'curve-style': 'bezier',
      'arrow-scale': 0.8,
    },
  },
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
      minZoom: 0.25,
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

// Run BFS-based auto-layout respecting exit directions
function runAutoLayout() {
  const cy = cyRef.value
  if (!cy) return

  const positions = new Map<number, { x: number; y: number }>()
  const visited = new Set<number>()
  const queue: Array<{ vnum: number; x: number; y: number }> = []

  // Find starting room
  let startRoom = props.rooms.find(r => r.exits && Object.keys(r.exits).length > 0)
  if (!startRoom) startRoom = props.rooms[0]
  if (!startRoom) return

  queue.push({ vnum: startRoom.vnum, x: 0, y: 0 })
  visited.add(startRoom.vnum)

  // Spiral offsets for collision resolution
  const spiralOffsets = [
    { x: 0, y: 0 },
    { x: 1, y: 0 }, { x: 0, y: 1 }, { x: -1, y: 0 }, { x: 0, y: -1 },
    { x: 1, y: 1 }, { x: -1, y: 1 }, { x: -1, y: -1 }, { x: 1, y: -1 },
    { x: 2, y: 0 }, { x: 0, y: 2 }, { x: -2, y: 0 }, { x: 0, y: -2 },
  ]

  // Check if position is occupied
  function isOccupied(x: number, y: number): boolean {
    const threshold = NODE_SIZE + 5
    for (const pos of positions.values()) {
      if (Math.abs(pos.x - x) < threshold && Math.abs(pos.y - y) < threshold) {
        return true
      }
    }
    return false
  }

  // Find available position
  function findAvailable(targetX: number, targetY: number): { x: number; y: number } {
    for (const offset of spiralOffsets) {
      const x = Math.round((targetX + offset.x * GRID_SIZE) / GRID_SIZE) * GRID_SIZE
      const y = Math.round((targetY + offset.y * GRID_SIZE) / GRID_SIZE) * GRID_SIZE
      if (!isOccupied(x, y)) {
        return { x, y }
      }
    }
    return { x: targetX, y: targetY }
  }

  // BFS layout
  while (queue.length > 0) {
    const current = queue.shift()!
    const pos = findAvailable(current.x, current.y)
    positions.set(current.vnum, pos)

    const room = props.rooms.find(r => r.vnum === current.vnum)
    if (!room?.exits) continue

    for (const [dir, toVnum] of Object.entries(room.exits)) {
      if (toVnum === undefined || toVnum === -1) continue
      if (visited.has(toVnum)) continue

      const destRoom = props.rooms.find(r => r.vnum === toVnum)
      if (!destRoom) continue

      visited.add(toVnum)

      const offset = DIRECTION_OFFSETS[dir] || { x: GRID_SIZE, y: 0 }
      queue.push({
        vnum: toVnum,
        x: pos.x + offset.x,
        y: pos.y + offset.y,
      })
    }
  }

  // Handle orphan rooms
  let orphanX = 0
  let orphanY = GRID_SIZE * 8
  for (const room of props.rooms) {
    if (!positions.has(room.vnum)) {
      const pos = findAvailable(orphanX, orphanY)
      positions.set(room.vnum, pos)
      orphanX += GRID_SIZE
      if (orphanX > GRID_SIZE * 10) {
        orphanX = 0
        orphanY += GRID_SIZE
      }
    }
  }

  // Apply positions to Cytoscape
  cy.batch(() => {
    for (const [vnum, pos] of positions) {
      const node = cy.getElementById(String(vnum))
      if (node.length) {
        node.position(pos)
      }
    }
  })

  // Fit view
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
    renderedPosition: { x: containerRef.value!.clientWidth / 2, y: containerRef.value!.clientHeight / 2 },
  })
}

function handleZoomOut() {
  const cy = cyRef.value
  if (!cy) return
  cy.zoom({
    level: cy.zoom() * 0.8,
    renderedPosition: { x: containerRef.value!.clientWidth / 2, y: containerRef.value!.clientHeight / 2 },
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
watch(() => props.selectedRoomVnum, (newVnum) => {
  updateSelectedRoom(newVnum)
})

// Watch for room changes
watch(() => props.rooms, () => {
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
}, { deep: true })

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
      'flex flex-col bg-zinc-950',
      isFullscreen ? 'fixed inset-0 z-50' : 'h-full'
    ]"
  >
    <!-- Map Header -->
    <div class="px-3 py-2 border-b border-zinc-800 flex items-center justify-between shrink-0">
      <div v-if="isFullscreen">
        <h2 class="text-lg font-semibold text-zinc-100" v-html="zoneName ? parseAnsiToHtml(zoneName) : 'Zone Map'" />
        <span class="text-xs text-zinc-500">{{ rooms.length }} rooms</span>
      </div>
      <span v-else class="text-sm text-zinc-400">Zone Map</span>
      <div class="flex items-center gap-2">
        <span v-if="!isFullscreen" class="text-xs text-zinc-500">{{ rooms.length }} rooms</span>
        <Button
          variant="ghost"
          size="icon"
          :class="isFullscreen ? 'h-8 w-8' : 'h-5 w-5'"
          :title="isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'"
          @click="toggleFullscreen"
          :disabled="rooms.length === 0"
        >
          <X v-if="isFullscreen" class="h-5 w-5" />
          <Fullscreen v-else class="h-3.5 w-3.5 text-zinc-500" />
        </Button>
        <Popover v-if="!isFullscreen">
          <PopoverTrigger asChild>
            <Button variant="ghost" size="icon" class="h-5 w-5" title="Sector Legend">
              <Info class="h-3.5 w-3.5 text-zinc-500" />
            </Button>
          </PopoverTrigger>
          <PopoverContent class="w-48 p-2" align="end">
            <div class="text-xs font-medium mb-2 text-zinc-400">Sector Types</div>
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
                <span class="text-xs text-zinc-300">{{ name }}</span>
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
        class="absolute pointer-events-none z-50 px-2 py-1 bg-zinc-800 border border-zinc-700 rounded text-sm shadow-lg"
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
      <div class="absolute bottom-4 left-4 flex items-center gap-2 bg-zinc-900 border border-zinc-800 rounded-lg p-2">
        <Button variant="ghost" size="icon" class="h-7 w-7" @click="handleZoomOut">
          <ZoomOut class="h-4 w-4" />
        </Button>
        <span class="text-xs text-zinc-400 w-10 text-center">{{ zoom }}%</span>
        <Button variant="ghost" size="icon" class="h-7 w-7" @click="handleZoomIn">
          <ZoomIn class="h-4 w-4" />
        </Button>
        <div class="border-l border-zinc-800 ml-1 pl-2 flex gap-1">
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
        class="absolute bottom-20 right-4 bg-zinc-900 border border-zinc-800 rounded-lg p-3 z-10"
      >
        <div class="text-xs font-medium mb-2 text-zinc-400">Sector Types</div>
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
            <span class="text-xs text-zinc-300">{{ name }}</span>
          </div>
        </div>
      </div>

      <!-- Empty State -->
      <div
        v-if="rooms.length === 0"
        class="absolute inset-0 flex items-center justify-center text-zinc-500"
      >
        <div class="text-center">
          <LayoutGrid class="h-12 w-12 mx-auto mb-2 opacity-50" />
          <p class="text-sm">No rooms in this zone</p>
        </div>
      </div>
    </div>
  </div>
</template>
