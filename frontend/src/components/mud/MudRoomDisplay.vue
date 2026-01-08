<script setup lang="ts">
import { computed, ref } from 'vue'
import { useMudStore } from '@/stores/mudStore'
import { useMudConnection } from '@/composables/useMudConnection'
import { useMobActions } from '@/composables/useMobActions'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
  ContextMenuSeparator,
} from '@/components/ui/context-menu'
import MobActionsDialog from './MobActionsDialog.vue'
import { parseAnsiToHtml } from '@/utils/ansiParser'
import { MUD_DIRECTION_SHORTCUTS, type MudDirection } from '@/types/mud'
import { Users, Skull, Package, DoorOpen, Lock, Plus, Minus, MapPin, Settings } from 'lucide-vue-next'

// Minimized state
const isMinimized = defineModel<boolean>('minimized', { default: false })

const store = useMudStore()
const { move, sendGameCommand } = useMudConnection()

// Mob actions (customizable right-click menu)
const { actions: mobActions, button1Action, button2Action } = useMobActions()
const showMobActionsDialog = ref(false)

const room = computed(() => store.room)

// Terrain to color/icon mapping
const terrainStyles: Record<string, { bg: string; text: string }> = {
  city: { bg: 'bg-slate-600', text: 'text-slate-100' },
  field: { bg: 'bg-green-700', text: 'text-green-100' },
  forest: { bg: 'bg-emerald-800', text: 'text-emerald-100' },
  hills: { bg: 'bg-amber-700', text: 'text-amber-100' },
  mountain: { bg: 'bg-stone-600', text: 'text-stone-100' },
  water: { bg: 'bg-blue-600', text: 'text-blue-100' },
  underwater: { bg: 'bg-blue-800', text: 'text-blue-100' },
  air: { bg: 'bg-sky-400', text: 'text-sky-900' },
  desert: { bg: 'bg-yellow-600', text: 'text-yellow-100' },
  arctic: { bg: 'bg-cyan-200', text: 'text-cyan-900' },
  swamp: { bg: 'bg-lime-800', text: 'text-lime-100' },
  inside: { bg: 'bg-zinc-700', text: 'text-zinc-100' },
  road: { bg: 'bg-amber-800', text: 'text-amber-100' },
}

const defaultStyle = { bg: 'bg-zinc-700', text: 'text-zinc-100' }

const getTerrainStyle = (terrain: string | undefined): { bg: string; text: string } => {
  if (!terrain) return defaultStyle
  const style = terrainStyles[terrain.toLowerCase()]
  return style ?? defaultStyle
}

// Computed terrain style for the current room
const currentTerrainStyle = computed(() => getTerrainStyle(room.value?.terrain))

// Smart exit handler - handles locked/closed doors
const handleExitClick = (direction: string, exit: { door?: string; closed?: boolean; locked?: boolean }) => {
  const shortcut = MUD_DIRECTION_SHORTCUTS[direction as MudDirection] || direction

  if (exit.locked) {
    // Locked door - try to unlock
    sendGameCommand(`unlock ${shortcut}`)
  } else if (exit.closed) {
    // Closed door - try to open
    sendGameCommand(`open ${shortcut}`)
  } else {
    // Open exit - move
    move(shortcut)
  }
}

// Handle left-click on mob - look at it
const handleMobClick = (targetRef: string) => {
  sendGameCommand(`look ${targetRef}`)
}

// Handle right-click action on mob
const executeMobAction = (command: string, targetRef: string) => {
  sendGameCommand(`${command} ${targetRef}`)
}

// Get exit display info
const getExitInfo = (direction: string, exit: { door?: string; closed?: boolean; locked?: boolean }) => {
  return {
    hasDoor: !!exit.door,
    isClosed: exit.closed,
    isLocked: exit.locked,
  }
}

// Process NPCs to add targeting counters (1.traveller, 2.traveller, etc.)
const processedNpcs = computed(() => {
  if (!room.value?.npcs) return []

  const keywordCounts: Record<string, number> = {}

  return room.value.npcs.map(npc => {
    const keyword = npc.keyword || 'mob'
    keywordCounts[keyword] = (keywordCounts[keyword] || 0) + 1
    return {
      ...npc,
      targetRef: `${keywordCounts[keyword]}.${keyword}`
    }
  })
})
</script>

<template>
  <div class="border rounded-lg bg-card text-sm">
    <!-- Room Name Header -->
    <div class="px-3 py-2 bg-muted/30 flex items-start justify-between" :class="isMinimized ? '' : 'border-b'">
      <div class="flex-1 min-w-0">
        <div class="flex items-center gap-2">
          <MapPin class="h-4 w-4 shrink-0 text-muted-foreground" />
          <span class="font-medium truncate" v-html="room ? parseAnsiToHtml(room.colored_name || room.name) : 'Unknown Location'" />
        </div>
        <div v-if="!isMinimized" class="flex items-center gap-2 mt-1 text-xs text-muted-foreground pl-6">
          <span v-if="room?.area" v-html="parseAnsiToHtml(room.colored_area || room.area)" />
          <Badge
            v-if="room?.terrain"
            :class="[currentTerrainStyle.bg, currentTerrainStyle.text]"
            class="text-[10px] px-1.5 py-0"
          >
            {{ room.terrain }}
          </Badge>
        </div>
      </div>
      <!-- Minimize button -->
      <Button
        variant="ghost"
        size="icon"
        class="h-5 w-5 text-muted-foreground hover:text-foreground shrink-0"
        :title="isMinimized ? 'Expand room info' : 'Minimize room info'"
        @click="isMinimized = !isMinimized"
      >
        <Plus v-if="isMinimized" class="h-3 w-3" />
        <Minus v-else class="h-3 w-3" />
      </Button>
    </div>

    <div v-if="!isMinimized" class="px-3 py-2 space-y-2">
      <!-- Exits row with mob actions config button -->
      <div class="flex items-center gap-1 flex-wrap">
        <template v-if="room?.exits && Object.keys(room.exits).length > 0">
          <span class="text-xs text-muted-foreground">Exits:</span>
          <button
            v-for="(exit, direction) in room.exits"
            :key="direction"
            class="px-1.5 py-0.5 text-xs rounded bg-muted hover:bg-muted/80 transition-colors inline-flex items-center gap-0.5"
            :title="exit.locked ? `Unlock ${direction}` : exit.closed ? `Open ${direction}` : `Go ${direction}`"
            @click="handleExitClick(direction as string, exit)"
          >
            <Lock
              v-if="getExitInfo(direction as string, exit).isLocked"
              class="h-2.5 w-2.5 text-red-500"
            />
            <DoorOpen
              v-else-if="getExitInfo(direction as string, exit).isClosed"
              class="h-2.5 w-2.5 text-yellow-500"
            />
            {{ direction }}
          </button>
        </template>
        <!-- Mob actions config button (always visible) -->
        <Button
          variant="ghost"
          size="icon"
          class="h-5 w-5 ml-auto text-muted-foreground hover:text-foreground"
          title="Configure mob actions"
          @click="showMobActionsDialog = true"
        >
          <Settings class="h-3 w-3" />
        </Button>
      </div>

      <!-- Room Contents -->
      <div v-if="room?.players?.length || room?.npcs?.length || room?.items?.length" class="space-y-2 text-xs">
        <!-- Players -->
        <div v-if="room?.players?.length">
          <div class="flex items-center gap-1 text-muted-foreground mb-0.5">
            <Users class="h-3 w-3 text-blue-400" />
            <span>Players:</span>
          </div>
          <div class="pl-4 space-y-0.5">
            <div v-for="(player, idx) in room.players" :key="`player-${idx}`" class="text-blue-400">
              <span v-html="parseAnsiToHtml(player.name)" />
            </div>
          </div>
        </div>

        <!-- NPCs -->
        <div v-if="processedNpcs.length">
          <div class="flex items-center gap-1 text-muted-foreground mb-0.5">
            <Skull class="h-3 w-3 text-yellow-400" />
            <span>Mobs:</span>
          </div>
          <div class="pl-4 space-y-0.5">
            <ContextMenu v-for="(npc, idx) in processedNpcs" :key="`npc-${idx}`">
              <ContextMenuTrigger as-child>
                <div class="flex items-center justify-between group">
                  <div
                    class="text-yellow-400 cursor-pointer hover:underline flex-1 min-w-0"
                    @click="handleMobClick(npc.targetRef)"
                  >
                    <span v-html="parseAnsiToHtml(npc.colored_name || npc.name)" />
                    <span class="text-muted-foreground/50 text-xs ml-1">({{ npc.targetRef }})</span>
                  </div>
                  <!-- Quick action buttons -->
                  <div class="flex gap-1 ml-2 shrink-0">
                    <button
                      v-if="button1Action"
                      class="h-5 px-2 text-[10px] font-bold bg-blue-600 hover:bg-blue-500 text-white rounded transition-colors"
                      :title="button1Action.label"
                      @click.stop="executeMobAction(button1Action.command, npc.targetRef)"
                    >
                      1
                    </button>
                    <button
                      v-if="button2Action"
                      class="h-5 px-2 text-[10px] font-bold bg-red-600 hover:bg-red-500 text-white rounded transition-colors"
                      :title="button2Action.label"
                      @click.stop="executeMobAction(button2Action.command, npc.targetRef)"
                    >
                      2
                    </button>
                  </div>
                </div>
              </ContextMenuTrigger>
              <ContextMenuContent class="w-48">
                <template v-if="mobActions.length > 0">
                  <ContextMenuItem
                    v-for="action in mobActions"
                    :key="action.id"
                    @click="executeMobAction(action.command, npc.targetRef)"
                  >
                    {{ action.label }}
                  </ContextMenuItem>
                  <ContextMenuSeparator />
                </template>
                <ContextMenuItem @click="showMobActionsDialog = true">
                  <Settings class="h-3.5 w-3.5 mr-2" />
                  Configure Actions...
                </ContextMenuItem>
              </ContextMenuContent>
            </ContextMenu>
          </div>
        </div>

        <!-- Items -->
        <div v-if="room?.items?.length">
          <div class="flex items-center gap-1 text-muted-foreground mb-0.5">
            <Package class="h-3 w-3" />
            <span>Items:</span>
          </div>
          <div class="pl-4 space-y-0.5">
            <div v-for="(item, idx) in room.items" :key="`item-${idx}`" class="text-muted-foreground">
              <span v-html="parseAnsiToHtml(item.colored_name || item.name)" />
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Mob Actions Dialog -->
    <MobActionsDialog v-model:open="showMobActionsDialog" />
  </div>
</template>
