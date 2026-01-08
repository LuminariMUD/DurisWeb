<script setup lang="ts">
import { computed } from 'vue'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  GripVertical,
  User,
  Package,
  Gift,
  Shirt,
  Archive,
  DoorOpen,
  Users,
  Trash2,
  Edit,
  AlertTriangle,
} from 'lucide-vue-next'
import { parseAnsiToHtml } from '@/utils/ansiParser'
import type { ResetWithMetadata } from '@/types'

const props = defineProps<{
  reset: ResetWithMetadata
  index: number
  selected?: boolean
  hasWarning?: boolean
  warningMessage?: string
}>()

const emit = defineEmits<{
  (e: 'edit'): void
  (e: 'delete'): void
  (e: 'select'): void
}>()

// Get icon for command type
const commandIcon = computed(() => {
  switch (props.reset.command) {
    case 'M': return User
    case 'O': return Package
    case 'G': return Gift
    case 'E': return Shirt
    case 'P': return Archive
    case 'D': return DoorOpen
    case 'F': return Users
    case 'R': return Trash2
    default: return Package
  }
})

// Get badge variant based on command type
const badgeVariant = computed(() => {
  switch (props.reset.command) {
    case 'M': return 'default' // Mob load - blue
    case 'O': return 'secondary' // Object in room - gray
    case 'G': return 'outline' // Give to mob
    case 'E': return 'outline' // Equip on mob
    case 'P': return 'outline' // Put in container
    case 'D': return 'destructive' // Door state - red
    case 'F': return 'secondary' // Follow
    case 'R': return 'destructive' // Remove
    default: return 'secondary'
  }
})

// Format the reset description
const description = computed(() => {
  const r = props.reset
  switch (r.command) {
    case 'M':
      return `Load ${r.mobName || `mob ${r.arg1}`} in ${r.roomName || `room ${r.arg3}`} (max ${r.arg2})`
    case 'O':
      return `Load ${r.objName || `obj ${r.arg1}`} in ${r.roomName || `room ${r.arg3}`} (max ${r.arg2})`
    case 'G':
      return `Give ${r.objName || `obj ${r.arg1}`} to mob (max ${r.arg2})`
    case 'E':
      return `Equip ${r.objName || `obj ${r.arg1}`} on ${r.slotName || `slot ${r.arg3}`} (max ${r.arg2})`
    case 'P':
      return `Put ${r.objName || `obj ${r.arg1}`} in ${r.containerName || `container ${r.arg3}`} (max ${r.arg2})`
    case 'D':
      return `Set door ${r.directionName || `dir ${r.arg2}`} in ${r.roomName || `room ${r.arg1}`} to ${r.stateName || `state ${r.arg3}`}`
    case 'F':
      return `Mob follows ${r.leaderName || `leader ${r.arg1}`}`
    case 'R':
      return `Remove ${r.objName || `obj ${r.arg2}`} from ${r.roomName || `room ${r.arg1}`}`
    default:
      return `Unknown command: ${r.command}`
  }
})

// Indentation based on if_flag (dependent commands are indented)
const indentLevel = computed(() => {
  // if_flag 0 = always execute (no indent)
  // if_flag > 0 = depends on last M command (indent)
  return props.reset.ifFlag > 0 ? 1 : 0
})
</script>

<template>
  <div
    :class="[
      'group flex items-center gap-2 p-2 rounded-md border transition-colors cursor-pointer',
      selected ? 'border-primary bg-primary/5' : 'border-transparent hover:bg-muted/50',
      indentLevel > 0 ? 'ml-6' : '',
    ]"
    @click="emit('select')"
  >
    <!-- Drag handle -->
    <div class="cursor-grab text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity">
      <GripVertical class="h-4 w-4" />
    </div>

    <!-- Index number -->
    <span class="text-xs font-mono text-muted-foreground w-6 text-right">
      {{ index + 1 }}
    </span>

    <!-- Command badge -->
    <Badge :variant="badgeVariant" class="w-8 justify-center">
      {{ reset.command }}
    </Badge>

    <!-- Icon -->
    <component :is="commandIcon" class="h-4 w-4 text-muted-foreground shrink-0" />

    <!-- Description -->
    <span class="flex-1 text-sm truncate" v-html="parseAnsiToHtml(description)" />

    <!-- Warning indicator -->
    <AlertTriangle
      v-if="hasWarning"
      class="h-4 w-4 text-yellow-500 shrink-0"
      :title="warningMessage"
    />

    <!-- If flag indicator -->
    <Badge v-if="reset.ifFlag > 0" variant="outline" class="text-xs">
      if-prev
    </Badge>

    <!-- Actions -->
    <div class="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
      <Button
        variant="ghost"
        size="icon"
        class="h-7 w-7"
        @click.stop="emit('edit')"
      >
        <Edit class="h-3.5 w-3.5" />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        class="h-7 w-7 text-destructive hover:text-destructive"
        @click.stop="emit('delete')"
      >
        <Trash2 class="h-3.5 w-3.5" />
      </Button>
    </div>
  </div>
</template>
