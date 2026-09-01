<script setup lang="ts">
import { ref } from 'vue'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Search,
  Plus,
  Edit,
  Copy,
  Clock,
  MapPin,
  Users,
  Package,
  FileText,
  Activity,
} from 'lucide-vue-next'

const searchQuery = ref('')

const zones = ref([
  {
    id: 345,
    name: 'CTF Tournament',
    description: 'Capture the flag arena zone',
    rooms: 47,
    mobs: 12,
    objects: 8,
    lastModified: '2 hours ago',
    status: 'published',
    level: '40-50',
  },
  {
    id: 346,
    name: 'Dark Forest',
    description: 'A mysterious forest shrouded in darkness',
    rooms: 23,
    mobs: 8,
    objects: 15,
    lastModified: '1 day ago',
    status: 'draft',
    level: '20-30',
  },
  {
    id: 347,
    name: 'Merchant Quarter',
    description: 'Bustling marketplace in the city center',
    rooms: 89,
    mobs: 34,
    objects: 67,
    lastModified: '5 days ago',
    status: 'published',
    level: '1-10',
  },
  {
    id: 348,
    name: "Dragon's Lair",
    description: 'The legendary dragon Fyrax makes his home here',
    rooms: 15,
    mobs: 5,
    objects: 12,
    lastModified: '1 week ago',
    status: 'review',
    level: '55-60',
  },
  {
    id: 349,
    name: 'Underwater Ruins',
    description: 'Ancient civilization beneath the waves',
    rooms: 32,
    mobs: 18,
    objects: 24,
    lastModified: '2 weeks ago',
    status: 'published',
    level: '35-45',
  },
  {
    id: 350,
    name: 'Frozen Wastes',
    description: 'Arctic tundra with deadly creatures',
    rooms: 56,
    mobs: 22,
    objects: 19,
    lastModified: '3 weeks ago',
    status: 'published',
    level: '45-55',
  },
])

const recentActivity = ref([
  { action: 'edited', target: 'Room #34502', zone: 'Zone 345', time: '2 hours ago', user: 'You' },
  { action: 'created', target: 'Zone 348', zone: '', time: '5 hours ago', user: 'Builder_X' },
  { action: 'added', target: 'Mob #83100', zone: 'Zone 345', time: 'yesterday', user: 'You' },
  { action: 'reviewed', target: 'Zone 346', zone: '', time: '2 days ago', user: 'Admin' },
  { action: 'edited', target: 'Object #67900', zone: 'Zone 345', time: '3 days ago', user: 'You' },
])

function getStatusColor(status: string) {
  switch (status) {
    case 'published':
      return 'bg-green-500/20 text-green-400 border-green-500/30'
    case 'draft':
      return 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30'
    case 'review':
      return 'bg-blue-500/20 text-blue-400 border-blue-500/30'
    default:
      return 'bg-zinc-500/20 text-zinc-400 border-zinc-500/30'
  }
}

function getActionIcon(action: string) {
  switch (action) {
    case 'edited':
      return Edit
    case 'created':
      return Plus
    case 'added':
      return Plus
    case 'reviewed':
      return Activity
    default:
      return Activity
  }
}
</script>

<template>
  <div class="min-h-[calc(100vh-140px)] bg-zinc-950 p-6">
    <!-- Header -->
    <div class="flex items-center justify-between mb-8">
      <div>
        <h1 class="text-3xl font-bold text-zinc-100">Zone Builder</h1>
        <p class="text-zinc-400 mt-1">Manage and edit your MUD zones</p>
      </div>
      <div class="flex items-center gap-4">
        <div class="relative">
          <Search class="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500" />
          <Input
            v-model="searchQuery"
            placeholder="Search zones..."
            class="pl-10 w-64 bg-zinc-900 border-zinc-700"
          />
        </div>
        <Button>
          <Plus class="h-4 w-4 mr-2" />
          Create New Zone
        </Button>
      </div>
    </div>

    <div class="grid grid-cols-12 gap-6">
      <!-- Main Content: Zone Cards -->
      <div class="col-span-8">
        <div class="flex items-center justify-between mb-4">
          <h2 class="text-lg font-semibold text-zinc-300">Your Zones</h2>
          <div class="flex gap-2">
            <Button variant="ghost" size="sm" class="text-zinc-400">All</Button>
            <Button variant="ghost" size="sm" class="text-zinc-400">Published</Button>
            <Button variant="ghost" size="sm" class="text-zinc-400">Drafts</Button>
          </div>
        </div>

        <div class="grid grid-cols-2 gap-4">
          <Card
            v-for="zone in zones"
            :key="zone.id"
            class="bg-zinc-900/50 border-zinc-800 hover:border-zinc-700 transition-colors cursor-pointer"
          >
            <CardHeader class="pb-2">
              <div class="flex items-start justify-between">
                <div>
                  <CardTitle class="text-zinc-100">{{ zone.name }}</CardTitle>
                  <CardDescription class="text-zinc-500">Zone #{{ zone.id }}</CardDescription>
                </div>
                <Badge :class="getStatusColor(zone.status)" variant="outline">
                  {{ zone.status }}
                </Badge>
              </div>
            </CardHeader>
            <CardContent class="pb-2">
              <p class="text-sm text-zinc-400 mb-4">{{ zone.description }}</p>

              <!-- Mini Map Placeholder -->
              <div class="bg-zinc-950 border border-zinc-800 rounded-md h-32 flex items-center justify-center mb-4">
                <div class="text-center">
                  <MapPin class="h-8 w-8 text-zinc-700 mx-auto mb-2" />
                  <span class="text-xs text-zinc-600">Zone Map Preview</span>
                </div>
              </div>

              <!-- Stats -->
              <div class="grid grid-cols-3 gap-2 text-center">
                <div class="bg-zinc-950/50 rounded-md py-2">
                  <div class="flex items-center justify-center gap-1 text-blue-400">
                    <FileText class="h-3.5 w-3.5" />
                    <span class="text-sm font-semibold">{{ zone.rooms }}</span>
                  </div>
                  <span class="text-xs text-zinc-500">Rooms</span>
                </div>
                <div class="bg-zinc-950/50 rounded-md py-2">
                  <div class="flex items-center justify-center gap-1 text-green-400">
                    <Users class="h-3.5 w-3.5" />
                    <span class="text-sm font-semibold">{{ zone.mobs }}</span>
                  </div>
                  <span class="text-xs text-zinc-500">Mobs</span>
                </div>
                <div class="bg-zinc-950/50 rounded-md py-2">
                  <div class="flex items-center justify-center gap-1 text-purple-400">
                    <Package class="h-3.5 w-3.5" />
                    <span class="text-sm font-semibold">{{ zone.objects }}</span>
                  </div>
                  <span class="text-xs text-zinc-500">Objects</span>
                </div>
              </div>
            </CardContent>
            <CardFooter class="pt-2 border-t border-zinc-800">
              <div class="flex items-center justify-between w-full">
                <div class="flex items-center gap-1 text-xs text-zinc-500">
                  <Clock class="h-3 w-3" />
                  {{ zone.lastModified }}
                </div>
                <div class="flex gap-1">
                  <Button variant="ghost" size="sm" class="h-7 px-2">
                    <Copy class="h-3.5 w-3.5" />
                  </Button>
                  <Button variant="default" size="sm" class="h-7 px-3">
                    <Edit class="h-3.5 w-3.5 mr-1" />
                    Edit
                  </Button>
                </div>
              </div>
            </CardFooter>
          </Card>
        </div>
      </div>

      <!-- Sidebar: Activity & Quick Stats -->
      <div class="col-span-4 space-y-6">
        <!-- Quick Stats -->
        <Card class="bg-zinc-900/50 border-zinc-800">
          <CardHeader>
            <CardTitle class="text-zinc-100 text-base">Overview</CardTitle>
          </CardHeader>
          <CardContent>
            <div class="grid grid-cols-2 gap-4">
              <div class="text-center p-3 bg-zinc-950/50 rounded-lg">
                <div class="text-2xl font-bold text-zinc-100">6</div>
                <div class="text-xs text-zinc-500">Total Zones</div>
              </div>
              <div class="text-center p-3 bg-zinc-950/50 rounded-lg">
                <div class="text-2xl font-bold text-blue-400">262</div>
                <div class="text-xs text-zinc-500">Total Rooms</div>
              </div>
              <div class="text-center p-3 bg-zinc-950/50 rounded-lg">
                <div class="text-2xl font-bold text-green-400">99</div>
                <div class="text-xs text-zinc-500">Total Mobs</div>
              </div>
              <div class="text-center p-3 bg-zinc-950/50 rounded-lg">
                <div class="text-2xl font-bold text-purple-400">145</div>
                <div class="text-xs text-zinc-500">Total Objects</div>
              </div>
            </div>
          </CardContent>
        </Card>

        <!-- Recent Activity -->
        <Card class="bg-zinc-900/50 border-zinc-800">
          <CardHeader>
            <CardTitle class="text-zinc-100 text-base">Recent Activity</CardTitle>
          </CardHeader>
          <CardContent class="p-0">
            <ScrollArea class="h-80">
              <div class="px-4 pb-4 space-y-3">
                <div
                  v-for="(activity, idx) in recentActivity"
                  :key="idx"
                  class="flex items-start gap-3 p-2 rounded-lg hover:bg-zinc-800/50"
                >
                  <div class="mt-0.5 p-1.5 rounded-full bg-zinc-800">
                    <component :is="getActionIcon(activity.action)" class="h-3.5 w-3.5 text-zinc-400" />
                  </div>
                  <div class="flex-1 min-w-0">
                    <p class="text-sm text-zinc-300">
                      <span class="text-zinc-100 font-medium">{{ activity.user }}</span>
                      {{ activity.action }}
                      <span class="text-blue-400">{{ activity.target }}</span>
                      <span v-if="activity.zone" class="text-zinc-500"> in {{ activity.zone }}</span>
                    </p>
                    <p class="text-xs text-zinc-600 mt-0.5">{{ activity.time }}</p>
                  </div>
                </div>
              </div>
            </ScrollArea>
          </CardContent>
        </Card>

        <!-- Quick Actions -->
        <Card class="bg-zinc-900/50 border-zinc-800">
          <CardHeader>
            <CardTitle class="text-zinc-100 text-base">Quick Actions</CardTitle>
          </CardHeader>
          <CardContent class="space-y-2">
            <Button variant="outline" class="w-full justify-start" size="sm">
              <Plus class="h-4 w-4 mr-2" />
              Create New Zone
            </Button>
            <Button variant="outline" class="w-full justify-start" size="sm">
              <FileText class="h-4 w-4 mr-2" />
              Browse All Rooms
            </Button>
            <Button variant="outline" class="w-full justify-start" size="sm">
              <Users class="h-4 w-4 mr-2" />
              Browse All Mobs
            </Button>
            <Button variant="outline" class="w-full justify-start" size="sm">
              <Package class="h-4 w-4 mr-2" />
              Browse All Objects
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  </div>
</template>
