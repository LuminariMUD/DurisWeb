import { ref, computed, watch, type Ref } from 'vue'
import type { RoomIndex } from '@/types'

// Extended direction type for all 10 MUD directions
export type MapDirection =
  | 'north'
  | 'east'
  | 'south'
  | 'west'
  | 'up'
  | 'down'
  | 'northeast'
  | 'northwest'
  | 'southeast'
  | 'southwest'

export interface RoomPosition {
  x: number
  y: number
}

export interface MapState {
  positions: Map<number, RoomPosition>
  zoom: number
  panX: number
  panY: number
}

// Node size constants (24x24px nodes)
const NODE_SIZE = 24
const NODE_HALF = NODE_SIZE / 2
const GRID_SIZE = 50 // Grid cell size (must match SVG grid pattern)

// Direction offsets for auto-layout (snap to grid intersections)
const DIRECTION_OFFSETS: Record<MapDirection, { x: number; y: number }> = {
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

// Snap position to grid intersection (stores CENTER coordinates)
function snapToGrid(x: number, y: number): { x: number; y: number } {
  return {
    x: Math.round(x / GRID_SIZE) * GRID_SIZE,
    y: Math.round(y / GRID_SIZE) * GRID_SIZE,
  }
}

// Spiral offsets for collision resolution
const SPIRAL_OFFSETS = [
  { x: 0, y: 0 },
  { x: 1, y: 0 },
  { x: 0, y: 1 },
  { x: -1, y: 0 },
  { x: 0, y: -1 },
  { x: 1, y: 1 },
  { x: -1, y: 1 },
  { x: -1, y: -1 },
  { x: 1, y: -1 },
  { x: 2, y: 0 },
  { x: 0, y: 2 },
  { x: -2, y: 0 },
  { x: 0, y: -2 },
  { x: 2, y: 1 },
  { x: 1, y: 2 },
  { x: -1, y: 2 },
  { x: -2, y: 1 },
  { x: -2, y: -1 },
  { x: -1, y: -2 },
  { x: 1, y: -2 },
  { x: 2, y: -1 },
]

export function useZoneMap(
  rooms: Ref<RoomIndex[]>,
  initialPositions?: Ref<Record<number, RoomPosition> | undefined>,
) {
  // Map state
  const positions = ref<Map<number, RoomPosition>>(new Map())
  const zoom = ref(100)
  const panX = ref(0)
  const panY = ref(0)
  const isDirty = ref(false)

  // Build adjacency from exits
  const adjacency = computed(() => {
    const adj = new Map<number, Map<MapDirection, number>>()
    for (const room of rooms.value) {
      const exits = new Map<MapDirection, number>()
      if (room.exits) {
        for (const [dir, toVnum] of Object.entries(room.exits)) {
          if (toVnum !== undefined && toVnum !== -1) {
            exits.set(dir as MapDirection, toVnum)
          }
        }
      }
      adj.set(room.vnum, exits)
    }
    return adj
  })

  // Get reverse direction
  function _getReverseDirection(dir: MapDirection): MapDirection {
    const reverse: Record<MapDirection, MapDirection> = {
      north: 'south',
      south: 'north',
      east: 'west',
      west: 'east',
      up: 'down',
      down: 'up',
      northeast: 'southwest',
      southwest: 'northeast',
      northwest: 'southeast',
      southeast: 'northwest',
    }
    return reverse[dir]
  }

  // Check if position is occupied (within threshold)
  function isOccupied(x: number, y: number, excludeVnum?: number): boolean {
    const threshold = NODE_SIZE + 5 // Minimum distance between rooms
    for (const [vnum, pos] of positions.value) {
      if (vnum === excludeVnum) continue
      const dx = Math.abs(pos.x - x)
      const dy = Math.abs(pos.y - y)
      if (dx < threshold && dy < threshold) return true
    }
    return false
  }

  // Find available position near target using spiral (snapped to grid)
  function findAvailablePosition(
    targetX: number,
    targetY: number,
    excludeVnum?: number,
  ): RoomPosition {
    for (const offset of SPIRAL_OFFSETS) {
      const snapped = snapToGrid(targetX + offset.x * GRID_SIZE, targetY + offset.y * GRID_SIZE)
      if (!isOccupied(snapped.x, snapped.y, excludeVnum)) {
        return snapped
      }
    }
    // Fallback: random grid position
    const randomOffset = Math.floor(Math.random() * 5) - 2
    return snapToGrid(targetX + randomOffset * GRID_SIZE, targetY + randomOffset * GRID_SIZE)
  }

  // BFS-based auto-layout algorithm
  function calculateLayout() {
    if (rooms.value.length === 0) return

    const newPositions = new Map<number, RoomPosition>()
    const visited = new Set<number>()
    const queue: Array<{ vnum: number; x: number; y: number }> = []

    // Find the first room with exits as starting point, or just the first room
    let startRoom = rooms.value.find((r) => r.exits && Object.keys(r.exits).length > 0)
    if (!startRoom) startRoom = rooms.value[0]

    // No rooms to process
    if (!startRoom) return

    // Start at center
    queue.push({ vnum: startRoom.vnum, x: 0, y: 0 })
    visited.add(startRoom.vnum)

    while (queue.length > 0) {
      const current = queue.shift()!

      // Find available position for current room
      const pos = findAvailablePosition(current.x, current.y, current.vnum)
      newPositions.set(current.vnum, pos)

      // Get exits for this room
      const exits = adjacency.value.get(current.vnum)
      if (!exits) continue

      // Process each exit
      for (const [dir, toVnum] of exits) {
        if (visited.has(toVnum)) continue

        // Check if destination room exists in our zone
        const destRoom = rooms.value.find((r) => r.vnum === toVnum)
        if (!destRoom) continue

        visited.add(toVnum)

        // Calculate target position based on direction
        const offset = DIRECTION_OFFSETS[dir] || { x: 100, y: 0 }
        queue.push({
          vnum: toVnum,
          x: pos.x + offset.x,
          y: pos.y + offset.y,
        })
      }
    }

    // Handle orphan rooms (no exits, not connected)
    let orphanX = 0
    let orphanY = GRID_SIZE * 8 // Place orphans below the main map
    for (const room of rooms.value) {
      if (!newPositions.has(room.vnum)) {
        newPositions.set(room.vnum, findAvailablePosition(orphanX, orphanY))
        orphanX += GRID_SIZE
        if (orphanX > GRID_SIZE * 10) {
          orphanX = 0
          orphanY += GRID_SIZE
        }
      }
    }

    positions.value = newPositions
    isDirty.value = true
  }

  // Initialize positions from saved data or calculate
  function initializePositions() {
    if (initialPositions?.value && Object.keys(initialPositions.value).length > 0) {
      // Use saved positions
      const savedMap = new Map<number, RoomPosition>()
      for (const [vnum, pos] of Object.entries(initialPositions.value)) {
        savedMap.set(parseInt(vnum), pos)
      }

      // Check if all rooms have positions
      const missingRooms = rooms.value.filter((r) => !savedMap.has(r.vnum))
      if (missingRooms.length === 0) {
        positions.value = savedMap
        isDirty.value = false
        return
      }

      // Some rooms missing, add them
      positions.value = savedMap
      let maxY = 0
      for (const pos of savedMap.values()) {
        if (pos.y > maxY) maxY = pos.y
      }

      let orphanX = 0
      let orphanY = maxY + GRID_SIZE * 3
      for (const room of missingRooms) {
        positions.value.set(room.vnum, findAvailablePosition(orphanX, orphanY))
        orphanX += GRID_SIZE
        if (orphanX > GRID_SIZE * 10) {
          orphanX = 0
          orphanY += GRID_SIZE
        }
      }
      isDirty.value = true
    } else {
      // No saved positions, calculate layout
      calculateLayout()
    }
  }

  // Update a single room position (for drag)
  function setRoomPosition(vnum: number, x: number, y: number) {
    positions.value.set(vnum, { x, y })
    isDirty.value = true
  }

  // Zoom controls
  function zoomIn() {
    zoom.value = Math.min(200, zoom.value + 25)
  }

  function zoomOut() {
    zoom.value = Math.max(25, zoom.value - 25)
  }

  function setZoom(value: number) {
    zoom.value = Math.max(25, Math.min(200, value))
  }

  // Pan controls
  function pan(dx: number, dy: number) {
    panX.value += dx
    panY.value += dy
  }

  function setPan(x: number, y: number) {
    panX.value = x
    panY.value = y
  }

  // Fit all rooms in view
  function fitToView(containerWidth: number, containerHeight: number) {
    if (positions.value.size === 0) return

    // Calculate bounds (positions are CENTER coordinates)
    let minX = Infinity,
      maxX = -Infinity
    let minY = Infinity,
      maxY = -Infinity

    for (const pos of positions.value.values()) {
      minX = Math.min(minX, pos.x - NODE_HALF)
      maxX = Math.max(maxX, pos.x + NODE_HALF)
      minY = Math.min(minY, pos.y - NODE_HALF)
      maxY = Math.max(maxY, pos.y + NODE_HALF)
    }

    const mapWidth = maxX - minX + GRID_SIZE * 2 // Padding
    const mapHeight = maxY - minY + GRID_SIZE * 2

    // Calculate zoom to fit
    const zoomX = (containerWidth / mapWidth) * 100
    const zoomY = (containerHeight / mapHeight) * 100
    const newZoom = Math.max(25, Math.min(150, Math.min(zoomX, zoomY)))

    zoom.value = newZoom

    // Center the map
    const centerX = (minX + maxX) / 2
    const centerY = (minY + maxY) / 2
    panX.value = containerWidth / 2 - centerX * (newZoom / 100)
    panY.value = containerHeight / 2 - centerY * (newZoom / 100)
  }

  // Center on a specific room
  function centerOnRoom(vnum: number, containerWidth: number, containerHeight: number) {
    const pos = positions.value.get(vnum)
    if (!pos) return

    // pos.x/y IS the center (grid-aligned)
    panX.value = containerWidth / 2 - pos.x * (zoom.value / 100)
    panY.value = containerHeight / 2 - pos.y * (zoom.value / 100)
  }

  // Get positions as plain object for saving
  function getPositionsObject(): Record<number, RoomPosition> {
    const obj: Record<number, RoomPosition> = {}
    for (const [vnum, pos] of positions.value) {
      obj[vnum] = pos
    }
    return obj
  }

  // Watch for room changes
  watch(
    rooms,
    (newRooms) => {
      if (newRooms.length > 0 && positions.value.size === 0) {
        initializePositions()
      }
    },
    { immediate: true },
  )

  return {
    // State
    positions,
    zoom,
    panX,
    panY,
    isDirty,

    // Actions
    calculateLayout,
    initializePositions,
    setRoomPosition,
    zoomIn,
    zoomOut,
    setZoom,
    pan,
    setPan,
    fitToView,
    centerOnRoom,
    getPositionsObject,

    // Computed
    adjacency,
  }
}
