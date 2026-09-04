<script setup lang="ts">
import { ref, onMounted, watch } from 'vue'
import { useRouter } from 'vue-router'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import AnsiText from '@/components/ui/AnsiText.vue'
import { wikiApi } from '@/services/api'
import { hasApiErrorCode } from '@/utils/apiError'
import type { WikiMobDetail } from '@/types'
import { Loader2, ArrowLeft, MapPin, Swords, Heart, Skull, Info, Package } from 'lucide-vue-next'

const props = defineProps<{
  zoneNumber: string
  vnum: string
}>()

const router = useRouter()

// State
const loading = ref(true)
const error = ref<string | null>(null)
const mob = ref<WikiMobDetail | null>(null)

/** Load mob details while preserving the stable unavailable-generation contract. */
async function loadMob() {
  try {
    loading.value = true
    error.value = null

    const zoneNum = parseInt(props.zoneNumber)
    const mobVnum = parseInt(props.vnum)
    if (isNaN(zoneNum) || isNaN(mobVnum)) {
      error.value = 'Invalid zone number or mob VNUM'
      return
    }

    mob.value = await wikiApi.getMobDetail(zoneNum, mobVnum)
  } catch (e: unknown) {
    if (hasApiErrorCode(e, 503, 'WIKI_MOB_REFERENCE_UNAVAILABLE')) {
      error.value = 'Mob reference data is temporarily unavailable. An operator must publish it.'
    } else if (
      e &&
      typeof e === 'object' &&
      'response' in e &&
      (e as { response?: { status?: unknown } }).response?.status === 404
    ) {
      error.value = 'Mob not found'
    } else {
      error.value = 'Failed to load mob data'
      console.error('Failed to load wiki mob:', e)
    }
  } finally {
    loading.value = false
  }
}

// Navigate back
function goBack() {
  router.push('/wiki/mobs')
}

// Navigate to zone
function goToZone(zoneNumber: number) {
  router.push(`/wiki/zones/${zoneNumber}`)
}

// Navigate to room in zone
function goToRoom(zoneNumber: number, roomVnum: number) {
  router.push(`/wiki/zones/${zoneNumber}?room=${roomVnum}`)
}

// Navigate to object detail page
function goToObject(objVnum: number) {
  router.push(`/wiki/objects/${objVnum}`)
}

// Get alignment badge variant
function getAlignmentVariant(alignment: number): 'default' | 'destructive' | 'secondary' {
  if (alignment >= 350) return 'default'
  if (alignment <= -350) return 'destructive'
  return 'secondary'
}

// Get alignment label
function getAlignmentLabel(alignment: number): string {
  if (alignment >= 350) return 'Good'
  if (alignment <= -350) return 'Evil'
  return 'Neutral'
}

// Format alignment for display
function formatAlignment(alignment: number): string {
  const label = getAlignmentLabel(alignment)
  return `${label} (${alignment})`
}

// Load on mount and when vnum changes
onMounted(() => {
  loadMob()
})

watch([() => props.zoneNumber, () => props.vnum], () => {
  loadMob()
})
</script>

<template>
  <div class="h-full overflow-y-auto">
    <div class="px-4 py-6">
    <!-- Loading State -->
    <div v-if="loading" class="flex items-center justify-center py-12">
      <Loader2 class="h-8 w-8 animate-spin text-muted-foreground" />
    </div>

    <!-- Error State -->
    <div v-else-if="error" class="flex items-center justify-center py-12">
      <Card class="max-w-md">
        <CardContent class="pt-6 text-center">
          <p class="text-destructive">{{ error }}</p>
          <div class="flex gap-2 mt-4 justify-center">
            <Button variant="outline" @click="goBack">
              <ArrowLeft class="h-4 w-4 mr-2" />
              Back to Mobs
            </Button>
            <Button @click="loadMob">Retry</Button>
          </div>
        </CardContent>
      </Card>
    </div>

    <!-- Mob Detail -->
    <div v-else-if="mob" class="space-y-6">
      <!-- Header -->
      <div class="flex flex-col sm:flex-row sm:items-start gap-3 sm:gap-4">
        <div class="flex items-start gap-3 sm:gap-4">
          <Button variant="ghost" size="icon" class="shrink-0" @click="goBack">
            <ArrowLeft class="h-5 w-5" />
          </Button>
          <div class="flex-1 min-w-0">
            <h1 class="text-xl sm:text-2xl font-bold">
              <AnsiText :text="mob.name" />
            </h1>
            <p class="text-sm text-muted-foreground">VNUM: {{ mob.vnum }}</p>
          </div>
        </div>
        <div class="flex flex-wrap gap-2 ml-11 sm:ml-0">
          <Badge variant="outline">Level {{ mob.level }}</Badge>
          <Badge v-if="mob.classname !== 'None'" variant="secondary">{{ mob.classname }}</Badge>
          <Badge :variant="getAlignmentVariant(mob.alignment)">
            {{ formatAlignment(mob.alignment) }}
          </Badge>
        </div>
      </div>

      <div class="grid md:grid-cols-2 gap-4 md:gap-6">
        <!-- Stats & Flags -->
        <Card>
          <CardHeader class="pb-3 sm:pb-6">
            <CardTitle class="flex items-center gap-2 text-base sm:text-lg">
              <Info class="h-4 w-4 sm:h-5 sm:w-5" />
              Stats and Flags
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div class="grid grid-cols-2 gap-3 sm:gap-4 mb-4">
              <div>
                <p class="text-sm text-muted-foreground">Level</p>
                <p class="font-medium">{{ mob.level }}</p>
              </div>
              <div>
                <p class="text-sm text-muted-foreground">Class</p>
                <p class="font-medium">{{ mob.classname }}</p>
              </div>
              <div>
                <p class="text-sm text-muted-foreground">Race</p>
                <p class="font-medium">{{ mob.raceName }}</p>
              </div>
              <div>
                <p class="text-sm text-muted-foreground">Alignment</p>
                <Badge :variant="getAlignmentVariant(mob.alignment)" class="mt-1">
                  {{ formatAlignment(mob.alignment) }}
                </Badge>
              </div>
            </div>
            <!-- Flags -->
            <div v-if="mob.flags && mob.flags.length > 0">
              <p class="text-sm text-muted-foreground mb-2">Flags</p>
              <div class="flex flex-wrap gap-1">
                <Badge
                  v-for="flag in mob.flags"
                  :key="flag"
                  variant="outline"
                  class="text-xs"
                >
                  {{ flag }}
                </Badge>
              </div>
            </div>
          </CardContent>
        </Card>

        <!-- Equipment -->
        <Card>
          <CardHeader class="pb-3 sm:pb-6">
            <CardTitle class="flex items-center gap-2 text-base sm:text-lg">
              <Package class="h-4 w-4 sm:h-5 sm:w-5" />
              Equipment
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div v-if="mob.equipment && mob.equipment.length > 0" class="space-y-2">
              <div
                v-for="item in mob.equipment"
                :key="`${item.vnum}-${item.slot}`"
                class="flex items-center justify-between gap-2 py-1 border-b border-border/50 last:border-0"
              >
                <div
                  class="flex-1 min-w-0 cursor-pointer hover:underline"
                  @click="goToObject(item.vnum)"
                >
                  <AnsiText :text="item.name" />
                </div>
                <Badge variant="secondary" class="shrink-0 text-xs">
                  {{ item.slot }}
                </Badge>
              </div>
            </div>
            <div v-else class="text-center text-muted-foreground py-4">
              No equipment loads on this mob.
            </div>
          </CardContent>
        </Card>
      </div>

      <!-- Room Description (what you see in room) -->
      <Card>
        <CardHeader class="pb-3 sm:pb-6">
          <CardTitle class="flex items-center gap-2 text-base sm:text-lg">
            <Skull class="h-4 w-4 sm:h-5 sm:w-5" />
            Room Description
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p class="text-xs sm:text-sm text-muted-foreground mb-2">
            What you see when the mob is in the room:
          </p>
          <div class="bg-black text-zinc-100 p-3 sm:p-4 rounded-lg font-mono text-xs sm:text-sm">
            <AnsiText :text="mob.longDesc || 'No room description.'" />
          </div>
        </CardContent>
      </Card>

      <!-- Detailed Description (when you look at mob) -->
      <Card v-if="mob.detailedDesc">
        <CardHeader class="pb-3 sm:pb-6">
          <CardTitle class="flex items-center gap-2 text-base sm:text-lg">
            <Heart class="h-4 w-4 sm:h-5 sm:w-5" />
            Look Description
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p class="text-xs sm:text-sm text-muted-foreground mb-2">
            What you see when you look at the mob:
          </p>
          <div class="bg-black text-zinc-100 p-3 sm:p-4 rounded-lg font-mono text-xs sm:text-sm whitespace-pre-wrap">
            <AnsiText :text="mob.detailedDesc" />
          </div>
        </CardContent>
      </Card>

      <!-- Keywords -->
      <Card>
        <CardHeader class="pb-3 sm:pb-6">
          <CardTitle class="flex items-center gap-2 text-base sm:text-lg">
            <Swords class="h-4 w-4 sm:h-5 sm:w-5" />
            Keywords
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p class="text-xs sm:text-sm text-muted-foreground mb-2">
            Words you can use to target this mob:
          </p>
          <div class="flex flex-wrap gap-2">
            <Badge
              v-for="keyword in mob.keywords.split(' ').filter(k => k)"
              :key="keyword"
              variant="outline"
            >
              {{ keyword }}
            </Badge>
          </div>
        </CardContent>
      </Card>

      <!-- Where to Find -->
      <Card>
        <CardHeader class="pb-3 sm:pb-6">
          <CardTitle class="flex items-center gap-2 text-base sm:text-lg">
            <MapPin class="h-4 w-4 sm:h-5 sm:w-5" />
            Where to Find
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div class="grid md:grid-cols-2 gap-4 md:gap-6">
            <!-- Zone Locations -->
            <div v-if="mob.zoneLocations.length > 0">
              <p class="text-xs sm:text-sm font-medium mb-2 sm:mb-3">Found in Zone:</p>
              <div class="flex flex-col gap-1.5">
                <Button
                  v-for="loc in mob.zoneLocations"
                  :key="loc.zoneNumber"
                  variant="outline"
                  size="sm"
                  class="justify-start h-auto py-1.5 px-2 sm:px-3 text-xs sm:text-sm whitespace-normal text-left"
                  @click="goToZone(loc.zoneNumber)"
                >
                  <AnsiText :text="loc.zoneName" />
                  <span class="ml-1 text-muted-foreground">(#{{ loc.zoneNumber }})</span>
                </Button>
              </div>
            </div>

            <!-- Spawn Rooms -->
            <div v-if="mob.spawnRooms && mob.spawnRooms.length > 0">
              <p class="text-xs sm:text-sm font-medium mb-2 sm:mb-3">Found in Room:</p>
              <div class="flex flex-col gap-1.5">
                <Button
                  v-for="room in mob.spawnRooms"
                  :key="room.roomVnum"
                  variant="outline"
                  size="sm"
                  class="justify-start h-auto py-1.5 px-2 sm:px-3 text-xs sm:text-sm whitespace-normal text-left"
                  @click="goToRoom(mob.zoneNumber, room.roomVnum)"
                >
                  <AnsiText :text="room.roomName" />
                  <span class="ml-1 text-muted-foreground">(#{{ room.roomVnum }})</span>
                </Button>
              </div>
            </div>
          </div>

          <!-- No locations -->
          <div
            v-if="mob.zoneLocations.length === 0 && (!mob.spawnRooms || mob.spawnRooms.length === 0)"
            class="text-center text-muted-foreground py-4"
          >
            No spawn locations found for this mob.
          </div>
        </CardContent>
      </Card>
    </div>
    </div>
  </div>
</template>
