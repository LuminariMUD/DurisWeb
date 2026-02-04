<script setup lang="ts">
import { computed, ref, onUnmounted } from 'vue'
import type { Timer, TimerState } from '@/types/timer'
import { useGroups } from '@/composables/useGroups'
import { formatInterval } from '@/types/timer'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { Badge } from '@/components/ui/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { MoreHorizontal, Pencil, Trash2, Copy, Play, Square } from 'lucide-vue-next'

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

const { getGroupPath } = useGroups()

// Current time for countdown display (updated every second)
const now = ref(Date.now())
let intervalHandle: ReturnType<typeof setInterval> | null = null

// Start countdown update interval
intervalHandle = setInterval(() => {
  now.value = Date.now()
}, 1000)

onUnmounted(() => {
  if (intervalHandle) {
    clearInterval(intervalHandle)
  }
})

// Sort timers: enabled first, then by name
const sortedTimers = computed(() => {
  return [...props.timers].sort((a, b) => {
    // Enabled timers first
    if (a.enabled !== b.enabled) {
      return a.enabled ? -1 : 1
    }
    // Then alphabetically by name
    return a.name.localeCompare(b.name)
  })
})

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
  <div class="rounded-md border">
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead class="w-[60px]">On</TableHead>
          <TableHead class="w-[140px]">Name</TableHead>
          <TableHead class="w-[100px]">Interval</TableHead>
          <TableHead class="w-[80px]">Type</TableHead>
          <TableHead class="w-[100px]">Status</TableHead>
          <TableHead class="w-[100px]">Actions</TableHead>
          <TableHead class="w-[100px]">Scope</TableHead>
          <TableHead class="w-[120px]">Group</TableHead>
          <TableHead class="w-[50px]"></TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        <TableRow v-if="sortedTimers.length === 0">
          <TableCell colspan="9" class="h-24 text-center text-muted-foreground">
            No timers defined. Click "Add Timer" to create one.
          </TableCell>
        </TableRow>
        <TableRow
          v-for="timer in sortedTimers"
          :key="`${timer.id}-${timer.enabled}`"
          :class="{ 'opacity-50': !timer.enabled }"
        >
          <TableCell>
            <Switch
              :model-value="timer.enabled"
              @update:model-value="(val: boolean) => emit('toggle', timer.id, val)"
            />
          </TableCell>
          <TableCell class="font-medium">
            <div class="flex items-center gap-1">
              {{ truncate(timer.name, 15) }}
            </div>
          </TableCell>
          <TableCell class="font-mono text-sm">
            {{ formatInterval(timer.intervalMs) }}
          </TableCell>
          <TableCell>
            <Badge :variant="timer.isOneShot ? 'outline' : 'secondary'">
              {{ timer.isOneShot ? 'One-shot' : 'Repeat' }}
            </Badge>
          </TableCell>
          <TableCell>
            <div v-if="isRunning(timer.id)" class="flex items-center gap-1">
              <span class="relative flex h-2 w-2">
                <span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                <span class="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
              </span>
              <span class="text-sm text-muted-foreground font-mono">
                {{ getCountdown(timer.id) }}
              </span>
            </div>
            <Badge v-else variant="outline" class="text-muted-foreground">
              Stopped
            </Badge>
          </TableCell>
          <TableCell>
            <Badge variant="outline" :title="getActionSummary(timer)">
              {{ timer.actions.length }} action{{ timer.actions.length !== 1 ? 's' : '' }}
            </Badge>
          </TableCell>
          <TableCell>
            <Badge v-if="timer.scope === 'global'" variant="secondary">Global</Badge>
            <Badge v-else variant="outline" :title="timer.characterName ?? undefined">
              {{ truncate(timer.characterName || '', 10) }}
            </Badge>
          </TableCell>
          <TableCell>
            <span class="text-xs text-muted-foreground">
              {{ timer.groupId ? getGroupPath(timer.groupId) : '—' }}
            </span>
          </TableCell>
          <TableCell>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" class="h-8 w-8">
                  <MoreHorizontal class="h-4 w-4" />
                  <span class="sr-only">Open menu</span>
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
          </TableCell>
        </TableRow>
      </TableBody>
    </Table>
  </div>
</template>
