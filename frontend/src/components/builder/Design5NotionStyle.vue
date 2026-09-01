<script setup lang="ts">
import { ref } from 'vue'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  ChevronLeft,
  ChevronRight,
  MoreHorizontal,
  Share2,
  Download,
  Plus,
  X,
  Edit,
  Trash2,
  ArrowUp,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ChevronUp as ChevronUpIcon,
  ChevronDown as ChevronDownIcon,
  Eye,
  MapPin,
} from 'lucide-vue-next'

const room = ref({
  vnum: 34500,
  name: 'A Recently Unearthed Chamber',
  zone: { id: 345, name: 'CTF Tournament' },
  sector: 'inside',
  description: `   A recent earthquake has revealed a crack in the mountains, leading to a
hollowed out ancient chamber.  Strong circular pillars support the large
amount of earth and rock above, while dust covers the floor and walls.  A
large tome sits on a pedestal in the center of the room.`,
  flags: ['DARK', 'INDOORS'],
  exits: [{ direction: 'North', vnum: 34501, name: 'The Grand Hall', door: 'passage', key: null }],
  extras: [
    {
      keywords: 'tome book pedestal',
      description:
        'This ancient tome is covered with dust, but you can make out the title: "The History of the Ancients". It appears to be very old and valuable.',
    },
  ],
})

const sectors = [
  'inside',
  'city',
  'field',
  'forest',
  'hills',
  'mountain',
  'water_swim',
  'water_noswim',
  'underwater',
  'flying',
  'desert',
  'arctic',
]

const availableFlags = [
  'DARK',
  'DEATH',
  'NO_MOB',
  'INDOORS',
  'NO_MAGIC',
  'TUNNEL',
  'PRIVATE',
  'GODROOM',
  'UNDERWATER',
  'NO_TELEPORT',
  'PEACEFUL',
  'ARENA',
]

const connectedRooms = ref([
  {
    direction: 'North',
    vnum: 34501,
    name: 'The Grand Hall',
    description: 'A vast hall with marble pillars stretching to the ceiling...',
  },
])

function removeFlag(flag: string) {
  const idx = room.value.flags.indexOf(flag)
  if (idx >= 0) {
    room.value.flags.splice(idx, 1)
  }
}

function getDirectionIcon(dir: string) {
  switch (dir.toLowerCase()) {
    case 'north':
      return ArrowUp
    case 'south':
      return ArrowDown
    case 'east':
      return ArrowRight
    case 'west':
      return ArrowLeft
    case 'up':
      return ChevronUpIcon
    case 'down':
      return ChevronDownIcon
    default:
      return ArrowUp
  }
}
</script>

<template>
  <div class="min-h-[calc(100vh-140px)] bg-zinc-950">
    <!-- Navigation Header -->
    <div class="sticky top-0 z-10 border-b border-zinc-800 bg-zinc-950/95 backdrop-blur">
      <div class="max-w-4xl mx-auto px-6 py-3 flex items-center justify-between">
        <div class="flex items-center gap-3">
          <Button variant="ghost" size="icon" class="h-8 w-8">
            <ChevronLeft class="h-4 w-4" />
          </Button>
          <div class="flex items-center gap-2 text-sm text-zinc-400">
            <span class="hover:text-zinc-200 cursor-pointer">{{ room.zone.name }}</span>
            <ChevronRight class="h-3 w-3" />
            <span class="text-zinc-200">Room #{{ room.vnum }}</span>
          </div>
        </div>
        <div class="flex items-center gap-2">
          <Badge variant="outline" class="bg-green-500/20 text-green-400 border-green-500/30">
            Published
          </Badge>
          <Button variant="ghost" size="icon" class="h-8 w-8">
            <Share2 class="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" class="h-8 w-8">
            <Download class="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" class="h-8 w-8">
            <MoreHorizontal class="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>

    <ScrollArea class="h-[calc(100vh-200px)]">
      <div class="max-w-4xl mx-auto px-6 py-8">
        <!-- Title Block -->
        <div class="mb-8">
          <div class="text-sm text-zinc-500 mb-2 font-mono"># Room {{ room.vnum }}</div>
          <Input
            v-model="room.name"
            class="text-3xl font-bold bg-transparent border-none p-0 h-auto text-zinc-100 focus-visible:ring-0 placeholder:text-zinc-600"
            placeholder="Untitled Room"
          />
        </div>

        <!-- Properties Block -->
        <div class="mb-8 group">
          <div class="flex items-center gap-2 mb-3">
            <div class="w-1 h-4 bg-zinc-700 rounded-full opacity-0 group-hover:opacity-100 transition-opacity" />
            <h2 class="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Properties</h2>
          </div>
          <div class="pl-3 border-l border-zinc-800">
            <div class="flex flex-wrap gap-4 text-sm">
              <div class="flex items-center gap-2">
                <span class="text-zinc-500">Sector:</span>
                <Select v-model="room.sector">
                  <SelectTrigger class="h-7 bg-zinc-900/50 border-zinc-800 text-zinc-200 w-32">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem v-for="s in sectors" :key="s" :value="s">{{ s }}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div class="flex items-center gap-2">
                <span class="text-zinc-500">Zone:</span>
                <span class="text-zinc-200">{{ room.zone.name }}</span>
              </div>
              <div class="flex items-center gap-2">
                <span class="text-zinc-500">Vnum:</span>
                <span class="text-zinc-200 font-mono">{{ room.vnum }}</span>
              </div>
            </div>
          </div>
        </div>

        <!-- Description Block -->
        <div class="mb-8 group">
          <div class="flex items-center gap-2 mb-3">
            <div class="w-1 h-4 bg-blue-500 rounded-full opacity-0 group-hover:opacity-100 transition-opacity" />
            <h2 class="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Description</h2>
            <Button variant="ghost" size="sm" class="h-6 px-2 text-xs text-zinc-500 ml-auto opacity-0 group-hover:opacity-100">
              <Eye class="h-3 w-3 mr-1" />
              Preview
            </Button>
          </div>
          <div class="pl-3 border-l border-zinc-800">
            <textarea
              v-model="room.description"
              rows="6"
              class="w-full bg-zinc-900/30 border border-zinc-800 rounded-lg px-4 py-3 text-zinc-300 font-mono text-sm resize-none focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
              placeholder="Enter room description..."
            />
            <div class="flex items-center gap-1 mt-2">
              <span class="text-xs text-zinc-600 mr-2">Colors:</span>
              <button class="w-6 h-6 rounded bg-red-500/20 hover:bg-red-500/40 text-red-400 text-xs font-bold">R</button>
              <button class="w-6 h-6 rounded bg-green-500/20 hover:bg-green-500/40 text-green-400 text-xs font-bold">G</button>
              <button class="w-6 h-6 rounded bg-blue-500/20 hover:bg-blue-500/40 text-blue-400 text-xs font-bold">B</button>
              <button class="w-6 h-6 rounded bg-yellow-500/20 hover:bg-yellow-500/40 text-yellow-400 text-xs font-bold">Y</button>
              <button class="w-6 h-6 rounded bg-cyan-500/20 hover:bg-cyan-500/40 text-cyan-400 text-xs font-bold">C</button>
              <button class="w-6 h-6 rounded bg-white/20 hover:bg-white/40 text-white text-xs font-bold">W</button>
              <button class="w-6 h-6 rounded bg-zinc-500/20 hover:bg-zinc-500/40 text-zinc-400 text-xs font-bold">N</button>
            </div>
          </div>
        </div>

        <!-- Flags Block -->
        <div class="mb-8 group">
          <div class="flex items-center gap-2 mb-3">
            <div class="w-1 h-4 bg-purple-500 rounded-full opacity-0 group-hover:opacity-100 transition-opacity" />
            <h2 class="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Flags</h2>
            <Badge variant="secondary" class="text-xs">{{ room.flags.length }} active</Badge>
          </div>
          <div class="pl-3 border-l border-zinc-800">
            <div class="flex flex-wrap gap-2">
              <div
                v-for="flag in room.flags"
                :key="flag"
                class="flex items-center gap-1 px-3 py-1.5 bg-purple-500/20 border border-purple-500/30 rounded-full text-sm text-purple-300"
              >
                {{ flag }}
                <button @click="removeFlag(flag)" class="hover:text-purple-100">
                  <X class="h-3 w-3" />
                </button>
              </div>
              <Select>
                <SelectTrigger class="h-8 bg-zinc-900/50 border-zinc-800 border-dashed text-zinc-500 w-auto min-w-24">
                  <Plus class="h-3 w-3 mr-1" />
                  <span class="text-sm">Add Flag</span>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem
                    v-for="flag in availableFlags.filter(f => !room.flags.includes(f))"
                    :key="flag"
                    :value="flag"
                  >
                    {{ flag }}
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        <!-- Exits Block -->
        <div class="mb-8 group">
          <div class="flex items-center gap-2 mb-3">
            <div class="w-1 h-4 bg-green-500 rounded-full opacity-0 group-hover:opacity-100 transition-opacity" />
            <h2 class="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Exits</h2>
          </div>
          <div class="pl-3 border-l border-zinc-800">
            <div class="rounded-lg border border-zinc-800 overflow-hidden">
              <table class="w-full text-sm">
                <thead>
                  <tr class="bg-zinc-900/50 text-zinc-500">
                    <th class="px-4 py-2 text-left font-medium">Direction</th>
                    <th class="px-4 py-2 text-left font-medium">Destination</th>
                    <th class="px-4 py-2 text-left font-medium">Door</th>
                    <th class="px-4 py-2 text-left font-medium">Key</th>
                    <th class="px-4 py-2 text-right font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  <tr
                    v-for="exit in room.exits"
                    :key="exit.direction"
                    class="border-t border-zinc-800 hover:bg-zinc-900/30"
                  >
                    <td class="px-4 py-3">
                      <div class="flex items-center gap-2">
                        <component :is="getDirectionIcon(exit.direction)" class="h-4 w-4 text-zinc-500" />
                        <span class="text-zinc-200">{{ exit.direction }}</span>
                      </div>
                    </td>
                    <td class="px-4 py-3">
                      <span class="text-blue-400 font-mono">#{{ exit.vnum }}</span>
                      <span class="text-zinc-500 ml-2">{{ exit.name }}</span>
                    </td>
                    <td class="px-4 py-3 text-zinc-400">{{ exit.door || '-' }}</td>
                    <td class="px-4 py-3 text-zinc-400">{{ exit.key || '-' }}</td>
                    <td class="px-4 py-3 text-right">
                      <Button variant="ghost" size="icon" class="h-7 w-7">
                        <Edit class="h-3 w-3" />
                      </Button>
                      <Button variant="ghost" size="icon" class="h-7 w-7 text-red-400">
                        <Trash2 class="h-3 w-3" />
                      </Button>
                    </td>
                  </tr>
                </tbody>
              </table>
              <div class="px-4 py-3 border-t border-zinc-800 bg-zinc-900/30">
                <Button variant="ghost" size="sm" class="text-zinc-400">
                  <Plus class="h-4 w-4 mr-2" />
                  Add Exit
                </Button>
              </div>
            </div>
          </div>
        </div>

        <!-- Extra Descriptions Block -->
        <div class="mb-8 group">
          <div class="flex items-center gap-2 mb-3">
            <div class="w-1 h-4 bg-amber-500 rounded-full opacity-0 group-hover:opacity-100 transition-opacity" />
            <h2 class="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Extra Descriptions</h2>
          </div>
          <div class="pl-3 border-l border-zinc-800">
            <div class="rounded-lg border border-zinc-800 overflow-hidden">
              <table class="w-full text-sm">
                <thead>
                  <tr class="bg-zinc-900/50 text-zinc-500">
                    <th class="px-4 py-2 text-left font-medium">Keywords</th>
                    <th class="px-4 py-2 text-left font-medium">Preview</th>
                    <th class="px-4 py-2 text-right font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  <tr
                    v-for="(extra, idx) in room.extras"
                    :key="idx"
                    class="border-t border-zinc-800 hover:bg-zinc-900/30"
                  >
                    <td class="px-4 py-3">
                      <span class="text-zinc-200 font-mono text-xs">{{ extra.keywords }}</span>
                    </td>
                    <td class="px-4 py-3">
                      <span class="text-zinc-400 line-clamp-1">{{ extra.description }}</span>
                    </td>
                    <td class="px-4 py-3 text-right">
                      <Button variant="ghost" size="icon" class="h-7 w-7">
                        <Edit class="h-3 w-3" />
                      </Button>
                      <Button variant="ghost" size="icon" class="h-7 w-7 text-red-400">
                        <Trash2 class="h-3 w-3" />
                      </Button>
                    </td>
                  </tr>
                </tbody>
              </table>
              <div class="px-4 py-3 border-t border-zinc-800 bg-zinc-900/30">
                <Button variant="ghost" size="sm" class="text-zinc-400">
                  <Plus class="h-4 w-4 mr-2" />
                  Add Extra Description
                </Button>
              </div>
            </div>
          </div>
        </div>

        <!-- Connected Rooms Block -->
        <div class="mb-8 group">
          <div class="flex items-center gap-2 mb-3">
            <div class="w-1 h-4 bg-cyan-500 rounded-full opacity-0 group-hover:opacity-100 transition-opacity" />
            <h2 class="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Connected Rooms</h2>
            <Button variant="ghost" size="sm" class="h-6 px-2 text-xs text-zinc-500 ml-auto opacity-0 group-hover:opacity-100">
              <MapPin class="h-3 w-3 mr-1" />
              View on Map
            </Button>
          </div>
          <div class="pl-3 border-l border-zinc-800 space-y-2">
            <div
              v-for="connected in connectedRooms"
              :key="connected.vnum"
              class="flex items-start gap-3 p-3 bg-zinc-900/30 border border-zinc-800 rounded-lg hover:bg-zinc-900/50 cursor-pointer transition-colors"
            >
              <div class="mt-1">
                <component :is="getDirectionIcon(connected.direction)" class="h-4 w-4 text-zinc-500" />
              </div>
              <div class="flex-1">
                <div class="flex items-center gap-2">
                  <span class="text-sm font-medium text-zinc-200">{{ connected.name }}</span>
                  <span class="text-xs font-mono text-zinc-500">#{{ connected.vnum }}</span>
                </div>
                <p class="text-sm text-zinc-500 line-clamp-1 mt-0.5">{{ connected.description }}</p>
              </div>
              <ChevronRight class="h-4 w-4 text-zinc-600 mt-1" />
            </div>
          </div>
        </div>
      </div>
    </ScrollArea>
  </div>
</template>
