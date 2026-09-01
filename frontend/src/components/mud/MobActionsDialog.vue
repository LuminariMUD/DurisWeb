<script setup lang="ts">
import { ref } from 'vue'
import { useMobActions, type MobAction } from '@/composables/useMobActions'
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
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

const {
  actions,
  actionError,
  button1ActionId,
  button2ActionId,
  addAction,
  updateAction,
  deleteAction,
  setButtonAction,
  reorderActions,
  exportActions,
  importActions,
} = useMobActions()

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

function startEdit(action: MobAction) {
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
        description: actionError.value ?? 'The mob action could not be updated.',
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
        description: actionError.value ?? 'The mob action could not be created.',
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
  a.download = 'duris-mob-actions.json'
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)

  toast.success('Mob actions exported', {
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
    toast.success('Mob actions imported', {
      description: `${count} actions imported (duplicates skipped).`,
    })
  } catch {
    toast.error('Import failed', {
      description: 'Invalid mob actions file format.',
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
        <DialogTitle>Mob Actions</DialogTitle>
        <DialogDescription>
          Configure right-click actions for mobs in the room. The command will be sent with the target appended (e.g., "kill 1.skeleton").
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
                    placeholder="e.g., kill"
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

        <!-- Quick Action Buttons Assignment -->
        <div class="border rounded-md p-3 space-y-3">
          <div class="text-sm font-medium">Quick Action Buttons</div>
          <div class="text-xs text-muted-foreground mb-2">
            Assign actions to the quick buttons shown next to each mob.
          </div>
          <div class="grid grid-cols-2 gap-3">
            <div class="space-y-1">
              <label class="text-xs text-muted-foreground">Button 1</label>
              <Select
                :model-value="button1ActionId || 'none'"
                @update:model-value="(v) => setButtonAction(1, v === 'none' ? null : String(v))"
              >
                <SelectTrigger class="h-8">
                  <SelectValue placeholder="Not assigned" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Not assigned</SelectItem>
                  <SelectItem v-for="action in actions" :key="action.id" :value="action.id">
                    {{ action.label }}
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div class="space-y-1">
              <label class="text-xs text-muted-foreground">Button 2</label>
              <Select
                :model-value="button2ActionId || 'none'"
                @update:model-value="(v) => setButtonAction(2, v === 'none' ? null : String(v))"
              >
                <SelectTrigger class="h-8">
                  <SelectValue placeholder="Not assigned" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Not assigned</SelectItem>
                  <SelectItem v-for="action in actions" :key="action.id" :value="action.id">
                    {{ action.label }}
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        <!-- Example -->
        <div class="text-xs text-muted-foreground bg-muted/50 p-3 rounded-md">
          <p class="font-medium mb-1">Examples:</p>
          <ul class="space-y-0.5">
            <li><span class="font-mono">kill</span> - Attack the mob</li>
            <li><span class="font-mono">cast 'fireball'</span> - Cast spell on mob</li>
            <li><span class="font-mono">consider</span> - Check mob difficulty</li>
          </ul>
        </div>
      </div>
    </DialogContent>
  </Dialog>
</template>
