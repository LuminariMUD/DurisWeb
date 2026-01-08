<script setup lang="ts">
import { ref, computed } from 'vue'
import type { Timer, TimerFormData } from '@/types/timer'
import { useMudStore } from '@/stores/mudStore'
import { useTimers } from '@/composables/useTimers'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
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
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { Plus, Download, Upload } from 'lucide-vue-next'
import { toast } from 'vue-sonner'

import TimerTable from './TimerTable.vue'
import TimerFormDialog from './TimerFormDialog.vue'

const props = defineProps<{
  open: boolean
}>()

const emit = defineEmits<{
  'update:open': [value: boolean]
}>()

const store = useMudStore()
const {
  timers,
  globalTimers,
  currentCharacterTimers,
  timerStates,
  addTimer,
  updateTimer,
  deleteTimer,
  setTimerEnabled,
  duplicateTimer,
  startTimer,
  stopTimer,
  exportTimers,
  importTimers,
  echoTimers,
  setEchoTimers,
} = useTimers()

// Filter state
type FilterType = 'all' | 'global' | 'character'
const filter = ref<FilterType>('all')

// Current character name
const currentCharacter = computed(() => store.selectedCharacter)

// Filtered timers based on selected tab
const filteredTimers = computed(() => {
  switch (filter.value) {
    case 'global':
      return globalTimers.value
    case 'character':
      return currentCharacterTimers.value
    default:
      return timers.value
  }
})

// Form dialog state
const formDialogOpen = ref(false)
const formMode = ref<'add' | 'edit'>('add')
const editingTimer = ref<Timer | null>(null)

// Delete confirmation state
const deleteDialogOpen = ref(false)
const timerToDelete = ref<Timer | null>(null)

// Import dialog state (simplified - uses file input)
const fileInputRef = ref<HTMLInputElement | null>(null)

function openAddDialog() {
  formMode.value = 'add'
  editingTimer.value = null
  formDialogOpen.value = true
}

function openEditDialog(timer: Timer) {
  formMode.value = 'edit'
  editingTimer.value = timer
  formDialogOpen.value = true
}

function confirmDelete(timer: Timer) {
  timerToDelete.value = timer
  deleteDialogOpen.value = true
}

function handleDelete() {
  if (timerToDelete.value) {
    deleteTimer(timerToDelete.value.id)
    toast.success('Timer deleted', {
      description: `Timer "${timerToDelete.value.name}" has been removed.`,
    })
  }
  deleteDialogOpen.value = false
  timerToDelete.value = null
}

function handleToggle(id: string, enabled: boolean) {
  setTimerEnabled(id, enabled)
}

function handleDuplicate(timer: Timer) {
  const newTimer = duplicateTimer(timer.id)
  if (newTimer) {
    toast.success('Timer duplicated', {
      description: `Created "${newTimer.name}" as a copy.`,
    })
  }
}

function handleStart(id: string) {
  if (startTimer(id)) {
    toast.success('Timer started')
  }
}

function handleStop(id: string) {
  if (stopTimer(id)) {
    toast.success('Timer stopped')
  }
}

function handleSave(data: TimerFormData, id?: string) {
  if (id) {
    // Edit mode
    updateTimer(id, data)
    toast.success('Timer updated', {
      description: `Timer "${data.name}" has been updated.`,
    })
  } else {
    // Add mode
    addTimer(data)
    toast.success('Timer created', {
      description: `Timer "${data.name}" has been added.`,
    })
  }
}

function handleExport() {
  const json = exportTimers()
  const blob = new Blob([json], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `duris-timers-${store.account || 'export'}.json`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)

  toast.success('Timers exported', {
    description: `${timers.value.length} timers saved to file.`,
  })
}

function handleImportClick() {
  fileInputRef.value?.click()
}

async function handleImportFile(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return

  try {
    const text = await file.text()
    const count = importTimers(text, 'merge')
    toast.success('Timers imported', {
      description: `${count} timers imported (duplicates skipped).`,
    })
  } catch {
    toast.error('Import failed', {
      description: 'Invalid timer file format.',
    })
  }

  // Reset file input
  input.value = ''
}
</script>

<template>
  <Dialog :open="props.open" @update:open="emit('update:open', $event)">
    <DialogContent class="sm:!max-w-4xl max-h-[80vh] flex flex-col">
      <DialogHeader>
        <DialogTitle>Timer Manager</DialogTitle>
        <DialogDescription>
          Create timers to execute actions at regular intervals. Timers only run when connected to the MUD.
        </DialogDescription>
      </DialogHeader>

      <!-- Toolbar -->
      <div class="flex items-center justify-between gap-2 flex-wrap">
        <div class="flex items-center gap-2">
          <Button size="sm" @click="openAddDialog">
            <Plus class="h-4 w-4 mr-1" />
            Add Timer
          </Button>
          <Button variant="outline" size="sm" @click="handleExport">
            <Download class="h-4 w-4 mr-1" />
            Export
          </Button>
          <Button variant="outline" size="sm" @click="handleImportClick">
            <Upload class="h-4 w-4 mr-1" />
            Import
          </Button>
          <input
            ref="fileInputRef"
            type="file"
            accept=".json"
            class="hidden"
            @change="handleImportFile"
          />
          <div class="flex items-center gap-2 ml-2 pl-2 border-l">
            <Switch
              id="echo-timers"
              :model-value="echoTimers"
              @update:model-value="setEchoTimers"
            />
            <Label for="echo-timers" class="text-sm cursor-pointer">Echo</Label>
          </div>
        </div>

        <!-- Filter tabs -->
        <Tabs v-model="filter" class="w-auto">
          <TabsList>
            <TabsTrigger value="all">
              All ({{ timers.length }})
            </TabsTrigger>
            <TabsTrigger value="global">
              Global ({{ globalTimers.length }})
            </TabsTrigger>
            <TabsTrigger value="character" :disabled="!currentCharacter">
              {{ currentCharacter || 'Character' }} ({{ currentCharacterTimers.length }})
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      <!-- Timer List -->
      <div class="flex-1 overflow-y-auto min-h-[200px]">
        <TimerTable
          :timers="filteredTimers"
          :timer-states="timerStates"
          @edit="openEditDialog"
          @delete="confirmDelete"
          @toggle="handleToggle"
          @duplicate="handleDuplicate"
          @start="handleStart"
          @stop="handleStop"
        />
      </div>
    </DialogContent>
  </Dialog>

  <!-- Add/Edit Dialog -->
  <TimerFormDialog
    v-model:open="formDialogOpen"
    :timer="editingTimer"
    :mode="formMode"
    @save="handleSave"
  />

  <!-- Delete Confirmation -->
  <AlertDialog v-model:open="deleteDialogOpen">
    <AlertDialogContent>
      <AlertDialogHeader>
        <AlertDialogTitle>Delete Timer</AlertDialogTitle>
        <AlertDialogDescription>
          Are you sure you want to delete the timer "{{ timerToDelete?.name }}"? This action
          cannot be undone.
        </AlertDialogDescription>
      </AlertDialogHeader>
      <AlertDialogFooter>
        <AlertDialogCancel>Cancel</AlertDialogCancel>
        <AlertDialogAction @click="handleDelete">Delete</AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
</template>
