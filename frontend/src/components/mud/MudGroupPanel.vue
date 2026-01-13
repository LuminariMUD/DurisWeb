<script setup lang="ts">
import { computed, ref } from 'vue'
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
import { Users, Crown, Bot, Settings, PictureInPicture2 } from 'lucide-vue-next'

const emit = defineEmits<{
  detach: []
}>()

const store = useMudStore()
const { sendGameCommand } = useMudConnection()
const { actions: groupActions } = useGroupActions()

const showActionsDialog = ref(false)
const group = computed(() => store.group)

// get hp percentage
const getHpPercent = (hp: number, maxHp: number): number => {
  if (maxHp === 0) return 0
  return Math.min(100, Math.round((hp / maxHp) * 100))
}

// get move percentage
const getMovePercent = (move: number, maxMove: number): number => {
  if (maxMove === 0) return 0
  return Math.min(100, Math.round((move / maxMove) * 100))
}

// get hp bar color
const getHpColor = (percent: number): string => {
  if (percent <= 25) return 'bar-critical'
  if (percent <= 50) return 'bar-warning'
  if (percent <= 75) return 'bar-caution'
  return 'bar-good'
}

// truncate npc name
const truncateName = (name: string, maxLen: number = 12): string => {
  if (name.length <= maxLen) return name
  return name.substring(0, maxLen) + '..'
}

// build target ref from member
const getTargetRef = (member: { targetNum: number | null; targetKeyword: string | null; name: string }): string => {
  if (member.targetNum && member.targetKeyword) {
    return `${member.targetNum}.${member.targetKeyword}`
  }
  return member.name
}

// handle group action
const handleGroupAction = (action: { command: string }, targetRef: string) => {
  const cmd = action.command.replace('{target}', targetRef)
  sendGameCommand(cmd)
}
</script>

<template>
  <Card class="flex flex-col h-full">
    <CardHeader class="py-2 px-3 shrink-0 flex flex-row items-center justify-between">
      <div class="flex items-center gap-2 text-sm font-medium">
        <Users class="h-4 w-4" />
        Group
        <Badge v-if="group && group.size > 0" variant="outline" class="h-5 px-1.5 text-xs">
          {{ group.size }}/{{ group.maxSize }}
        </Badge>
        <Button
          variant="ghost"
          size="icon"
          class="h-5 w-5 text-muted-foreground hover:text-foreground"
          title="Configure group actions"
          @click="showActionsDialog = true"
        >
          <Settings class="h-3 w-3" />
        </Button>
      </div>
      <Button
        variant="ghost"
        size="icon"
        class="h-5 w-5 text-muted-foreground hover:text-foreground"
        title="Dock"
        @click="emit('detach')"
      >
        <PictureInPicture2 class="h-3 w-3" />
      </Button>
    </CardHeader>
    <CardContent class="flex-1 px-3 pb-3 overflow-hidden">
      <ScrollArea class="h-full">
        <div v-if="!group || group.size === 0" class="text-sm text-muted-foreground text-center py-4">
          Not in a group
        </div>
        <div v-else class="space-y-2">
          <ContextMenu v-for="member in group.members" :key="member.name">
            <ContextMenuTrigger as-child>
              <div
                class="p-1.5 rounded-md transition-colors"
                :class="[
                  member.inRoom ? 'bg-muted/30 hover:bg-muted/50' : 'bg-muted/10 opacity-60',
                  groupActions.length > 0 ? 'cursor-context-menu' : '',
                ]"
              >
                <div class="flex items-center gap-1.5 mb-1">
                  <Crown v-if="member.rank === 'head'" class="h-3.5 w-3.5 text-yellow-400 shrink-0" />
                  <Bot v-else-if="member.isNpc" class="h-3.5 w-3.5 text-zinc-500 shrink-0" />
                  <span v-else class="w-3.5" />

                  <span
                    class="text-sm font-medium truncate"
                    :class="member.rank === 'head' ? 'text-yellow-400' : 'text-foreground'"
                  >
                    <template v-if="!member.isNpc">
                      <span class="text-muted-foreground">[{{ member.level }} {{ member.class }}]</span>
                      {{ member.name }}
                    </template>
                    <template v-else>
                      {{ truncateName(member.name) }}
                      <span v-if="member.targetNum && member.targetKeyword" class="text-muted-foreground">
                        ({{ member.targetNum }}.{{ member.targetKeyword }})
                      </span>
                    </template>
                  </span>

                  <Badge
                    v-if="member.position !== 'standing'"
                    variant="outline"
                    class="ml-auto text-xs capitalize"
                    :class="member.position === 'prone' ? 'text-red-400 border-red-400/50' : ''"
                  >
                    {{ member.position }}
                  </Badge>
                </div>

                <div class="flex gap-1">
                  <div class="flex-1 relative">
                    <Progress
                      :model-value="getHpPercent(member.hp, member.maxHp)"
                      class="h-5 w-full"
                      :class="getHpColor(getHpPercent(member.hp, member.maxHp))"
                    />
                    <span class="absolute inset-0 flex items-center justify-center text-white font-semibold drop-shadow-[0_1px_1px_rgba(0,0,0,0.8)] text-xs">
                      {{ member.hp }}/{{ member.maxHp }}HP
                    </span>
                  </div>
                  <div class="flex-1 relative">
                    <Progress
                      :model-value="getMovePercent(member.move, member.maxMove)"
                      class="h-5 w-full bar-move"
                    />
                    <span class="absolute inset-0 flex items-center justify-center text-white font-semibold drop-shadow-[0_1px_1px_rgba(0,0,0,0.8)] text-xs">
                      {{ member.move }}/{{ member.maxMove }}V
                    </span>
                  </div>
                </div>
              </div>
            </ContextMenuTrigger>
            <ContextMenuContent>
              <ContextMenuItem
                v-for="action in groupActions"
                :key="action.id"
                @click="handleGroupAction(action, getTargetRef(member))"
              >
                {{ action.label }}
              </ContextMenuItem>
              <ContextMenuSeparator v-if="groupActions.length > 0" />
              <ContextMenuItem @click="showActionsDialog = true">
                Configure Actions...
              </ContextMenuItem>
            </ContextMenuContent>
          </ContextMenu>
        </div>
      </ScrollArea>
    </CardContent>

    <GroupActionsDialog v-model:open="showActionsDialog" />
  </Card>
</template>

<style scoped>
:deep(.bar-critical [data-slot="progress-indicator"]) {
  background-color: rgb(220 38 38) !important;
}
:deep(.bar-warning [data-slot="progress-indicator"]) {
  background-color: rgb(234 179 8) !important;
}
:deep(.bar-caution [data-slot="progress-indicator"]) {
  background-color: rgb(132 204 22) !important;
}
:deep(.bar-good [data-slot="progress-indicator"]) {
  background-color: rgb(34 197 94) !important;
}
:deep(.bar-move [data-slot="progress-indicator"]) {
  background-color: rgb(14 165 233) !important;
}
</style>
