<script setup lang="ts">
import { computed, ref, onMounted, onUnmounted } from 'vue'
import { useMudStore } from '@/stores/mudStore'
import { useMudConnection } from '@/composables/useMudConnection'
import { useGroupActions } from '@/composables/useGroupActions'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { Button } from '@/components/ui/button'
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
  ContextMenuSeparator,
} from '@/components/ui/context-menu'
import GroupActionsDialog from './GroupActionsDialog.vue'
import {
  Shield,
  Flame,
  Snowflake,
  Zap,
  Eye,
  Wind,
  Heart,
  Sword,
  Sparkles,
  Moon,
  Sun,
  AlertCircle,
  Users,
  Crown,
  Bot,
  Plus,
  Minus,
  Settings,
  Anchor,
  Crosshair,
  ExternalLink,
} from 'lucide-vue-next'

import type { Component } from 'vue'
import type { MudShipContact } from '@/types/mud'

// Minimized state
const isMinimized = defineModel<boolean>('minimized', { default: false })

// Emit for opening radar
const emit = defineEmits<{
  openRadar: []
}>()

const store = useMudStore()
const { sendGameCommand } = useMudConnection()

// Tab state
const activeTab = ref<'affects' | 'group' | 'ship'>('affects')

const affects = computed(() => store.affects)

// Current time for countdown calculation (updates every second)
const now = ref(Date.now())
let intervalId: ReturnType<typeof setInterval> | null = null

onMounted(() => {
  intervalId = setInterval(() => {
    now.value = Date.now()
  }, 1000)
})

onUnmounted(() => {
  if (intervalId) {
    clearInterval(intervalId)
  }
})

// Computed affects with remaining time (reactive to now.value)
const affectsWithTime = computed(() => {
  return affects.value.map(affect => {
    let remaining = affect.duration
    if (affect.receivedAt) {
      const elapsed = Math.floor((now.value - affect.receivedAt) / 1000)
      remaining = Math.max(0, affect.duration - elapsed)
    }
    return {
      ...affect,
      remaining,
      percent: affect.duration > 0 ? Math.min(100, Math.max(0, (remaining / affect.duration) * 100)) : 0,
    }
  })
})

// Format seconds as MM:SS or just seconds
const formatDuration = (seconds: number): string => {
  if (seconds <= 0) return '0s'
  if (seconds < 60) return `${seconds}s`
  const mins = Math.floor(seconds / 60)
  const secs = seconds % 60
  return `${mins}:${secs.toString().padStart(2, '0')}`
}

// Map affect names to icons
const affectIcons: Record<string, Component> = {
  // Defensive
  sanctuary: Shield,
  armor: Shield,
  stoneskin: Shield,
  barkskin: Shield,
  blur: Eye,
  displacement: Wind,
  // Offensive
  strength: Sword,
  haste: Zap,
  bless: Sun,
  // Elemental
  fireshield: Flame,
  coldshield: Snowflake,
  // Utility
  fly: Wind,
  invisibility: Eye,
  infravision: Eye,
  detect_invisibility: Eye,
  waterbreathing: Sparkles,
  // Healing
  regeneration: Heart,
  // Status
  sleep: Moon,
  poison: AlertCircle,
  blindness: AlertCircle,
  curse: AlertCircle,
}

// Get icon for affect
const getAffectIcon = (affectName: string): Component => {
  const normalizedName = affectName.toLowerCase().replace(/\s+/g, '_')
  return affectIcons[normalizedName] || Sparkles
}

// Get color based on remaining seconds (warning when low)
const getDurationColor = (seconds: number): string => {
  if (seconds <= 30) return 'text-red-400'
  if (seconds <= 120) return 'text-orange-400'
  return 'text-green-400'
}


// Categorize affects
const categorizedAffects = computed(() => {
  const debuffKeywords = ['poison', 'blindness', 'curse', 'disease', 'weakness']
  const buffs = affectsWithTime.value.filter(
    (a) => a.name && !debuffKeywords.some(
      (debuff) => a.name.toLowerCase().includes(debuff)
    )
  )
  const debuffs = affectsWithTime.value.filter(
    (a) => a.name && debuffKeywords.some(
      (debuff) => a.name.toLowerCase().includes(debuff)
    )
  )
  return { buffs, debuffs }
})

// ==========================================================================
// Group Tab
// ==========================================================================

const group = computed(() => store.group)

// Get HP percentage for a group member
const getHpPercent = (hp: number, maxHp: number): number => {
  if (maxHp === 0) return 0
  return Math.min(100, Math.round((hp / maxHp) * 100))
}

// Get Move percentage for a group member
const getMovePercent = (move: number, maxMove: number): number => {
  if (maxMove === 0) return 0
  return Math.min(100, Math.round((move / maxMove) * 100))
}

// Get HP bar color class based on percentage
const getHpColor = (percent: number): string => {
  if (percent <= 25) return 'bar-critical'
  if (percent <= 50) return 'bar-warning'
  if (percent <= 75) return 'bar-caution'
  return 'bar-good'
}

// Truncate NPC name for display
const truncateName = (name: string, maxLen: number = 12): string => {
  if (name.length <= maxLen) return name
  return name.substring(0, maxLen) + '..'
}

// Group actions (customizable right-click menu)
const { actions: groupActions, getTarget } = useGroupActions()
const showActionsDialog = ref(false)

// Execute a group action on a member
const executeAction = (command: string, member: { name: string; isNpc: boolean; targetNum: number | null; targetKeyword: string | null }) => {
  const target = getTarget(member)
  sendGameCommand(`${command} ${target}`)
}

// ==========================================================================
// Ship Tab
// ==========================================================================

const shipContacts = computed(() => store.shipContacts)

// If we're receiving Ship.Contacts GMCP, we're on a ship
const isOnShip = computed(() => shipContacts.value !== null)

// Get color class for ship race
const getRaceColor = (race: MudShipContact['race']): string => {
  switch (race) {
    case 'good': return 'text-green-400 border-green-400/50'
    case 'evil': return 'text-red-400 border-red-400/50'
    case 'undead': return 'text-purple-400 border-purple-400/50'
    case 'squid': return 'text-orange-400 border-orange-400/50'
    default: return 'text-gray-400 border-gray-400/50'
  }
}

// Get color class for ship status
const getStatusColor = (status: MudShipContact['status']): string => {
  switch (status) {
    case 'flying': return 'text-blue-400 border-blue-400/50'
    case 'sinking': return 'text-red-400 border-red-400/50 animate-pulse'
    case 'docked': return 'text-gray-400 border-gray-400/50'
    case 'anchored': return 'text-amber-400 border-amber-400/50'
    default: return 'text-gray-400 border-gray-400/50'
  }
}

// Convert bearing to compass direction
const bearingToCompass = (bearing: number): string => {
  const directions = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'] as const
  const index = Math.round(bearing / 45) % 8
  return directions[index] ?? 'N'
}

// Execute ship action
const executeShipAction = (command: string, contact: MudShipContact) => {
  sendGameCommand(`${command} ${contact.id}`)
}
</script>

<template>
  <Card class="flex flex-col" :class="isMinimized ? 'h-auto' : 'h-full'">
    <CardHeader class="py-2 px-3 shrink-0 flex flex-row items-center justify-between">
      <!-- Tab Navigation -->
      <div class="flex items-center gap-1">
        <button
          class="flex items-center gap-1 px-2 py-1 text-sm rounded transition-colors"
          :class="activeTab === 'affects' ? 'bg-muted text-foreground' : 'text-muted-foreground hover:text-foreground'"
          @click="activeTab = 'affects'"
        >
          <Shield class="h-3.5 w-3.5" />
          Affects
          <Badge v-if="affects.length > 0" variant="outline" class="ml-1 h-5 px-1.5 text-xs">
            {{ affects.length }}
          </Badge>
        </button>
        <button
          class="flex items-center gap-1 px-2 py-1 text-sm rounded transition-colors"
          :class="activeTab === 'group' ? 'bg-muted text-foreground' : 'text-muted-foreground hover:text-foreground'"
          @click="activeTab = 'group'"
        >
          <Users class="h-3.5 w-3.5" />
          Group
          <Badge v-if="group && group.size > 0" variant="outline" class="ml-1 h-5 px-1.5 text-xs">
            {{ group.size }}/{{ group.maxSize }}
          </Badge>
        </button>
        <button
          class="flex items-center gap-1 px-2 py-1 text-sm rounded transition-colors"
          :class="activeTab === 'ship' ? 'bg-muted text-foreground' : 'text-muted-foreground hover:text-foreground'"
          @click="activeTab = 'ship'"
        >
          <Anchor class="h-3.5 w-3.5" />
          Ship
          <Badge v-if="shipContacts && shipContacts.contacts.length > 0" variant="outline" class="ml-1 h-5 px-1.5 text-xs">
            {{ shipContacts.contacts.length }}
          </Badge>
        </button>
        <!-- Group Actions Settings -->
        <Button
          v-if="activeTab === 'group'"
          variant="ghost"
          size="icon"
          class="h-5 w-5 text-muted-foreground hover:text-foreground"
          title="Configure group actions"
          @click="showActionsDialog = true"
        >
          <Settings class="h-3 w-3" />
        </Button>
        <!-- Open Radar Button -->
        <Button
          v-if="activeTab === 'ship'"
          variant="ghost"
          size="icon"
          class="h-5 w-5 text-muted-foreground hover:text-foreground"
          title="Open radar window"
          @click="emit('openRadar')"
        >
          <ExternalLink class="h-3 w-3" />
        </Button>
      </div>
      <!-- Minimize button -->
      <Button
        variant="ghost"
        size="icon"
        class="h-5 w-5 text-muted-foreground hover:text-foreground"
        :title="isMinimized ? 'Expand panel' : 'Minimize panel'"
        @click="isMinimized = !isMinimized"
      >
        <Plus v-if="isMinimized" class="h-3 w-3" />
        <Minus v-else class="h-3 w-3" />
      </Button>
    </CardHeader>
    <CardContent v-if="!isMinimized" class="flex-1 px-3 pb-3 overflow-hidden">
      <!-- Affects Tab -->
      <ScrollArea v-if="activeTab === 'affects'" class="h-full">
        <div v-if="affects.length === 0" class="text-sm text-muted-foreground text-center py-4">
          No active effects
        </div>

        <div v-else class="space-y-3">
          <!-- Buffs -->
          <div v-if="categorizedAffects.buffs.length > 0" class="space-y-1.5">
            <div class="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Buffs
            </div>
            <div
              v-for="affect in categorizedAffects.buffs"
              :key="affect.name"
              class="flex items-center gap-2 p-1.5 rounded-md bg-muted/30 hover:bg-muted/50 transition-colors"
            >
              <component
                :is="getAffectIcon(affect.name)"
                class="h-4 w-4 text-green-500 shrink-0"
              />
              <div class="flex-1 min-w-0">
                <div class="flex items-center justify-between gap-2">
                  <span class="text-sm truncate">{{ affect.name }}</span>
                  <span
                    :class="getDurationColor(affect.remaining)"
                    class="text-xs shrink-0 font-mono"
                  >
                    {{ formatDuration(affect.remaining) }}
                  </span>
                </div>
                <Progress
                  :model-value="affect.percent"
                  class="h-1 mt-1"
                />
              </div>
            </div>
          </div>

          <!-- Debuffs -->
          <div v-if="categorizedAffects.debuffs.length > 0" class="space-y-1.5">
            <div class="text-xs font-medium text-red-400 uppercase tracking-wide">
              Debuffs
            </div>
            <div
              v-for="affect in categorizedAffects.debuffs"
              :key="affect.name"
              class="flex items-center gap-2 p-1.5 rounded-md bg-red-950/30 hover:bg-red-950/50 transition-colors"
            >
              <AlertCircle class="h-4 w-4 text-red-500 shrink-0" />
              <div class="flex-1 min-w-0">
                <div class="flex items-center justify-between gap-2">
                  <span class="text-sm truncate text-red-400">{{ affect.name }}</span>
                  <span class="text-xs shrink-0 font-mono text-red-400">
                    {{ formatDuration(affect.remaining) }}
                  </span>
                </div>
                <Progress
                  :model-value="affect.percent"
                  class="h-1 mt-1"
                />
              </div>
            </div>
          </div>
        </div>
      </ScrollArea>

      <!-- Group Tab -->
      <ScrollArea v-else-if="activeTab === 'group'" class="h-full">
        <div v-if="!group || group.members.length === 0" class="text-sm text-muted-foreground text-center py-4">
          Not in a group
        </div>

        <div v-else class="space-y-1">
          <ContextMenu v-for="(member, index) in group.members" :key="index">
            <ContextMenuTrigger as-child>
              <div
                class="p-1.5 rounded-md transition-colors"
                :class="[
                  member.inRoom ? 'bg-muted/30 hover:bg-muted/50' : 'bg-muted/10 opacity-60',
                  groupActions.length > 0 ? 'cursor-context-menu' : '',
                ]"
              >
            <!-- Member Name Row -->
            <div class="flex items-center gap-1.5 mb-1">
              <!-- Leader crown or NPC bot icon -->
              <Crown v-if="member.rank === 'head'" class="h-3.5 w-3.5 text-yellow-400 shrink-0" />
              <Bot v-else-if="member.isNpc" class="h-3.5 w-3.5 text-zinc-500 shrink-0" />
              <span v-else class="w-3.5" />

              <!-- Name display -->
              <span
                class="text-sm font-medium truncate"
                :class="member.rank === 'head' ? 'text-yellow-400' : 'text-foreground'"
              >
                <!-- Players: [Level Class] Name -->
                <template v-if="!member.isNpc">
                  <span class="text-muted-foreground">[{{ member.level }} {{ member.class }}]</span>
                  {{ member.name }}
                </template>
                <!-- NPCs: truncated name (num.keyword) -->
                <template v-else>
                  {{ truncateName(member.name) }}
                  <span v-if="member.targetNum && member.targetKeyword" class="text-muted-foreground">
                    ({{ member.targetNum }}.{{ member.targetKeyword }})
                  </span>
                </template>
              </span>

              <!-- Position badge if not standing -->
              <Badge
                v-if="member.position !== 'standing'"
                variant="outline"
                class="ml-auto text-xs capitalize"
                :class="member.position === 'prone' ? 'text-red-400 border-red-400/50' : ''"
              >
                {{ member.position }}
              </Badge>
            </div>

            <!-- HP and Move bars -->
            <div class="flex items-center gap-2 text-xs font-mono">
              <!-- HP -->
              <div class="flex-1 relative">
                <Progress
                  :model-value="getHpPercent(member.hp, member.maxHp)"
                  class="h-5 w-full"
                  :class="getHpColor(getHpPercent(member.hp, member.maxHp))"
                />
                <span class="absolute inset-0 flex items-center justify-center text-white font-semibold drop-shadow-[0_1px_1px_rgba(0,0,0,0.8)]">
                  {{ member.hp }}/{{ member.maxHp }}HP ({{ getHpPercent(member.hp, member.maxHp) }}%)
                </span>
              </div>
              <!-- Move -->
              <div class="flex-1 relative">
                <Progress
                  :model-value="getMovePercent(member.move, member.maxMove)"
                  class="h-5 w-full bar-move"
                />
                <span class="absolute inset-0 flex items-center justify-center text-white font-semibold drop-shadow-[0_1px_1px_rgba(0,0,0,0.8)]">
                  {{ member.move }}/{{ member.maxMove }}V ({{ getMovePercent(member.move, member.maxMove) }}%)
                </span>
              </div>
            </div>
              </div>
            </ContextMenuTrigger>
            <ContextMenuContent class="w-48">
              <template v-if="groupActions.length > 0">
                <ContextMenuItem
                  v-for="action in groupActions"
                  :key="action.id"
                  @click="executeAction(action.command, member)"
                >
                  {{ action.label }}
                </ContextMenuItem>
                <ContextMenuSeparator />
              </template>
              <ContextMenuItem @click="showActionsDialog = true">
                <Settings class="h-3.5 w-3.5 mr-2" />
                Configure Actions...
              </ContextMenuItem>
            </ContextMenuContent>
          </ContextMenu>
        </div>
      </ScrollArea>

      <!-- Ship Tab -->
      <ScrollArea v-else-if="activeTab === 'ship'" class="h-full">
        <div v-if="!isOnShip" class="text-sm text-muted-foreground text-center py-4">
          Not on a ship
        </div>

        <div v-else class="space-y-2">
          <!-- Your Ship Info -->
          <div class="flex items-center justify-between p-2 bg-muted/30 rounded-md">
            <div class="flex items-center gap-2 text-sm">
              <span class="text-muted-foreground">HDG:</span>
              <span class="font-mono">{{ shipContacts?.heading ?? '---' }}°</span>
              <span class="text-muted-foreground ml-2">SPD:</span>
              <span class="font-mono">{{ shipContacts?.speed ?? '---' }}</span>
            </div>
            <Button
              variant="outline"
              size="sm"
              class="h-6 text-xs"
              @click="emit('openRadar')"
            >
              <ExternalLink class="h-3 w-3 mr-1" />
              Radar
            </Button>
          </div>

          <!-- Contacts List -->
          <div v-if="!shipContacts || shipContacts.contacts.length === 0" class="text-sm text-muted-foreground text-center py-2">
            No contacts in range
          </div>

          <div v-else class="space-y-1">
            <ContextMenu v-for="contact in shipContacts.contacts" :key="contact.id">
              <ContextMenuTrigger as-child>
                <div
                  class="p-2 rounded-md cursor-context-menu transition-colors"
                  :class="contact.targeting_you ? 'bg-red-950/40 hover:bg-red-950/60' : 'bg-muted/30 hover:bg-muted/50'"
                >
                  <!-- Contact Header Row -->
                  <div class="flex items-center gap-2 mb-1">
                    <Badge variant="outline" class="font-mono text-xs px-1.5">
                      {{ contact.id }}
                    </Badge>
                    <span class="text-sm font-medium truncate flex-1">{{ contact.name }}</span>
                    <!-- Threat indicators -->
                    <AlertCircle
                      v-if="contact.targeting_you"
                      class="h-4 w-4 text-red-500 shrink-0"
                      title="Targeting you!"
                    />
                    <Crosshair
                      v-if="contact.you_targeting"
                      class="h-4 w-4 text-yellow-500 shrink-0"
                      title="You are targeting"
                    />
                  </div>

                  <!-- Contact Details Row -->
                  <div class="flex items-center gap-2 text-xs">
                    <span class="font-mono text-muted-foreground">
                      {{ contact.range.toFixed(1) }}nm @ {{ contact.bearing }}° {{ bearingToCompass(contact.bearing) }}
                    </span>
                    <span class="text-muted-foreground">|</span>
                    <span class="font-mono text-muted-foreground">
                      HDG {{ contact.heading }}° SPD {{ contact.speed }}
                    </span>
                    <span class="text-muted-foreground">|</span>
                    <span class="font-mono text-muted-foreground">
                      ({{ contact.x }}, {{ contact.y }})
                    </span>
                  </div>

                  <!-- Status Badges Row -->
                  <div class="flex items-center gap-1 mt-1">
                    <Badge variant="outline" class="text-xs capitalize" :class="getRaceColor(contact.race)">
                      {{ contact.race }}
                    </Badge>
                    <Badge v-if="contact.status" variant="outline" class="text-xs capitalize" :class="getStatusColor(contact.status)">
                      {{ contact.status }}
                    </Badge>
                    <Badge v-if="contact.arc" variant="outline" class="text-xs font-mono">
                      {{ contact.arc }}
                    </Badge>
                  </div>
                </div>
              </ContextMenuTrigger>
              <ContextMenuContent class="w-48">
                <ContextMenuItem @click="executeShipAction('target', contact)">
                  <Crosshair class="h-3.5 w-3.5 mr-2" />
                  Target
                </ContextMenuItem>
                <ContextMenuItem @click="executeShipAction('fire', contact)">
                  Fire
                </ContextMenuItem>
                <ContextMenuSeparator />
                <ContextMenuItem @click="executeShipAction('scan', contact)">
                  Scan
                </ContextMenuItem>
                <ContextMenuItem @click="executeShipAction('hail', contact)">
                  Hail
                </ContextMenuItem>
              </ContextMenuContent>
            </ContextMenu>
          </div>
        </div>
      </ScrollArea>
    </CardContent>

    <!-- Group Actions Dialog -->
    <GroupActionsDialog v-model:open="showActionsDialog" />
  </Card>
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
/* Move bar */
:deep(.bar-move [data-slot="progress-indicator"]) {
  background-color: rgb(52 211 153) !important; /* emerald-400 */
}
</style>
