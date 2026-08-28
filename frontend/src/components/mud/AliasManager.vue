<script setup lang="ts">
import { ref, computed } from 'vue'
import type { Alias, AliasFormData } from '@/types/alias'
import { useMudStore } from '@/stores/mudStore'
import { useAliases } from '@/composables/useAliases'
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
import { Plus, Download, Upload, FolderTree } from 'lucide-vue-next'
import { toast } from 'vue-sonner'

import AliasTable from './AliasTable.vue'
import AliasFormDialog from './AliasFormDialog.vue'
import GroupManager from './GroupManager.vue'

const props = defineProps<{
  open: boolean
}>()

const emit = defineEmits<{
  'update:open': [value: boolean]
}>()

const store = useMudStore()
const {
  aliases,
  globalAliases,
  currentCharacterAliases,
  addAlias,
  updateAlias,
  deleteAlias,
  setAliasEnabled,
  duplicateAlias,
  exportAliases,
  importAliases,
  echoExpansion,
  setEchoExpansion,
  storageError,
} = useAliases()

// Filter state
type FilterType = 'all' | 'global' | 'character'
const filter = ref<FilterType>('all')

// Current character name
const currentCharacter = computed(() => store.selectedCharacter)

// Filtered aliases based on selected tab
const filteredAliases = computed(() => {
  switch (filter.value) {
    case 'global':
      return globalAliases.value
    case 'character':
      return currentCharacterAliases.value
    default:
      return aliases.value
  }
})

// Form dialog state
const formDialogOpen = ref(false)
const formMode = ref<'add' | 'edit'>('add')
const editingAlias = ref<Alias | null>(null)

// Delete confirmation state
const deleteDialogOpen = ref(false)
const aliasToDelete = ref<Alias | null>(null)

// Import dialog state (simplified - uses file input)
const fileInputRef = ref<HTMLInputElement | null>(null)

// Group manager dialog state
const groupManagerOpen = ref(false)

function openAddDialog() {
  formMode.value = 'add'
  editingAlias.value = null
  formDialogOpen.value = true
}

function openEditDialog(alias: Alias) {
  formMode.value = 'edit'
  editingAlias.value = alias
  formDialogOpen.value = true
}

function confirmDelete(alias: Alias) {
  aliasToDelete.value = alias
  deleteDialogOpen.value = true
}

function handleDelete() {
  if (aliasToDelete.value) {
    const deleted = deleteAlias(aliasToDelete.value.id)
    if (deleted) {
      toast.success('Alias deleted', {
        description: `Alias "${aliasToDelete.value.trigger}" has been removed.`,
      })
    } else {
      toast.error('Alias was not saved', {
        description: storageError.value ?? 'The alias could not be deleted.',
      })
    }
  }
  deleteDialogOpen.value = false
  aliasToDelete.value = null
}

function handleToggle(id: string, enabled: boolean) {
  if (!setAliasEnabled(id, enabled)) {
    toast.error('Alias was not saved', {
      description: storageError.value ?? 'The alias state could not be saved.',
    })
  }
}

function handleDuplicate(alias: Alias) {
  const newAlias = duplicateAlias(alias.id)
  if (newAlias) {
    toast.success('Alias duplicated', {
      description: `Created "${newAlias.trigger}" as a copy.`,
    })
  } else if (storageError.value) {
    toast.error('Alias was not saved', {
      description: storageError.value,
    })
  }
}

function handleSave(data: AliasFormData, id?: string) {
  if (id) {
    // Edit mode
    const updated = updateAlias(id, data)
    if (!updated) {
      toast.error('Alias was not saved', {
        description: storageError.value ?? 'The alias could not be updated.',
      })
      return
    }
    toast.success('Alias updated', {
      description: `Alias "${data.trigger}" has been updated.`,
    })
  } else {
    // Add mode
    const created = addAlias(data)
    if (!created) {
      toast.error('Alias was not saved', {
        description: storageError.value ?? 'The alias could not be created.',
      })
      return
    }
    toast.success('Alias created', {
      description: `Alias "${data.trigger}" has been added.`,
    })
  }
}

function handleExport() {
  const json = exportAliases()
  const blob = new Blob([json], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `duris-aliases-${store.account || 'export'}.json`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)

  toast.success('Aliases exported', {
    description: `${aliases.value.length} aliases saved to file.`,
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
    const count = importAliases(text, 'merge')
    toast.success('Aliases imported', {
      description: `${count} aliases imported (duplicates skipped).`,
    })
  } catch {
    toast.error('Import failed', {
      description: 'Invalid alias file format.',
    })
  }

  // Reset file input
  input.value = ''
}
</script>

<template>
  <Dialog :open="props.open" @update:open="emit('update:open', $event)">
    <DialogContent class="sm:!max-w-3xl max-h-[80vh] flex flex-col">
      <DialogHeader>
        <DialogTitle>Alias Manager</DialogTitle>
        <DialogDescription>
          Create command shortcuts. Character-specific aliases override global ones.
        </DialogDescription>
      </DialogHeader>

      <!-- Toolbar -->
      <div class="flex items-center justify-between gap-2 flex-wrap">
        <div class="flex items-center gap-2">
          <Button size="sm" @click="openAddDialog">
            <Plus class="h-4 w-4 mr-1" />
            Add Alias
          </Button>
          <Button variant="outline" size="sm" @click="handleExport">
            <Download class="h-4 w-4 mr-1" />
            Export
          </Button>
          <Button variant="outline" size="sm" @click="handleImportClick">
            <Upload class="h-4 w-4 mr-1" />
            Import
          </Button>
          <Button variant="outline" size="sm" @click="groupManagerOpen = true">
            <FolderTree class="h-4 w-4 mr-1" />
            Groups
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
              id="echo-expansion"
              :model-value="echoExpansion"
              @update:model-value="setEchoExpansion"
            />
            <Label for="echo-expansion" class="text-sm cursor-pointer">Echo</Label>
          </div>
        </div>

        <!-- Filter tabs -->
        <Tabs v-model="filter" class="w-auto">
          <TabsList>
            <TabsTrigger value="all">
              All ({{ aliases.length }})
            </TabsTrigger>
            <TabsTrigger value="global">
              Global ({{ globalAliases.length }})
            </TabsTrigger>
            <TabsTrigger value="character" :disabled="!currentCharacter">
              {{ currentCharacter || 'Character' }} ({{ currentCharacterAliases.length }})
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      <!-- Alias List -->
      <div class="flex-1 overflow-y-auto min-h-[200px]">
        <AliasTable
          :aliases="filteredAliases"
          @edit="openEditDialog"
          @delete="confirmDelete"
          @toggle="handleToggle"
          @duplicate="handleDuplicate"
        />
      </div>
    </DialogContent>
  </Dialog>

  <!-- Add/Edit Dialog -->
  <AliasFormDialog
    v-model:open="formDialogOpen"
    :alias="editingAlias"
    :mode="formMode"
    @save="handleSave"
  />

  <!-- Delete Confirmation -->
  <AlertDialog v-model:open="deleteDialogOpen">
    <AlertDialogContent>
      <AlertDialogHeader>
        <AlertDialogTitle>Delete Alias</AlertDialogTitle>
        <AlertDialogDescription>
          Are you sure you want to delete the alias "{{ aliasToDelete?.trigger }}"? This action
          cannot be undone.
        </AlertDialogDescription>
      </AlertDialogHeader>
      <AlertDialogFooter>
        <AlertDialogCancel>Cancel</AlertDialogCancel>
        <AlertDialogAction @click="handleDelete">Delete</AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>

  <GroupManager v-model:open="groupManagerOpen" />
</template>
