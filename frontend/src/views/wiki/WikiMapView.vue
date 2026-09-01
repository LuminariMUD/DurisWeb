<script setup lang="ts">
import { ref, onMounted, watch } from 'vue'
import { useRouter } from 'vue-router'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import LeafletMap from '@/components/wiki/LeafletMap.vue'
import { wikiApi } from '@/services/api'
import type { WikiContinent, WikiMapBounds } from '@/types'
import { Loader2, ZoomIn, ZoomOut, Crosshair, Home, Layers } from 'lucide-vue-next'

const router = useRouter()

// Refs
const leafletMapRef = ref<InstanceType<typeof LeafletMap> | null>(null)

// State
const loading = ref(true)
const error = ref<string | null>(null)
const continents = ref<WikiContinent[]>([])
const mapBounds = ref<WikiMapBounds | null>(null)
const mapLayers = ref<{ id: number; name: string; description: string }[]>([])
const selectedContinent = ref<string>('')
const selectedLayer = ref<string>('0')
const currentZoom = ref(1)
const currentPosition = ref({ x: 0, y: 0 })
const hoveredRoom = ref<{ vnum: number | null; x: number; y: number }>({ vnum: null, x: 0, y: 0 })

// Load initial data
onMounted(async () => {
  try {
    loading.value = true
    error.value = null

    // Load continents, map bounds (for default layer 0), and layers in parallel
    const [continentsData, boundsData, layersData] = await Promise.all([
      wikiApi.getContinents(),
      wikiApi.getMapBounds(0), // Load bounds for Surface layer initially
      wikiApi.getMapLayers(),
    ])

    continents.value = continentsData
    mapBounds.value = boundsData
    mapLayers.value = layersData
  } catch (e) {
    error.value = 'Failed to load map data'
    console.error('Failed to load wiki map data:', e)
  } finally {
    loading.value = false
  }
})

// Watch for layer changes and update bounds
watch(selectedLayer, async (newLayer) => {
  try {
    const layerNum = Number(newLayer)
    const newBounds = await wikiApi.getMapBounds(layerNum)
    mapBounds.value = newBounds

    // Fit the map to the new layer's bounds
    if (leafletMapRef.value) {
      leafletMapRef.value.fitBounds()
    }

    // Clear continent selection when switching layers
    selectedContinent.value = ''
  } catch (e) {
    console.error('Failed to load layer bounds:', e)
  }
})

// Jump to continent - AcceptableValue = string | number | bigint | Record<string, any> | null
function jumpToContinent(continentId: string | number | bigint | Record<string, unknown> | null) {
  if (continentId === null || typeof continentId === 'object') return
  const continent = continents.value.find((c) => c.id.toString() === String(continentId))
  if (
    continent &&
    continent.centerX !== null &&
    continent.centerY !== null &&
    leafletMapRef.value
  ) {
    leafletMapRef.value.panTo(continent.centerX, continent.centerY)
    leafletMapRef.value.setZoom(2)
  }
}

// Zoom controls
function handleZoomIn() {
  leafletMapRef.value?.zoomIn()
}

function handleZoomOut() {
  leafletMapRef.value?.zoomOut()
}

function handleResetView() {
  if (mapBounds.value && leafletMapRef.value) {
    leafletMapRef.value.fitBounds()
    selectedContinent.value = ''
  }
}

// Event handlers
function handleZoneClick(zoneNumber: number, _zoneName: string) {
  router.push(`/wiki/zones/${zoneNumber}`)
}

function handleRoomHover(vnum: number | null, x: number, y: number) {
  hoveredRoom.value = { vnum, x, y }
}

function handleZoomChange(zoom: number) {
  currentZoom.value = zoom
}

function handlePositionChange(x: number, y: number) {
  currentPosition.value = { x, y }
}

// Legend colors matching the map (from MUD defines.h sector types)
const legendItems = [
  { color: '#ffffff', label: 'City' },
  { color: '#6b7280', label: 'Road' },
  { color: '#4ade80', label: 'Field' },
  { color: '#16a34a', label: 'Forest' },
  { color: '#eab308', label: 'Hills' },
  { color: '#a16207', label: 'Mountain' },
  { color: '#22d3ee', label: 'Water' },
  { color: '#1e3a8a', label: 'Ocean' },
  { color: '#fef08a', label: 'Desert' },
  { color: '#f1f5f9', label: 'Arctic' },
  { color: '#a855f7', label: 'Swamp' },
  { color: '#7e22ce', label: 'Underdark' },
]
</script>

<template>
  <div class="h-full flex flex-col">
    <!-- Loading State -->
    <div v-if="loading" class="flex-1 flex items-center justify-center">
      <Loader2 class="h-8 w-8 animate-spin text-muted-foreground" />
    </div>

    <!-- Error State -->
    <div v-else-if="error" class="flex-1 flex items-center justify-center">
      <Card class="max-w-md">
        <CardContent class="pt-6">
          <p class="text-destructive text-center">{{ error }}</p>
          <Button class="mt-4 w-full" @click="$router.go(0)">Retry</Button>
        </CardContent>
      </Card>
    </div>

    <!-- Map View -->
    <div v-else class="flex-1 flex flex-col">
      <!-- Toolbar -->
      <div class="border-b bg-muted/50 px-2 sm:px-4 py-2 flex flex-wrap items-center gap-2 sm:gap-4">
        <!-- Layer Selector -->
        <div class="flex items-center gap-1.5 sm:gap-2">
          <Layers class="h-4 w-4 text-muted-foreground shrink-0" />
          <Select v-model="selectedLayer">
            <SelectTrigger class="w-[100px] sm:w-[140px] h-8">
              <SelectValue placeholder="Layer..." />
            </SelectTrigger>
            <SelectContent>
              <SelectItem
                v-for="layer in mapLayers"
                :key="layer.id"
                :value="layer.id.toString()"
              >
                {{ layer.name }}
              </SelectItem>
            </SelectContent>
          </Select>
        </div>

        <!-- Continent Selector -->
        <div class="flex items-center gap-1.5 sm:gap-2">
          <Crosshair class="h-4 w-4 text-muted-foreground shrink-0" />
          <Select v-model="selectedContinent" @update:model-value="jumpToContinent">
            <SelectTrigger class="w-[120px] sm:w-[200px] h-8">
              <SelectValue placeholder="Jump to..." />
            </SelectTrigger>
            <SelectContent>
              <SelectItem
                v-for="continent in continents"
                :key="continent.id"
                :value="continent.id.toString()"
              >
                {{ continent.name }}
              </SelectItem>
            </SelectContent>
          </Select>
        </div>

        <!-- Position display (hidden on mobile) -->
        <div class="hidden sm:block text-sm text-muted-foreground font-mono">
          ({{ Math.round(currentPosition.x) }}, {{ Math.round(currentPosition.y) }})
        </div>

        <div class="flex-1" />

        <!-- Zoom display -->
        <div class="text-xs sm:text-sm text-muted-foreground">
          {{ (Math.pow(2, currentZoom) * 100).toFixed(0) }}%
        </div>

        <!-- Zoom Controls -->
        <div class="flex items-center gap-0.5 sm:gap-1">
          <Button variant="outline" size="icon" class="h-7 w-7 sm:h-8 sm:w-8" @click="handleZoomIn" title="Zoom In">
            <ZoomIn class="h-3.5 w-3.5 sm:h-4 sm:w-4" />
          </Button>
          <Button variant="outline" size="icon" class="h-7 w-7 sm:h-8 sm:w-8" @click="handleZoomOut" title="Zoom Out">
            <ZoomOut class="h-3.5 w-3.5 sm:h-4 sm:w-4" />
          </Button>
          <Button variant="outline" size="icon" class="h-7 w-7 sm:h-8 sm:w-8" @click="handleResetView" title="Reset View">
            <Home class="h-3.5 w-3.5 sm:h-4 sm:w-4" />
          </Button>
        </div>
      </div>

      <!-- Map Area -->
      <div class="flex-1 relative bg-slate-900 overflow-hidden">
        <LeafletMap
          ref="leafletMapRef"
          :bounds="mapBounds"
          :initial-zoom="1"
          :layer="Number(selectedLayer)"
          @zone-click="handleZoneClick"
          @room-hover="handleRoomHover"
          @zoom-change="handleZoomChange"
          @position-change="handlePositionChange"
        />

        <!-- Legend (bottom right) - hidden on small mobile -->
        <div class="absolute bottom-2 right-2 sm:bottom-4 sm:right-4 hidden sm:block">
          <Card class="bg-background/90 backdrop-blur">
            <CardContent class="p-2 sm:p-3">
              <p class="text-xs font-medium mb-2">Terrain Types</p>
              <div class="grid grid-cols-2 gap-x-3 sm:gap-x-4 gap-y-1 text-xs">
                <div
                  v-for="item in legendItems"
                  :key="item.label"
                  class="flex items-center gap-1.5 sm:gap-2"
                >
                  <span
                    class="w-2.5 h-2.5 sm:w-3 sm:h-3 rounded-sm border border-white/20 shrink-0"
                    :style="{ backgroundColor: item.color }"
                  ></span>
                  <span>{{ item.label }}</span>
                </div>
              </div>
              <div class="mt-2 pt-2 border-t text-xs">
                <div class="flex items-center gap-1.5 sm:gap-2">
                  <span class="w-2.5 h-2.5 sm:w-3 sm:h-3 rounded-full bg-red-500 shrink-0"></span>
                  <span>Zone Entrance</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <!-- Hovered room info (bottom left) - hidden on mobile -->
        <div v-if="hoveredRoom.vnum" class="absolute bottom-2 left-2 sm:bottom-4 sm:left-4 hidden sm:block">
          <Card class="bg-background/90 backdrop-blur">
            <CardContent class="p-2 sm:p-3 text-xs">
              <p class="font-mono">Room VNUM: {{ hoveredRoom.vnum }}</p>
              <p class="text-muted-foreground">{{ hoveredRoom.x }}, {{ hoveredRoom.y }}</p>
            </CardContent>
          </Card>
        </div>

        <!-- Help text (top left) -->
        <div class="absolute top-2 left-2 sm:top-4 sm:left-4 text-[10px] sm:text-xs text-white/60 pointer-events-none">
          <span class="hidden sm:inline">Drag to pan | Scroll to zoom | Click zone markers to view details</span>
          <span class="sm:hidden">Tap zones to view details</span>
        </div>
      </div>
    </div>
  </div>
</template>
