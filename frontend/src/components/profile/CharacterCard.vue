<script setup lang="ts">
import { computed } from 'vue'
import type { CharacterWithStats } from '@/types'
import { Card, CardContent } from '@/components/ui/card'
import AnsiText from '@/components/ui/AnsiText.vue'
import { formatWealthBreakdown } from '@/utils/formatWealth'
import { ChevronDown, ChevronUp, Sword, Skull, Trophy, MessageSquare, Clock, Coins } from 'lucide-vue-next'

const props = defineProps<{
  character: CharacterWithStats
  isExpanded: boolean
  isOwnProfile?: boolean
}>()

const emit = defineEmits<{
  (e: 'toggle'): void
}>()

const kdRatio = computed(() => {
  if (props.character.stats.deaths === 0) {
    return props.character.stats.frags > 0 ? props.character.stats.frags.toFixed(1) : '0.0'
  }
  return (props.character.stats.frags / props.character.stats.deaths).toFixed(1)
})

const wealth = computed(() => {
  return formatWealthBreakdown(props.character.money, props.character.balance)
})

const playtimeFormatted = computed(() => {
  const hours = Math.floor(props.character.playtime / 3600)
  if (hours >= 1000) {
    return `${(hours / 1000).toFixed(1)}k hrs`
  }
  return `${hours.toLocaleString()} hrs`
})

const characterName = computed(() => {
  // Convert to title case (first letter uppercase, rest lowercase)
  const name = props.character.name || ''
  return name.charAt(0).toUpperCase() + name.slice(1).toLowerCase()
})
</script>

<template>
  <Card
    class="transition-all duration-200 cursor-pointer hover:border-primary/50"
    :class="{ 'border-primary': isExpanded }"
    @click="emit('toggle')"
  >
    <CardContent class="pt-4">
      <!-- Collapsed View -->
      <div class="flex justify-between items-start">
        <div class="flex-1 min-w-0">
          <div class="flex items-center gap-2">
            <span class="text-lg font-bold text-foreground">{{ characterName }}</span>
            <span class="text-sm text-muted-foreground">Lv.{{ character.level }}</span>
          </div>
          <div class="text-sm mt-1">
            <AnsiText :text="character.class" /> <AnsiText :text="character.race" />
          </div>
          <div v-if="character.guild" class="text-sm mt-1">
            <AnsiText :text="character.guild" />
            <span v-if="character.guildRank"> - <AnsiText :text="character.guildRank" /></span>
          </div>
          <div v-else class="text-sm text-muted-foreground mt-1">No Guild</div>
        </div>

        <div class="flex items-center gap-3">
          <div class="text-right">
            <div class="text-xl font-bold text-green-400">{{ character.stats.frags }}</div>
            <div class="text-xs text-muted-foreground">frags</div>
          </div>
          <component :is="isExpanded ? ChevronUp : ChevronDown" class="w-5 h-5 text-muted-foreground" />
        </div>
      </div>

      <!-- Expanded View -->
      <div v-if="isExpanded" class="mt-4 pt-4 border-t border-border">
        <!-- Stats Grid -->
        <div class="grid grid-cols-5 gap-4 text-center">
          <div>
            <div class="flex items-center justify-center gap-1 text-green-400">
              <Sword class="w-4 h-4" />
              <span class="text-xl font-bold">{{ character.stats.frags }}</span>
            </div>
            <div class="text-xs text-muted-foreground">Frags</div>
          </div>
          <div>
            <div class="flex items-center justify-center gap-1 text-red-400">
              <Skull class="w-4 h-4" />
              <span class="text-xl font-bold">{{ character.stats.deaths }}</span>
            </div>
            <div class="text-xs text-muted-foreground">Deaths</div>
          </div>
          <div>
            <div class="text-xl font-bold text-blue-400">{{ kdRatio }}</div>
            <div class="text-xs text-muted-foreground">K/D Ratio</div>
          </div>
          <div>
            <div class="flex items-center justify-center gap-1 text-purple-400">
              <Trophy class="w-4 h-4" />
              <span class="text-xl font-bold">{{ character.epics }}</span>
            </div>
            <div class="text-xs text-muted-foreground">Epics</div>
          </div>
          <div>
            <div class="flex items-center justify-center gap-1 text-cyan-400">
              <MessageSquare class="w-4 h-4" />
              <span class="text-xl font-bold">{{ character.stats.forumPosts }}</span>
            </div>
            <div class="text-xs text-muted-foreground">Posts</div>
          </div>
        </div>

        <!-- Additional Info -->
        <div class="mt-4 grid grid-cols-2 gap-4 text-sm">
          <!-- Left Column -->
          <div class="space-y-2">
            <div v-if="isOwnProfile" class="flex items-center gap-2 text-muted-foreground">
              <Clock class="w-4 h-4" />
              <span>Playtime: <span class="text-foreground">{{ playtimeFormatted }}</span></span>
            </div>
            <div v-if="character.stats.fragRank" class="text-muted-foreground">
              Frag Rank: <span class="text-foreground">#{{ character.stats.fragRank }}</span> Overall
            </div>
            <div v-if="character.spec" class="text-muted-foreground">
              Spec: <AnsiText :text="character.spec" class="text-foreground" />
            </div>
          </div>

          <!-- Right Column - Wealth (only visible to owner) -->
          <div v-if="isOwnProfile" class="space-y-2">
            <div class="flex items-center gap-2 text-muted-foreground">
              <Coins class="w-4 h-4" />
              <span>Wealth</span>
            </div>
            <div class="text-sm">
              <div class="text-foreground">{{ wealth.total }}</div>
              <div class="text-xs text-muted-foreground">
                On hand: {{ wealth.onHand }} | Bank: {{ wealth.inBank }}
              </div>
            </div>
          </div>
        </div>

        <!-- Forum Stats -->
        <div v-if="character.stats.forumThreads > 0" class="mt-3 text-sm text-muted-foreground">
          Forum: {{ character.stats.forumThreads }} threads created, {{ character.stats.forumPosts }} posts
        </div>
      </div>

      <!-- Click hint for collapsed -->
      <div v-if="!isExpanded" class="text-xs text-muted-foreground mt-2">
        Click to expand details
      </div>
    </CardContent>
  </Card>
</template>
