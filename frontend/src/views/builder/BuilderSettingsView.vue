<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useQuery, useMutation, useQueryClient } from '@tanstack/vue-query'
import { builderApi } from '@/services/api'
import { useToast } from '@/composables/useToast'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
  RefreshCw,
  ArrowLeft,
  Database,
  Package,
  Users,
  Home,
  Settings2,
  GitCommit,
} from 'lucide-vue-next'

const router = useRouter()
const queryClient = useQueryClient()
const toast = useToast()

// Active tab
const activeTab = ref('general')

// General settings (stored in localStorage)
const showGitCommitButton = ref(true)

// Load settings from localStorage
onMounted(() => {
  showGitCommitButton.value = localStorage.getItem('builder_show_git_commit') !== 'false'
})

// Save git commit button setting
function toggleGitCommitButton(value: boolean) {
  showGitCommitButton.value = value
  localStorage.setItem('builder_show_git_commit', value ? 'true' : 'false')
  toast.success(value ? 'Git commit button enabled' : 'Git commit button hidden')
}

// Sync confirmation dialog
const syncDialogOpen = ref(false)

// Fetch flags from database
const { data: flags, isLoading: flagsLoading } = useQuery({
  queryKey: ['builder-flags'],
  queryFn: () => builderApi.getFlags(),
  staleTime: 1000 * 60 * 5, // 5 minutes
})

// Fetch flag categories with counts
const { data: categories, isLoading: categoriesLoading } = useQuery({
  queryKey: ['builder-flag-categories'],
  queryFn: () => builderApi.getFlagCategories(),
  staleTime: 1000 * 60 * 5, // 5 minutes
})

// Sync flags mutation
const syncFlagsMutation = useMutation({
  mutationFn: () => builderApi.syncFlags(),
  onSuccess: (data) => {
    toast.success(
      `Flags synced: ${data.stats.inserted} inserted, ${data.stats.updated} updated, ${data.stats.deleted} deleted`,
    )
    queryClient.invalidateQueries({ queryKey: ['builder-flags'] })
    queryClient.invalidateQueries({ queryKey: ['builder-flag-categories'] })
    syncDialogOpen.value = false
  },
  onError: (error: Error) => {
    toast.error(`Failed to sync flags: ${error.message}`)
  },
})

// Category stats
const categoryStats = computed(() => {
  if (!categories.value) return { objects: 0, mobs: 0, rooms: 0, total: 0 }

  let objects = 0
  let mobs = 0
  let rooms = 0

  for (const cat of categories.value) {
    if (cat.category.startsWith('obj_') || cat.category.startsWith('weapon_')) {
      objects += cat.count
    } else if (cat.category.startsWith('mob_')) {
      mobs += cat.count
    } else if (cat.category.startsWith('room_') || cat.category.startsWith('exit_')) {
      rooms += cat.count
    }
  }

  return {
    objects,
    mobs,
    rooms,
    total: objects + mobs + rooms,
  }
})

// Get flags for a specific category
function getFlagsForCategory(categoryKey: string) {
  if (!flags.value) return []
  return (flags.value as any)[categoryKey] || []
}

// Object flag categories
const objectCategories = [
  {
    key: 'objectTypes',
    label: 'Item Types',
    description: 'Type of object (weapon, armor, container, etc.)',
  },
  { key: 'objWearFlags', label: 'Wear Flags', description: 'Where the item can be worn' },
  {
    key: 'objExtraFlags',
    label: 'Extra Flags',
    description: 'Special properties (glow, hum, no-drop, etc.)',
  },
  { key: 'objExtra2Flags', label: 'Extra Flags 2', description: 'Additional special properties' },
  {
    key: 'objApplyTypes',
    label: 'Apply Types',
    description: 'Stat modifications (STR, DEX, HP, etc.)',
  },
  { key: 'objMaterials', label: 'Materials', description: 'Material types (iron, leather, etc.)' },
  {
    key: 'objWeaponTypes',
    label: 'Weapon Types',
    description: 'Type of weapon (sword, axe, etc.)',
  },
  {
    key: 'objWeaponDamageTypes',
    label: 'Damage Types',
    description: 'Type of damage (slash, pierce, etc.)',
  },
  { key: 'objCraftsmanship', label: 'Craftsmanship', description: 'Quality level of the item' },
  // Note: ITEM_ANTI_*, ITEM_ANTI2_*, ITEM_ALLOW2_* defines are commented out in defines.h - not in use
]

// Mob flag categories
const mobCategories = [
  { key: 'mobActFlags', label: 'Action Flags', description: 'NPC behavior flags' },
  { key: 'mobActFlags2', label: 'Action Flags 2', description: 'Additional behavior flags' },
  {
    key: 'mobAffFlags',
    label: 'Affected Flags 1',
    description: 'Permanent effects on mob (also used for object bitvector1)',
  },
  {
    key: 'mobAffFlags2',
    label: 'Affected Flags 2',
    description: 'Additional permanent effects (also used for object bitvector2)',
  },
  {
    key: 'mobAffFlags3',
    label: 'Affected Flags 3',
    description: 'More permanent effects (also used for object bitvector3)',
  },
  {
    key: 'mobAffFlags4',
    label: 'Affected Flags 4',
    description: 'Even more permanent effects (also used for object bitvector4)',
  },
  { key: 'mobAffFlags5', label: 'Affected Flags 5', description: 'Additional effects' },
  { key: 'mobAggroFlags', label: 'Aggro Flags', description: 'What triggers aggression' },
  { key: 'mobAggroFlags2', label: 'Aggro Flags 2', description: 'Additional aggro triggers' },
  { key: 'mobClasses', label: 'Classes', description: 'NPC class types' },
  { key: 'mobRaces', label: 'Races', description: 'NPC race types' },
]

// Room flag categories
const roomCategories = [
  { key: 'roomFlags', label: 'Room Flags', description: 'Room properties (dark, no-mob, etc.)' },
  {
    key: 'sectorTypes',
    label: 'Sector Types',
    description: 'Terrain type (city, forest, water, etc.)',
  },
  { key: 'doorFlags', label: 'Exit Flags', description: 'Door/exit properties' },
]

// Handle sync click
function handleSync() {
  syncDialogOpen.value = true
}

function confirmSync() {
  syncFlagsMutation.mutate()
}
</script>

<template>
  <div class="container mx-auto py-6 space-y-6">
    <!-- Header -->
    <div class="flex items-center justify-between">
      <div class="flex items-center gap-4">
        <Button variant="ghost" size="icon" @click="router.push('/builder')">
          <ArrowLeft class="h-5 w-5" />
        </Button>
        <div>
          <h1 class="text-3xl font-bold tracking-tight">Builder Settings</h1>
          <p class="text-muted-foreground">
            Manage flag definitions for zone building
          </p>
        </div>
      </div>
      <div class="flex items-center gap-2">
        <Button @click="handleSync" :disabled="syncFlagsMutation.isPending.value">
          <RefreshCw class="h-4 w-4 mr-2" :class="{ 'animate-spin': syncFlagsMutation.isPending.value }" />
          Sync from MUD Source
        </Button>
      </div>
    </div>

    <!-- Stats Cards -->
    <div class="grid grid-cols-1 md:grid-cols-4 gap-4">
      <Card>
        <CardContent class="pt-6">
          <div class="flex items-center gap-3">
            <div class="p-2 bg-primary/10 rounded-lg">
              <Database class="h-5 w-5 text-primary" />
            </div>
            <div>
              <p class="text-sm text-muted-foreground">Total Flags</p>
              <p class="text-2xl font-bold">
                <template v-if="categoriesLoading">
                  <Skeleton class="h-8 w-16" />
                </template>
                <template v-else>
                  {{ categoryStats.total.toLocaleString() }}
                </template>
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardContent class="pt-6">
          <div class="flex items-center gap-3">
            <div class="p-2 bg-orange-500/10 rounded-lg">
              <Package class="h-5 w-5 text-orange-500" />
            </div>
            <div>
              <p class="text-sm text-muted-foreground">Object Flags</p>
              <p class="text-2xl font-bold">
                <template v-if="categoriesLoading">
                  <Skeleton class="h-8 w-16" />
                </template>
                <template v-else>
                  {{ categoryStats.objects.toLocaleString() }}
                </template>
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardContent class="pt-6">
          <div class="flex items-center gap-3">
            <div class="p-2 bg-green-500/10 rounded-lg">
              <Users class="h-5 w-5 text-green-500" />
            </div>
            <div>
              <p class="text-sm text-muted-foreground">Mob Flags</p>
              <p class="text-2xl font-bold">
                <template v-if="categoriesLoading">
                  <Skeleton class="h-8 w-16" />
                </template>
                <template v-else>
                  {{ categoryStats.mobs.toLocaleString() }}
                </template>
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardContent class="pt-6">
          <div class="flex items-center gap-3">
            <div class="p-2 bg-blue-500/10 rounded-lg">
              <Home class="h-5 w-5 text-blue-500" />
            </div>
            <div>
              <p class="text-sm text-muted-foreground">Room Flags</p>
              <p class="text-2xl font-bold">
                <template v-if="categoriesLoading">
                  <Skeleton class="h-8 w-16" />
                </template>
                <template v-else>
                  {{ categoryStats.rooms.toLocaleString() }}
                </template>
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>

    <!-- Tabs -->
    <Tabs v-model="activeTab" class="space-y-4">
      <TabsList>
        <TabsTrigger value="general">
          <Settings2 class="h-4 w-4 mr-2" />
          General
        </TabsTrigger>
        <TabsTrigger value="objects">
          <Package class="h-4 w-4 mr-2" />
          Objects
        </TabsTrigger>
        <TabsTrigger value="mobs">
          <Users class="h-4 w-4 mr-2" />
          Mobs
        </TabsTrigger>
        <TabsTrigger value="rooms">
          <Home class="h-4 w-4 mr-2" />
          Rooms
        </TabsTrigger>
        <TabsTrigger value="categories">
          <Database class="h-4 w-4 mr-2" />
          All Categories
        </TabsTrigger>
      </TabsList>

      <!-- General Tab -->
      <TabsContent value="general" class="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>Editor Settings</CardTitle>
            <CardDescription>
              Configure the zone editor interface
            </CardDescription>
          </CardHeader>
          <CardContent class="space-y-6">
            <!-- Git Integration -->
            <div class="flex items-center justify-between">
              <div class="space-y-0.5">
                <Label class="flex items-center gap-2">
                  <GitCommit class="h-4 w-4" />
                  Show Git Commit Button
                </Label>
                <p class="text-sm text-muted-foreground">
                  Display a commit button in the zone editor toolbar to commit changes to git
                </p>
              </div>
              <Switch
                :model-value="showGitCommitButton"
                @update:model-value="toggleGitCommitButton"
              />
            </div>
          </CardContent>
        </Card>
      </TabsContent>

      <!-- Objects Tab -->
      <TabsContent value="objects" class="space-y-4">
        <div class="grid gap-4">
          <template v-for="cat in objectCategories" :key="cat.key">
            <Card>
              <CardHeader class="pb-3">
                <div class="flex items-center justify-between">
                  <div>
                    <CardTitle class="text-lg">{{ cat.label }}</CardTitle>
                    <CardDescription>{{ cat.description }}</CardDescription>
                  </div>
                  <Badge variant="secondary">
                    {{ getFlagsForCategory(cat.key).length }} flags
                  </Badge>
                </div>
              </CardHeader>
              <CardContent>
                <div v-if="flagsLoading" class="space-y-2">
                  <Skeleton class="h-8 w-full" />
                  <Skeleton class="h-8 w-full" />
                </div>
                <div v-else-if="getFlagsForCategory(cat.key).length === 0" class="text-sm text-muted-foreground py-4 text-center">
                  No flags defined. Click "Sync from MUD Source" to populate.
                </div>
                <div v-else class="max-h-[300px] overflow-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead class="w-[200px]">Name</TableHead>
                        <TableHead class="w-[100px]">Value</TableHead>
                        <TableHead>Description</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      <TableRow v-for="flag in getFlagsForCategory(cat.key)" :key="flag.name">
                        <TableCell class="font-mono text-sm">{{ flag.name }}</TableCell>
                        <TableCell class="font-mono text-sm text-muted-foreground">{{ flag.value }}</TableCell>
                        <TableCell class="text-sm">{{ flag.description || '-' }}</TableCell>
                      </TableRow>
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </template>
        </div>
      </TabsContent>

      <!-- Mobs Tab -->
      <TabsContent value="mobs" class="space-y-4">
        <div class="grid gap-4">
          <template v-for="cat in mobCategories" :key="cat.key">
            <Card>
              <CardHeader class="pb-3">
                <div class="flex items-center justify-between">
                  <div>
                    <CardTitle class="text-lg">{{ cat.label }}</CardTitle>
                    <CardDescription>{{ cat.description }}</CardDescription>
                  </div>
                  <Badge variant="secondary">
                    {{ getFlagsForCategory(cat.key).length }} flags
                  </Badge>
                </div>
              </CardHeader>
              <CardContent>
                <div v-if="flagsLoading" class="space-y-2">
                  <Skeleton class="h-8 w-full" />
                  <Skeleton class="h-8 w-full" />
                </div>
                <div v-else-if="getFlagsForCategory(cat.key).length === 0" class="text-sm text-muted-foreground py-4 text-center">
                  No flags defined. Click "Sync from MUD Source" to populate.
                </div>
                <div v-else class="max-h-[300px] overflow-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead class="w-[200px]">Name</TableHead>
                        <TableHead class="w-[100px]">Value</TableHead>
                        <TableHead>Description</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      <TableRow v-for="flag in getFlagsForCategory(cat.key)" :key="flag.name">
                        <TableCell class="font-mono text-sm">{{ flag.name }}</TableCell>
                        <TableCell class="font-mono text-sm text-muted-foreground">{{ flag.value }}</TableCell>
                        <TableCell class="text-sm">{{ flag.description || '-' }}</TableCell>
                      </TableRow>
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </template>
        </div>
      </TabsContent>

      <!-- Rooms Tab -->
      <TabsContent value="rooms" class="space-y-4">
        <div class="grid gap-4">
          <template v-for="cat in roomCategories" :key="cat.key">
            <Card>
              <CardHeader class="pb-3">
                <div class="flex items-center justify-between">
                  <div>
                    <CardTitle class="text-lg">{{ cat.label }}</CardTitle>
                    <CardDescription>{{ cat.description }}</CardDescription>
                  </div>
                  <Badge variant="secondary">
                    {{ getFlagsForCategory(cat.key).length }} flags
                  </Badge>
                </div>
              </CardHeader>
              <CardContent>
                <div v-if="flagsLoading" class="space-y-2">
                  <Skeleton class="h-8 w-full" />
                  <Skeleton class="h-8 w-full" />
                </div>
                <div v-else-if="getFlagsForCategory(cat.key).length === 0" class="text-sm text-muted-foreground py-4 text-center">
                  No flags defined. Click "Sync from MUD Source" to populate.
                </div>
                <div v-else class="max-h-[300px] overflow-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead class="w-[200px]">Name</TableHead>
                        <TableHead class="w-[100px]">Value</TableHead>
                        <TableHead>Description</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      <TableRow v-for="flag in getFlagsForCategory(cat.key)" :key="flag.name">
                        <TableCell class="font-mono text-sm">{{ flag.name }}</TableCell>
                        <TableCell class="font-mono text-sm text-muted-foreground">{{ flag.value }}</TableCell>
                        <TableCell class="text-sm">{{ flag.description || '-' }}</TableCell>
                      </TableRow>
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </template>
        </div>
      </TabsContent>

      <!-- All Categories Tab -->
      <TabsContent value="categories" class="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>All Flag Categories</CardTitle>
            <CardDescription>
              Overview of all flag categories in the database
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div v-if="categoriesLoading" class="space-y-2">
              <Skeleton class="h-8 w-full" />
              <Skeleton class="h-8 w-full" />
              <Skeleton class="h-8 w-full" />
            </div>
            <div v-else-if="!categories || categories.length === 0" class="text-sm text-muted-foreground py-4 text-center">
              No categories found. Click "Sync from MUD Source" to populate the database.
            </div>
            <Table v-else>
              <TableHeader>
                <TableRow>
                  <TableHead>Category</TableHead>
                  <TableHead class="w-[100px]">Count</TableHead>
                  <TableHead class="w-[200px]">Last Updated</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <TableRow v-for="cat in categories" :key="cat.category">
                  <TableCell class="font-mono">{{ cat.category }}</TableCell>
                  <TableCell>
                    <Badge variant="secondary">{{ cat.count }}</Badge>
                  </TableCell>
                  <TableCell class="text-sm text-muted-foreground">
                    {{ new Date(cat.lastUpdated).toLocaleString() }}
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </TabsContent>
    </Tabs>

    <!-- Sync Confirmation Dialog -->
    <AlertDialog v-model:open="syncDialogOpen">
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Sync Flags from MUD Source?</AlertDialogTitle>
          <AlertDialogDescription>
            This will parse the MUD source code and update the database with the latest flag definitions.
            Existing flags will be updated, new flags will be added, and removed flags will be deleted.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction @click="confirmSync" :disabled="syncFlagsMutation.isPending.value">
            <RefreshCw v-if="syncFlagsMutation.isPending.value" class="h-4 w-4 mr-2 animate-spin" />
            Sync Flags
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </div>
</template>
