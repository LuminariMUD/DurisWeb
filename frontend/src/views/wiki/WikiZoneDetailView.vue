<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch, computed } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '@/components/ui/resizable'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import AnsiText from '@/components/ui/AnsiText.vue'
import WikiZoneMap from '@/components/wiki/WikiZoneMap.vue'
import { wikiApi } from '@/services/api'
import type {
  WikiZoneDetail,
  WikiRoom,
  WikiZoneMapData,
  WikiZoneSpawns,
  WikiRoomSpawn,
  WikiShopItem,
} from '@/types'
import {
  Loader2,
  ArrowLeft,
  MapPin,
  Users,
  Package,
  ChevronUp,
  ChevronDown,
  List,
  Store,
  Info,
  Map as MapIcon,
  FileText,
} from 'lucide-vue-next'
import { getWealthParts } from '@/utils/formatWealth'

const props = defineProps<{
  number: string
}>()

const router = useRouter()
const route = useRoute()

// State
const loading = ref(true)
const error = ref<string | null>(null)
const zone = ref<WikiZoneDetail | null>(null)
const mapData = ref<WikiZoneMapData | null>(null)
const spawns = ref<WikiZoneSpawns | null>(null)
const selectedRoom = ref<WikiRoom | null>(null)
const showRoomList = ref(false)
const mobileTab = ref('details')

// Epic type labels
const epicTypeLabels: Record<number, string> = {
  0: 'None',
  1: 'Solo Epic',
  2: 'Group Epic',
  3: 'Raid Epic',
}

// Get sector type color for room list
function getSectorColor(sectorType: number): string {
  const colors: Record<number, string> = {
    0: 'bg-stone-500',
    1: 'bg-white',
    2: 'bg-green-400',
    3: 'bg-green-600',
    4: 'bg-yellow-500',
    5: 'bg-yellow-700',
    6: 'bg-cyan-400',
    7: 'bg-blue-500',
    8: 'bg-sky-300',
    9: 'bg-blue-700',
    10: 'bg-blue-800',
    11: 'bg-red-500',
    12: 'bg-blue-900',
    13: 'bg-purple-700',
    14: 'bg-purple-300',
    15: 'bg-stone-700',
    24: 'bg-yellow-200',
    25: 'bg-slate-100',
    26: 'bg-purple-500',
    37: 'bg-gray-500',
  }
  return colors[sectorType] || 'bg-gray-400'
}

// Format exits for MUD-style display
const formattedExits = computed(() => {
  if (!selectedRoom.value || !selectedRoom.value.exits.length) {
    return 'None'
  }

  return selectedRoom.value.exits
    .map((exit) => {
      const dir = exit.direction.charAt(0).toUpperCase() + exit.direction.slice(1)
      return exit.hasDoor ? `[${dir}]` : `-${dir}`
    })
    .join(' ')
})

// Convert rooms to format expected by WikiZoneMap
const mapRooms = computed(() => {
  if (!zone.value) return []
  return zone.value.rooms.map((room) => ({
    vnum: room.vnum,
    name: room.name,
    sectorType: room.sectorType,
    exits: room.exits.reduce(
      (acc, exit) => {
        acc[exit.direction] = exit.toRoom
        return acc
      },
      {} as Record<string, number>,
    ),
  }))
})

// Room name lookup map for exit display
const roomNameMap = computed(() => {
  if (!zone.value) return new Map<number, string>()
  return new Map(zone.value.rooms.map((room) => [room.vnum, room.name]))
})

// Get room name by vnum (for exit buttons)
function getRoomName(vnum: number): string {
  return roomNameMap.value.get(vnum) || ''
}

// Load zone data
async function loadZone() {
  try {
    loading.value = true
    error.value = null

    const zoneNumber = parseInt(props.number)
    if (isNaN(zoneNumber)) {
      error.value = 'Invalid zone number'
      return
    }

    // Load zone detail, map data, and spawns in parallel
    const [zoneData, mapDataResult, spawnsData] = await Promise.all([
      wikiApi.getZoneDetail(zoneNumber),
      wikiApi.getZoneMapData(zoneNumber),
      wikiApi.getZoneSpawns(zoneNumber),
    ])

    zone.value = zoneData
    mapData.value = mapDataResult
    spawns.value = spawnsData

    // Check if a specific room was requested via query param
    const roomParam = route.query.room
    if (roomParam) {
      const roomVnum = parseInt(roomParam as string)
      const requestedRoom = zoneData.rooms.find((r) => r.vnum === roomVnum)
      if (requestedRoom) {
        selectedRoom.value = requestedRoom
        return
      }
    }

    // Select first room by default
    if (zoneData.rooms.length > 0) {
      selectedRoom.value = zoneData.rooms[0] ?? null
    }
  } catch (e) {
    error.value = 'Failed to load zone data'
    console.error('Failed to load wiki zone:', e)
  } finally {
    loading.value = false
  }
}

// Select a room
function selectRoom(room: WikiRoom) {
  selectedRoom.value = room
  showRoomList.value = false
}

// Select room by vnum (from map click)
function selectRoomByVnum(vnum: number) {
  const room = zone.value?.rooms.find((r) => r.vnum === vnum)
  if (room) {
    selectedRoom.value = room
    showRoomList.value = false
  }
}

// Navigate to adjacent room
function navigateToRoom(toRoom: number) {
  // Check if room exists in current zone
  const room = zone.value?.rooms.find((r) => r.vnum === toRoom)
  if (room) {
    selectedRoom.value = room
  }
}

// Navigate back
function goBack() {
  router.push('/wiki/zones')
}

// Get current room's spawns
const currentRoomSpawns = computed(() => {
  if (!selectedRoom.value || !spawns.value) return []
  return spawns.value.roomSpawns[selectedRoom.value.vnum] || []
})

// Get shopkeepers in current room (mobs with shopItems)
const currentRoomShopkeepers = computed(() => {
  return currentRoomSpawns.value.filter(
    (spawn) =>
      spawn.type === 'mob' && spawn.isShopkeeper && spawn.shopItems && spawn.shopItems.length > 0,
  )
})

// Navigate to spawn detail page
function goToSpawn(spawn: WikiRoomSpawn) {
  if (spawn.type === 'mob') {
    router.push(`/wiki/mobs/${zone.value?.number}/${spawn.vnum}`)
  } else {
    router.push(`/wiki/objects/${spawn.vnum}`)
  }
}

// Navigate to shop item detail page
function goToShopItem(item: WikiShopItem) {
  router.push(`/wiki/objects/${item.vnum}`)
}

// Keyboard navigation mapping
const keyToDirection: Record<string, string> = {
  // Arrow keys
  ArrowUp: 'north',
  ArrowDown: 'south',
  ArrowLeft: 'west',
  ArrowRight: 'east',
  // Letter keys
  n: 'north',
  s: 'south',
  e: 'east',
  w: 'west',
  u: 'up',
  d: 'down',
  // Numpad keys (both with and without NumLock)
  '8': 'north',
  '2': 'south',
  '4': 'west',
  '6': 'east',
  '7': 'northwest',
  '9': 'northeast',
  '1': 'southwest',
  '3': 'southeast',
  '5': 'up', // center key as up
  '0': 'down', // zero as down
}

// Handle keyboard navigation
function handleKeyDown(e: KeyboardEvent) {
  // Skip if user is typing in an input or textarea
  const target = e.target as HTMLElement
  if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
    return
  }

  // Skip if no room selected
  if (!selectedRoom.value) return

  const direction = keyToDirection[e.key]
  if (!direction) return

  // Find exit in that direction
  const exit = selectedRoom.value.exits.find((ex) => ex.direction === direction)
  if (exit) {
    e.preventDefault()
    navigateToRoom(exit.toRoom)
  }
}

// Load on mount and when number changes
onMounted(() => {
  loadZone()
  window.addEventListener('keydown', handleKeyDown)
})

onUnmounted(() => {
  window.removeEventListener('keydown', handleKeyDown)
})

watch(
  () => props.number,
  () => {
    loadZone()
  },
)
</script>

<template>
  <div class="h-full flex flex-col">
    <!-- Loading State -->
    <div v-if="loading" class="flex-1 flex items-center justify-center">
      <Loader2 class="h-8 w-8 animate-spin text-muted-foreground" />
    </div>

    <!-- Error State -->
    <div v-else-if="error" class="flex-1 flex items-center justify-center">
      <div class="text-center">
        <p class="text-destructive mb-4">{{ error }}</p>
        <div class="flex gap-2 justify-center">
          <Button variant="outline" @click="goBack">
            <ArrowLeft class="h-4 w-4 mr-2" />
            Back to Zones
          </Button>
          <Button @click="loadZone">Retry</Button>
        </div>
      </div>
    </div>

    <!-- Zone Detail -->
    <div v-else-if="zone" class="flex-1 flex flex-col overflow-hidden">
      <!-- Header -->
      <div class="border-b bg-muted/50 px-3 lg:px-4 py-3">
        <div class="flex items-start lg:items-center gap-3 lg:gap-4">
          <Button variant="ghost" size="icon" class="shrink-0" @click="goBack">
            <ArrowLeft class="h-5 w-5" />
          </Button>
          <div class="flex-1 min-w-0">
            <h1 class="text-base lg:text-lg font-semibold truncate">
              <AnsiText :text="zone.name" />
            </h1>
            <p class="text-xs lg:text-sm text-muted-foreground">Zone #{{ zone.number }}</p>
            <!-- Mobile badges -->
            <div class="flex flex-wrap items-center gap-1 mt-1 lg:hidden">
              <Badge :variant="zone.alignment > 0 ? 'default' : zone.alignment < 0 ? 'destructive' : 'secondary'" class="text-xs">
                {{ zone.alignment > 0 ? '+' : '' }}{{ zone.alignment }}
              </Badge>
              <Badge variant="outline" class="text-xs">
                D{{ zone.difficulty }}
              </Badge>
              <Badge v-if="zone.epicType > 0" variant="outline" class="text-xs bg-amber-500/10 text-amber-500 border-amber-500/20">
                {{ epicTypeLabels[zone.epicType] }}
              </Badge>
            </div>
          </div>
          <!-- Desktop badges -->
          <div class="hidden lg:flex items-center gap-2 shrink-0">
            <Badge :variant="zone.alignment > 0 ? 'default' : zone.alignment < 0 ? 'destructive' : 'secondary'">
              Align: {{ zone.alignment > 0 ? '+' : '' }}{{ zone.alignment }}
            </Badge>
            <Badge variant="outline">
              Diff: {{ zone.difficulty }}
            </Badge>
            <Badge v-if="zone.epicType > 0" variant="outline" class="bg-amber-500/10 text-amber-500 border-amber-500/20">
              {{ epicTypeLabels[zone.epicType] }}
            </Badge>
          </div>
        </div>
      </div>

      <!-- Stats Bar -->
      <div class="border-b bg-background px-3 lg:px-4 py-2 flex flex-wrap items-center gap-3 lg:gap-6 text-xs lg:text-sm">
        <div class="flex items-center gap-1 lg:gap-2">
          <MapPin class="h-3 w-3 lg:h-4 lg:w-4 text-muted-foreground" />
          <span>{{ zone.roomCount }} rooms</span>
        </div>
        <div class="flex items-center gap-1 lg:gap-2">
          <Users class="h-3 w-3 lg:h-4 lg:w-4 text-muted-foreground" />
          <span>{{ zone.mobCount }} mobs</span>
        </div>
        <div class="flex items-center gap-1 lg:gap-2">
          <Package class="h-3 w-3 lg:h-4 lg:w-4 text-muted-foreground" />
          <span>{{ zone.objectCount }} objs</span>
        </div>
        <div class="flex-1" />
        <Button
          variant="outline"
          size="sm"
          @click="showRoomList = !showRoomList"
          class="gap-1 lg:gap-2 text-xs lg:text-sm h-7 lg:h-8"
        >
          <List class="h-3 w-3 lg:h-4 lg:w-4" />
          <span class="hidden sm:inline">Room List</span>
          <span class="sm:hidden">Rooms</span>
          <ChevronUp v-if="showRoomList" class="h-3 w-3 lg:h-4 lg:w-4" />
          <ChevronDown v-else class="h-3 w-3 lg:h-4 lg:w-4" />
        </Button>
      </div>

      <!-- Room List Dropdown -->
      <div v-if="showRoomList" class="border-b bg-muted/30 max-h-64 overflow-hidden">
        <ScrollArea class="h-full max-h-64">
          <div class="divide-y">
            <div
              v-for="room in zone.rooms"
              :key="room.vnum"
              class="px-4 py-2 cursor-pointer hover:bg-muted/50 transition-colors flex items-center gap-3"
              :class="{ 'bg-muted': selectedRoom?.vnum === room.vnum }"
              @click="selectRoom(room)"
            >
              <span
                class="w-3 h-3 rounded-sm shrink-0"
                :class="getSectorColor(room.sectorType)"
              ></span>
              <span class="font-mono text-xs text-muted-foreground w-16 shrink-0">#{{ room.vnum }}</span>
              <span class="truncate">
                <AnsiText :text="room.name" />
              </span>
            </div>
          </div>
        </ScrollArea>
      </div>

      <!-- Mobile: Tabbed Layout -->
      <Tabs v-model="mobileTab" class="flex-1 flex flex-col lg:hidden overflow-hidden">
        <TabsList class="mx-3 mt-2 grid w-auto grid-cols-2">
          <TabsTrigger value="details" class="gap-1">
            <FileText class="h-4 w-4" />
            Details
          </TabsTrigger>
          <TabsTrigger value="map" class="gap-1">
            <MapIcon class="h-4 w-4" />
            Map
          </TabsTrigger>
        </TabsList>
        <TabsContent value="details" class="flex-1 m-0 overflow-hidden">
          <div class="h-full flex flex-col bg-black text-zinc-100 font-mono text-sm overflow-hidden">
            <ScrollArea class="flex-1">
              <div v-if="selectedRoom" class="p-3 space-y-3">
                <!-- Room Name with VNUM -->
                <div class="text-cyan-400 font-bold text-sm">
                  <span class="text-zinc-500 font-normal mr-2">#{{ selectedRoom.vnum }}</span>
                  <AnsiText :text="selectedRoom.name" />
                </div>
                <!-- Room Description -->
                <div class="text-zinc-300 whitespace-pre-wrap leading-relaxed text-xs">
                  <AnsiText :text="selectedRoom.description || 'No description.'" />
                </div>
                <!-- Exits -->
                <div class="pt-2 border-t border-zinc-800 text-xs">
                  <span class="text-green-400">Obvious exits: </span>
                  <span class="text-zinc-300">{{ formattedExits }}</span>
                </div>
                <!-- Room Contents -->
                <div v-if="currentRoomSpawns.length > 0" class="pt-2 space-y-1 text-xs">
                  <div v-for="spawn in currentRoomSpawns" :key="`m-${spawn.type}-${spawn.vnum}`" class="cursor-pointer hover:text-cyan-300 flex items-center gap-2" @click="goToSpawn(spawn)">
                    <AnsiText :text="spawn.name" />
                    <span v-if="spawn.isShopkeeper" class="text-xs text-amber-400 bg-amber-400/10 px-1 py-0.5 rounded">(Shop)</span>
                  </div>
                </div>
                <!-- Exit Links -->
                <div v-if="selectedRoom.exits.length > 0" class="pt-3 border-t border-zinc-800">
                  <div class="text-xs text-zinc-500 mb-2">Navigate to:</div>
                  <div class="flex flex-wrap gap-1">
                    <Button v-for="exit in selectedRoom.exits" :key="`m-${exit.direction}`" variant="outline" size="sm" class="font-mono text-xs h-auto py-1 px-2" :class="{ 'border-amber-500/50 text-amber-400': exit.hasDoor }" @click="navigateToRoom(exit.toRoom)">
                      {{ exit.direction }}
                    </Button>
                  </div>
                </div>
                <!-- Shop Items -->
                <div v-if="currentRoomShopkeepers.length > 0" class="pt-3 border-t border-zinc-800">
                  <div v-for="shopkeeper in currentRoomShopkeepers" :key="`m-shop-${shopkeeper.vnum}`" class="mb-3 last:mb-0">
                    <div class="flex items-center gap-2 mb-2">
                      <Store class="h-3 w-3 text-amber-400" />
                      <span class="text-xs text-amber-400 font-medium truncate">
                        <AnsiText :text="shopkeeper.shortDesc" /> sells:
                      </span>
                    </div>
                    <div class="space-y-1 ml-5">
                      <div v-for="item in shopkeeper.shopItems" :key="`m-${item.vnum}`" class="text-xs cursor-pointer hover:text-cyan-300" @click="goToShopItem(item)">
                        <AnsiText :text="item.name" />
                        <span v-if="item.price" class="text-zinc-500 ml-1">
                          {{ getWealthParts(item.price).plat > 0 ? getWealthParts(item.price).plat + 'p ' : '' }}{{ getWealthParts(item.price).gold > 0 ? getWealthParts(item.price).gold + 'g' : '' }}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
              <div v-else class="h-full flex items-center justify-center text-zinc-500 p-4 text-sm">
                Select a room from the list or map
              </div>
            </ScrollArea>
          </div>
        </TabsContent>
        <TabsContent value="map" class="flex-1 m-0 overflow-hidden">
          <WikiZoneMap
            :rooms="mapRooms"
            :selected-room-vnum="selectedRoom?.vnum ?? null"
            :zone-name="zone.name"
            @select-room="selectRoomByVnum"
          />
        </TabsContent>
      </Tabs>

      <!-- Desktop: Two-Column Layout with Resizable Panels -->
      <div class="flex-1 hidden lg:block overflow-hidden">
        <ResizablePanelGroup direction="horizontal" class="h-full">
        <!-- Left Panel: MUD-style Room Display -->
        <ResizablePanel :default-size="50" :min-size="30">
          <div class="h-full flex flex-col bg-black text-zinc-100 font-mono text-sm overflow-hidden">
            <ScrollArea class="flex-1">
              <div v-if="selectedRoom" class="p-4 space-y-4">
                <!-- Room Name with VNUM -->
                <div class="text-cyan-400 font-bold">
                  <span class="text-zinc-500 font-normal mr-2">#{{ selectedRoom.vnum }}</span>
                  <AnsiText :text="selectedRoom.name" />
                </div>

                <!-- Room Description -->
                <div class="text-zinc-300 whitespace-pre-wrap leading-relaxed">
                  <AnsiText :text="selectedRoom.description || 'No description.'" />
                </div>

                <!-- Exits -->
                <div class="pt-2 border-t border-zinc-800">
                  <span class="text-green-400">Obvious exits: </span>
                  <span class="text-zinc-300">{{ formattedExits }}</span>
                </div>

                <!-- Room Contents (mobs and objects) -->
                <div v-if="currentRoomSpawns.length > 0" class="pt-2 space-y-1">
                  <div
                    v-for="spawn in currentRoomSpawns"
                    :key="`${spawn.type}-${spawn.vnum}`"
                    class="cursor-pointer hover:text-cyan-300 transition-colors flex items-center gap-2"
                    @click="goToSpawn(spawn)"
                  >
                    <AnsiText :text="spawn.name" />
                    <span
                      v-if="spawn.isShopkeeper"
                      class="text-xs text-amber-400 bg-amber-400/10 px-1.5 py-0.5 rounded"
                    >(Shopkeeper)</span>
                  </div>
                </div>

                <!-- Exit Links -->
                <div v-if="selectedRoom.exits.length > 0" class="pt-4 border-t border-zinc-800">
                  <div class="text-xs text-zinc-500 mb-2">Navigate to:</div>
                  <div class="flex flex-col gap-1">
                    <Button
                      v-for="exit in selectedRoom.exits"
                      :key="exit.direction"
                      variant="outline"
                      size="sm"
                      class="font-mono text-xs justify-start h-auto py-1.5 px-2"
                      :class="{ 'border-amber-500/50 text-amber-400': exit.hasDoor }"
                      @click="navigateToRoom(exit.toRoom)"
                    >
                      <span class="w-20 text-left">{{ exit.direction }}</span>
                      <span class="text-muted-foreground">#{{ exit.toRoom }}</span>
                      <span v-if="getRoomName(exit.toRoom)" class="ml-2 truncate text-zinc-400">
                        <AnsiText :text="getRoomName(exit.toRoom)" />
                      </span>
                    </Button>
                  </div>
                </div>

                <!-- Shop Items Section -->
                <div v-if="currentRoomShopkeepers.length > 0" class="pt-4 border-t border-zinc-800">
                  <div v-for="shopkeeper in currentRoomShopkeepers" :key="`shop-${shopkeeper.vnum}`" class="mb-4 last:mb-0">
                    <div class="flex items-center gap-2 mb-2">
                      <Store class="h-4 w-4 text-amber-400" />
                      <span class="text-xs text-amber-400 font-medium">
                        <AnsiText :text="shopkeeper.shortDesc" /> sells:
                      </span>
                      <span class="text-xs text-zinc-500">(base price)</span>
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger as-child>
                            <Info class="h-3.5 w-3.5 text-zinc-500 cursor-help" />
                          </TooltipTrigger>
                          <TooltipContent side="top" class="max-w-xs text-xs bg-zinc-900 text-zinc-100 border border-zinc-700">
                            <p class="font-medium mb-1">Price Formula</p>
                            <p class="text-zinc-400">Base price = item cost x shop sell multiplier</p>
                            <p class="text-zinc-400 mt-1">Actual in-game price varies based on your character's charisma, race match with shopkeeper, barter ability, and epic bonuses.</p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </div>
                    <table class="w-full text-xs ml-6">
                      <tbody>
                        <tr
                          v-for="item in shopkeeper.shopItems"
                          :key="item.vnum"
                          class="cursor-pointer hover:text-cyan-300 transition-colors"
                          @click="goToShopItem(item)"
                        >
                          <td class="py-0.5 pr-2 text-white font-mono whitespace-nowrap">
                            #{{ item.vnum }}
                          </td>
                          <td class="py-0.5 pr-2">
                            <AnsiText :text="item.name" />
                          </td>
                          <td class="py-0.5 pr-2 whitespace-nowrap">
                            <template v-if="item.price">
                              <template v-if="getWealthParts(item.price).plat > 0">
                                <span class="text-zinc-300">{{ getWealthParts(item.price).plat.toLocaleString() }}</span><span class="text-white font-semibold">p </span>
                              </template>
                              <template v-if="getWealthParts(item.price).gold > 0">
                                <span class="text-zinc-300">{{ getWealthParts(item.price).gold }}</span><span class="text-yellow-300">g </span>
                              </template>
                              <template v-if="getWealthParts(item.price).silver > 0">
                                <span class="text-zinc-300">{{ getWealthParts(item.price).silver }}</span><span class="text-zinc-400">s </span>
                              </template>
                              <template v-if="getWealthParts(item.price).copper > 0">
                                <span class="text-zinc-300">{{ getWealthParts(item.price).copper }}</span><span class="text-amber-700">c</span>
                              </template>
                            </template>
                            <span v-else>-</span>
                          </td>
                          <td class="py-0.5 text-zinc-600 whitespace-nowrap">
                            {{ item.itemTypeName || '' }}
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>

              <!-- No Room Selected -->
              <div v-else class="h-full flex items-center justify-center text-zinc-500 p-4">
                Click a room on the map to view details
              </div>
            </ScrollArea>
          </div>
        </ResizablePanel>

        <ResizableHandle />

        <!-- Right Panel: Zone Map -->
        <ResizablePanel :default-size="50" :min-size="30">
          <WikiZoneMap
            :rooms="mapRooms"
            :selected-room-vnum="selectedRoom?.vnum ?? null"
            :zone-name="zone.name"
            @select-room="selectRoomByVnum"
          />
        </ResizablePanel>
        </ResizablePanelGroup>
      </div>
    </div>
  </div>
</template>
