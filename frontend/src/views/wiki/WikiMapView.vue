<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch } from 'vue'
import { useRouter } from 'vue-router'
import axios from 'axios'
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
import { Loader2, ZoomIn, ZoomOut, Crosshair, Home, Layers } from '@lucide/vue'

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
const displayedLayer = ref(0)
const layerLoading = ref(false)
const layerError = ref('')
let layerRequest = 0
const selectedLayer = ref<string>('0')
const currentZoom = ref(1)
const currentPosition = ref({ x: 0, y: 0 })
const hoveredRoom = ref<{ vnum: number | null; x: number; y: number }>({ vnum: null, x: 0, y: 0 })
let mapDataRequest = 0

async function loadMapData() {
  const request = ++mapDataRequest
  loading.value = true
  error.value = null

  for (let attempt = 0; attempt < 3; attempt++) {
    if (request !== mapDataRequest) return
    try {
      const [continentsData, boundsData, layersData] = await Promise.all([
        wikiApi.getContinents(),
        wikiApi.getMapBounds(0),
        wikiApi.getMapLayers(),
      ])
      if (request !== mapDataRequest) return

      continents.value = continentsData
      mapBounds.value = boundsData
      mapLayers.value = layersData
      loading.value = false
      return
    } catch (e) {
      if (request !== mapDataRequest) return
      const status = axios.isAxiosError(e) ? e.response?.status : undefined
      const temporary =
        axios.isAxiosError(e) &&
        !axios.isCancel(e) &&
        (['ERR_NETWORK', 'ECONNABORTED', 'ETIMEDOUT'].includes(e.code ?? '') ||
          (status !== undefined && status >= 500 && status < 600))
      if (temporary && attempt < 2) {
        await new Promise((resolve) => setTimeout(resolve, 500 * (attempt + 1)))
        continue
      }
      error.value =
        status === 401
          ? 'Sign in to view the map, then try again.'
          : status === 403
            ? 'You do not have permission to view the map.'
            : status === 429
              ? 'Too many map requests. Wait a moment, then try again.'
              : temporary
                ? 'The map service is temporarily unavailable. Please try again.'
                : 'Failed to load map data. Please try again.'
      loading.value = false
      return
    }
  }
}
onMounted(loadMapData)

// Commit a layer and its bounds together; a slow earlier request cannot replace them.
watch(selectedLayer, async (newLayer) => {
  const request = ++layerRequest
  layerLoading.value = true
  layerError.value = ''
  try {
    const layerNum = Number(newLayer)
    const newBounds = await wikiApi.getMapBounds(layerNum)
    if (request !== layerRequest) return
    mapBounds.value = newBounds
    displayedLayer.value = layerNum
    selectedContinent.value = ''
  } catch {
    if (request === layerRequest)
      layerError.value = 'Could not load this layer. Choose another layer and try again.'
  } finally {
    if (request === layerRequest) layerLoading.value = false
  }
})
onUnmounted(() => {
  ++mapDataRequest
  ++layerRequest
})

// Jump to the selected continent using its published center.
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
    leafletMapRef.value.setZoom(3)
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

// Explicit sector IDs match the generated image, including roads and planar terrain.
const legendItems = [
  { sectors: [0, 21], color: '#777066', label: 'Stone / earth' },
  { sectors: [1], color: '#cec1a6', label: 'City' },
  { sectors: [2], color: '#63734c', label: 'Field' },
  { sectors: [3], color: '#34563d', label: 'Forest' },
  { sectors: [4], color: '#8c7952', label: 'Hills' },
  { sectors: [5], color: '#695e52', label: 'Mountain' },
  { sectors: [6, 20], color: '#4e7b86', label: 'Shallows / water plane' },
  { sectors: [7], color: '#365c70', label: 'Deep water' },
  { sectors: [8, 19], color: '#97b5bb', label: 'Air' },
  { sectors: [9, 10], color: '#2c4b60', label: 'Underwater' },
  { sectors: [11, 36], color: '#9d5140', label: 'Fire / Avernus' },
  { sectors: [12], color: '#263f4b', label: 'Ocean' },
  { sectors: [13], color: '#51475d', label: 'Underdark wilds' },
  { sectors: [14], color: '#b1a0b8', label: 'Underdark city' },
  { sectors: [15], color: '#47414a', label: 'Underdark stone' },
  { sectors: [16], color: '#52637f', label: 'Underdark water' },
  { sectors: [17], color: '#394961', label: 'Underdark deep water' },
  { sectors: [18, 35], color: '#27232f', label: 'Void / negative plane' },
  { sectors: [22], color: '#a4a0b7', label: 'Ethereal' },
  { sectors: [23], color: '#7e729b', label: 'Astral' },
  { sectors: [24], color: '#b9a078', label: 'Desert' },
  { sectors: [25], color: '#c6ceca', label: 'Arctic' },
  { sectors: [26], color: '#53634b', label: 'Swamp' },
  { sectors: [27], color: '#60516b', label: 'Underdark mountain' },
  { sectors: [28], color: '#788346', label: 'Slime' },
  { sectors: [29], color: '#3d3546', label: 'Low ceiling' },
  { sectors: [30], color: '#67938b', label: 'Liquid mithril' },
  { sectors: [31], color: '#96704f', label: 'Mushrooms' },
  { sectors: [32, 33, 34], color: '#aaa28e', label: 'Castle / gate / wall' },
  { sectors: [37], color: '#8c8a7b', label: 'Road' },
  { sectors: [38], color: '#91a798', label: 'Snowy forest' },
  { sectors: [39], color: '#b56b45', label: 'Lava' },
]
</script>

<template>
  <div class="h-full min-h-0 flex flex-col">
    <!-- Loading State -->
    <div v-if="loading" class="flex-1 flex items-center justify-center">
      <Loader2 class="h-8 w-8 animate-spin text-muted-foreground" />
    </div>

    <!-- Error State -->
    <div v-else-if="error" class="flex-1 flex items-center justify-center">
      <Card class="max-w-md">
        <CardContent class="pt-6">
          <p role="alert" class="text-destructive text-center">{{ error }}</p>
          <Button class="mt-4 w-full" @click="loadMapData">Retry</Button>
        </CardContent>
      </Card>
    </div>

    <!-- Map View -->
    <div v-else class="flex-1 min-h-0 flex flex-col">
      <!-- Toolbar -->
      <div class="border-b border-border bg-background px-3 py-3 flex flex-wrap items-center gap-3">
        <!-- Layer Selector -->
        <div class="flex items-center gap-1.5 sm:gap-2">
          <Layers class="h-4 w-4 text-muted-foreground shrink-0" />
          <Select v-model="selectedLayer">
            <SelectTrigger aria-label="Map layer" class="w-[112px] sm:w-[140px] h-9">
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
            <SelectTrigger aria-label="Jump to continent" class="w-[136px] sm:w-[200px] h-9">
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
        <span v-if="layerLoading" role="status" class="text-sm text-muted-foreground">Loading layer…</span>
        <span v-if="layerError" role="alert" class="basis-full text-sm text-destructive">{{ layerError }}</span>

        <!-- Zoom display -->
        <div class="text-xs sm:text-sm text-muted-foreground">
          {{ (Math.pow(2, currentZoom) * 100).toFixed(0) }}%
        </div>

        <!-- Zoom Controls -->
        <div class="flex items-center gap-0.5 sm:gap-1">
          <Button variant="outline" size="icon" class="h-9 w-9" @click="handleZoomIn" title="Zoom in" aria-label="Zoom in">
            <ZoomIn class="h-3.5 w-3.5 sm:h-4 sm:w-4" />
          </Button>
          <Button variant="outline" size="icon" class="h-9 w-9" @click="handleZoomOut" title="Zoom out" aria-label="Zoom out">
            <ZoomOut class="h-3.5 w-3.5 sm:h-4 sm:w-4" />
          </Button>
          <Button variant="outline" size="icon" class="h-9 w-9" @click="handleResetView" title="Reset view" aria-label="Reset view">
            <Home class="h-3.5 w-3.5 sm:h-4 sm:w-4" />
          </Button>
        </div>
      </div>

      <!-- Map Area -->
      <div class="flex-1 min-h-64 relative bg-card overflow-hidden" :aria-busy="layerLoading">
        <LeafletMap
          ref="leafletMapRef"
          :bounds="mapBounds"
          :initial-zoom="1"
          :initial-painted="true"
          :initial-show-docks="true"
          :layer="displayedLayer"
          @zone-click="handleZoneClick"
          @room-hover="handleRoomHover"
          @zoom-change="handleZoomChange"
          @position-change="handlePositionChange"
        />

        <!-- A compact key remains available at every screen size. -->
        <details class="absolute bottom-3 right-3 z-[1000] max-w-[calc(100%-1.5rem)] border border-border bg-background text-sm">
          <summary class="cursor-pointer px-3 py-2 font-medium select-none">Terrain key</summary>
          <div class="max-h-[40vh] overflow-y-auto border-t border-border p-3">
            <div class="mb-3 flex items-center gap-2 border-b border-border pb-3">
              <span class="h-3 w-3 shrink-0 rounded-full border-2 border-bone bg-vermilion" />
              <span>Zone entrance</span>
            </div>
            <div class="grid grid-cols-2 gap-x-4 gap-y-2">
              <div v-for="item in legendItems" :key="item.label" class="flex items-center gap-2">
                <span class="h-3 w-3 shrink-0 border border-rule" :style="{ backgroundColor: item.color }" :data-sectors="item.sectors.join(',')" />
                <span>{{ item.label }}</span>
              </div>
            </div>
          </div>
        </details>

        <!-- Hovered room info (bottom left) - hidden on mobile -->
        <div v-if="hoveredRoom.vnum" class="absolute bottom-2 left-2 sm:bottom-4 sm:left-4 hidden sm:block">
          <Card class="bg-background/90 backdrop-blur">
            <CardContent class="p-2 sm:p-3 text-xs">
              <p class="font-mono">Room VNUM: {{ hoveredRoom.vnum }}</p>
              <p class="text-muted-foreground">{{ hoveredRoom.x }}, {{ hoveredRoom.y }}</p>
            </CardContent>
          </Card>
        </div>

      </div>
      <p class="border-t border-border bg-background px-3 py-2 text-sm text-muted-foreground">
        <span class="hidden sm:inline">Drag to pan · Scroll to zoom · </span>Zoom in to read names. Select an entrance for zone details.
      </p>
    </div>
  </div>
</template>
