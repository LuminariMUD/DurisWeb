<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { Input } from '@/components/ui/input'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Plus, Save, Search, Loader2, AlertTriangle, RefreshCw, Undo2 } from 'lucide-vue-next'
import Sortable from 'sortablejs'
import { useToast } from '@/composables/useToast'
import { useZoneCache } from '@/composables/useZoneCache'
import { useZoneStreaming } from '@/composables/useZoneStreaming'
import ResetItem from './ResetItem.vue'
import ResetEditDialog from './ResetEditDialog.vue'
import type { ResetWithMetadata, ResetCommand, MobIndex, ObjIndex, RoomIndex } from '@/types'
import { RESET_COMMANDS } from '@/types'

const props = defineProps<{
  zoneId: string
  mobs: MobIndex[]
  objects: ObjIndex[]
  rooms: RoomIndex[]
}>()

const toast = useToast()
const zoneCache = computed(() => useZoneCache(props.zoneId))

// Streaming state for resets
const { resetState, resetProgress, streamResets, clearState } = useZoneStreaming()

// Local editable copy of resets
const localResets = ref<ResetWithMetadata[]>([])
const hasUnsavedChanges = ref(false)

// Selection state
const selectedIndex = ref<number | null>(null)

// Dialog states
const editDialogOpen = ref(false)
const editingReset = ref<ResetWithMetadata | null>(null)
const isNewReset = ref(false)
const deleteDialogOpen = ref(false)
const resetToDelete = ref<number | null>(null)

// Filter state
const searchQuery = ref('')
const filterCommand = ref<string | null>(null)

// Sortable instance
const sortableContainer = ref<HTMLElement | null>(null)
let sortableInstance: Sortable | null = null

// Filtered resets
const filteredResets = computed(() => {
  let results = localResets.value

  // Filter by search query
  if (searchQuery.value) {
    const query = searchQuery.value.toLowerCase()
    results = results.filter((r) => {
      const mobName = r.mobName?.toLowerCase() || ''
      const objName = r.objName?.toLowerCase() || ''
      const roomName = r.roomName?.toLowerCase() || ''
      return (
        mobName.includes(query) ||
        objName.includes(query) ||
        roomName.includes(query) ||
        r.arg1.toString().includes(query) ||
        r.arg2.toString().includes(query) ||
        r.arg3.toString().includes(query)
      )
    })
  }

  // Filter by command type
  if (filterCommand.value) {
    results = results.filter((r) => r.command === filterCommand.value)
  }

  return results
})

// Sync streamed resets to local state
watch(
  () => resetState.value.items,
  (items) => {
    if (items.length > 0 && !hasUnsavedChanges.value) {
      localResets.value = [...items]
    }
  },
  { deep: true },
)

// Watch for stream completion
watch(
  () => resetState.value.isComplete,
  (isComplete) => {
    if (isComplete && resetState.value.items.length > 0) {
      localResets.value = [...resetState.value.items]
      hasUnsavedChanges.value = false
    }
  },
)

// Save function - now saves to localStorage only
function saveResets() {
  // Convert ResetWithMetadata back to ResetCommand
  const resets: ResetCommand[] = localResets.value.map((r) => ({
    command: r.command,
    ifFlag: r.ifFlag,
    arg1: r.arg1,
    arg2: r.arg2,
    arg3: r.arg3,
    arg4: r.arg4,
    comment: r.comment,
  }))

  const cache = zoneCache.value
  cache.markResetsDirty(resets)

  toast.success('Changes saved locally (not yet written to file)')
  hasUnsavedChanges.value = false
}

// Start streaming resets on mount
onMounted(() => {
  if (props.zoneId) {
    streamResets(props.zoneId)
  }
})

// Setup sortable
watch(sortableContainer, (container) => {
  if (sortableInstance) {
    sortableInstance.destroy()
    sortableInstance = null
  }

  if (container) {
    sortableInstance = new Sortable(container, {
      animation: 150,
      handle: '.cursor-grab',
      ghostClass: 'opacity-50',
      onEnd: (evt) => {
        const oldIndex = evt.oldIndex
        const newIndex = evt.newIndex

        if (oldIndex !== undefined && newIndex !== undefined && oldIndex !== newIndex) {
          // Move the item in the array
          const movedItem = localResets.value[oldIndex]
          if (!movedItem) return

          const newResets = [...localResets.value]
          newResets.splice(oldIndex, 1)
          newResets.splice(newIndex, 0, movedItem)

          // Update indices
          newResets.forEach((r, i) => {
            r.index = i
          })

          localResets.value = newResets
          hasUnsavedChanges.value = true
        }
      },
    })
  }
})

// Cleanup sortable on unmount
onUnmounted(() => {
  if (sortableInstance) {
    sortableInstance.destroy()
    sortableInstance = null
  }
})

// Open edit dialog for new reset
function handleAdd() {
  editingReset.value = null
  isNewReset.value = true
  editDialogOpen.value = true
}

// Open edit dialog for existing reset
function handleEdit(index: number) {
  const reset = localResets.value[index]
  if (reset) {
    editingReset.value = reset
    isNewReset.value = false
    editDialogOpen.value = true
  }
}

// Handle delete confirmation
function handleDelete(index: number) {
  resetToDelete.value = index
  deleteDialogOpen.value = true
}

// Confirm delete
function confirmDelete() {
  if (resetToDelete.value !== null) {
    localResets.value.splice(resetToDelete.value, 1)
    // Update indices
    localResets.value.forEach((r, i) => {
      r.index = i
    })
    hasUnsavedChanges.value = true
    if (selectedIndex.value === resetToDelete.value) {
      selectedIndex.value = null
    }
  }
  deleteDialogOpen.value = false
  resetToDelete.value = null
}

// Handle save from dialog
function handleSaveReset(reset: ResetCommand) {
  if (isNewReset.value) {
    // Add new reset
    const newReset: ResetWithMetadata = {
      ...reset,
      index: localResets.value.length,
      // Resolve names from the available data
      mobName: props.mobs.find((m) => m.vnum === reset.arg1)?.shortDesc,
      objName: props.objects.find((o) => o.vnum === reset.arg1)?.shortDesc,
      roomName: props.rooms.find((r) => r.vnum === reset.arg3)?.name,
    }
    localResets.value.push(newReset)
  } else if (editingReset.value) {
    // Update existing reset
    const index = editingReset.value.index
    const updatedReset: ResetWithMetadata = {
      ...reset,
      index,
      mobName: props.mobs.find((m) => m.vnum === reset.arg1)?.shortDesc,
      objName: props.objects.find((o) => o.vnum === reset.arg1)?.shortDesc,
      roomName: props.rooms.find((r) => r.vnum === reset.arg3)?.name,
    }
    localResets.value[index] = updatedReset
  }
  hasUnsavedChanges.value = true
}

// Handle selection
function handleSelect(index: number) {
  selectedIndex.value = selectedIndex.value === index ? null : index
}

// Refresh resets from server
function handleRefresh() {
  if (hasUnsavedChanges.value) {
    // Show warning
    if (!confirm('You have unsaved changes. Are you sure you want to reload?')) {
      return
    }
  }
  clearState('resets')
  streamResets(props.zoneId)
  hasUnsavedChanges.value = false
}

// Undo changes
function handleUndo() {
  if (resetState.value.items.length > 0) {
    localResets.value = [...resetState.value.items]
    hasUnsavedChanges.value = false
  }
}
</script>

<template>
  <div class="flex flex-col h-full">
    <!-- Header -->
    <div class="border-b p-4 flex items-center justify-between shrink-0">
      <div class="flex items-center gap-4">
        <h2 class="text-lg font-semibold">Zone Resets</h2>
        <Badge variant="outline">
          {{ localResets.length }} resets
        </Badge>
        <Badge v-if="hasUnsavedChanges" variant="destructive">
          Unsaved changes
        </Badge>
      </div>

      <div class="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          :disabled="!hasUnsavedChanges"
          @click="handleUndo"
        >
          <Undo2 class="h-4 w-4 mr-1" />
          Undo
        </Button>
        <Button
          variant="outline"
          size="sm"
          @click="handleRefresh"
        >
          <RefreshCw class="h-4 w-4 mr-1" />
          Refresh
        </Button>
        <Button
          variant="default"
          size="sm"
          :disabled="!hasUnsavedChanges"
          @click="saveResets"
        >
          <Save class="h-4 w-4 mr-1" />
          Save
        </Button>
      </div>
    </div>

    <!-- Toolbar -->
    <div class="border-b p-3 flex items-center gap-3 shrink-0">
      <div class="relative flex-1 max-w-sm">
        <Search class="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          v-model="searchQuery"
          placeholder="Search resets..."
          class="pl-8"
        />
      </div>

      <div class="flex items-center gap-1">
        <Button
          v-for="(label, cmd) in RESET_COMMANDS"
          :key="cmd"
          :variant="filterCommand === cmd ? 'default' : 'outline'"
          size="sm"
          class="h-7 px-2 text-xs"
          @click="filterCommand = filterCommand === cmd ? null : cmd"
        >
          {{ cmd }}
        </Button>
      </div>

      <Button size="sm" @click="handleAdd">
        <Plus class="h-4 w-4 mr-1" />
        Add Reset
      </Button>
    </div>

    <!-- Loading state -->
    <div v-if="resetState.isStreaming" class="p-4 space-y-4">
      <div class="flex items-center gap-2">
        <Loader2 class="h-4 w-4 animate-spin" />
        <span class="text-sm text-muted-foreground">
          Loading resets... {{ resetState.loaded }} / {{ resetState.total }}
        </span>
      </div>
      <Progress :model-value="resetProgress" />
    </div>

    <!-- Error state -->
    <div v-else-if="resetState.error" class="p-4">
      <div class="flex items-center gap-2 text-destructive">
        <AlertTriangle class="h-4 w-4" />
        <span>{{ resetState.error }}</span>
      </div>
    </div>

    <!-- Empty state -->
    <div v-else-if="localResets.length === 0" class="flex-1 flex items-center justify-center">
      <div class="text-center space-y-2">
        <p class="text-muted-foreground">No resets in this zone</p>
        <Button @click="handleAdd">
          <Plus class="h-4 w-4 mr-1" />
          Add First Reset
        </Button>
      </div>
    </div>

    <!-- Resets list -->
    <ScrollArea v-else class="flex-1">
      <div ref="sortableContainer" class="p-2 space-y-1">
        <ResetItem
          v-for="reset in filteredResets"
          :key="`${reset.index}-${reset.command}-${reset.arg1}`"
          :reset="reset"
          :index="reset.index"
          :selected="selectedIndex === reset.index"
          @edit="handleEdit(reset.index)"
          @delete="handleDelete(reset.index)"
          @select="handleSelect(reset.index)"
        />
      </div>
    </ScrollArea>

    <!-- No results message -->
    <div
      v-if="localResets.length > 0 && filteredResets.length === 0"
      class="p-4 text-center text-muted-foreground"
    >
      No resets match your search
    </div>

    <!-- Edit Dialog -->
    <ResetEditDialog
      v-model:open="editDialogOpen"
      :reset="editingReset"
      :mobs="mobs"
      :objects="objects"
      :rooms="rooms"
      :is-new="isNewReset"
      @save="handleSaveReset"
    />

    <!-- Delete Confirmation Dialog -->
    <AlertDialog v-model:open="deleteDialogOpen">
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete Reset</AlertDialogTitle>
          <AlertDialogDescription>
            Are you sure you want to delete this reset? This action cannot be undone until you save.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction @click="confirmDelete">Delete</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </div>
</template>
