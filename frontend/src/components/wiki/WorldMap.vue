<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch, computed } from 'vue'
import { wikiApi } from '@/services/api'
import type { WikiMapTile, WikiZoneEntrance, WikiMapBounds } from '@/types'

const props = withDefaults(
  defineProps<{
    initialCenterX?: number
    initialCenterY?: number
    initialZoom?: number
    bounds: WikiMapBounds | null
    layer?: number
  }>(),
  {
    initialCenterX: 0,
    initialCenterY: 0,
    initialZoom: 1,
    layer: 0,
  },
)

const emit = defineEmits<{
  (e: 'zone-click', zoneNumber: number, zoneName: string): void
  (e: 'room-hover', vnum: number | null, x: number, y: number): void
  (e: 'zoom-change', zoom: number): void
  (e: 'position-change', x: number, y: number): void
}>()

// Canvas refs
const canvasRef = ref<HTMLCanvasElement | null>(null)
const containerRef = ref<HTMLDivElement | null>(null)

// Map state
const centerX = ref(props.initialCenterX)
const centerY = ref(props.initialCenterY)
const zoom = ref(props.initialZoom)
const isDragging = ref(false)
const dragStart = ref({ x: 0, y: 0 })
const lastCenter = ref({ x: 0, y: 0 })

// Tile cache
const tileCache = ref<Map<string, WikiMapTile[]>>(new Map())
const entranceCache = ref<Map<string, WikiZoneEntrance[]>>(new Map())
const loadingTiles = ref<Set<string>>(new Set())

// Hover state
const hoveredEntrance = ref<WikiZoneEntrance | null>(null)
const mousePos = ref({ x: 0, y: 0 })

// Toggle state for visibility
const showMarkers = ref(true)
const showZoneNames = ref(true)

// Constants
const TILE_SIZE = 8 // pixels per tile at zoom 1
const CHUNK_SIZE = 100 // load tiles in chunks
const MIN_ZOOM = 0.25
const MAX_ZOOM = 4

// Strip ANSI color codes from text for canvas rendering
function stripAnsi(text: string): string {
  // Remove &+X, &-X, &n patterns (MUD ANSI codes)
  return text.replace(/&[+-]?[a-zA-Z]|&n/g, '')
}

// Sector type colors (from MUD defines.h)
const sectorColors: Record<number, string> = {
  0: '#78716c', // SECT_INSIDE - stone gray
  1: '#ffffff', // SECT_CITY - white
  2: '#4ade80', // SECT_FIELD - green
  3: '#16a34a', // SECT_FOREST - darker green
  4: '#eab308', // SECT_HILLS - yellow
  5: '#a16207', // SECT_MOUNTAIN - brown
  6: '#22d3ee', // SECT_WATER_SWIM - cyan
  7: '#3b82f6', // SECT_WATER_NOSWIM - blue
  8: '#7dd3fc', // SECT_NO_GROUND - sky blue (air)
  9: '#1d4ed8', // SECT_UNDERWATER - dark blue
  10: '#1e40af', // SECT_UNDERWATER_GR - darker blue
  11: '#ef4444', // SECT_FIREPLANE - red/orange
  12: '#1e3a8a', // SECT_OCEAN - deep blue
  13: '#7e22ce', // SECT_UNDRWLD_WILD - dark purple
  14: '#d8b4fe', // SECT_UNDRWLD_CITY - light purple
  15: '#44403c', // SECT_UNDRWLD_INSIDE - dark stone
  16: '#6366f1', // SECT_UNDRWLD_WATER - indigo
  17: '#4f46e5', // SECT_UNDRWLD_NOSWIM - indigo darker
  18: '#1c1917', // SECT_UNDRWLD_NOGROUND - near black
  19: '#7dd3fc', // SECT_AIR_PLANE - sky blue
  20: '#06b6d4', // SECT_WATER_PLANE - cyan
  21: '#78716c', // SECT_EARTH_PLANE - stone
  22: '#c4b5fd', // SECT_ETHEREAL - light violet
  23: '#a78bfa', // SECT_ASTRAL - violet
  24: '#fef08a', // SECT_DESERT - light yellow
  25: '#f1f5f9', // SECT_ARCTIC - white/light gray
  26: '#a855f7', // SECT_SWAMP - purple
  27: '#581c87', // SECT_UNDRWLD_MOUNTAIN - dark purple
  28: '#84cc16', // SECT_UNDRWLD_SLIME - lime
  29: '#581c87', // SECT_UNDRWLD_LOWCEIL - dark purple
  30: '#14b8a6', // SECT_UNDRWLD_LIQMITH - teal
  31: '#f97316', // SECT_UNDRWLD_MUSHROOM - orange
  32: '#6b7280', // SECT_CASTLE_WALL - gray
  33: '#9ca3af', // SECT_CASTLE_GATE - lighter gray
  34: '#d1d5db', // SECT_CASTLE - light gray
  35: '#1f2937', // SECT_NEG_PLANE - dark gray
  36: '#dc2626', // SECT_PLANE_OF_AVERNUS - red
  37: '#6b7280', // SECT_ROAD - gray
  38: '#bbf7d0', // SECT_SNOWY_FOREST - light green/white
  39: '#f97316', // SECT_LAVA - orange
}

// Computed viewport
const viewport = computed(() => {
  if (!canvasRef.value) {
    return { minX: 0, maxX: 100, minY: 0, maxY: 100, width: 800, height: 600 }
  }
  const canvas = canvasRef.value
  const tileWidth = TILE_SIZE * zoom.value
  const tilesX = Math.ceil(canvas.width / tileWidth) + 2
  const tilesY = Math.ceil(canvas.height / tileWidth) + 2

  return {
    minX: Math.floor(centerX.value - tilesX / 2),
    maxX: Math.ceil(centerX.value + tilesX / 2),
    minY: Math.floor(centerY.value - tilesY / 2),
    maxY: Math.ceil(centerY.value + tilesY / 2),
    width: canvas.width,
    height: canvas.height,
  }
})

// Get chunk key for caching (for future use in tile lookup)
function _getChunkKey(x: number, y: number): string {
  const chunkX = Math.floor(x / CHUNK_SIZE) * CHUNK_SIZE
  const chunkY = Math.floor(y / CHUNK_SIZE) * CHUNK_SIZE
  return `${chunkX},${chunkY}`
}

// Get all chunk keys needed for viewport
function getViewportChunks(): string[] {
  const chunks: string[] = []
  const vp = viewport.value

  for (let x = Math.floor(vp.minX / CHUNK_SIZE) * CHUNK_SIZE; x <= vp.maxX; x += CHUNK_SIZE) {
    for (let y = Math.floor(vp.minY / CHUNK_SIZE) * CHUNK_SIZE; y <= vp.maxY; y += CHUNK_SIZE) {
      chunks.push(`${x},${y}`)
    }
  }

  return chunks
}

// Load tiles for a chunk
async function loadChunk(chunkKey: string) {
  // Include layer in cache key
  const cacheKey = `${chunkKey}:${props.layer}`
  if (tileCache.value.has(cacheKey) || loadingTiles.value.has(cacheKey)) {
    return
  }

  loadingTiles.value.add(cacheKey)

  try {
    const parts = chunkKey.split(',').map(Number)
    const chunkX = parts[0] ?? 0
    const chunkY = parts[1] ?? 0
    const chunkBounds = {
      minX: chunkX,
      maxX: chunkX + CHUNK_SIZE,
      minY: chunkY,
      maxY: chunkY + CHUNK_SIZE,
    }

    const [tiles, entrances] = await Promise.all([
      wikiApi.getMapTiles(chunkBounds, props.layer),
      wikiApi.getZoneEntrances(chunkBounds, props.layer),
    ])

    tileCache.value.set(cacheKey, tiles)
    entranceCache.value.set(cacheKey, entrances)

    // Trigger re-render
    render()
  } catch (err) {
    console.error('Failed to load chunk:', chunkKey, err)
  } finally {
    loadingTiles.value.delete(cacheKey)
  }
}

// Load visible chunks
async function loadVisibleChunks() {
  const chunks = getViewportChunks()
  await Promise.all(chunks.map(loadChunk))
}

// Convert world coordinates to screen coordinates
function worldToScreen(worldX: number, worldY: number): { x: number; y: number } {
  const canvas = canvasRef.value
  if (!canvas) return { x: 0, y: 0 }

  const tileWidth = TILE_SIZE * zoom.value
  const screenX = (worldX - centerX.value) * tileWidth + canvas.width / 2
  const screenY = (worldY - centerY.value) * tileWidth + canvas.height / 2

  return { x: screenX, y: screenY }
}

// Convert screen coordinates to world coordinates
function screenToWorld(screenX: number, screenY: number): { x: number; y: number } {
  const canvas = canvasRef.value
  if (!canvas) return { x: 0, y: 0 }

  const tileWidth = TILE_SIZE * zoom.value
  const worldX = (screenX - canvas.width / 2) / tileWidth + centerX.value
  const worldY = (screenY - canvas.height / 2) / tileWidth + centerY.value

  return { x: Math.floor(worldX), y: Math.floor(worldY) }
}

// Render the map
function render() {
  const canvas = canvasRef.value
  if (!canvas) return

  const ctx = canvas.getContext('2d')
  if (!ctx) return

  // Clear canvas
  ctx.fillStyle = '#0f172a' // slate-900
  ctx.fillRect(0, 0, canvas.width, canvas.height)

  const tileWidth = TILE_SIZE * zoom.value
  const vp = viewport.value

  // Draw grid (at higher zoom levels)
  if (zoom.value >= 2) {
    ctx.strokeStyle = '#1e293b' // slate-800
    ctx.lineWidth = 1

    for (let x = vp.minX; x <= vp.maxX; x++) {
      const screenPos = worldToScreen(x, 0)
      ctx.beginPath()
      ctx.moveTo(screenPos.x, 0)
      ctx.lineTo(screenPos.x, canvas.height)
      ctx.stroke()
    }

    for (let y = vp.minY; y <= vp.maxY; y++) {
      const screenPos = worldToScreen(0, y)
      ctx.beginPath()
      ctx.moveTo(0, screenPos.y)
      ctx.lineTo(canvas.width, screenPos.y)
      ctx.stroke()
    }
  }

  // Draw tiles from cache (only for current layer)
  for (const [key, tiles] of tileCache.value) {
    // Only render tiles for the current layer
    if (!key.endsWith(`:${props.layer}`)) continue

    for (const tile of tiles) {
      // Check if tile is in viewport
      if (tile.x < vp.minX || tile.x > vp.maxX || tile.y < vp.minY || tile.y > vp.maxY) {
        continue
      }

      const screenPos = worldToScreen(tile.x, tile.y)
      const color = sectorColors[tile.sectorType] || '#6b7280'

      ctx.fillStyle = color
      ctx.fillRect(screenPos.x, screenPos.y, tileWidth, tileWidth)
    }
  }

  // Draw zone entrances (only for current layer)
  for (const [key, entrances] of entranceCache.value) {
    // Only render entrances for the current layer
    if (!key.endsWith(`:${props.layer}`)) continue

    for (const entrance of entrances) {
      // Skip entrances without coordinates
      if (entrance.x === null || entrance.y === null) continue

      // Check if entrance is in viewport
      if (
        entrance.x < vp.minX ||
        entrance.x > vp.maxX ||
        entrance.y < vp.minY ||
        entrance.y > vp.maxY
      ) {
        continue
      }

      const screenPos = worldToScreen(entrance.x, entrance.y)

      // Draw entrance marker
      if (showMarkers.value) {
        ctx.fillStyle =
          hoveredEntrance.value?.fromRoomVnum === entrance.fromRoomVnum
            ? '#f59e0b' // amber when hovered
            : '#ef4444' // red

        const markerSize = Math.max(tileWidth * 0.8, 4)
        ctx.beginPath()
        ctx.arc(
          screenPos.x + tileWidth / 2,
          screenPos.y + tileWidth / 2,
          markerSize / 2,
          0,
          Math.PI * 2,
        )
        ctx.fill()
      }

      // Draw zone label at higher zoom
      if (showZoneNames.value && zoom.value >= 1.5 && entrance.toZoneName) {
        ctx.font = `${Math.max(10, tileWidth * 0.8)}px sans-serif`
        ctx.fillStyle = '#ffffff'
        ctx.textAlign = 'center'
        const zoneName = stripAnsi(entrance.toZoneName).substring(0, 20)
        ctx.fillText(zoneName, screenPos.x + tileWidth / 2, screenPos.y - 4)
      }
    }
  }

  // Draw hovered entrance tooltip
  if (showMarkers.value && hoveredEntrance.value) {
    const padding = 8
    const zoneName = hoveredEntrance.value.toZoneName
      ? stripAnsi(hoveredEntrance.value.toZoneName)
      : 'Unknown'
    const text = `Zone ${hoveredEntrance.value.toZoneNumber}: ${zoneName}`
    ctx.font = '12px sans-serif'
    const metrics = ctx.measureText(text)
    const tooltipWidth = metrics.width + padding * 2
    const tooltipHeight = 24

    let tooltipX = mousePos.value.x + 10
    let tooltipY = mousePos.value.y - tooltipHeight - 5

    // Keep tooltip in bounds
    if (tooltipX + tooltipWidth > canvas.width) {
      tooltipX = canvas.width - tooltipWidth - 5
    }
    if (tooltipY < 0) {
      tooltipY = mousePos.value.y + 15
    }

    // Draw tooltip background
    ctx.fillStyle = '#1e293b'
    ctx.strokeStyle = '#475569'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.roundRect(tooltipX, tooltipY, tooltipWidth, tooltipHeight, 4)
    ctx.fill()
    ctx.stroke()

    // Draw tooltip text
    ctx.fillStyle = '#f8fafc'
    ctx.textAlign = 'left'
    ctx.fillText(text, tooltipX + padding, tooltipY + 16)
  }

  // Draw loading indicator
  if (loadingTiles.value.size > 0) {
    ctx.fillStyle = '#f8fafc'
    ctx.font = '12px sans-serif'
    ctx.textAlign = 'right'
    ctx.fillText(`Loading ${loadingTiles.value.size} chunks...`, canvas.width - 10, 20)
  }

  // Draw coordinates
  ctx.fillStyle = '#94a3b8'
  ctx.font = '11px monospace'
  ctx.textAlign = 'left'
  ctx.fillText(
    `Center: (${Math.round(centerX.value)}, ${Math.round(centerY.value)}) Zoom: ${zoom.value.toFixed(2)}x`,
    10,
    20,
  )
}

// Handle resize
function handleResize() {
  const canvas = canvasRef.value
  const container = containerRef.value
  if (!canvas || !container) return

  canvas.width = container.clientWidth
  canvas.height = container.clientHeight

  loadVisibleChunks()
  render()
}

// Handle mouse down
function handleMouseDown(e: MouseEvent) {
  isDragging.value = true
  dragStart.value = { x: e.clientX, y: e.clientY }
  lastCenter.value = { x: centerX.value, y: centerY.value }
}

// Handle mouse move
function handleMouseMove(e: MouseEvent) {
  const canvas = canvasRef.value
  if (!canvas) return

  const rect = canvas.getBoundingClientRect()
  mousePos.value = { x: e.clientX - rect.left, y: e.clientY - rect.top }

  if (isDragging.value) {
    const dx = e.clientX - dragStart.value.x
    const dy = e.clientY - dragStart.value.y
    const tileWidth = TILE_SIZE * zoom.value

    centerX.value = lastCenter.value.x - dx / tileWidth
    centerY.value = lastCenter.value.y - dy / tileWidth

    render()
  } else {
    // Check for entrance hover (only for current layer and when markers visible)
    const worldPos = screenToWorld(mousePos.value.x, mousePos.value.y)
    let found: WikiZoneEntrance | null = null

    if (showMarkers.value) {
      for (const [key, entrances] of entranceCache.value) {
        // Only check entrances for the current layer
        if (!key.endsWith(`:${props.layer}`)) continue

        for (const entrance of entrances) {
          if (entrance.x === worldPos.x && entrance.y === worldPos.y) {
            found = entrance
            break
          }
        }
        if (found) break
      }
    }

    if (found !== hoveredEntrance.value) {
      hoveredEntrance.value = found
      canvas.style.cursor = found ? 'pointer' : 'grab'
      render()
    }

    emit('room-hover', found?.fromRoomVnum || null, worldPos.x, worldPos.y)
  }
}

// Handle mouse up
function handleMouseUp() {
  if (isDragging.value) {
    isDragging.value = false
    loadVisibleChunks()
    emit('position-change', centerX.value, centerY.value)
  }
}

// Handle mouse leave
function handleMouseLeave() {
  isDragging.value = false
  hoveredEntrance.value = null
  render()
}

// Handle click
function handleClick() {
  if (hoveredEntrance.value) {
    emit('zone-click', hoveredEntrance.value.toZoneNumber, hoveredEntrance.value.toZoneName || '')
  }
}

// Handle wheel (zoom)
function handleWheel(e: WheelEvent) {
  e.preventDefault()

  const canvas = canvasRef.value
  if (!canvas) return

  const rect = canvas.getBoundingClientRect()
  const mouseX = e.clientX - rect.left
  const mouseY = e.clientY - rect.top

  // Get world position under mouse before zoom
  const worldBefore = screenToWorld(mouseX, mouseY)

  // Calculate new zoom
  const zoomDelta = e.deltaY > 0 ? 0.9 : 1.1
  const newZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, zoom.value * zoomDelta))

  if (newZoom !== zoom.value) {
    zoom.value = newZoom

    // Adjust center to keep mouse position fixed
    const tileWidth = TILE_SIZE * zoom.value
    centerX.value = worldBefore.x - (mouseX - canvas.width / 2) / tileWidth
    centerY.value = worldBefore.y - (mouseY - canvas.height / 2) / tileWidth

    loadVisibleChunks()
    render()
    emit('zoom-change', zoom.value)
  }
}

// Public methods for parent component
function setZoom(newZoom: number) {
  zoom.value = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, newZoom))
  loadVisibleChunks()
  render()
  emit('zoom-change', zoom.value)
}

function zoomIn() {
  setZoom(zoom.value * 1.25)
}

function zoomOut() {
  setZoom(zoom.value * 0.8)
}

function panTo(x: number, y: number) {
  centerX.value = x
  centerY.value = y
  loadVisibleChunks()
  render()
  emit('position-change', x, y)
}

// Expose methods
defineExpose({
  setZoom,
  zoomIn,
  zoomOut,
  panTo,
  render,
})

// Lifecycle
onMounted(() => {
  handleResize()
  window.addEventListener('resize', handleResize)

  // Initial center from bounds
  if (props.bounds) {
    centerX.value = Math.floor((props.bounds.minX + props.bounds.maxX) / 2)
    centerY.value = Math.floor((props.bounds.minY + props.bounds.maxY) / 2)
  }

  loadVisibleChunks()
})

onUnmounted(() => {
  window.removeEventListener('resize', handleResize)
})

// Watch for initial values
watch(
  () => [props.initialCenterX, props.initialCenterY],
  ([x, y]) => {
    if (x !== undefined && y !== undefined) {
      panTo(x, y)
    }
  },
)

// Watch for layer changes - reload tiles
watch(
  () => props.layer,
  () => {
    loadVisibleChunks()
    render()
  },
)

// Watch for toggle changes - re-render
watch([showMarkers, showZoneNames], () => {
  render()
})
</script>

<template>
  <div ref="containerRef" class="w-full h-full relative">
    <canvas
      ref="canvasRef"
      class="block"
      :class="isDragging ? 'cursor-grabbing' : 'cursor-grab'"
      @mousedown="handleMouseDown"
      @mousemove="handleMouseMove"
      @mouseup="handleMouseUp"
      @mouseleave="handleMouseLeave"
      @click="handleClick"
      @wheel="handleWheel"
    />
    <!-- toggle controls -->
    <div class="absolute top-2 right-2 bg-slate-800/90 rounded px-2 py-1.5 text-xs text-slate-200 flex flex-col gap-1">
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
