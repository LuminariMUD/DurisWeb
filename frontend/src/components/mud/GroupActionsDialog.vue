<script setup lang="ts">
import { ref } from 'vue'
import { useGroupActions, type GroupAction } from '@/composables/useGroupActions'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Plus, Pencil, Trash2, Save, X, GripVertical, Download, Upload } from 'lucide-vue-next'
import { toast } from 'vue-sonner'

const isOpen = defineModel<boolean>('open', { default: false })

const { actions, actionError, addAction, updateAction, deleteAction, reorderActions, exportActions, importActions } = useGroupActions()

// File input ref for import
const fileInputRef = ref<HTMLInputElement | null>(null)

// Edit state
const editingId = ref<string | null>(null)
const editLabel = ref('')
const editCommand = ref('')

// New action state
const isAdding = ref(false)
const newLabel = ref('')
const newCommand = ref('')

// Drag state
const dragIndex = ref<number | null>(null)
const dragOverIndex = ref<number | null>(null)

function handleDragStart(index: number) {
  dragIndex.value = index
}

function handleDragOver(e: DragEvent, index: number) {
  e.preventDefault()
  dragOverIndex.value = index
}

function handleDragLeave() {
  dragOverIndex.value = null
}

function handleDrop(index: number) {
  if (dragIndex.value !== null && dragIndex.value !== index) {
    reorderActions(dragIndex.value, index)
  }
  dragIndex.value = null
  dragOverIndex.value = null
}

function handleDragEnd() {
  dragIndex.value = null
  dragOverIndex.value = null
}

function startEdit(action: GroupAction) {
  editingId.value = action.id
  editLabel.value = action.label
  editCommand.value = action.command
}

function cancelEdit() {
  editingId.value = null
  editLabel.value = ''
  editCommand.value = ''
}

function saveEdit() {
  if (editingId.value && editLabel.value.trim() && editCommand.value.trim()) {
    const updated = updateAction(editingId.value, editLabel.value, editCommand.value)
    if (updated) {
      cancelEdit()
    } else {
      toast.error('Action was not saved', {
        description: actionError.value ?? 'The group action could not be updated.',
      })
    }
  }
}

function startAdd() {
  isAdding.value = true
  newLabel.value = ''
  newCommand.value = ''
}

function cancelAdd() {
  isAdding.value = false
  newLabel.value = ''
  newCommand.value = ''
}

function saveAdd() {
  if (newLabel.value.trim() && newCommand.value.trim()) {
    const created = addAction(newLabel.value, newCommand.value)
    if (created) {
      cancelAdd()
    } else {
      toast.error('Action was not saved', {
        description: actionError.value ?? 'The group action could not be created.',
      })
    }
  }
}

function handleDelete(id: string) {
  deleteAction(id)
}

function handleExport() {
  const json = exportActions()
  const blob = new Blob([json], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'duris-group-actions.json'
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)

  toast.success('Group actions exported', {
    description: `${actions.value.length} actions saved to file.`,
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
    const count = importActions(text, 'merge')
    toast.success('Group actions imported', {
      description: `${count} actions imported (duplicates skipped).`,
    })
  } catch {
    toast.error('Import failed', {
      description: 'Invalid group actions file format.',
    })
  }

  // Reset file input
  input.value = ''
}
</script>

<template>
  <Dialog v-model:open="isOpen">
    <DialogContent class="sm:max-w-[500px]">
      <DialogHeader>
        <DialogTitle>Group Actions</DialogTitle>
        <DialogDescription>
          Configure right-click actions for group members. The command will be sent with the target appended (e.g., "cast 'heal' 2.orc").
        </DialogDescription>
      </DialogHeader>

      <div class="space-y-4">
        <!-- Actions Table -->
        <div class="border rounded-md">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead class="w-[32px]"></TableHead>
                <TableHead class="w-[120px]">Action</TableHead>
                <TableHead>Command</TableHead>
                <TableHead class="w-[80px] text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <!-- Existing Actions -->
              <TableRow
                v-for="(action, index) in actions"
                :key="action.id"
                draggable="true"
                class="transition-colors"
                :class="{
                  'opacity-50': dragIndex === index,
                  'border-t-2 border-primary': dragOverIndex === index && dragIndex !== null && dragIndex > index,
                  'border-b-2 border-primary': dragOverIndex === index && dragIndex !== null && dragIndex < index,
                }"
                @dragstart="handleDragStart(index)"
                @dragover="(e: DragEvent) => handleDragOver(e, index)"
                @dragleave="handleDragLeave"
                @drop="handleDrop(index)"
                @dragend="handleDragEnd"
              >
                <template v-if="editingId === action.id">
                  <TableCell class="cursor-grab">
                    <GripVertical class="h-4 w-4 text-muted-foreground/50" />
                  </TableCell>
                  <TableCell>
                    <Input
                      v-model="editLabel"
                      placeholder="Action name"
                      class="h-8"
                      @keyup.enter="saveEdit"
                      @keyup.escape="cancelEdit"
                    />
                  </TableCell>
                  <TableCell>
                    <Input
                      v-model="editCommand"
                      placeholder="Command"
                      class="h-8"
                      @keyup.enter="saveEdit"
                      @keyup.escape="cancelEdit"
                    />
                  </TableCell>
                  <TableCell class="text-right">
                    <div class="flex justify-end gap-1">
                      <Button variant="ghost" size="icon" class="h-7 w-7" @click="saveEdit">
                        <Save class="h-3.5 w-3.5" />
                      </Button>
                      <Button variant="ghost" size="icon" class="h-7 w-7" @click="cancelEdit">
                        <X class="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </TableCell>
                </template>
                <template v-else>
                  <TableCell class="cursor-grab">
                    <GripVertical class="h-4 w-4 text-muted-foreground/50 hover:text-muted-foreground" />
                  </TableCell>
                  <TableCell class="font-medium">{{ action.label }}</TableCell>
                  <TableCell class="font-mono text-sm text-muted-foreground">{{ action.command }}</TableCell>
                  <TableCell class="text-right">
                    <div class="flex justify-end gap-1">
                      <Button variant="ghost" size="icon" class="h-7 w-7" @click="startEdit(action)">
                        <Pencil class="h-3.5 w-3.5" />
                      </Button>
                      <Button variant="ghost" size="icon" class="h-7 w-7 text-destructive" @click="handleDelete(action.id)">
                        <Trash2 class="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </TableCell>
                </template>
              </TableRow>

              <!-- Add New Row -->
              <TableRow v-if="isAdding">
                <TableCell></TableCell>
                <TableCell>
                  <Input
                    v-model="newLabel"
                    placeholder="Action name"
                    class="h-8"
                    @keyup.enter="saveAdd"
                    @keyup.escape="cancelAdd"
                  />
                </TableCell>
                <TableCell>
                  <Input
                    v-model="newCommand"
                    placeholder="e.g., cast 'heal'"
                    class="h-8"
                    @keyup.enter="saveAdd"
                    @keyup.escape="cancelAdd"
                  />
                </TableCell>
                <TableCell class="text-right">
                  <div class="flex justify-end gap-1">
                    <Button variant="ghost" size="icon" class="h-7 w-7" @click="saveAdd">
                      <Save class="h-3.5 w-3.5" />
                    </Button>
                    <Button variant="ghost" size="icon" class="h-7 w-7" @click="cancelAdd">
                      <X class="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>

              <!-- Empty State -->
              <TableRow v-if="actions.length === 0 && !isAdding">
                <TableCell colspan="4" class="text-center text-muted-foreground py-4">
                  No actions configured. Click "Add Action" to create one.
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </div>

        <!-- Action Buttons -->
        <div class="flex gap-2">
          <Button v-if="!isAdding" variant="outline" size="sm" class="flex-1" @click="startAdd">
            <Plus class="h-4 w-4 mr-2" />
            Add Action
          </Button>
          <Button variant="outline" size="sm" @click="handleExport" :disabled="actions.length === 0">
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
        </div>

        <!-- Example -->
        <div class="text-xs text-muted-foreground bg-muted/50 p-3 rounded-md">
          <p class="font-medium mb-1">Examples:</p>
          <ul class="space-y-0.5">
            <li><span class="font-mono">cast 'heal'</span> - Heals the target</li>
            <li><span class="font-mono">cast 'full heal'</span> - Full heals the target</li>
            <li><span class="font-mono">assist</span> - Assists the target in combat</li>
          </ul>
        </div>
      </div>
    </DialogContent>
  </Dialog>
</template>
