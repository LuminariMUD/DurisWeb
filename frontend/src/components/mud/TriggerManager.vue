<script setup lang="ts">
import { ref, computed } from 'vue'
import type { Trigger, TriggerFormData } from '@/types/trigger'
import { useMudStore } from '@/stores/mudStore'
import { useTriggers } from '@/composables/useTriggers'
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
import { Plus, Download, Upload, VolumeX, Volume2 } from 'lucide-vue-next'
import { toast } from 'vue-sonner'

import TriggerTable from './TriggerTable.vue'
import TriggerFormDialog from './TriggerFormDialog.vue'

const props = defineProps<{
  open: boolean
}>()

const emit = defineEmits<{
  'update:open': [value: boolean]
}>()

const store = useMudStore()
const {
  triggers,
  globalTriggers,
  currentCharacterTriggers,
  addTrigger,
  updateTrigger,
  deleteTrigger,
  setTriggerEnabled,
  duplicateTrigger,
  exportTriggers,
  importTriggers,
  echoTriggers,
  setEchoTriggers,
  muteSounds,
  setMuteSounds,
} = useTriggers()

// Filter state
type FilterType = 'all' | 'global' | 'character'
const filter = ref<FilterType>('all')

// Current character name
const currentCharacter = computed(() => store.selectedCharacter)

// Filtered triggers based on selected tab
const filteredTriggers = computed(() => {
  switch (filter.value) {
    case 'global':
      return globalTriggers.value
    case 'character':
      return currentCharacterTriggers.value
    default:
      return triggers.value
  }
})

// Form dialog state
const formDialogOpen = ref(false)
const formMode = ref<'add' | 'edit'>('add')
const editingTrigger = ref<Trigger | null>(null)

// Delete confirmation state
const deleteDialogOpen = ref(false)
const triggerToDelete = ref<Trigger | null>(null)

// Import dialog state (simplified - uses file input)
const fileInputRef = ref<HTMLInputElement | null>(null)

function openAddDialog() {
  formMode.value = 'add'
  editingTrigger.value = null
  formDialogOpen.value = true
}

function openEditDialog(trigger: Trigger) {
  formMode.value = 'edit'
  editingTrigger.value = trigger
  formDialogOpen.value = true
}

function confirmDelete(trigger: Trigger) {
  triggerToDelete.value = trigger
  deleteDialogOpen.value = true
}

function handleDelete() {
  if (triggerToDelete.value) {
    deleteTrigger(triggerToDelete.value.id)
    toast.success('Trigger deleted', {
      description: `Trigger "${triggerToDelete.value.name}" has been removed.`,
    })
  }
  deleteDialogOpen.value = false
  triggerToDelete.value = null
}

function handleToggle(id: string, enabled: boolean) {
  setTriggerEnabled(id, enabled)
}

function handleDuplicate(trigger: Trigger) {
  const newTrigger = duplicateTrigger(trigger.id)
  if (newTrigger) {
    toast.success('Trigger duplicated', {
      description: `Created "${newTrigger.name}" as a copy.`,
    })
  }
}

function handleSave(data: TriggerFormData, id?: string) {
  if (id) {
    // Edit mode
    updateTrigger(id, data)
    toast.success('Trigger updated', {
      description: `Trigger "${data.name}" has been updated.`,
    })
  } else {
    // Add mode
    addTrigger(data)
    toast.success('Trigger created', {
      description: `Trigger "${data.name}" has been added.`,
    })
  }
}

function handleExport() {
  const json = exportTriggers()
  const blob = new Blob([json], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `duris-triggers-${store.account || 'export'}.json`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)

  toast.success('Triggers exported', {
    description: `${triggers.value.length} triggers saved to file.`,
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
    const count = importTriggers(text, 'merge')
    toast.success('Triggers imported', {
      description: `${count} triggers imported (duplicates skipped).`,
    })
  } catch {
    toast.error('Import failed', {
      description: 'Invalid trigger file format.',
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
        <DialogTitle>Trigger Manager</DialogTitle>
        <DialogDescription>
          Create triggers to match incoming text and perform actions. Character-specific triggers override global ones.
        </DialogDescription>
      </DialogHeader>

      <!-- Toolbar -->
      <div class="flex items-center justify-between gap-2 flex-wrap">
        <div class="flex items-center gap-2">
          <Button size="sm" @click="openAddDialog">
            <Plus class="h-4 w-4 mr-1" />
            Add Trigger
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
              id="echo-triggers"
              :model-value="echoTriggers"
              @update:model-value="setEchoTriggers"
            />
            <Label for="echo-triggers" class="text-sm cursor-pointer">Echo</Label>
          </div>
          <div class="flex items-center gap-2 ml-2 pl-2 border-l">
            <Switch
              id="mute-sounds"
              :model-value="muteSounds"
              @update:model-value="setMuteSounds"
            />
            <Label for="mute-sounds" class="text-sm cursor-pointer flex items-center gap-1">
              <component :is="muteSounds ? VolumeX : Volume2" class="h-3 w-3" />
              Mute
            </Label>
          </div>
        </div>

        <!-- Filter tabs -->
        <Tabs v-model="filter" class="w-auto">
          <TabsList>
            <TabsTrigger value="all">
              All ({{ triggers.length }})
            </TabsTrigger>
            <TabsTrigger value="global">
              Global ({{ globalTriggers.length }})
            </TabsTrigger>
            <TabsTrigger value="character" :disabled="!currentCharacter">
              {{ currentCharacter || 'Character' }} ({{ currentCharacterTriggers.length }})
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      <!-- Trigger List -->
      <div class="flex-1 overflow-y-auto min-h-[200px]">
        <TriggerTable
          :triggers="filteredTriggers"
          @edit="openEditDialog"
          @delete="confirmDelete"
          @toggle="handleToggle"
          @duplicate="handleDuplicate"
        />
      </div>
    </DialogContent>
  </Dialog>

  <!-- Add/Edit Dialog -->
  <TriggerFormDialog
    v-model:open="formDialogOpen"
    :trigger="editingTrigger"
    :mode="formMode"
    @save="handleSave"
  />

  <!-- Delete Confirmation -->
  <AlertDialog v-model:open="deleteDialogOpen">
    <AlertDialogContent>
      <AlertDialogHeader>
        <AlertDialogTitle>Delete Trigger</AlertDialogTitle>
        <AlertDialogDescription>
          Are you sure you want to delete the trigger "{{ triggerToDelete?.name }}"? This action
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
