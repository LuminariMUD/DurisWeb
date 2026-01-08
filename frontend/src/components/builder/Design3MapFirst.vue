<script setup lang="ts">
import { ref, computed } from 'vue'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Plus,
  Move,
  MousePointer,
  Link,
  Trash2,
  ZoomIn,
  ZoomOut,
  LayoutGrid,
  List,
  Code,
  Map,
} from 'lucide-vue-next'

const viewMode = ref('map')
const zoom = ref(100)
const selectedRoom = ref<number | null>(34502)

// Room nodes for the map
const rooms = ref([
  { vnum: 34500, name: 'Start', x: 300, y: 50, sector: 'inside' },
  { vnum: 34501, name: 'Hall', x: 200, y: 150, sector: 'inside' },
  { vnum: 34502, name: 'Arena', x: 400, y: 150, sector: 'arena' },
  { vnum: 34503, name: 'Armory', x: 400, y: 250, sector: 'inside' },
  { vnum: 34504, name: 'Training', x: 200, y: 250, sector: 'inside' },
  { vnum: 34505, name: 'Storage', x: 300, y: 350, sector: 'inside' },
])

// Connections (exits)
const connections = ref([
  { from: 34500, to: 34501, dir: 'south' },
  { from: 34500, to: 34502, dir: 'east' },
  { from: 34501, to: 34504, dir: 'south' },
  { from: 34502, to: 34503, dir: 'south' },
  { from: 34503, to: 34505, dir: 'west' },
  { from: 34504, to: 34505, dir: 'east' },
])

const selectedRoomData = computed(() => {
  return rooms.value.find(r => r.vnum === selectedRoom.value) || null
})

function getRoomPosition(vnum: number) {
  const room = rooms.value.find(r => r.vnum === vnum)
  return room ? { x: room.x, y: room.y } : { x: 0, y: 0 }
}

function getConnectionPath(conn: typeof connections.value[0]) {
  const from = getRoomPosition(conn.from)
  const to = getRoomPosition(conn.to)
  // Simple line for now
  return `M ${from.x + 40} ${from.y + 20} L ${to.x + 40} ${to.y + 20}`
}

function getSectorColor(sector: string) {
  switch (sector) {
    case 'inside': return 'bg-zinc-700 border-zinc-600'
    case 'arena': return 'bg-red-900/50 border-red-700'
    case 'city': return 'bg-amber-900/50 border-amber-700'
    case 'forest': return 'bg-green-900/50 border-green-700'
    case 'water': return 'bg-blue-900/50 border-blue-700'
    default: return 'bg-zinc-700 border-zinc-600'
  }
}

function selectRoom(vnum: number) {
  selectedRoom.value = vnum
}

function zoomIn() {
  zoom.value = Math.min(200, zoom.value + 25)
}

function zoomOut() {
  zoom.value = Math.max(25, zoom.value - 25)
}
</script>

<template>
  <div class="h-[calc(100vh-140px)] bg-zinc-950 flex flex-col">
    <!-- Header -->
    <div class="px-4 py-3 border-b border-zinc-800 flex items-center justify-between bg-zinc-900/50">
      <div class="flex items-center gap-4">
        <h2 class="text-lg font-semibold text-zinc-100">Zone 345: CTF Tournament</h2>
        <Badge variant="outline" class="bg-green-500/20 text-green-400 border-green-500/30">
          Published
        </Badge>
      </div>
      <div class="flex items-center gap-2">
        <Tabs v-model="viewMode" class="h-9">
          <TabsList class="bg-zinc-800 h-9">
            <TabsTrigger value="list" class="h-7 px-3 data-[state=active]:bg-zinc-700">
              <List class="h-4 w-4" />
            </TabsTrigger>
            <TabsTrigger value="map" class="h-7 px-3 data-[state=active]:bg-zinc-700">
              <Map class="h-4 w-4" />
            </TabsTrigger>
            <TabsTrigger value="code" class="h-7 px-3 data-[state=active]:bg-zinc-700">
              <Code class="h-4 w-4" />
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </div>
    </div>

    <div class="flex-1 flex">
      <!-- Map Area -->
      <div class="flex-1 relative bg-zinc-950 overflow-hidden">
        <!-- Map Canvas -->
        <div
          class="absolute inset-0 overflow-auto"
          :style="{ transform: `scale(${zoom / 100})`, transformOrigin: 'top left' }"
        >
          <svg class="w-[800px] h-[500px]">
            <!-- Grid Pattern -->
            <defs>
              <pattern id="grid" width="50" height="50" patternUnits="userSpaceOnUse">
                <path d="M 50 0 L 0 0 0 50" fill="none" stroke="#27272a" stroke-width="1"/>
              </pattern>
            </defs>
            <rect width="100%" height="100%" fill="url(#grid)" />

            <!-- Connections -->
            <g>
              <path
                v-for="(conn, idx) in connections"
                :key="idx"
                :d="getConnectionPath(conn)"
                stroke="#3f3f46"
                stroke-width="2"
                fill="none"
                marker-end="url(#arrowhead)"
              />
            </g>

            <!-- Arrow marker -->
            <defs>
              <marker id="arrowhead" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">
                <polygon points="0 0, 10 3.5, 0 7" fill="#3f3f46" />
              </marker>
            </defs>
          </svg>

          <!-- Room Nodes -->
          <div
            v-for="room in rooms"
            :key="room.vnum"
            class="absolute cursor-pointer transition-all duration-150"
            :style="{ left: `${room.x}px`, top: `${room.y}px` }"
            @click="selectRoom(room.vnum)"
          >
            <div
              class="w-20 h-10 rounded-lg border-2 flex items-center justify-center transition-all"
              :class="[
                getSectorColor(room.sector),
                selectedRoom === room.vnum
                  ? 'ring-2 ring-blue-500 ring-offset-2 ring-offset-zinc-950'
                  : 'hover:ring-1 hover:ring-zinc-500'
              ]"
            >
              <div class="text-center">
                <div class="text-[10px] font-mono text-zinc-400">#{{ room.vnum }}</div>
                <div class="text-xs font-medium text-zinc-200 truncate w-16">{{ room.name }}</div>
              </div>
            </div>
          </div>
        </div>

        <!-- Map Toolbar -->
        <div class="absolute top-4 left-4 flex flex-col gap-1 bg-zinc-900 border border-zinc-800 rounded-lg p-1">
          <Button variant="ghost" size="icon" class="h-8 w-8" title="Select">
            <MousePointer class="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" class="h-8 w-8" title="Move">
            <Move class="h-4 w-4" />
          </Button>
          <div class="border-t border-zinc-800 my-1" />
          <Button variant="ghost" size="icon" class="h-8 w-8" title="Add Room">
            <Plus class="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" class="h-8 w-8" title="Add Exit">
            <Link class="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" class="h-8 w-8 text-red-400" title="Delete">
            <Trash2 class="h-4 w-4" />
          </Button>
        </div>

        <!-- Zoom Controls -->
        <div class="absolute bottom-4 left-4 flex items-center gap-2 bg-zinc-900 border border-zinc-800 rounded-lg p-2">
          <Button variant="ghost" size="icon" class="h-7 w-7" @click="zoomOut">
            <ZoomOut class="h-4 w-4" />
          </Button>
          <span class="text-xs text-zinc-400 w-12 text-center">{{ zoom }}%</span>
          <Button variant="ghost" size="icon" class="h-7 w-7" @click="zoomIn">
            <ZoomIn class="h-4 w-4" />
          </Button>
          <div class="border-l border-zinc-800 ml-1 pl-2">
            <Button variant="ghost" size="icon" class="h-7 w-7" title="Auto-Layout">
              <LayoutGrid class="h-4 w-4" />
            </Button>
          </div>
        </div>

        <!-- Minimap -->
        <div class="absolute bottom-4 right-4 w-32 h-24 bg-zinc-900 border border-zinc-800 rounded-lg overflow-hidden">
          <div class="w-full h-full relative p-1">
            <div
              v-for="room in rooms"
              :key="`mini-${room.vnum}`"
              class="absolute w-2 h-2 rounded-sm"
              :class="selectedRoom === room.vnum ? 'bg-blue-500' : 'bg-zinc-600'"
              :style="{ left: `${room.x / 8}px`, top: `${room.y / 6}px` }"
            />
          </div>
        </div>
      </div>

      <!-- Selected Room Panel -->
      <div class="w-80 border-l border-zinc-800 bg-zinc-900/50 flex flex-col">
        <div class="p-4 border-b border-zinc-800">
          <h3 class="text-sm font-semibold text-zinc-300 uppercase tracking-wider">
            Selected Room
          </h3>
        </div>

        <div v-if="selectedRoomData" class="flex-1 overflow-auto p-4 space-y-4">
          <!-- Room Header -->
          <div class="space-y-2">
            <div class="flex items-center justify-between">
              <Badge variant="outline" class="font-mono">#{{ selectedRoomData.vnum }}</Badge>
              <Badge
                :class="getSectorColor(selectedRoomData.sector)"
                variant="outline"
              >
                {{ selectedRoomData.sector }}
              </Badge>
            </div>
            <Input
              :value="selectedRoomData.name"
              class="bg-zinc-900 border-zinc-700 text-zinc-100 font-semibold"
            />
          </div>

          <!-- Quick Stats -->
          <div class="grid grid-cols-2 gap-2">
            <div class="bg-zinc-950/50 rounded-md p-2 text-center">
              <div class="text-lg font-bold text-zinc-100">4</div>
              <div class="text-xs text-zinc-500">Exits</div>
            </div>
            <div class="bg-zinc-950/50 rounded-md p-2 text-center">
              <div class="text-lg font-bold text-zinc-100">2</div>
              <div class="text-xs text-zinc-500">Extras</div>
            </div>
          </div>

          <!-- Description Preview -->
          <div class="space-y-2">
            <Label class="text-zinc-400 text-xs uppercase">Description</Label>
            <div class="bg-zinc-950 border border-zinc-800 rounded-md p-3 text-sm text-zinc-400 max-h-32 overflow-hidden">
              A vast circular arena stretches before you, its sandy floor stained
              with the memories of countless battles. Stone bleachers rise on all
              sides, though they now sit empty and silent...
            </div>
            <Button variant="outline" size="sm" class="w-full">
              Edit Full Description
            </Button>
          </div>

          <!-- Flags -->
          <div class="space-y-2">
            <Label class="text-zinc-400 text-xs uppercase">Flags</Label>
            <div class="flex flex-wrap gap-1">
              <Badge variant="secondary" class="text-xs">DARK</Badge>
              <Badge variant="secondary" class="text-xs">NO_MAGIC</Badge>
              <Badge variant="secondary" class="text-xs">ARENA</Badge>
              <Button variant="ghost" size="sm" class="h-6 px-2 text-xs">
                <Plus class="h-3 w-3 mr-1" />
                Add
              </Button>
            </div>
          </div>

          <!-- Exits -->
          <div class="space-y-2">
            <Label class="text-zinc-400 text-xs uppercase">Exits</Label>
            <div class="space-y-1">
              <div class="flex items-center justify-between p-2 bg-zinc-950/50 rounded-md">
                <span class="text-sm text-zinc-300">North</span>
                <span class="text-sm text-blue-400 font-mono">#34500</span>
              </div>
              <div class="flex items-center justify-between p-2 bg-zinc-950/50 rounded-md">
                <span class="text-sm text-zinc-300">South</span>
                <span class="text-sm text-blue-400 font-mono">#34503</span>
              </div>
            </div>
          </div>

          <!-- Actions -->
          <div class="pt-4 border-t border-zinc-800 space-y-2">
            <Button class="w-full">
              Open Full Editor
            </Button>
            <Button variant="outline" class="w-full text-red-400 hover:text-red-300">
              <Trash2 class="h-4 w-4 mr-2" />
              Delete Room
            </Button>
          </div>
        </div>

        <div v-else class="flex-1 flex items-center justify-center text-zinc-500">
          <div class="text-center">
            <MousePointer class="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p class="text-sm">Click a room to select it</p>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
