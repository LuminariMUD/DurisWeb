<script setup lang="ts">
import { ref } from 'vue'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
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
  X,
  Plus,
  Save,
  Trash2,
  Edit,
  Eye,
  ArrowUp,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ChevronUp,
  ChevronDown,
  FolderOpen,
  FileText,
  Users,
} from 'lucide-vue-next'

interface Tab {
  id: string
  type: 'zone' | 'room' | 'mob' | 'object'
  vnum: number
  name: string
  dirty: boolean
}

const tabs = ref<Tab[]>([
  { id: '1', type: 'zone', vnum: 345, name: 'Zone 345', dirty: false },
  { id: '2', type: 'room', vnum: 34500, name: 'Room #34500', dirty: true },
  { id: '3', type: 'mob', vnum: 83100, name: 'Mob #83100', dirty: false },
])

const activeTab = ref('2')

const room = ref({
  vnum: 34500,
  name: 'A Recently Unearthed Chamber',
  zone: 345,
  sector: 'inside',
  description: `   A recent earthquake has revealed a crack in the mountains, leading to a
hollowed out ancient chamber.  Strong circular pillars support the large
amount of earth and rock above, while dust covers the floor and walls.  A
large tome sits on a pedestal in the center of the room.`,
  flags: ['DARK', 'INDOORS'],
  exits: {
    north: { to: 34501, keywords: 'passage', key: null },
    east: null,
    south: null,
    west: null,
    up: null,
    down: null,
  },
  extras: [
    { keywords: 'tome book pedestal', preview: 'This ancient tome is covered with dust...' },
  ],
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
  basic: true,
  description: true,
  exits: true,
  flags: true,
  extras: true,
  preview: false,
})

function closeTab(tabId: string) {
  const idx = tabs.value.findIndex(t => t.id === tabId)
  if (idx >= 0) {
    tabs.value.splice(idx, 1)
    if (activeTab.value === tabId && tabs.value.length > 0) {
      const newIdx = Math.max(0, idx - 1)
      const tab = tabs.value[newIdx]
      if (tab) {
        activeTab.value = tab.id
      }
    }
  }
}

function toggleSection(section: keyof typeof expandedSections.value) {
  expandedSections.value[section] = !expandedSections.value[section]
}

function getTabIcon(type: string) {
  switch (type) {
    case 'zone': return FolderOpen
    case 'room': return FileText
    case 'mob': return Users
    default: return FileText
  }
}

function getTabColor(type: string) {
  switch (type) {
    case 'zone': return 'text-amber-400'
    case 'room': return 'text-blue-400'
    case 'mob': return 'text-green-400'
    case 'object': return 'text-purple-400'
    default: return 'text-zinc-400'
  }
}

function isChecked(flag: string) {
  return room.value.flags.includes(flag)
}
</script>

<template>
  <div class="h-[calc(100vh-140px)] bg-zinc-950 flex flex-col">
    <!-- Tabs Bar -->
    <div class="flex items-center bg-zinc-900 border-b border-zinc-800">
      <div class="flex-1 flex overflow-x-auto">
        <button
          v-for="tab in tabs"
          :key="tab.id"
          @click="activeTab = tab.id"
          class="flex items-center gap-2 px-4 py-2 border-r border-zinc-800 min-w-0 group"
          :class="activeTab === tab.id
            ? 'bg-zinc-950 text-zinc-100'
            : 'bg-zinc-900 text-zinc-400 hover:bg-zinc-800/50'"
        >
          <component :is="getTabIcon(tab.type)" class="h-4 w-4 flex-shrink-0" :class="getTabColor(tab.type)" />
          <span class="truncate text-sm">{{ tab.name }}</span>
          <span v-if="tab.dirty" class="w-2 h-2 rounded-full bg-blue-500 flex-shrink-0" />
          <button
            @click.stop="closeTab(tab.id)"
            class="opacity-0 group-hover:opacity-100 hover:bg-zinc-700 rounded p-0.5 flex-shrink-0"
          >
            <X class="h-3 w-3" />
          </button>
        </button>
      </div>
      <Button variant="ghost" size="icon" class="h-9 w-9 mr-1">
        <Plus class="h-4 w-4" />
      </Button>
    </div>

    <!-- Tab Content -->
    <div class="flex-1 flex overflow-hidden">
      <!-- Main Editor -->
      <ScrollArea class="flex-1">
        <div class="max-w-4xl mx-auto p-6">
          <!-- Header -->
          <div class="flex items-center justify-between mb-6">
            <div>
              <h1 class="text-2xl font-bold text-zinc-100">Room #{{ room.vnum }}</h1>
              <p class="text-sm text-zinc-500">Zone {{ room.zone }} - CTF Tournament</p>
            </div>
            <div class="flex gap-2">
              <Button variant="outline" size="sm">
                <Trash2 class="h-4 w-4 mr-2 text-red-400" />
                Delete
              </Button>
              <Button size="sm">
                <Save class="h-4 w-4 mr-2" />
                Save
              </Button>
            </div>
          </div>

          <!-- Sections -->
          <div class="space-y-4">
            <!-- Basic Info Section -->
            <div class="border border-zinc-800 rounded-lg overflow-hidden">
              <button
                @click="toggleSection('basic')"
                class="w-full flex items-center justify-between px-4 py-3 bg-zinc-900/50 hover:bg-zinc-900"
              >
                <span class="font-semibold text-zinc-200">Basic Info</span>
                <component :is="expandedSections.basic ? ChevronUp : ChevronDown" class="h-4 w-4 text-zinc-500" />
              </button>
              <div v-if="expandedSections.basic" class="p-4 space-y-4 bg-zinc-950/50">
                <div class="grid grid-cols-2 gap-4">
                  <div class="space-y-2">
                    <Label class="text-zinc-400">Room Name</Label>
                    <div class="flex gap-2">
                      <Input v-model="room.name" class="bg-zinc-900 border-zinc-700" />
                      <Button variant="outline" size="icon" title="Color codes">
                        <span class="font-bold">A</span>
                      </Button>
                    </div>
                  </div>
                  <div class="grid grid-cols-2 gap-4">
                    <div class="space-y-2">
                      <Label class="text-zinc-400">Vnum</Label>
                      <Input :value="room.vnum" disabled class="bg-zinc-900 border-zinc-700 text-zinc-500" />
                    </div>
                    <div class="space-y-2">
                      <Label class="text-zinc-400">Sector</Label>
                      <Select v-model="room.sector">
                        <SelectTrigger class="bg-zinc-900 border-zinc-700">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem v-for="s in sectors" :key="s" :value="s">{{ s }}</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <!-- Description Section -->
            <div class="border border-zinc-800 rounded-lg overflow-hidden">
              <button
                @click="toggleSection('description')"
                class="w-full flex items-center justify-between px-4 py-3 bg-zinc-900/50 hover:bg-zinc-900"
              >
                <span class="font-semibold text-zinc-200">Description</span>
                <component :is="expandedSections.description ? ChevronUp : ChevronDown" class="h-4 w-4 text-zinc-500" />
              </button>
              <div v-if="expandedSections.description" class="p-4 bg-zinc-950/50">
                <textarea
                  v-model="room.description"
                  rows="8"
                  class="w-full bg-zinc-900 border border-zinc-700 rounded-md px-3 py-2 text-zinc-100 font-mono text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <div class="flex items-center justify-between mt-2">
                  <div class="flex gap-1">
                    <Button variant="outline" size="sm" class="h-7 px-2 text-red-500">R</Button>
                    <Button variant="outline" size="sm" class="h-7 px-2 text-green-500">G</Button>
                    <Button variant="outline" size="sm" class="h-7 px-2 text-blue-500">B</Button>
                    <Button variant="outline" size="sm" class="h-7 px-2 text-yellow-500">Y</Button>
                    <Button variant="outline" size="sm" class="h-7 px-2 text-white">W</Button>
                    <Button variant="outline" size="sm" class="h-7 px-2 text-zinc-400">N</Button>
                  </div>
                  <Button variant="ghost" size="sm">
                    <Eye class="h-4 w-4 mr-2" />
                    Preview
                  </Button>
                </div>
              </div>
            </div>

            <!-- Exits Section -->
            <div class="border border-zinc-800 rounded-lg overflow-hidden">
              <button
                @click="toggleSection('exits')"
                class="w-full flex items-center justify-between px-4 py-3 bg-zinc-900/50 hover:bg-zinc-900"
              >
                <div class="flex items-center gap-2">
                  <span class="font-semibold text-zinc-200">Exits</span>
                  <Badge variant="secondary" class="text-xs">1 defined</Badge>
                </div>
                <component :is="expandedSections.exits ? ChevronUp : ChevronDown" class="h-4 w-4 text-zinc-500" />
              </button>
              <div v-if="expandedSections.exits" class="p-4 bg-zinc-950/50">
                <div class="grid grid-cols-2 gap-3">
                  <!-- North -->
                  <div class="flex items-center gap-2 p-2 bg-zinc-900/50 rounded-md">
                    <ArrowUp class="h-4 w-4 text-zinc-500" />
                    <span class="text-sm text-zinc-300 w-10">North</span>
                    <Input value="34501" class="h-8 bg-zinc-900 border-zinc-700 text-blue-400 font-mono text-sm flex-1" />
                    <Button variant="ghost" size="sm" class="h-8">
                      <Edit class="h-3 w-3" />
                    </Button>
                  </div>
                  <!-- East -->
                  <div class="flex items-center gap-2 p-2 bg-zinc-900/50 rounded-md">
                    <ArrowRight class="h-4 w-4 text-zinc-500" />
                    <span class="text-sm text-zinc-300 w-10">East</span>
                    <span class="text-sm text-zinc-600 flex-1">Not set</span>
                    <Button variant="ghost" size="sm" class="h-8">
                      <Plus class="h-3 w-3" />
                    </Button>
                  </div>
                  <!-- South -->
                  <div class="flex items-center gap-2 p-2 bg-zinc-900/50 rounded-md">
                    <ArrowDown class="h-4 w-4 text-zinc-500" />
                    <span class="text-sm text-zinc-300 w-10">South</span>
                    <span class="text-sm text-zinc-600 flex-1">Not set</span>
                    <Button variant="ghost" size="sm" class="h-8">
                      <Plus class="h-3 w-3" />
                    </Button>
                  </div>
                  <!-- West -->
                  <div class="flex items-center gap-2 p-2 bg-zinc-900/50 rounded-md">
                    <ArrowLeft class="h-4 w-4 text-zinc-500" />
                    <span class="text-sm text-zinc-300 w-10">West</span>
                    <span class="text-sm text-zinc-600 flex-1">Not set</span>
                    <Button variant="ghost" size="sm" class="h-8">
                      <Plus class="h-3 w-3" />
                    </Button>
                  </div>
                  <!-- Up -->
                  <div class="flex items-center gap-2 p-2 bg-zinc-900/50 rounded-md">
                    <ChevronUp class="h-4 w-4 text-zinc-500" />
                    <span class="text-sm text-zinc-300 w-10">Up</span>
                    <span class="text-sm text-zinc-600 flex-1">Not set</span>
                    <Button variant="ghost" size="sm" class="h-8">
                      <Plus class="h-3 w-3" />
                    </Button>
                  </div>
                  <!-- Down -->
                  <div class="flex items-center gap-2 p-2 bg-zinc-900/50 rounded-md">
                    <ChevronDown class="h-4 w-4 text-zinc-500" />
                    <span class="text-sm text-zinc-300 w-10">Down</span>
                    <span class="text-sm text-zinc-600 flex-1">Not set</span>
                    <Button variant="ghost" size="sm" class="h-8">
                      <Plus class="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              </div>
            </div>

            <!-- Flags Section -->
            <div class="border border-zinc-800 rounded-lg overflow-hidden">
              <button
                @click="toggleSection('flags')"
                class="w-full flex items-center justify-between px-4 py-3 bg-zinc-900/50 hover:bg-zinc-900"
              >
                <div class="flex items-center gap-2">
                  <span class="font-semibold text-zinc-200">Room Flags</span>
                  <Badge variant="secondary" class="text-xs">{{ room.flags.length }} active</Badge>
                </div>
                <component :is="expandedSections.flags ? ChevronUp : ChevronDown" class="h-4 w-4 text-zinc-500" />
              </button>
              <div v-if="expandedSections.flags" class="p-4 bg-zinc-950/50">
                <div class="grid grid-cols-4 gap-2">
                  <div
                    v-for="flag in allFlags"
                    :key="flag"
                    class="flex items-center gap-2 p-2 rounded-md"
                    :class="isChecked(flag) ? 'bg-blue-900/20' : 'bg-zinc-900/50'"
                  >
                    <Checkbox :id="`flag-${flag}`" :checked="isChecked(flag)" />
                    <label :for="`flag-${flag}`" class="text-sm text-zinc-300 cursor-pointer">
                      {{ flag }}
                    </label>
                  </div>
                </div>
                <div class="mt-3 text-right">
                  <Button variant="link" size="sm" class="text-zinc-400">
                    Show all 100+ flags...
                  </Button>
                </div>
              </div>
            </div>

            <!-- Extra Descriptions Section -->
            <div class="border border-zinc-800 rounded-lg overflow-hidden">
              <button
                @click="toggleSection('extras')"
                class="w-full flex items-center justify-between px-4 py-3 bg-zinc-900/50 hover:bg-zinc-900"
              >
                <div class="flex items-center gap-2">
                  <span class="font-semibold text-zinc-200">Extra Descriptions</span>
                  <Badge variant="secondary" class="text-xs">{{ room.extras.length }}</Badge>
                </div>
                <component :is="expandedSections.extras ? ChevronUp : ChevronDown" class="h-4 w-4 text-zinc-500" />
              </button>
              <div v-if="expandedSections.extras" class="p-4 bg-zinc-950/50 space-y-2">
                <div
                  v-for="(extra, idx) in room.extras"
                  :key="idx"
                  class="flex items-start gap-3 p-3 bg-zinc-900/50 rounded-md"
                >
                  <div class="flex-1">
                    <div class="text-sm font-medium text-zinc-200 mb-1">{{ extra.keywords }}</div>
                    <div class="text-sm text-zinc-500 line-clamp-2">{{ extra.preview }}</div>
                  </div>
                  <div class="flex gap-1">
                    <Button variant="ghost" size="icon" class="h-7 w-7">
                      <Edit class="h-3 w-3" />
                    </Button>
                    <Button variant="ghost" size="icon" class="h-7 w-7 text-red-400">
                      <X class="h-3 w-3" />
                    </Button>
                  </div>
                </div>
                <Button variant="outline" size="sm" class="w-full">
                  <Plus class="h-4 w-4 mr-2" />
                  Add Extra Description
                </Button>
              </div>
            </div>

            <!-- Preview Section -->
            <div class="border border-zinc-800 rounded-lg overflow-hidden">
              <button
                @click="toggleSection('preview')"
                class="w-full flex items-center justify-between px-4 py-3 bg-zinc-900/50 hover:bg-zinc-900"
              >
                <span class="font-semibold text-zinc-200">Preview (Rendered)</span>
                <component :is="expandedSections.preview ? ChevronUp : ChevronDown" class="h-4 w-4 text-zinc-500" />
              </button>
              <div v-if="expandedSections.preview" class="p-4 bg-black">
                <div class="font-mono text-sm">
                  <div class="text-white font-bold">{{ room.name }}</div>
                  <div class="text-zinc-300 whitespace-pre-wrap mt-2">{{ room.description }}</div>
                  <div class="text-cyan-400 mt-4">Obvious exits: North</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </ScrollArea>
    </div>
  </div>
</template>
