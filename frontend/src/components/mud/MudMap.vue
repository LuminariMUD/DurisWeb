<script setup lang="ts">
import { ref, watch, onMounted, onUnmounted, nextTick, computed } from 'vue'
import cytoscape, { type Core, type NodeSingular, type ElementDefinition } from 'cytoscape'
import { useMudStore } from '@/stores/mudStore'
import { useMudConnection } from '@/composables/useMudConnection'
import { useMapBroadcastSender } from '@/composables/useMapBroadcast'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Map as MapIcon,
  ZoomIn,
  ZoomOut,
  Crosshair,
  Loader2,
  Square,
  ExternalLink,
  Plus,
  Minus,
  PictureInPicture2,
  Layers,
} from 'lucide-vue-next'
import type { MudRoom, MudExit } from '@/types/mud'

import { parseAnsiToHtml } from '@/utils/ansiParser'

// Props for standalone mode (pop-out window)
const props = defineProps<{
  standalone?: boolean
  room?: MudRoom | null
  visitedRooms?: Map<number, MudRoom>
  wildernessMap?: string | null
  zoneNumber?: number | null
  onSpeedwalkRequest?: (targetVnum: number) => void
}>()

// Minimized state
const isMinimized = defineModel<boolean>('minimized', { default: false })

// API response type for zone map data
interface ZoneMapNode {
  id: number
  name: string
  sectorType: number
  x?: number
  y?: number
}

interface ZoneMapEdge {
  from: number
  to: number
  direction: string
}

interface ZoneMapData {
  nodes: ZoneMapNode[]
  edges: ZoneMapEdge[]
}

// Constants
const GRID_SIZE = 50
const NODE_SIZE = 24
const SPEEDWALK_DELAY = 1000 // ms between movement commands

// Check if zone is a wilderness zone (too large to render)
// Zone numbers derived from VNUM ranges in backend/src/scripts/extractMapData.ts
function isWildernessZone(zoneNumber: number): boolean {
  return (
    zoneNumber === 600 ||                          // The Adventurers Shipyards
    (zoneNumber >= 1200 && zoneNumber <= 1238) ||  // Alatorin
    (zoneNumber >= 5000 && zoneNumber <= 6599) ||  // Surface
    (zoneNumber >= 6600 && zoneNumber <= 6999) ||  // Newbie Maps
    (zoneNumber >= 7000 && zoneNumber <= 8599)     // Underdark
  )
}

// Pathfinding types
interface PathStep {
  vnum: number
  direction: string
  door?: string      // Door name if needs opening
  closed?: boolean   // Door closed state
  locked?: boolean   // Door locked state
}

// Store and connection (only used in non-standalone mode)
const store = useMudStore()
const { sendGameCommand } = useMudConnection()

// Computed data sources - use props in standalone mode, otherwise store
const currentRoom = computed(() => props.standalone ? props.room ?? null : store.room)
const currentVisitedRooms = computed(() => props.standalone ? props.visitedRooms ?? new Map() : store.visitedRooms)
const currentWildernessMap = computed(() => props.standalone ? props.wildernessMap ?? null : store.wildernessMap)
const currentZoneNum = computed(() => props.standalone ? props.zoneNumber ?? null : store.currentZoneNumber)

// Pop-out map broadcast (only in non-standalone mode)
const { sendSync, openPopOutWindow, setSpeedwalkHandler } = props.standalone
  ? { sendSync: () => {}, openPopOutWindow: () => {}, setSpeedwalkHandler: () => {} }
  : useMapBroadcastSender(
      () => store.room,
      () => store.visitedRooms,
      () => store.wildernessMap,
      () => store.currentZoneNumber
    )

// Container refs
const containerRef = ref<HTMLElement | null>(null)
const cyRef = ref<Core | null>(null)

// State
const zoom = ref(100)
const asciiMapZoom = ref(1.5) // Zoom level for ASCII wilderness map (1.0 = 12px, default 1.5 = 18px)
const isLoading = ref(false)
const zoneMapData = ref<ZoneMapData | null>(null)
const loadedZoneNumber = ref<number | null>(null)
const showAllFloors = ref(false) // Toggle to show all floors or just current

// Tooltip state
const tooltipVisible = ref(false)
const tooltipX = ref(0)
const tooltipY = ref(0)
const tooltipContent = ref('')
const tooltipVnum = ref(0)

// Speedwalk state (local path tracking, store for global visibility)
const speedwalkPath = ref<PathStep[]>([])
const speedwalkAbortController = ref<AbortController | null>(null)

// Computed: current room vnum
const currentRoomVnum = computed(() => currentRoom.value?.vnum ?? null)

// Computed: visited room vnums (as a Set for quick lookup)
const visitedVnums = computed(() => new Set(currentVisitedRooms.value.keys()))

// Computed: room count
const roomCount = computed(() => zoneMapData.value?.nodes.length ?? 0)

// Computed: check if we should show ASCII map instead of graph
// True for wilderness zones (by zone number) OR when we have Room.Map GMCP data (e.g., ships)
const isSkippedZone = computed(() => {
  // Show ASCII map if:
  // 1. We're in a wilderness zone (too large to render as graph)
  // 2. OR we have received Room.Map GMCP data (e.g., from ships sailing on ocean)
  return (currentZoneNum.value !== null && isWildernessZone(currentZoneNum.value)) ||
         !!currentWildernessMap.value
})

// Sector colors map (same as WikiZoneMap)
const SECTOR_COLORS: Record<number, { bg: string; border: string }> = {
  0: { bg: '#3f3f46', border: '#52525b' }, // SECT_INSIDE
  1: { bg: '#78350f', border: '#b45309' }, // SECT_CITY
  2: { bg: '#14532d', border: '#15803d' }, // SECT_FIELD
  3: { bg: '#166534', border: '#16a34a' }, // SECT_FOREST
  4: { bg: '#44403c', border: '#57534e' }, // SECT_HILLS
  5: { bg: '#52525b', border: '#71717a' }, // SECT_MOUNTAIN
  6: { bg: '#1e3a8a', border: '#1d4ed8' }, // SECT_WATER_SWIM
  7: { bg: '#1e40af', border: '#2563eb' }, // SECT_WATER_NOSWIM
  8: { bg: '#164e63', border: '#0e7490' }, // SECT_UNDERWATER
  9: { bg: '#0c4a6e', border: '#0284c7' }, // SECT_AIR
  10: { bg: '#713f12', border: '#a16207' }, // SECT_DESERT
  24: { bg: '#ca8a04', border: '#eab308' }, // SECT_DESERT
  25: { bg: '#e2e8f0', border: '#f8fafc' }, // SECT_ARCTIC
  26: { bg: '#7c3aed', border: '#a78bfa' }, // SECT_SWAMP
  37: { bg: '#525252', border: '#737373' }, // SECT_ROAD
}

const DEFAULT_SECTOR_COLOR = { bg: '#3f3f46', border: '#52525b' }

// Get sector color
function getSectorColor(sectorType?: number): { bg: string; border: string } {
  return SECTOR_COLORS[sectorType ?? 0] ?? DEFAULT_SECTOR_COLOR
}

// Compress path to direction string (e.g., [s,s,s,e,e] → "3s,2e")
function compressPath(path: PathStep[]): string {
  if (path.length === 0) return ''

  const compressed: string[] = []
  let currentDir = ''
  let count = 0

  // Direction abbreviations
  const abbrevMap: Record<string, string> = {
    north: 'n', south: 's', east: 'e', west: 'w',
    up: 'u', down: 'd',
    northeast: 'ne', northwest: 'nw', southeast: 'se', southwest: 'sw',
  }

  for (const step of path) {
    const abbrev = abbrevMap[step.direction] || step.direction
    if (abbrev === currentDir) {
      count++
    } else {
      if (count > 0) {
        compressed.push(count > 1 ? `${count}${currentDir}` : currentDir)
      }
      currentDir = abbrev
      count = 1
    }
  }

  // Add last group
  if (count > 0) {
    compressed.push(count > 1 ? `${count}${currentDir}` : currentDir)
  }

  return compressed.join(',')
}

// BFS pathfinding - uses visited rooms for door info, falls back to zone map edges
function findPath(fromVnum: number, toVnum: number): PathStep[] | null {
  // Build adjacency from multiple sources:
  // 1. Current room (freshest door data)
  // 2. Visited rooms (have door data)
  // 3. Zone map edges (no door data, but provides connectivity)
  const adjacency = new Map<number, PathStep[]>()

  // Add current room's exits (freshest data)
  const room = currentRoom.value
  if (room) {
    const exits: PathStep[] = []
    for (const [direction, exit] of Object.entries(room.exits)) {
      // Skip locked doors entirely
      if (exit.closed && exit.locked) continue
      exits.push({
        vnum: exit.vnum,
        direction,
        door: exit.door,
        closed: exit.closed,
        locked: exit.locked,
      })
    }
    adjacency.set(room.vnum, exits)
  }

  // Add visited rooms' exits (have door info)
  for (const [vnum, visitedRoom] of currentVisitedRooms.value) {
    if (adjacency.has(vnum)) continue
    const exits: PathStep[] = []
    for (const [direction, exit] of Object.entries(visitedRoom.exits) as [string, MudExit][]) {
      // Skip locked doors
      if (exit.closed && exit.locked) continue
      exits.push({
        vnum: exit.vnum,
        direction,
        door: exit.door,
        closed: exit.closed,
        locked: exit.locked,
      })
    }
    adjacency.set(vnum, exits)
  }

  // Add zone map edges for rooms we haven't visited (no door info)
  const data = zoneMapData.value
  if (data) {
    for (const edge of data.edges) {
      // Skip if we already have this room from visited data
      if (adjacency.has(edge.from)) continue

      // Build exits from zone map edges
      const roomEdges = data.edges.filter(e => e.from === edge.from)
      const exits: PathStep[] = roomEdges.map(e => ({
        vnum: e.to,
        direction: e.direction,
        // No door info for unvisited rooms - will check dynamically during walk
      }))
      adjacency.set(edge.from, exits)
    }
  }

  // BFS
  const visited = new Set<number>()
  const queue: Array<{ vnum: number; path: PathStep[] }> = [{ vnum: fromVnum, path: [] }]
  visited.add(fromVnum)

  while (queue.length > 0) {
    const current = queue.shift()!

    if (current.vnum === toVnum) {
      return current.path
    }

    const neighbors = adjacency.get(current.vnum) || []
    for (const neighbor of neighbors) {
      if (!visited.has(neighbor.vnum)) {
        visited.add(neighbor.vnum)
        queue.push({
          vnum: neighbor.vnum,
          path: [...current.path, neighbor],
        })
      }
    }
  }

  return null
}

// Get room name from zone map data
function getRoomName(vnum: number): string {
  const node = zoneMapData.value?.nodes.find(n => n.id === vnum)
  return node?.name || `Room #${vnum}`
}

// Stop speedwalk
function stopSpeedwalk(reason?: string) {
  if (speedwalkAbortController.value) {
    speedwalkAbortController.value.abort()
  }
  if (store.isSpeedwalking && reason) {
    store.addLogEntry('system', reason)
  }
  speedwalkPath.value = []
  speedwalkAbortController.value = null
  store.clearSpeedwalk()
}

// Execute speedwalk (only works in non-standalone mode)
async function executeSpeedwalk(targetVnum: number) {
  if (props.standalone) return // No speedwalk in pop-out window
  const room = currentRoom.value
  if (!room) return

  // Check if target is adjacent (direct exit from current room)
  let path: PathStep[] | null = null
  for (const [direction, exit] of Object.entries(room.exits)) {
    if (exit.vnum === targetVnum) {
      // Direct adjacent room - create single-step path
      path = [{
        vnum: exit.vnum,
        direction,
        door: exit.door,
        closed: exit.closed,
        locked: exit.locked,
      }]
      break
    }
  }

  // If not adjacent, try pathfinding through visited rooms
  if (!path) {
    path = findPath(room.vnum, targetVnum)
  }

  if (!path || path.length === 0) {
    store.addLogEntry('system', 'No path found to destination.')
    return
  }

  // Stop any existing speedwalk
  if (store.isSpeedwalking) {
    stopSpeedwalk()
    await new Promise(resolve => setTimeout(resolve, 50))
  }

  // Setup
  speedwalkPath.value = [...path]
  speedwalkAbortController.value = new AbortController()
  const controller = speedwalkAbortController.value
  const targetName = getRoomName(targetVnum)

  // Register with store (includes abort function for status bar stop button)
  store.startSpeedwalk(targetName, path.length, () => {
    if (speedwalkAbortController.value) {
      speedwalkAbortController.value.abort()
    }
  })

  // Display start message
  const compressed = compressPath(path)
  store.addLogEntry('system', '=== Speedwalk Started ===')
  store.addLogEntry('system', `Target    : ${targetName}`)
  store.addLogEntry('system', `Direction : ${compressed}`)

  // Walk
  for (let i = 0; i < path.length; i++) {
    if (controller.signal.aborted) break

    const step = path[i]
    if (!step) break

    const abbrevMap: Record<string, string> = {
      north: 'n', south: 's', east: 'e', west: 'w',
      up: 'u', down: 'd',
      northeast: 'ne', northwest: 'nw', southeast: 'se', southwest: 'sw',
    }
    const abbrev = abbrevMap[step.direction] || step.direction

    // Check current room's exit for fresh door state (not stale pathfinding data)
    const nowRoom = currentRoom.value
    const nowExit = nowRoom?.exits[step.direction]
    const hasDoor = nowExit?.door || step.door
    const doorName = nowExit?.door || step.door
    const isClosed = nowExit?.closed ?? step.closed
    const isLocked = nowExit?.locked ?? step.locked

    // Handle locked door - try to find alternative route
    if (hasDoor && isClosed && isLocked) {
      store.addLogEntry('system', `Door is locked (${doorName}), searching alternative route...`)

      // Update visited room data to mark this door as locked for future pathfinding
      if (nowRoom) {
        const visitedRoom = currentVisitedRooms.value.get(nowRoom.vnum)
        const visitedExit = visitedRoom?.exits[step.direction]
        if (visitedExit) {
          visitedExit.locked = true
          visitedExit.closed = true
        }
      }

      // Try to find alternative path from current room to target
      const targetVnum = path[path.length - 1]?.vnum
      if (targetVnum && nowRoom) {
        const newPath = findPath(nowRoom.vnum, targetVnum)
        if (newPath && newPath.length > 0) {
          store.addLogEntry('system', `Found alternative route: ${compressPath(newPath)}`)
          // Replace remaining path with new path and continue
          path = newPath
          speedwalkPath.value = [...newPath]
          i = -1  // Reset loop to start from beginning of new path
          continue
        }
      }

      store.addLogEntry('system', 'No alternative route found, stopping.')
      break
    }

    // Open door if closed - use direction to open the correct door
    if (hasDoor && isClosed && !isLocked) {
      store.addLogEntry('system', `Door is closed, opening ${step.direction}...`)
      sendGameCommand(`open ${step.direction}`)
      // Wait for door to open
      await new Promise(resolve => setTimeout(resolve, SPEEDWALK_DELAY * 2))
      if (controller.signal.aborted) break
    }

    store.addLogEntry('system', `Now Walking: ${abbrev}`)

    // Move
    sendGameCommand(step.direction)

    // Update remaining path
    speedwalkPath.value = path.slice(i + 1)
    store.updateSpeedwalkSteps(speedwalkPath.value.length)

    // Wait before next step
    if (i < path.length - 1 && !controller.signal.aborted) {
      await new Promise(resolve => setTimeout(resolve, SPEEDWALK_DELAY))
    }
  }

  // Complete
  if (!controller.signal.aborted) {
    store.addLogEntry('system', '=== Speedwalk Complete ===')
  }

  speedwalkPath.value = []
  speedwalkAbortController.value = null
  store.clearSpeedwalk()
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

// Fetch zone map data from API
async function fetchZoneMap(zoneNumber: number) {
  // Skip wilderness zones (too large to render)
  if (isWildernessZone(zoneNumber)) {
    zoneMapData.value = null
    loadedZoneNumber.value = null
    return
  }

  if (loadedZoneNumber.value === zoneNumber && zoneMapData.value) {
    return // Already loaded
  }

  isLoading.value = true
  try {
    const response = await fetch(`/api/wiki/zones/${zoneNumber}/map-data`)
    if (!response.ok) {
      throw new Error(`Failed to fetch zone map: ${response.status}`)
    }
    const data: ZoneMapData = await response.json()
    zoneMapData.value = data
    loadedZoneNumber.value = zoneNumber

    // Reinitialize Cytoscape with new data
    nextTick(() => {
      initCytoscape()
    })
  } catch (error) {
    console.error('Failed to fetch zone map:', error)
    zoneMapData.value = null
  } finally {
    isLoading.value = false
  }
}

// Build Cytoscape elements from zone data
function buildElements(): ElementDefinition[] {
  const elements: ElementDefinition[] = []
  const data = zoneMapData.value
  if (!data) return elements

  // Determine which nodes to show
  let nodesToShow: Set<number>

  if (showAllFloors.value) {
    // Show all nodes
    nodesToShow = new Set(data.nodes.map(n => n.id))
  } else {
    // BFS from current room, only following non-up/down edges to find current floor
    nodesToShow = new Set<number>()
    const startVnum = currentRoomVnum.value
    if (startVnum !== null) {
      const queue = [startVnum]
      nodesToShow.add(startVnum)

      // Build adjacency map (excluding up/down)
      const adjacency = new Map<number, number[]>()
      for (const edge of data.edges) {
        if (edge.direction === 'up' || edge.direction === 'down') continue
        if (!adjacency.has(edge.from)) adjacency.set(edge.from, [])
        if (!adjacency.has(edge.to)) adjacency.set(edge.to, [])
        adjacency.get(edge.from)!.push(edge.to)
        adjacency.get(edge.to)!.push(edge.from)
      }

      while (queue.length > 0) {
        const current = queue.shift()!
        const neighbors = adjacency.get(current) || []
        for (const neighbor of neighbors) {
          if (!nodesToShow.has(neighbor)) {
            nodesToShow.add(neighbor)
            queue.push(neighbor)
          }
        }
      }
    }
  }

  // Add nodes (only those on current floor)
  for (const node of data.nodes) {
    if (!nodesToShow.has(node.id)) continue

    const colors = getSectorColor(node.sectorType)
    const isVisited = visitedVnums.value.has(node.id)
    const isCurrent = node.id === currentRoomVnum.value

    elements.push({
      group: 'nodes',
      data: {
        id: String(node.id),
        vnum: node.id,
        name: node.name,
        sectorType: node.sectorType,
        bgColor: isVisited ? colors.bg : 'transparent',
        borderColor: isCurrent ? '#fbbf24' : colors.border,
        borderWidth: isCurrent ? 3 : (isVisited ? 2 : 1),
        isVisited,
        isCurrent,
      },
    })
  }

  // Add edges (only between visible nodes, skip up/down unless showing all)
  const addedEdges = new Set<string>()
  for (const edge of data.edges) {
    // Skip up/down exits unless showing all floors
    if (!showAllFloors.value && (edge.direction === 'up' || edge.direction === 'down')) continue

    // Check if both source and destination are visible
    if (!nodesToShow.has(edge.from) || !nodesToShow.has(edge.to)) continue

    // Check if destination exists in our zone
    const destExists = data.nodes.some(n => n.id === edge.to)
    if (!destExists) continue

    // Avoid duplicate edges
    const edgeKey = [edge.from, edge.to].sort().join('-')
    if (addedEdges.has(edgeKey)) continue
    addedEdges.add(edgeKey)

    // Check for door info from visited rooms or current room
    let hasDoor = false
    let doorClosed = false
    let doorLocked = false

    // Check source room's exit
    const sourceRoom = currentRoom.value?.vnum === edge.from ? currentRoom.value : currentVisitedRooms.value.get(edge.from)
    if (sourceRoom) {
      const exit = sourceRoom.exits[edge.direction]
      if (exit?.door) {
        hasDoor = true
        doorClosed = exit.closed ?? false
        doorLocked = exit.locked ?? false
      }
    }

    elements.push({
      group: 'edges',
      data: {
        id: `edge-${edge.from}-${edge.to}`,
        source: String(edge.from),
        target: String(edge.to),
        direction: edge.direction,
        hasDoor,
        doorClosed,
        doorLocked,
      },
    })
  }

  return elements
}

// Cytoscape stylesheet
function getStylesheet(): cytoscape.StylesheetStyle[] {
  return [
    {
      selector: 'node',
      style: {
        'width': NODE_SIZE,
        'height': NODE_SIZE,
        'background-color': 'data(bgColor)',
        'border-width': 'data(borderWidth)',
        'border-color': 'data(borderColor)',
        'shape': 'ellipse',
        'label': '',
      },
    },
    {
      selector: 'node[?isCurrent]',
      style: {
        'border-color': '#fbbf24', // yellow-400
        'border-width': 3,
      },
    },
    {
      selector: 'edge',
      style: {
        'width': 2,
        'line-color': '#52525b',
        'curve-style': 'bezier',
      },
    },
    // Door marker - open door (green tee)
    {
      selector: 'edge[?hasDoor][!doorClosed]',
      style: {
        'mid-target-arrow-shape': 'tee',
        'mid-target-arrow-color': '#22c55e', // green-500
        'arrow-scale': 1.2,
      },
    },
    // Door marker - closed door (orange tee)
    {
      selector: 'edge[?hasDoor][?doorClosed][!doorLocked]',
      style: {
        'mid-target-arrow-shape': 'tee',
        'mid-target-arrow-color': '#f97316', // orange-500
        'arrow-scale': 1.2,
      },
    },
    // Door marker - locked door (red tee)
    {
      selector: 'edge[?hasDoor][?doorClosed][?doorLocked]',
      style: {
        'mid-target-arrow-shape': 'tee',
        'mid-target-arrow-color': '#ef4444', // red-500
        'arrow-scale': 1.2,
      },
    },
  ]
}

// Initialize Cytoscape
function initCytoscape() {
  if (!containerRef.value) return
  if (!zoneMapData.value || zoneMapData.value.nodes.length === 0) return

  // Destroy existing instance
  if (cyRef.value) {
    cyRef.value.destroy()
  }

  const container = containerRef.value
  if (container.clientWidth === 0 || container.clientHeight === 0) {
    setTimeout(() => initCytoscape(), 100)
    return
  }

  const elements = buildElements()

  try {
    cyRef.value = cytoscape({
      container,
      elements,
      style: getStylesheet(),
      layout: { name: 'preset' },
      minZoom: 0.25,
      maxZoom: 2,
    })
  } catch (error) {
    console.error('Failed to initialize Cytoscape:', error)
    return
  }

  const cy = cyRef.value

  // Event: node click - speedwalk to that room
  cy.on('tap', 'node', (e) => {
    const node = e.target as NodeSingular
    const targetVnum = node.data('vnum') as number

    const room = currentRoom.value
    if (!room || targetVnum === room.vnum) return

    if (props.standalone && props.onSpeedwalkRequest) {
      // In standalone mode, send request to main window
      props.onSpeedwalkRequest(targetVnum)
    } else if (!props.standalone) {
      // In normal mode, execute speedwalk directly
      executeSpeedwalk(targetVnum)
    }
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

// Run layout - use pre-set coordinates if available, otherwise BFS auto-layout
function runAutoLayout() {
  const cy = cyRef.value
  const data = zoneMapData.value
  if (!cy || !data) return

  const positions: Record<number, { x: number; y: number }> = {}

  // Check how many nodes have pre-set coordinates
  const nodesWithCoords = data.nodes.filter(n => n.x !== undefined && n.y !== undefined)

  // If most nodes have coordinates, use them directly
  if (nodesWithCoords.length >= data.nodes.length * 0.5) {
    // Use pre-set coordinates (scale them for display)
    const SCALE = GRID_SIZE / 2

    for (const node of data.nodes) {
      if (node.x !== undefined && node.y !== undefined) {
        positions[node.id] = { x: node.x * SCALE, y: node.y * SCALE }
      }
    }

    // Handle nodes without coordinates (place them in a grid below)
    let orphanX = 0
    let orphanY = GRID_SIZE * 8
    for (const node of data.nodes) {
      if (!(node.id in positions)) {
        positions[node.id] = { x: orphanX, y: orphanY }
        orphanX += GRID_SIZE
        if (orphanX > GRID_SIZE * 10) {
          orphanX = 0
          orphanY += GRID_SIZE
        }
      }
    }

    // Apply positions to Cytoscape
    cy.batch(() => {
      for (const [vnumStr, pos] of Object.entries(positions)) {
        const node = cy.getElementById(vnumStr)
        if (node.length) {
          node.position(pos)
        }
      }
    })

    // Fit view and center
    cy.fit(undefined, 50)
    zoom.value = Math.round(cy.zoom() * 100)

    nextTick(() => {
      centerOnCurrentRoom()
    })
    return
  }

  // Fall back to BFS auto-layout with improved collision detection
  const visited: Record<number, boolean> = {}
  const queue: Array<{ vnum: number; x: number; y: number; depth: number }> = []

  // Use a grid-based occupancy map for O(1) collision detection
  const occupiedGrid = new Set<string>()
  const gridKey = (x: number, y: number) => `${Math.round(x / GRID_SIZE)},${Math.round(y / GRID_SIZE)}`

  // Start from current room if available, otherwise first room with exits
  let startVnum: number | null = currentRoomVnum.value
  if (!startVnum || !data.nodes.some(n => n.id === startVnum)) {
    const roomWithExits = data.nodes.find(n =>
      data.edges.some(e => e.from === n.id)
    )
    startVnum = roomWithExits?.id ?? data.nodes[0]?.id ?? null
  }
  if (!startVnum) return

  queue.push({ vnum: startVnum, x: 0, y: 0, depth: 0 })
  visited[startVnum] = true

  // Generate spiral offsets up to distance 10 (for dense zones)
  const spiralOffsets: Array<{ x: number; y: number }> = []
  for (let dist = 0; dist <= 10; dist++) {
    for (let dx = -dist; dx <= dist; dx++) {
      for (let dy = -dist; dy <= dist; dy++) {
        if (Math.abs(dx) === dist || Math.abs(dy) === dist) {
          spiralOffsets.push({ x: dx, y: dy })
        }
      }
    }
  }
  // Sort by distance from origin for true spiral search
  spiralOffsets.sort((a, b) => (a.x * a.x + a.y * a.y) - (b.x * b.x + b.y * b.y))

  // Check if grid position is occupied
  function isOccupied(x: number, y: number): boolean {
    return occupiedGrid.has(gridKey(x, y))
  }

  // Find available position using spiral search
  function findAvailable(targetX: number, targetY: number): { x: number; y: number } {
    // Snap to grid first
    const baseX = Math.round(targetX / GRID_SIZE) * GRID_SIZE
    const baseY = Math.round(targetY / GRID_SIZE) * GRID_SIZE

    for (const offset of spiralOffsets) {
      const x = baseX + offset.x * GRID_SIZE
      const y = baseY + offset.y * GRID_SIZE
      if (!isOccupied(x, y)) {
        return { x, y }
      }
    }
    // Fallback: find any empty position (should rarely happen)
    let fallbackX = 0
    let fallbackY = 0
    while (isOccupied(fallbackX, fallbackY)) {
      fallbackX += GRID_SIZE
      if (fallbackX > GRID_SIZE * 50) {
        fallbackX = 0
        fallbackY += GRID_SIZE
      }
    }
    return { x: fallbackX, y: fallbackY }
  }

  // BFS layout - process rooms in order of distance from start
  while (queue.length > 0) {
    const current = queue.shift()!
    const pos = findAvailable(current.x, current.y)
    positions[current.vnum] = pos
    occupiedGrid.add(gridKey(pos.x, pos.y))

    // Find edges from this room
    const edges = data.edges.filter(e => e.from === current.vnum)
    for (const edge of edges) {
      if (visited[edge.to]) continue
      if (!data.nodes.some(n => n.id === edge.to)) continue

      visited[edge.to] = true

      const offset = DIRECTION_OFFSETS[edge.direction] || { x: GRID_SIZE, y: 0 }
      queue.push({
        vnum: edge.to,
        x: pos.x + offset.x,
        y: pos.y + offset.y,
        depth: current.depth + 1,
      })
    }
  }

  // Handle orphan rooms (disconnected from main graph)
  let orphanIndex = 0
  for (const node of data.nodes) {
    if (!(node.id in positions)) {
      // Place orphans in a separate grid below the main map
      const orphanY = GRID_SIZE * 15 + Math.floor(orphanIndex / 10) * GRID_SIZE
      const orphanX = (orphanIndex % 10) * GRID_SIZE
      const pos = findAvailable(orphanX, orphanY)
      positions[node.id] = pos
      occupiedGrid.add(gridKey(pos.x, pos.y))
      orphanIndex++
    }
  }

  // Apply positions to Cytoscape
  cy.batch(() => {
    for (const [vnumStr, pos] of Object.entries(positions)) {
      const node = cy.getElementById(vnumStr)
      if (node.length) {
        node.position(pos)
      }
    }
  })

  // Fit view
  cy.fit(undefined, 50)
  zoom.value = Math.round(cy.zoom() * 100)

  // Center on current room after layout
  nextTick(() => {
    centerOnCurrentRoom()
  })
}

// Update node and edge styles when visited rooms change
function updateNodeStyles() {
  const cy = cyRef.value
  if (!cy) return

  cy.batch(() => {
    // Update nodes
    cy.nodes().forEach((node) => {
      const vnum = node.data('vnum') as number
      const sectorType = node.data('sectorType') as number
      const colors = getSectorColor(sectorType)
      const isVisited = visitedVnums.value.has(vnum)
      const isCurrent = vnum === currentRoomVnum.value

      node.data('bgColor', isVisited ? colors.bg : 'transparent')
      node.data('borderColor', isCurrent ? '#fbbf24' : colors.border)
      node.data('borderWidth', isCurrent ? 3 : (isVisited ? 2 : 1))
      node.data('isVisited', isVisited)
      node.data('isCurrent', isCurrent)
    })

    // Update edges (door states)
    cy.edges().forEach((edge) => {
      const sourceVnum = parseInt(edge.data('source'))
      const direction = edge.data('direction') as string

      // Check source room's exit for door info
      const sourceRoom = currentRoom.value?.vnum === sourceVnum ? currentRoom.value : currentVisitedRooms.value.get(sourceVnum)
      if (sourceRoom) {
        const exit = sourceRoom.exits[direction]
        if (exit?.door) {
          edge.data('hasDoor', true)
          edge.data('doorClosed', exit.closed ?? false)
          edge.data('doorLocked', exit.locked ?? false)
        }
      }
    })
  })
}

// Center on current room
function centerOnCurrentRoom() {
  const cy = cyRef.value
  if (!cy || !currentRoomVnum.value) return

  const node = cy.getElementById(String(currentRoomVnum.value))
  if (node.length) {
    cy.animate({
      center: { eles: node },
      zoom: 1,
      duration: 300,
    })
  }
}

// Control handlers
function handleZoomIn() {
  const cy = cyRef.value
  if (!cy || !containerRef.value) return
  cy.zoom({
    level: cy.zoom() * 1.25,
    renderedPosition: { x: containerRef.value.clientWidth / 2, y: containerRef.value.clientHeight / 2 },
  })
}

function handleZoomOut() {
  const cy = cyRef.value
  if (!cy || !containerRef.value) return
  cy.zoom({
    level: cy.zoom() * 0.8,
    renderedPosition: { x: containerRef.value.clientWidth / 2, y: containerRef.value.clientHeight / 2 },
  })
}

// ASCII map zoom handlers
function handleAsciiZoomIn() {
  asciiMapZoom.value = Math.min(3, asciiMapZoom.value + 0.25)
}

function handleAsciiZoomOut() {
  asciiMapZoom.value = Math.max(0.5, asciiMapZoom.value - 0.25)
}

function handleAsciiZoomReset() {
  asciiMapZoom.value = 1.5
}

// Toggle show all floors
function toggleShowAllFloors() {
  showAllFloors.value = !showAllFloors.value
  // Rebuild map with new setting
  if (cyRef.value && zoneMapData.value) {
    const elements = buildElements()
    cyRef.value.elements().remove()
    cyRef.value.add(elements)
    nextTick(() => {
      runAutoLayout()
    })
  }
}

// Computed font size for ASCII map
const asciiMapFontSize = computed(() => `${12 * asciiMapZoom.value}px`)

// Watch for zone changes
watch(currentZoneNum, (newZone) => {
  if (newZone !== null) {
    fetchZoneMap(newZone)
  }
}, { immediate: true })

// Watch for visited rooms changes to update styles
watch(visitedVnums, () => {
  updateNodeStyles()
}, { deep: true })

// Watch for current room changes to update highlight and center
watch(currentRoomVnum, () => {
  updateNodeStyles()
  // Auto-center on current room when moving
  centerOnCurrentRoom()
})

// Watch for combat - cancel speedwalk when fighting starts (only in non-standalone mode)
watch(() => store.isFighting, (fighting) => {
  if (!props.standalone && fighting && store.isSpeedwalking) {
    stopSpeedwalk('Combat started, speedwalk cancelled.')
  }
})

// Broadcast sync to pop-out windows when map data changes (only in non-standalone mode)
if (!props.standalone) {
  watch(() => store.room, () => sendSync())
  watch(() => store.visitedRooms, () => sendSync(), { deep: true })
  watch(() => store.wildernessMap, () => sendSync())
  watch(() => store.currentZoneNumber, () => sendSync())
}

// Lifecycle
onMounted(() => {
  if (currentZoneNum.value !== null) {
    fetchZoneMap(currentZoneNum.value)
  }

  // Register speedwalk handler for pop-out requests (only in non-standalone mode)
  if (!props.standalone) {
    setSpeedwalkHandler((targetVnum: number) => {
      executeSpeedwalk(targetVnum)
    })
  }
})

onUnmounted(() => {
  if (cyRef.value) {
    cyRef.value.destroy()
  }
  // Stop any ongoing speedwalk
  stopSpeedwalk()
})

// Emit events
const emit = defineEmits<{
  (e: 'detach'): void
}>()
</script>

<template>
  <!-- Standalone mode: simple wrapper without Card -->
  <div v-if="standalone" class="relative w-full h-full bg-black">
    <!-- Loading state -->
    <div
      v-if="isLoading"
      class="absolute inset-0 flex items-center justify-center bg-zinc-900/80 z-10"
    >
      <Loader2 class="h-8 w-8 animate-spin text-zinc-400" />
    </div>

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

    <!-- Map controls overlay -->
    <div class="absolute bottom-2 right-2 z-20 flex flex-col gap-1">
      <Button
        variant="secondary"
        size="icon"
        class="h-7 w-7"
        @click="handleZoomIn"
      >
        <ZoomIn class="h-4 w-4" />
      </Button>
      <Button
        variant="secondary"
        size="icon"
        class="h-7 w-7"
        @click="handleZoomOut"
      >
        <ZoomOut class="h-4 w-4" />
      </Button>
      <Button
        variant="secondary"
        size="icon"
        class="h-7 w-7"
        @click="centerOnCurrentRoom"
      >
        <Crosshair class="h-4 w-4" />
      </Button>
      <Button
        :variant="showAllFloors ? 'default' : 'secondary'"
        size="icon"
        class="h-7 w-7"
        :title="showAllFloors ? 'Showing all floors' : 'Show all floors'"
        @click="toggleShowAllFloors"
      >
        <Layers class="h-4 w-4" />
      </Button>
    </div>

    <!-- Legend -->
    <div class="absolute top-2 left-2 z-20 text-[10px] text-muted-foreground bg-background/80 rounded px-2 py-1 space-y-0.5">
      <div class="flex items-center gap-1">
        <div class="w-3 h-3 rounded-full bg-zinc-600 border-2 border-yellow-400" />
        <span>Current</span>
      </div>
      <div class="flex items-center gap-1">
        <div class="w-3 h-3 rounded-full bg-zinc-600 border border-zinc-500" />
        <span>Visited</span>
      </div>
      <div class="flex items-center gap-1">
        <div class="w-3 h-3 rounded-full bg-transparent border border-zinc-600" />
        <span>Unexplored</span>
      </div>
    </div>

    <!-- Wilderness Zone ASCII Map -->
    <div
      v-if="!isLoading && isSkippedZone"
      class="absolute inset-0 flex flex-col items-center justify-center bg-black z-10 overflow-auto"
    >
      <pre
        v-if="currentWildernessMap"
        class="font-mono leading-tight whitespace-pre"
        :style="{ fontSize: asciiMapFontSize }"
        v-html="parseAnsiToHtml(currentWildernessMap)"
      />
      <div v-else class="text-center text-zinc-500">
        <MapIcon class="h-12 w-12 mx-auto mb-2 opacity-50" />
        <p class="text-sm">Waiting for map data...</p>
      </div>
    </div>

    <!-- Empty State -->
    <div
      v-if="!isLoading && !isSkippedZone && (!zoneMapData || zoneMapData.nodes.length === 0)"
      class="absolute inset-0 flex items-center justify-center text-zinc-500"
    >
      <div class="text-center">
        <MapIcon class="h-12 w-12 mx-auto mb-2 opacity-50" />
        <p class="text-sm">Enter a zone to see the map</p>
      </div>
    </div>
  </div>

  <!-- Normal mode: Card wrapper -->
  <Card v-else class="flex flex-col" :class="isMinimized ? 'h-auto' : 'h-full'">
    <CardHeader class="py-2 px-3 shrink-0 flex flex-row items-center justify-between">
      <CardTitle class="text-sm flex items-center gap-2">
        <MapIcon class="h-4 w-4" />
        Map
      </CardTitle>
      <div class="flex items-center gap-1">
        <!-- Speedwalk indicator -->
        <Badge
          v-if="store.isSpeedwalking"
          variant="default"
          class="text-xs animate-pulse cursor-pointer"
          title="Click to stop"
          @click="stopSpeedwalk('Speedwalk stopped.')"
        >
          <Square class="h-3 w-3 mr-1" />
          {{ store.speedwalkStepsRemaining }} steps
        </Badge>
        <Badge v-else variant="secondary" class="text-xs">
          {{ roomCount }} rooms
        </Badge>
        <!-- Pop-out button -->
        <Button
          v-if="!isMinimized"
          variant="ghost"
          size="icon"
          class="h-6 w-6"
          title="Open map in new window"
          @click="openPopOutWindow"
        >
          <PictureInPicture2 class="h-3 w-3" />
        </Button>
        <!-- Detach button -->
        <Button
          v-if="!isMinimized"
          variant="ghost"
          size="icon"
          class="h-6 w-6"
          title="Detach map"
          @click="emit('detach')"
        >
          <ExternalLink class="h-3 w-3" />
        </Button>
        <!-- Minimize button -->
        <Button
          variant="ghost"
          size="icon"
          class="h-5 w-5 text-muted-foreground hover:text-foreground"
          :title="isMinimized ? 'Expand map' : 'Minimize map'"
          @click="isMinimized = !isMinimized"
        >
          <Plus v-if="isMinimized" class="h-3 w-3" />
          <Minus v-else class="h-3 w-3" />
        </Button>
      </div>
    </CardHeader>

    <CardContent v-if="!isMinimized" class="flex-1 p-0 relative overflow-hidden">
      <!-- Loading state -->
      <div
        v-if="isLoading"
        class="absolute inset-0 flex items-center justify-center bg-zinc-900/80 z-10"
      >
        <Loader2 class="h-8 w-8 animate-spin text-zinc-400" />
      </div>

      <!-- Cytoscape Container -->
      <div
        ref="containerRef"
        class="absolute inset-0 w-full h-full bg-black"
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

      <!-- Map controls overlay -->
      <div class="absolute bottom-2 right-2 flex flex-col gap-1">
        <Button
          variant="secondary"
          size="icon"
          class="h-7 w-7"
          @click="handleZoomIn"
        >
          <ZoomIn class="h-4 w-4" />
        </Button>
        <Button
          variant="secondary"
          size="icon"
          class="h-7 w-7"
          @click="handleZoomOut"
        >
          <ZoomOut class="h-4 w-4" />
        </Button>
        <Button
          variant="secondary"
          size="icon"
          class="h-7 w-7"
          @click="centerOnCurrentRoom"
        >
          <Crosshair class="h-4 w-4" />
        </Button>
        <Button
          :variant="showAllFloors ? 'default' : 'secondary'"
          size="icon"
          class="h-7 w-7"
          :title="showAllFloors ? 'Showing all floors' : 'Show all floors'"
          @click="toggleShowAllFloors"
        >
          <Layers class="h-4 w-4" />
        </Button>
      </div>

      <!-- Legend -->
      <div class="absolute top-2 left-2 text-[10px] text-muted-foreground bg-background/80 rounded px-2 py-1 space-y-0.5">
        <div class="flex items-center gap-1">
          <div class="w-3 h-3 rounded-full bg-zinc-600 border-2 border-yellow-400" />
          <span>Current</span>
        </div>
        <div class="flex items-center gap-1">
          <div class="w-3 h-3 rounded-full bg-zinc-600 border border-zinc-500" />
          <span>Visited</span>
        </div>
        <div class="flex items-center gap-1">
          <div class="w-3 h-3 rounded-full bg-transparent border border-zinc-600" />
          <span>Unexplored</span>
        </div>
        <div class="flex items-center gap-1 mt-1 pt-1 border-t border-zinc-700">
          <div class="w-3 h-0.5 bg-green-500" />
          <span>Open door</span>
        </div>
        <div class="flex items-center gap-1">
          <div class="w-3 h-0.5 bg-orange-500" />
          <span>Closed door</span>
        </div>
        <div class="flex items-center gap-1">
          <div class="w-3 h-0.5 bg-red-500" />
          <span>Locked door</span>
        </div>
      </div>

      <!-- Wilderness Zone ASCII Map -->
      <div
        v-if="!isLoading && isSkippedZone"
        class="absolute inset-0 flex flex-col items-center justify-center bg-black z-10 overflow-auto"
      >
        <pre
          v-if="currentWildernessMap"
          class="font-mono leading-tight whitespace-pre"
          :style="{ fontSize: asciiMapFontSize }"
          v-html="parseAnsiToHtml(currentWildernessMap)"
        />
        <div v-else class="text-center text-zinc-500">
          <MapIcon class="h-12 w-12 mx-auto mb-2 opacity-50" />
          <p class="text-sm">Waiting for map data...</p>
        </div>

        <!-- ASCII Map zoom controls -->
        <div class="absolute bottom-2 right-2 flex flex-col gap-1">
          <Button
            variant="secondary"
            size="icon"
            class="h-7 w-7"
            @click="handleAsciiZoomIn"
          >
            <ZoomIn class="h-4 w-4" />
          </Button>
          <Button
            variant="secondary"
            size="icon"
            class="h-7 w-7"
            @click="handleAsciiZoomOut"
          >
            <ZoomOut class="h-4 w-4" />
          </Button>
          <Button
            variant="secondary"
            size="icon"
            class="h-7 w-7"
            @click="handleAsciiZoomReset"
            title="Reset zoom"
          >
            <Crosshair class="h-4 w-4" />
          </Button>
        </div>
      </div>

      <!-- Empty State -->
      <div
        v-if="!isLoading && !isSkippedZone && (!zoneMapData || zoneMapData.nodes.length === 0)"
        class="absolute inset-0 flex items-center justify-center text-zinc-500"
      >
        <div class="text-center">
          <MapIcon class="h-12 w-12 mx-auto mb-2 opacity-50" />
          <p class="text-sm">Enter a zone to see the map</p>
        </div>
      </div>
    </CardContent>
  </Card>
</template>
