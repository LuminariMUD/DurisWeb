<script setup lang="ts">
import { ref, onMounted, watch } from 'vue'
import { useRouter } from 'vue-router'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import AnsiText from '@/components/ui/AnsiText.vue'
import { wikiApi } from '@/services/api'
import type { WikiObjectDetail } from '@/types'
import { Loader2, ArrowLeft, MapPin, Shield, Sword, Sparkles, Zap } from 'lucide-vue-next'

const props = defineProps<{
  vnum: string
}>()

const router = useRouter()

// State
const loading = ref(true)
const error = ref<string | null>(null)
const object = ref<WikiObjectDetail | null>(null)

// Load object data
async function loadObject() {
  try {
    loading.value = true
    error.value = null

    const objVnum = parseInt(props.vnum)
    if (isNaN(objVnum)) {
      error.value = 'Invalid object VNUM'
      return
    }

    object.value = await wikiApi.getObjectDetail(objVnum)
  } catch (e: any) {
    if (e.response?.status === 404) {
      error.value = 'Object not found'
    } else {
      error.value = 'Failed to load object data'
    }
    console.error('Failed to load wiki object:', e)
  } finally {
    loading.value = false
  }
}

// Navigate back
function goBack() {
  router.push('/wiki/objects')
}

// Navigate to zone
function goToZone(zoneNumber: number) {
  router.push(`/wiki/zones/${zoneNumber}`)
}

// Navigate to room in zone
function goToRoom(zoneNumber: number, roomVnum: number) {
  router.push(`/wiki/zones/${zoneNumber}?room=${roomVnum}`)
}

// Navigate to mob detail
function goToMob(zoneNumber: number, mobVnum: number) {
  router.push(`/wiki/mobs/${zoneNumber}/${mobVnum}`)
}

// Navigate to object detail (for containers)
function goToObject(objVnum: number) {
  router.push(`/wiki/objects/${objVnum}`)
}

// Get badge variant for affect
function getAffectVariant(modifier: number): 'default' | 'secondary' | 'destructive' | 'outline' {
  if (modifier > 0) return 'default'
  if (modifier < 0) return 'destructive'
  return 'secondary'
}

// Load on mount and when vnum changes
onMounted(() => {
  loadObject()
})

watch(() => props.vnum, () => {
  loadObject()
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
              Back to Objects
            </Button>
            <Button @click="loadObject">Retry</Button>
          </div>
        </CardContent>
      </Card>
    </div>

    <!-- Object Detail -->
    <div v-else-if="object" class="space-y-6">
      <!-- Header -->
      <div class="flex items-start gap-3 sm:gap-4">
        <Button variant="ghost" size="icon" class="shrink-0" @click="goBack">
          <ArrowLeft class="h-5 w-5" />
        </Button>
        <div class="flex-1 min-w-0">
          <h1 class="text-xl sm:text-2xl font-bold">
            <AnsiText :text="object.name" />
          </h1>
          <p class="text-sm text-muted-foreground">VNUM: {{ object.vnum }}</p>
        </div>
      </div>

      <div class="grid md:grid-cols-2 gap-4 md:gap-6">
        <!-- Basic Info -->
        <Card>
          <CardHeader class="pb-3 sm:pb-6">
            <CardTitle class="flex items-center gap-2 text-base sm:text-lg">
              <Shield class="h-4 w-4 sm:h-5 sm:w-5" />
              Basic Info
            </CardTitle>
          </CardHeader>
          <CardContent class="space-y-4">
            <div class="grid grid-cols-2 gap-3 sm:gap-4">
              <div>
                <p class="text-sm text-muted-foreground">Type</p>
                <Badge variant="outline" class="mt-1">{{ object.typeName }}</Badge>
              </div>
              <div>
                <p class="text-sm text-muted-foreground">Level</p>
                <p class="font-medium">{{ object.level }}</p>
              </div>
              <div>
                <p class="text-sm text-muted-foreground">Weight</p>
                <p class="font-medium">{{ object.weight }} lbs</p>
              </div>
            </div>

            <!-- Description -->
            <div v-if="object.description">
              <Separator class="my-4" />
              <p class="text-sm text-muted-foreground mb-2">Description</p>
              <p class="text-sm whitespace-pre-wrap">
                <AnsiText :text="object.description" />
              </p>
            </div>
          </CardContent>
        </Card>

        <!-- Wear Slots & Flags -->
        <Card>
          <CardHeader class="pb-3 sm:pb-6">
            <CardTitle class="flex items-center gap-2 text-base sm:text-lg">
              <Sword class="h-4 w-4 sm:h-5 sm:w-5" />
              Wear Slots & Flags
            </CardTitle>
          </CardHeader>
          <CardContent class="space-y-4">
            <!-- Wear Slots -->
            <div>
              <p class="text-xs sm:text-sm font-medium mb-2">Wear Slots</p>
              <div v-if="object.slots.length > 0" class="flex flex-wrap gap-2">
                <Badge
                  v-for="slot in object.slots"
                  :key="slot"
                  variant="secondary"
                >
                  {{ slot }}
                </Badge>
              </div>
              <p v-else class="text-muted-foreground text-sm">
                Cannot be worn
              </p>
            </div>
            <!-- Item Flags -->
            <div v-if="object.extraFlagNames && object.extraFlagNames.length > 0">
              <p class="text-xs sm:text-sm font-medium mb-2">Item Flags</p>
              <div class="flex flex-wrap gap-2">
                <Badge
                  v-for="flag in object.extraFlagNames"
                  :key="flag"
                  variant="outline"
                >
                  {{ flag }}
                </Badge>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <!-- Secondary info grid - 2 columns on desktop -->
      <div class="grid md:grid-cols-2 gap-4 md:gap-6">
        <!-- Affects -->
        <Card v-if="object.affects.length > 0">
          <CardHeader class="pb-3 sm:pb-6">
            <CardTitle class="flex items-center gap-2 text-base sm:text-lg">
              <Sparkles class="h-4 w-4 sm:h-5 sm:w-5" />
              Affects / Bonuses
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div class="grid grid-cols-2 gap-2 sm:gap-3">
              <div
                v-for="(affect, index) in object.affects"
                :key="index"
                class="flex items-center justify-between p-2 sm:p-3 rounded-lg bg-muted/50"
              >
                <span class="text-xs sm:text-sm font-medium">{{ affect.locationName }}</span>
                <Badge :variant="getAffectVariant(affect.modifier)">
                  {{ affect.modifier > 0 ? '+' : '' }}{{ affect.modifier }}
                </Badge>
              </div>
            </div>
          </CardContent>
        </Card>

        <!-- Spell Effects -->
        <Card v-if="object.spellEffects && object.spellEffects.length > 0">
          <CardHeader class="pb-3 sm:pb-6">
            <CardTitle class="flex items-center gap-2 text-base sm:text-lg">
              <Zap class="h-4 w-4 sm:h-5 sm:w-5" />
              Spell Effects
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div class="flex flex-wrap gap-2">
              <Badge
                v-for="effect in object.spellEffects"
                :key="effect"
                variant="outline"
                class="bg-purple-500/10 text-purple-500 border-purple-500/20"
              >
                {{ effect }}
              </Badge>
            </div>
          </CardContent>
        </Card>

        <!-- Class/Race Restrictions -->
        <Card v-if="(object.classRestrictions && object.classRestrictions.length > 0) || (object.raceRestrictions && object.raceRestrictions.length > 0)">
          <CardHeader class="pb-3 sm:pb-6">
            <CardTitle class="flex items-center gap-2 text-base sm:text-lg">
              <Shield class="h-4 w-4 sm:h-5 sm:w-5" />
              Restrictions
            </CardTitle>
          </CardHeader>
          <CardContent class="space-y-4">
            <!-- Class Restrictions -->
            <div v-if="object.classRestrictions && object.classRestrictions.length > 0">
              <p class="text-xs sm:text-sm font-medium mb-2">
                {{ object.classRestrictions[0]?.isAllowed ? 'Allowed Classes:' : 'Restricted Classes:' }}
              </p>
              <div class="flex flex-wrap gap-2">
                <Badge
                  v-for="cls in object.classRestrictions"
                  :key="cls.className"
                  :variant="cls.isAllowed ? 'default' : 'destructive'"
                >
                  {{ cls.className }}
                </Badge>
              </div>
            </div>
            <!-- Race Restrictions -->
            <div v-if="object.raceRestrictions && object.raceRestrictions.length > 0">
              <p class="text-xs sm:text-sm font-medium mb-2">
                {{ object.raceRestrictions[0]?.isAllowed ? 'Allowed Races:' : 'Restricted Races:' }}
              </p>
              <div class="flex flex-wrap gap-2">
                <Badge
                  v-for="race in object.raceRestrictions"
                  :key="race.raceName"
                  :variant="race.isAllowed ? 'default' : 'destructive'"
                >
                  {{ race.raceName }}
                </Badge>
              </div>
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
          <CardContent class="space-y-4">
            <!-- Zone Locations -->
            <div v-if="object.zoneLocations.length > 0">
              <p class="text-xs sm:text-sm font-medium mb-2">Zone:</p>
              <div class="flex flex-col gap-1.5">
                <Button
                  v-for="loc in object.zoneLocations"
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

            <!-- Loads in Rooms -->
            <div v-if="object.roomLoads && object.roomLoads.length > 0">
              <p class="text-xs sm:text-sm font-medium mb-2">Rooms:</p>
              <div class="flex flex-col gap-1.5">
                <Button
                  v-for="room in object.roomLoads"
                  :key="room.roomVnum"
                  variant="outline"
                  size="sm"
                  class="justify-start h-auto py-1.5 px-2 sm:px-3 text-xs sm:text-sm whitespace-normal text-left"
                  @click="goToRoom(room.zoneNumber, room.roomVnum)"
                >
                  <AnsiText :text="room.roomName" />
                  <span class="ml-1 text-muted-foreground">(#{{ room.roomVnum }})</span>
                </Button>
              </div>
            </div>

            <!-- Loads on Mobs -->
            <div v-if="object.mobDrops && object.mobDrops.length > 0">
              <p class="text-xs sm:text-sm font-medium mb-2">Mobs:</p>
              <div class="flex flex-col gap-1.5">
                <Button
                  v-for="drop in object.mobDrops"
                  :key="drop.mobVnum"
                  variant="outline"
                  size="sm"
                  class="justify-start h-auto py-1.5 px-2 sm:px-3 text-xs sm:text-sm whitespace-normal text-left"
                  @click="goToMob(drop.zoneNumber, drop.mobVnum)"
                >
                  <AnsiText :text="drop.mobName" />
                  <span class="ml-1 text-muted-foreground">(#{{ drop.mobVnum }})</span>
                </Button>
              </div>
            </div>

            <!-- Loads in Containers -->
            <div v-if="object.containerLoads && object.containerLoads.length > 0">
              <p class="text-xs sm:text-sm font-medium mb-2">Containers:</p>
              <div class="flex flex-col gap-1.5">
                <Button
                  v-for="container in object.containerLoads"
                  :key="container.containerVnum"
                  variant="outline"
                  size="sm"
                  class="justify-start h-auto py-1.5 px-2 sm:px-3 text-xs sm:text-sm whitespace-normal text-left"
                  @click="goToObject(container.containerVnum)"
                >
                  <AnsiText :text="container.containerName" />
                  <span class="ml-1 text-muted-foreground">(#{{ container.containerVnum }})</span>
                </Button>
              </div>
            </div>

            <!-- No locations -->
            <div
              v-if="object.zoneLocations.length === 0 && (!object.roomLoads || object.roomLoads.length === 0) && (!object.mobDrops || object.mobDrops.length === 0) && (!object.containerLoads || object.containerLoads.length === 0)"
              class="text-center text-muted-foreground py-4"
            >
              No load locations found.
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
    </div>
  </div>
</template>
