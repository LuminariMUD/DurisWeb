<script setup lang="ts">
import { computed } from 'vue'
import { useMudStore } from '@/stores/mudStore'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { Separator } from '@/components/ui/separator'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import {
  Heart,
  Sparkles,
  Footprints,
  Coins,
  Swords,
  Star,
  Square,
  Navigation,
  // Position icons
  PersonStanding,
  Armchair,
  BedDouble,
  Moon,
} from 'lucide-vue-next'
import { Button } from '@/components/ui/button'
import { parseAnsiToHtml } from '@/utils/ansiParser'
import QuestPopover from './QuestPopover.vue'

const store = useMudStore()

// Computed values
const vitals = computed(() => store.vitals)
const hpPercent = computed(() => store.hpPercent)
const manaPercent = computed(() => store.manaPercent)
const movePercent = computed(() => store.movePercent)
const expPercent = computed(() => store.expPercent)
const combatTarget = computed(() => store.combatTarget)
const quest = computed(() => store.quest)

// Format large numbers with commas
const formatNumber = (num: number): string => {
  return num.toLocaleString()
}

// Get vitals bar color class based on percentage
const getVitalColor = (percent: number): string => {
  if (percent <= 25) return 'bar-critical'
  if (percent <= 50) return 'bar-warning'
  if (percent <= 75) return 'bar-caution'
  return 'bar-good'
}

// Get position icon component
const getPositionIcon = (position: string) => {
  switch (position) {
    case 'standing': return PersonStanding
    case 'sitting': return Armchair
    case 'resting': return Moon
    case 'sleeping': return BedDouble
    case 'fighting': return Swords
    default: return PersonStanding
  }
}
</script>

<template>
  <div class="flex items-center gap-2 lg:gap-4 p-2 lg:p-3 border-b bg-muted/30">
    <!-- Position Badge - Icon on mobile, text on desktop -->
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger as-child>
          <!-- Mobile: Icon only -->
          <div class="lg:hidden">
            <component
              :is="getPositionIcon(vitals.position)"
              class="h-5 w-5"
              :class="vitals.position === 'standing' ? 'text-muted-foreground' : 'text-red-400'"
            />
          </div>
        </TooltipTrigger>
        <TooltipContent>
          <p class="capitalize">{{ vitals.position }}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
    <!-- Desktop: Text badge -->
    <Badge :variant="vitals.position === 'standing' ? 'outline' : 'destructive'" class="hidden lg:inline-flex capitalize">{{ vitals.position }}</Badge>

    <Separator orientation="vertical" class="hidden lg:block h-6" />

    <!-- HP Bar -->
    <div class="flex-1">
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger as-child>
            <div class="flex items-center gap-1 cursor-default">
              <Heart class="h-4 w-4 text-red-400 shrink-0" />
              <div class="flex-1 relative">
                <Progress
                  :model-value="hpPercent"
                  class="h-4 lg:h-5"
                  :class="getVitalColor(hpPercent)"
                />
                <span class="absolute inset-0 flex items-center justify-center text-[10px] lg:text-xs font-mono text-white drop-shadow-md">
                  {{ formatNumber(vitals.hp) }}/{{ formatNumber(vitals.maxHp) }}
                </span>
              </div>
            </div>
          </TooltipTrigger>
          <TooltipContent>
            <p class="font-semibold">Hit Points</p>
            <p>{{ formatNumber(vitals.hp) }} / {{ formatNumber(vitals.maxHp) }} ({{ hpPercent }}%)</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    </div>

    <!-- Mana Bar - Only show for mana-using classes (Psionicist, Mindflayer, Illithid/Pillithid) -->
    <div v-if="vitals.usesMana" class="flex-1">
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger as-child>
            <div class="flex items-center gap-1 cursor-default">
              <Sparkles class="h-4 w-4 text-blue-400 shrink-0" />
              <div class="flex-1 relative">
                <Progress
                  :model-value="manaPercent"
                  class="h-4 lg:h-5"
                  :class="getVitalColor(manaPercent)"
                />
                <span class="absolute inset-0 flex items-center justify-center text-[10px] lg:text-xs font-mono text-white drop-shadow-md">
                  {{ formatNumber(vitals.mana) }}/{{ formatNumber(vitals.maxMana) }}
                </span>
              </div>
            </div>
          </TooltipTrigger>
          <TooltipContent>
            <p class="font-semibold">Mana</p>
            <p>{{ formatNumber(vitals.mana) }} / {{ formatNumber(vitals.maxMana) }} ({{ manaPercent }}%)</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    </div>

    <!-- Move Bar -->
    <div class="flex-1">
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger as-child>
            <div class="flex items-center gap-1 cursor-default">
              <Footprints class="h-4 w-4 text-emerald-400 shrink-0" />
              <div class="flex-1 relative">
                <Progress
                  :model-value="movePercent"
                  class="h-4 lg:h-5"
                  :class="getVitalColor(movePercent)"
                />
                <span class="absolute inset-0 flex items-center justify-center text-[10px] lg:text-xs font-mono text-white drop-shadow-md">
                  {{ formatNumber(vitals.move) }}/{{ formatNumber(vitals.maxMove) }}
                </span>
              </div>
            </div>
          </TooltipTrigger>
          <TooltipContent>
            <p class="font-semibold">Movement</p>
            <p>{{ formatNumber(vitals.move) }} / {{ formatNumber(vitals.maxMove) }} ({{ movePercent }}%)</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    </div>

    <!-- Exp Bar -->
    <div class="flex-1">
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger as-child>
            <div class="flex items-center gap-1 cursor-default">
              <Star class="h-4 w-4 text-purple-400 shrink-0" />
              <div class="flex-1 relative">
                <Progress
                  :model-value="expPercent"
                  class="h-4 lg:h-5 bar-exp"
                />
                <span class="absolute inset-0 flex items-center justify-center text-[10px] lg:text-xs font-mono text-white drop-shadow-md">
                  {{ expPercent }}%
                </span>
              </div>
            </div>
          </TooltipTrigger>
          <TooltipContent>
            <p class="font-semibold">Experience</p>
            <p>{{ formatNumber(vitals.exp) }} / {{ formatNumber(vitals.tnl) }} to next level</p>
            <p>{{ expPercent }}% complete</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    </div>

    <Separator orientation="vertical" class="hidden lg:block h-6" />

    <!-- Coins (hidden on mobile and when fighting) -->
    <div v-if="!combatTarget" class="hidden lg:block">
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger as-child>
            <div class="flex items-center gap-1 cursor-default">
              <Coins class="h-4 w-4 text-yellow-400" />
              <span class="text-sm font-mono">
                <span v-if="vitals.platinum" class="text-cyan-300">{{ vitals.platinum }}p </span>
                <span v-if="vitals.gold" class="text-yellow-300">{{ vitals.gold }}g </span>
                <span v-if="vitals.silver" class="text-gray-300">{{ vitals.silver }}s </span>
                <span v-if="vitals.copper" class="text-orange-300">{{ vitals.copper }}c</span>
                <span v-if="!vitals.platinum && !vitals.gold && !vitals.silver && !vitals.copper" class="text-gray-500">0</span>
              </span>
            </div>
          </TooltipTrigger>
          <TooltipContent>
            <p class="font-semibold">Coins Carried</p>
            <p class="text-xs text-muted-foreground">
              <span class="text-cyan-300">p</span>=platinum,
              <span class="text-yellow-300">g</span>=gold,
              <span class="text-gray-300">s</span>=silver,
              <span class="text-orange-300">c</span>=copper
            </p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    </div>

    <!-- Quest (shown when quest data available, hidden on mobile) -->
    <template v-if="quest && !combatTarget">
      <Separator orientation="vertical" class="hidden lg:block h-6" />
      <div class="hidden lg:block">
        <QuestPopover :quest="quest" :quest-map="store.questMap" />
      </div>
    </template>

    <!-- Speedwalk (shown when speedwalking) -->
    <template v-if="store.isSpeedwalking">
      <Separator orientation="vertical" class="hidden lg:block h-6" />
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger as-child>
            <div class="flex items-center gap-1 cursor-default">
              <Navigation class="h-4 w-4 text-blue-400 animate-pulse" />
              <Badge variant="secondary" class="text-xs">{{ store.speedwalkStepsRemaining }}</Badge>
            </div>
          </TooltipTrigger>
          <TooltipContent>
            <p class="font-semibold">Speedwalking</p>
            <p v-html="parseAnsiToHtml(store.speedwalkTarget)" />
            <p class="text-xs text-muted-foreground">{{ store.speedwalkStepsRemaining }} steps remaining</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
      <Button
        variant="destructive"
        size="icon"
        class="h-6 w-6"
        title="Stop speedwalk"
        @click="store.stopSpeedwalk()"
      >
        <Square class="h-3 w-3" />
      </Button>
    </template>

    <!-- Combat Target (compact display in status bar) -->
    <template v-if="combatTarget">
      <Separator orientation="vertical" class="hidden lg:block h-6" />
      <div class="flex items-center gap-1 lg:gap-2">
        <Swords class="h-4 w-4 text-red-500 shrink-0" />
        <span class="text-xs lg:text-sm truncate max-w-[60px] lg:max-w-none">{{ combatTarget.name }}</span>
        <Badge variant="destructive" class="hidden lg:inline-flex text-xs capitalize">{{ combatTarget.position }}</Badge>
        <Progress
          :model-value="combatTarget.healthPercent"
          class="h-3 w-16 lg:w-24 target-health"
        />
        <span class="hidden lg:inline text-xs text-muted-foreground">{{ combatTarget.health }}</span>
      </div>
    </template>

      </div>
</template>

<style scoped>
/* Bar colors based on percentage */
:deep(.bar-good [data-slot="progress-indicator"]) {
  background-color: rgb(34 197 94) !important; /* green-500 */
}
:deep(.bar-caution [data-slot="progress-indicator"]) {
  background-color: rgb(234 179 8) !important; /* yellow-500 */
}
:deep(.bar-warning [data-slot="progress-indicator"]) {
  background-color: rgb(249 115 22) !important; /* orange-500 */
}
:deep(.bar-critical [data-slot="progress-indicator"]) {
  background-color: rgb(220 38 38) !important; /* red-600 */
}

/* Exp bar */
:deep(.bar-exp [data-slot="progress-indicator"]) {
  background-color: rgb(168 85 247) !important; /* purple-500 */
}

/* Target health bar */
:deep(.target-health [data-slot="progress-indicator"]) {
  background-color: rgb(239 68 68) !important;
}
</style>
