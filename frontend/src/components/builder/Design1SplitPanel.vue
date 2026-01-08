<script setup lang="ts">
import { ref } from 'vue'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  ChevronDown,
  ChevronRight,
  FolderOpen,
  FileText,
  Users,
  Package,
  RefreshCw,
  Plus,
  Save,
  X,
  Eye,
  ArrowUp,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  Circle,
} from 'lucide-vue-next'

// Sample data
const zones = ref([
  {
    id: 345,
    name: 'CTF Tournament',
    expanded: true,
    rooms: [
      { vnum: 34500, name: 'A Recently Unearthed Chamber', selected: true },
      { vnum: 34501, name: 'The Grand Hall' },
      { vnum: 34502, name: 'The Arena' },
      { vnum: 34503, name: 'The Armory' },
    ],
    mobs: [
      { vnum: 83100, name: 'entry guard' },
      { vnum: 83101, name: 'arena master' },
    ],
    objects: [
      { vnum: 67900, name: 'arena portal' },
      { vnum: 67901, name: 'tournament trophy' },
    ],
  },
  {
    id: 346,
    name: 'Dark Forest',
    expanded: false,
    rooms: [],
    mobs: [],
    objects: [],
  },
])

const selectedRoom = ref({
  vnum: 34500,
  name: 'A Recently Unearthed Chamber',
  description: `   A recent earthquake has revealed a crack in the mountains, leading to a
hollowed out ancient chamber.  Strong circular pillars support the large
amount of earth and rock above, while dust covers the floor and walls.  A
large tome sits on a pedestal in the center of the room.`,
  sector: 'inside',
  flags: ['DARK', 'INDOORS'],
  exits: {
    north: { to: 34501, door: 'passage' },
    east: null,
    south: null,
    west: null,
    up: null,
    down: null,
  },
})

const allFlags = [
  'DARK', 'DEATH', 'NO_MOB', 'INDOORS', 'NO_MAGIC', 'TUNNEL', 'PRIVATE',
  'GODROOM', 'UNDERWATER', 'NO_TELEPORT', 'PEACEFUL', 'ARENA',
]

const sectors = [
  'inside', 'city', 'field', 'forest', 'hills', 'mountain', 'water_swim',
  'water_noswim', 'underwater', 'flying', 'desert', 'arctic',
]

const expandedSections = ref({
  rooms: true,
  mobs: false,
  objects: false,
  resets: false,
})

function toggleZone(zone: typeof zones.value[0]) {
  zone.expanded = !zone.expanded
}

function toggleSection(section: keyof typeof expandedSections.value) {
  expandedSections.value[section] = !expandedSections.value[section]
}

function isChecked(flag: string) {
  return selectedRoom.value.flags.includes(flag)
}

function toggleFlag(flag: string) {
  const idx = selectedRoom.value.flags.indexOf(flag)
  if (idx >= 0) {
    selectedRoom.value.flags.splice(idx, 1)
  } else {
    selectedRoom.value.flags.push(flag)
  }
}
</script>

<template>
  <div class="flex h-[calc(100vh-140px)] bg-zinc-950">
    <!-- Left Panel: Zone Tree -->
    <div class="w-64 border-r border-zinc-800 bg-zinc-900/50 flex flex-col">
      <div class="p-3 border-b border-zinc-800">
        <h2 class="text-sm font-semibold text-zinc-300 uppercase tracking-wider">Zones</h2>
      </div>
      <ScrollArea class="flex-1">
        <div class="p-2">
          <div v-for="zone in zones" :key="zone.id" class="mb-1">
            <!-- Zone Header -->
            <button
              @click="toggleZone(zone)"
              class="flex items-center gap-2 w-full px-2 py-1.5 text-sm rounded hover:bg-zinc-800 text-zinc-300"
            >
              <component :is="zone.expanded ? ChevronDown : ChevronRight" class="h-4 w-4 text-zinc-500" />
              <FolderOpen class="h-4 w-4 text-amber-500" />
              <span>Zone {{ zone.id }}</span>
            </button>

            <!-- Zone Contents -->
            <div v-if="zone.expanded" class="ml-4 mt-1 space-y-1">
              <!-- Rooms Section -->
              <div>
                <button
                  @click="toggleSection('rooms')"
                  class="flex items-center gap-2 w-full px-2 py-1 text-sm rounded hover:bg-zinc-800 text-zinc-400"
                >
                  <component :is="expandedSections.rooms ? ChevronDown : ChevronRight" class="h-3 w-3" />
                  <FileText class="h-3.5 w-3.5 text-blue-400" />
                  <span>Rooms ({{ zone.rooms.length }})</span>
                </button>
                <div v-if="expandedSections.rooms" class="ml-5 mt-1">
                  <button
                    v-for="room in zone.rooms"
                    :key="room.vnum"
                    class="flex items-center gap-2 w-full px-2 py-1 text-xs rounded hover:bg-zinc-800"
                    :class="room.selected ? 'bg-blue-900/50 text-blue-300' : 'text-zinc-500'"
                  >
                    <span class="font-mono">#{{ room.vnum }}</span>
                  </button>
                </div>
              </div>

              <!-- Mobs Section -->
              <div>
                <button
                  @click="toggleSection('mobs')"
                  class="flex items-center gap-2 w-full px-2 py-1 text-sm rounded hover:bg-zinc-800 text-zinc-400"
                >
                  <component :is="expandedSections.mobs ? ChevronDown : ChevronRight" class="h-3 w-3" />
                  <Users class="h-3.5 w-3.5 text-green-400" />
                  <span>Mobs ({{ zone.mobs.length }})</span>
                </button>
              </div>

              <!-- Objects Section -->
              <div>
                <button
                  @click="toggleSection('objects')"
                  class="flex items-center gap-2 w-full px-2 py-1 text-sm rounded hover:bg-zinc-800 text-zinc-400"
                >
                  <component :is="expandedSections.objects ? ChevronDown : ChevronRight" class="h-3 w-3" />
                  <Package class="h-3.5 w-3.5 text-purple-400" />
                  <span>Objects ({{ zone.objects.length }})</span>
                </button>
              </div>

              <!-- Resets Section -->
              <div>
                <button
                  @click="toggleSection('resets')"
                  class="flex items-center gap-2 w-full px-2 py-1 text-sm rounded hover:bg-zinc-800 text-zinc-400"
                >
                  <component :is="expandedSections.resets ? ChevronDown : ChevronRight" class="h-3 w-3" />
                  <RefreshCw class="h-3.5 w-3.5 text-orange-400" />
                  <span>Resets</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </ScrollArea>
      <div class="p-3 border-t border-zinc-800">
        <Button variant="outline" size="sm" class="w-full">
          <Plus class="h-4 w-4 mr-2" />
          New Zone
        </Button>
      </div>
    </div>

    <!-- Center Panel: Editor -->
    <div class="flex-1 flex flex-col bg-zinc-950">
      <!-- Editor Header -->
      <div class="px-4 py-3 border-b border-zinc-800 flex items-center justify-between bg-zinc-900/30">
        <div>
          <h3 class="text-lg font-semibold text-zinc-100">
            Room #{{ selectedRoom.vnum }}
          </h3>
          <p class="text-sm text-zinc-500">{{ selectedRoom.name }}</p>
        </div>
        <div class="flex gap-2">
          <Button variant="outline" size="sm">
            <Eye class="h-4 w-4 mr-2" />
            Preview
          </Button>
          <Button variant="outline" size="sm">
            <X class="h-4 w-4 mr-2" />
            Discard
          </Button>
          <Button size="sm">
            <Save class="h-4 w-4 mr-2" />
            Save
          </Button>
        </div>
      </div>

      <ScrollArea class="flex-1">
        <div class="p-4 space-y-4">
          <!-- Room Name -->
          <div class="space-y-2">
            <Label class="text-zinc-400">Room Name</Label>
            <div class="flex gap-2">
              <Input
                v-model="selectedRoom.name"
                class="bg-zinc-900 border-zinc-700 text-zinc-100"
              />
              <Button variant="outline" size="icon" title="Color codes">
                <span class="text-lg">A</span>
              </Button>
            </div>
          </div>

          <!-- Description -->
          <div class="space-y-2">
            <Label class="text-zinc-400">Description</Label>
            <textarea
              v-model="selectedRoom.description"
              rows="8"
              class="w-full bg-zinc-900 border border-zinc-700 rounded-md px-3 py-2 text-zinc-100 font-mono text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <!-- Color Toolbar -->
            <div class="flex gap-1 flex-wrap">
              <Button variant="outline" size="sm" class="h-7 px-2 text-red-500 hover:text-red-400">R</Button>
              <Button variant="outline" size="sm" class="h-7 px-2 text-green-500 hover:text-green-400">G</Button>
              <Button variant="outline" size="sm" class="h-7 px-2 text-blue-500 hover:text-blue-400">B</Button>
              <Button variant="outline" size="sm" class="h-7 px-2 text-yellow-500 hover:text-yellow-400">Y</Button>
              <Button variant="outline" size="sm" class="h-7 px-2 text-cyan-500 hover:text-cyan-400">C</Button>
              <Button variant="outline" size="sm" class="h-7 px-2 text-purple-500 hover:text-purple-400">M</Button>
              <Button variant="outline" size="sm" class="h-7 px-2 text-white hover:text-zinc-300">W</Button>
              <Button variant="outline" size="sm" class="h-7 px-2 text-zinc-400 hover:text-zinc-300">N</Button>
            </div>
          </div>

          <!-- Preview -->
          <div class="space-y-2">
            <Label class="text-zinc-400">Preview (Rendered)</Label>
            <div class="bg-black border border-zinc-800 rounded-md p-4 font-mono text-sm">
              <div class="text-white font-bold">{{ selectedRoom.name }}</div>
              <div class="text-zinc-300 whitespace-pre-wrap mt-2">{{ selectedRoom.description }}</div>
            </div>
          </div>
        </div>
      </ScrollArea>
    </div>

    <!-- Right Panel: Properties -->
    <div class="w-72 border-l border-zinc-800 bg-zinc-900/50 flex flex-col">
      <div class="p-3 border-b border-zinc-800">
        <h2 class="text-sm font-semibold text-zinc-300 uppercase tracking-wider">Properties</h2>
      </div>
      <ScrollArea class="flex-1">
        <div class="p-4 space-y-6">
          <!-- Sector -->
          <div class="space-y-2">
            <Label class="text-zinc-400">Sector Type</Label>
            <Select v-model="selectedRoom.sector">
              <SelectTrigger class="bg-zinc-900 border-zinc-700 text-zinc-100">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem v-for="s in sectors" :key="s" :value="s">
                  {{ s }}
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          <!-- Flags -->
          <div class="space-y-2">
            <Label class="text-zinc-400">Room Flags</Label>
            <div class="space-y-1.5 max-h-48 overflow-y-auto">
              <div
                v-for="flag in allFlags"
                :key="flag"
                class="flex items-center gap-2"
              >
                <Checkbox
                  :id="`flag-${flag}`"
                  :checked="isChecked(flag)"
                  @update:checked="toggleFlag(flag)"
                />
                <label
                  :for="`flag-${flag}`"
                  class="text-sm text-zinc-300 cursor-pointer"
                >
                  {{ flag }}
                </label>
              </div>
            </div>
          </div>

          <!-- Exits -->
          <div class="space-y-2">
            <Label class="text-zinc-400">Exits</Label>
            <div class="space-y-2">
              <div class="flex items-center gap-2">
                <ArrowUp class="h-4 w-4 text-zinc-500" />
                <span class="text-sm text-zinc-300 w-8">N</span>
                <span class="text-sm text-blue-400 flex-1">#34501</span>
                <Button variant="ghost" size="sm" class="h-6 px-2 text-xs">Edit</Button>
              </div>
              <div class="flex items-center gap-2">
                <ArrowRight class="h-4 w-4 text-zinc-500" />
                <span class="text-sm text-zinc-300 w-8">E</span>
                <span class="text-sm text-zinc-600 flex-1">---</span>
                <Button variant="ghost" size="sm" class="h-6 px-2 text-xs">
                  <Plus class="h-3 w-3" />
                </Button>
              </div>
              <div class="flex items-center gap-2">
                <ArrowDown class="h-4 w-4 text-zinc-500" />
                <span class="text-sm text-zinc-300 w-8">S</span>
                <span class="text-sm text-zinc-600 flex-1">---</span>
                <Button variant="ghost" size="sm" class="h-6 px-2 text-xs">
                  <Plus class="h-3 w-3" />
                </Button>
              </div>
              <div class="flex items-center gap-2">
                <ArrowLeft class="h-4 w-4 text-zinc-500" />
                <span class="text-sm text-zinc-300 w-8">W</span>
                <span class="text-sm text-zinc-600 flex-1">---</span>
                <Button variant="ghost" size="sm" class="h-6 px-2 text-xs">
                  <Plus class="h-3 w-3" />
                </Button>
              </div>
              <div class="flex items-center gap-2">
                <Circle class="h-4 w-4 text-zinc-500" />
                <span class="text-sm text-zinc-300 w-8">U</span>
                <span class="text-sm text-zinc-600 flex-1">---</span>
                <Button variant="ghost" size="sm" class="h-6 px-2 text-xs">
                  <Plus class="h-3 w-3" />
                </Button>
              </div>
              <div class="flex items-center gap-2">
                <Circle class="h-4 w-4 text-zinc-500" />
                <span class="text-sm text-zinc-300 w-8">D</span>
                <span class="text-sm text-zinc-600 flex-1">---</span>
                <Button variant="ghost" size="sm" class="h-6 px-2 text-xs">
                  <Plus class="h-3 w-3" />
                </Button>
              </div>
            </div>
          </div>

          <!-- Extra Descriptions -->
          <div class="space-y-2">
            <Label class="text-zinc-400">Extra Descriptions</Label>
            <div class="bg-zinc-900/50 border border-zinc-800 rounded-md p-2">
              <div class="flex items-center justify-between">
                <span class="text-sm text-zinc-300">tome book pedestal</span>
                <Button variant="ghost" size="sm" class="h-6 px-2 text-xs">Edit</Button>
              </div>
            </div>
            <Button variant="outline" size="sm" class="w-full">
              <Plus class="h-4 w-4 mr-2" />
              Add Extra
            </Button>
          </div>
        </div>
      </ScrollArea>
    </div>
  </div>
</template>
