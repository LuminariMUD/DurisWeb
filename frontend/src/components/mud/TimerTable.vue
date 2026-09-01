<script setup lang="ts">
import { ref, computed, onUnmounted } from 'vue'
import type { Timer, TimerState } from '@/types/timer'
import { useGroups } from '@/composables/useGroups'
import { useTimers } from '@/composables/useTimers'
import { formatInterval } from '@/types/timer'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { Badge } from '@/components/ui/badge'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from '@/components/ui/context-menu'
import {
  MoreHorizontal,
  Pencil,
  Trash2,
  Copy,
  Play,
  Square,
  ChevronRight,
  ChevronDown,
  GripVertical,
  ToggleLeft,
  ToggleRight,
  ChevronsUpDown,
} from 'lucide-vue-next'

const props = defineProps<{
  timers: Timer[]
  timerStates: Map<string, TimerState>
}>()

const emit = defineEmits<{
  edit: [timer: Timer]
  delete: [timer: Timer]
  toggle: [id: string, enabled: boolean]
  duplicate: [timer: Timer]
  start: [id: string]
  stop: [id: string]
}>()

const { groups, rootGroups, getChildGroups, toggleGroup, isGroupEffectivelyEnabled } = useGroups()

const { setTimerGroup } = useTimers()

// current time for countdown display
const now = ref(Date.now())
let intervalHandle: ReturnType<typeof setInterval> | null = null

intervalHandle = setInterval(() => {
  now.value = Date.now()
}, 1000)

onUnmounted(() => {
  if (intervalHandle) {
    clearInterval(intervalHandle)
  }
})

// expanded state for groups
const expandedGroups = ref<Set<string>>(new Set())

// drag state
const dragTimer = ref<Timer | null>(null)
const dragOverGroupId = ref<string | null | 'ungrouped'>(null)

// initialize all groups as expanded (including ungrouped)
function initExpanded() {
  expandedGroups.value.add('__ungrouped__')
  for (const g of groups.value) {
    expandedGroups.value.add(g.id)
  }
}
initExpanded()

function toggleExpand(id: string) {
  if (expandedGroups.value.has(id)) {
    expandedGroups.value.delete(id)
  } else {
    expandedGroups.value.add(id)
  }
}

function expandAll() {
  for (const g of groups.value) {
    expandedGroups.value.add(g.id)
  }
}

function collapseAll() {
  expandedGroups.value.clear()
}

// get timers for a specific group
function getTimersForGroup(groupId: string | null): Timer[] {
  return props.timers
    .filter((t) => t.groupId === groupId)
    .sort((a, b) => {
      if (a.enabled !== b.enabled) return a.enabled ? -1 : 1
      return a.name.localeCompare(b.name)
    })
}

// ungrouped timers
const ungroupedTimers = computed(() => getTimersForGroup(null))

// drag handlers
function handleDragStart(e: DragEvent, timer: Timer) {
  dragTimer.value = timer
  if (e.dataTransfer) {
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', timer.id)
  }
}

function handleDragOver(e: DragEvent, groupId: string | null | 'ungrouped') {
  e.preventDefault()
  if (e.dataTransfer) {
    e.dataTransfer.dropEffect = 'move'
  }
  dragOverGroupId.value = groupId
}

function handleDragLeave() {
  dragOverGroupId.value = null
}

function handleDrop(groupId: string | null) {
  if (dragTimer.value && dragTimer.value.groupId !== groupId) {
    setTimerGroup(dragTimer.value.id, groupId)
  }
  dragTimer.value = null
  dragOverGroupId.value = null
}

function handleDragEnd() {
  dragTimer.value = null
  dragOverGroupId.value = null
}

// group actions
function enableAllInGroup(groupId: string) {
  const timers = getTimersForGroup(groupId)
  for (const t of timers) {
    if (!t.enabled) emit('toggle', t.id, true)
  }
  for (const sub of getChildGroups(groupId)) {
    const subTimers = getTimersForGroup(sub.id)
    for (const t of subTimers) {
      if (!t.enabled) emit('toggle', t.id, true)
    }
  }
}

function disableAllInGroup(groupId: string) {
  const timers = getTimersForGroup(groupId)
  for (const t of timers) {
    if (t.enabled) emit('toggle', t.id, false)
  }
  for (const sub of getChildGroups(groupId)) {
    const subTimers = getTimersForGroup(sub.id)
    for (const t of subTimers) {
      if (t.enabled) emit('toggle', t.id, false)
    }
  }
}

function getTimerCountForGroup(groupId: string): number {
  let count = getTimersForGroup(groupId).length
  for (const sub of getChildGroups(groupId)) {
    count += getTimersForGroup(sub.id).length
  }
  return count
}

function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text
  return text.substring(0, maxLength) + '...'
}

function getActionSummary(timer: Timer): string {
  const types = timer.actions.map((a) => a.type)
  const unique = [...new Set(types)]
  return unique.join(', ')
}

function getTimerState(id: string): TimerState | undefined {
  return props.timerStates.get(id)
}

function isRunning(id: string): boolean {
  return getTimerState(id)?.isRunning ?? false
}

function getCountdown(id: string): string {
  const state = getTimerState(id)
  if (!state?.isRunning) return '-'

  const remaining = state.nextFireTime - now.value
  if (remaining <= 0) return 'firing...'

  return formatInterval(remaining)
}
</script>

<template>
  <div class="space-y-1">
    <!-- Empty state -->
    <div v-if="timers.length === 0" class="border rounded-md p-8 text-center text-muted-foreground">
      No timers defined. Click "Add Timer" to create one.
    </div>

    <template v-else>
      <!-- Group tree -->
      <template v-for="group in rootGroups" :key="group.id">
        <!-- Root group header -->
        <ContextMenu>
          <ContextMenuTrigger>
            <div
              class="border rounded-md transition-colors"
              :class="{
                'ring-2 ring-primary': dragOverGroupId === group.id,
                'opacity-60': !group.enabled,
              }"
              @dragover="(e: DragEvent) => handleDragOver(e, group.id)"
              @dragleave="handleDragLeave"
              @drop="handleDrop(group.id)"
            >
              <!-- Group header -->
              <div
                class="flex items-center gap-2 p-2 bg-muted/30 cursor-pointer select-none"
                @click="toggleExpand(group.id)"
              >
                <component
                  :is="expandedGroups.has(group.id) ? ChevronDown : ChevronRight"
                  class="h-4 w-4 shrink-0"
                />
                <Switch
                  :model-value="group.enabled"
                  @update:model-value="toggleGroup(group.id)"
                  @click.stop
                />
                <span class="font-medium flex-1">{{ group.name }}</span>
                <Badge variant="outline" class="text-xs">
                  {{ getTimerCountForGroup(group.id) }}
                </Badge>
              </div>

              <!-- Group content -->
              <div v-if="expandedGroups.has(group.id)" class="border-t">
                <!-- Timers directly in this group -->
                <div
                  v-for="timer in getTimersForGroup(group.id)"
                  :key="timer.id"
                  draggable="true"
                  class="flex items-center gap-2 p-2 pl-8 hover:bg-muted/50 border-b last:border-b-0 cursor-grab"
                  :class="{
                    'opacity-50': !timer.enabled || !isGroupEffectivelyEnabled(timer.groupId),
                    'opacity-30': dragTimer?.id === timer.id,
                  }"
                  @dragstart="(e: DragEvent) => handleDragStart(e, timer)"
                  @dragend="handleDragEnd"
                >
                  <GripVertical class="h-4 w-4 text-muted-foreground/50 shrink-0" />
                  <Switch
                    :model-value="timer.enabled"
                    @update:model-value="(val: boolean) => emit('toggle', timer.id, val)"
                  />
                  <span class="font-medium w-28 truncate" :title="timer.name">
                    {{ truncate(timer.name, 12) }}
                  </span>
                  <span class="font-mono text-sm text-muted-foreground w-16 shrink-0">
                    {{ formatInterval(timer.intervalMs) }}
                  </span>
                  <Badge :variant="timer.isOneShot ? 'outline' : 'secondary'" class="shrink-0 text-xs">
                    {{ timer.isOneShot ? 'Once' : 'Repeat' }}
                  </Badge>
                  <div v-if="isRunning(timer.id)" class="flex items-center gap-1 w-20 shrink-0">
                    <span class="relative flex h-2 w-2">
                      <span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                      <span class="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
                    </span>
                    <span class="text-xs text-muted-foreground font-mono">
                      {{ getCountdown(timer.id) }}
                    </span>
                  </div>
                  <Badge v-else variant="outline" class="text-muted-foreground shrink-0 text-xs w-20 justify-center">
                    Stopped
                  </Badge>
                  <Badge variant="outline" class="shrink-0 text-xs" :title="getActionSummary(timer)">
                    {{ timer.actions.length }}
                  </Badge>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" class="h-7 w-7 shrink-0">
                        <MoreHorizontal class="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem @click="emit('edit', timer)">
                        <Pencil class="mr-2 h-4 w-4" />
                        Edit
                      </DropdownMenuItem>
                      <DropdownMenuItem @click="emit('duplicate', timer)">
                        <Copy class="mr-2 h-4 w-4" />
                        Duplicate
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        v-if="timer.enabled && !isRunning(timer.id)"
                        @click="emit('start', timer.id)"
                      >
                        <Play class="mr-2 h-4 w-4" />
                        Start
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        v-if="isRunning(timer.id)"
                        @click="emit('stop', timer.id)"
                      >
                        <Square class="mr-2 h-4 w-4" />
                        Stop
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem class="text-destructive" @click="emit('delete', timer)">
                        <Trash2 class="mr-2 h-4 w-4" />
                        Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>

                <!-- Subgroups -->
                <template v-for="subgroup in getChildGroups(group.id)" :key="subgroup.id">
                  <ContextMenu>
                    <ContextMenuTrigger>
                      <div
                        class="transition-colors"
                        :class="{
                          'ring-2 ring-primary ring-inset': dragOverGroupId === subgroup.id,
                          'opacity-60': !subgroup.enabled || !group.enabled,
                        }"
                        @dragover="(e: DragEvent) => handleDragOver(e, subgroup.id)"
                        @dragleave="handleDragLeave"
                        @drop="handleDrop(subgroup.id)"
                      >
                        <!-- Subgroup header -->
                        <div
                          class="flex items-center gap-2 p-2 pl-6 bg-muted/20 cursor-pointer select-none border-t"
                          @click="toggleExpand(subgroup.id)"
                        >
                          <component
                            :is="expandedGroups.has(subgroup.id) ? ChevronDown : ChevronRight"
                            class="h-4 w-4 shrink-0"
                          />
                          <Switch
                            :model-value="subgroup.enabled"
                            :disabled="!group.enabled"
                            @update:model-value="toggleGroup(subgroup.id)"
                            @click.stop
                          />
                          <span class="font-medium flex-1">{{ subgroup.name }}</span>
                          <Badge variant="outline" class="text-xs">
                            {{ getTimersForGroup(subgroup.id).length }}
                          </Badge>
                        </div>

                        <!-- Subgroup timers -->
                        <div v-if="expandedGroups.has(subgroup.id)">
                          <div
                            v-for="timer in getTimersForGroup(subgroup.id)"
                            :key="timer.id"
                            draggable="true"
                            class="flex items-center gap-2 p-2 pl-12 hover:bg-muted/50 border-t cursor-grab"
                            :class="{
                              'opacity-50': !timer.enabled || !isGroupEffectivelyEnabled(timer.groupId),
                              'opacity-30': dragTimer?.id === timer.id,
                            }"
                            @dragstart="(e: DragEvent) => handleDragStart(e, timer)"
                            @dragend="handleDragEnd"
                          >
                            <GripVertical class="h-4 w-4 text-muted-foreground/50 shrink-0" />
                            <Switch
                              :model-value="timer.enabled"
                              @update:model-value="(val: boolean) => emit('toggle', timer.id, val)"
                            />
                            <span class="font-medium w-28 truncate" :title="timer.name">
                              {{ truncate(timer.name, 12) }}
                            </span>
                            <span class="font-mono text-sm text-muted-foreground w-16 shrink-0">
                              {{ formatInterval(timer.intervalMs) }}
                            </span>
                            <Badge :variant="timer.isOneShot ? 'outline' : 'secondary'" class="shrink-0 text-xs">
                              {{ timer.isOneShot ? 'Once' : 'Repeat' }}
                            </Badge>
                            <div v-if="isRunning(timer.id)" class="flex items-center gap-1 w-20 shrink-0">
                              <span class="relative flex h-2 w-2">
                                <span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                                <span class="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
                              </span>
                              <span class="text-xs text-muted-foreground font-mono">
                                {{ getCountdown(timer.id) }}
                              </span>
                            </div>
                            <Badge v-else variant="outline" class="text-muted-foreground shrink-0 text-xs w-20 justify-center">
                              Stopped
                            </Badge>
                            <Badge variant="outline" class="shrink-0 text-xs" :title="getActionSummary(timer)">
                              {{ timer.actions.length }}
                            </Badge>
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon" class="h-7 w-7 shrink-0">
                                  <MoreHorizontal class="h-4 w-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem @click="emit('edit', timer)">
                                  <Pencil class="mr-2 h-4 w-4" />
                                  Edit
                                </DropdownMenuItem>
                                <DropdownMenuItem @click="emit('duplicate', timer)">
                                  <Copy class="mr-2 h-4 w-4" />
                                  Duplicate
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                  v-if="timer.enabled && !isRunning(timer.id)"
                                  @click="emit('start', timer.id)"
                                >
                                  <Play class="mr-2 h-4 w-4" />
                                  Start
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  v-if="isRunning(timer.id)"
                                  @click="emit('stop', timer.id)"
                                >
                                  <Square class="mr-2 h-4 w-4" />
                                  Stop
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem class="text-destructive" @click="emit('delete', timer)">
                                  <Trash2 class="mr-2 h-4 w-4" />
                                  Delete
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </div>
                          <div v-if="getTimersForGroup(subgroup.id).length === 0" class="p-2 pl-12 text-sm text-muted-foreground border-t">
                            No timers in this subgroup
                          </div>
                        </div>
                      </div>
                    </ContextMenuTrigger>
                    <ContextMenuContent>
                      <ContextMenuItem @click="enableAllInGroup(subgroup.id)">
                        <ToggleRight class="mr-2 h-4 w-4" />
                        Enable all
                      </ContextMenuItem>
                      <ContextMenuItem @click="disableAllInGroup(subgroup.id)">
                        <ToggleLeft class="mr-2 h-4 w-4" />
                        Disable all
                      </ContextMenuItem>
                    </ContextMenuContent>
                  </ContextMenu>
                </template>

                <!-- Empty group message -->
                <div v-if="getTimersForGroup(group.id).length === 0 && getChildGroups(group.id).length === 0" class="p-2 pl-8 text-sm text-muted-foreground">
                  No timers in this group
                </div>
              </div>
            </div>
          </ContextMenuTrigger>
          <ContextMenuContent>
            <ContextMenuItem @click="enableAllInGroup(group.id)">
              <ToggleRight class="mr-2 h-4 w-4" />
              Enable all
            </ContextMenuItem>
            <ContextMenuItem @click="disableAllInGroup(group.id)">
              <ToggleLeft class="mr-2 h-4 w-4" />
              Disable all
            </ContextMenuItem>
            <ContextMenuSeparator />
            <ContextMenuItem @click="expandAll">
              <ChevronsUpDown class="mr-2 h-4 w-4" />
              Expand all
            </ContextMenuItem>
            <ContextMenuItem @click="collapseAll">
              <ChevronsUpDown class="mr-2 h-4 w-4" />
              Collapse all
            </ContextMenuItem>
          </ContextMenuContent>
        </ContextMenu>
      </template>

      <!-- Ungrouped section -->
      <div
        v-if="ungroupedTimers.length > 0 || (timers.length > 0 && rootGroups.length > 0)"
        class="border rounded-md transition-colors"
        :class="{ 'ring-2 ring-primary': dragOverGroupId === 'ungrouped' }"
        @dragover="(e: DragEvent) => handleDragOver(e, 'ungrouped')"
        @dragleave="handleDragLeave"
        @drop="handleDrop(null)"
      >
        <div
          class="flex items-center gap-2 p-2 bg-muted/30 cursor-pointer select-none"
          @click="toggleExpand('__ungrouped__')"
        >
          <component
            :is="expandedGroups.has('__ungrouped__') ? ChevronDown : ChevronRight"
            class="h-4 w-4 shrink-0"
          />
          <span class="font-medium flex-1 text-muted-foreground">Ungrouped</span>
          <Badge variant="outline" class="text-xs">
            {{ ungroupedTimers.length }}
          </Badge>
        </div>
        <div v-if="expandedGroups.has('__ungrouped__')" class="border-t">
          <div
            v-for="timer in ungroupedTimers"
            :key="timer.id"
            draggable="true"
            class="flex items-center gap-2 p-2 pl-8 hover:bg-muted/50 border-b last:border-b-0 cursor-grab"
            :class="{
              'opacity-50': !timer.enabled,
              'opacity-30': dragTimer?.id === timer.id,
            }"
            @dragstart="(e: DragEvent) => handleDragStart(e, timer)"
            @dragend="handleDragEnd"
          >
            <GripVertical class="h-4 w-4 text-muted-foreground/50 shrink-0" />
            <Switch
              :model-value="timer.enabled"
              @update:model-value="(val: boolean) => emit('toggle', timer.id, val)"
            />
            <span class="font-medium w-28 truncate" :title="timer.name">
              {{ truncate(timer.name, 12) }}
            </span>
            <span class="font-mono text-sm text-muted-foreground w-16 shrink-0">
              {{ formatInterval(timer.intervalMs) }}
            </span>
            <Badge :variant="timer.isOneShot ? 'outline' : 'secondary'" class="shrink-0 text-xs">
              {{ timer.isOneShot ? 'Once' : 'Repeat' }}
            </Badge>
            <div v-if="isRunning(timer.id)" class="flex items-center gap-1 w-20 shrink-0">
              <span class="relative flex h-2 w-2">
                <span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                <span class="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
              </span>
              <span class="text-xs text-muted-foreground font-mono">
                {{ getCountdown(timer.id) }}
              </span>
            </div>
            <Badge v-else variant="outline" class="text-muted-foreground shrink-0 text-xs w-20 justify-center">
              Stopped
            </Badge>
            <Badge variant="outline" class="shrink-0 text-xs" :title="getActionSummary(timer)">
              {{ timer.actions.length }}
            </Badge>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" class="h-7 w-7 shrink-0">
                  <MoreHorizontal class="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem @click="emit('edit', timer)">
                  <Pencil class="mr-2 h-4 w-4" />
                  Edit
                </DropdownMenuItem>
                <DropdownMenuItem @click="emit('duplicate', timer)">
                  <Copy class="mr-2 h-4 w-4" />
                  Duplicate
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  v-if="timer.enabled && !isRunning(timer.id)"
                  @click="emit('start', timer.id)"
                >
                  <Play class="mr-2 h-4 w-4" />
                  Start
                </DropdownMenuItem>
                <DropdownMenuItem
                  v-if="isRunning(timer.id)"
                  @click="emit('stop', timer.id)"
                >
                  <Square class="mr-2 h-4 w-4" />
                  Stop
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem class="text-destructive" @click="emit('delete', timer)">
                  <Trash2 class="mr-2 h-4 w-4" />
                  Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
          <div v-if="ungroupedTimers.length === 0" class="p-2 pl-8 text-sm text-muted-foreground">
            No ungrouped timers
          </div>
        </div>
      </div>
    </template>
  </div>
</template>
