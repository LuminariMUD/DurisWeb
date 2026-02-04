<script setup lang="ts">
import { ref, computed } from 'vue'
import { useGroups } from '@/composables/useGroups'
import { useTriggers } from '@/composables/useTriggers'
import { useAliases } from '@/composables/useAliases'
import { useTimers } from '@/composables/useTimers'
import type { Group } from '@/types/group'
import type { Trigger } from '@/types/trigger'
import type { Alias } from '@/types/alias'
import type { Timer } from '@/types/timer'
import { formatInterval } from '@/types/timer'
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
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { Plus, Trash2, FolderPlus, Terminal, Zap, Clock, ChevronRight, ChevronDown, Folder, FolderOpen } from 'lucide-vue-next'
import { toast } from 'vue-sonner'

const props = defineProps<{
  open: boolean
}>()

const emit = defineEmits<{
  'update:open': [value: boolean]
}>()

const {
  groups,
  rootGroups,
  getChildGroups,
  addGroup,
  updateGroup,
  deleteGroup,
  toggleGroup,
  isNameInUse,
} = useGroups()

const { triggers, setTriggerGroup } = useTriggers()
const { aliases, setAliasGroup } = useAliases()
const { timers, setTimerGroup } = useTimers()

// selected group (null = ungrouped)
const selectedGroupId = ref<string | null>(null)

// expanded state for group tree
const expandedGroups = ref<Set<string>>(new Set())

// editing state
const editingId = ref<string | null>(null)
const editingName = ref('')

// new group input
const newGroupName = ref('')
const newSubgroupParent = ref<string | null>(null)

// delete confirmation
const deleteDialogOpen = ref(false)
const groupToDelete = ref<Group | null>(null)

// drag state
const dragOverGroupId = ref<string | null>(null)

// item type for drag
type ItemType = 'trigger' | 'alias' | 'timer'
interface DragItem {
  type: ItemType
  id: string
}
const dragItem = ref<DragItem | null>(null)

// selected group object
const selectedGroup = computed(() => {
  if (selectedGroupId.value === null) return null
  return groups.value.find(g => g.id === selectedGroupId.value) || null
})

// items for selected group
const selectedTriggers = computed((): Trigger[] => {
  if (selectedGroupId.value === null) {
    return triggers.value.filter(t => !t.groupId)
  }
  return triggers.value.filter(t => t.groupId === selectedGroupId.value)
})

const selectedAliases = computed((): Alias[] => {
  if (selectedGroupId.value === null) {
    return aliases.value.filter(a => !a.groupId)
  }
  return aliases.value.filter(a => a.groupId === selectedGroupId.value)
})

const selectedTimers = computed((): Timer[] => {
  if (selectedGroupId.value === null) {
    return timers.value.filter(t => !t.groupId)
  }
  return timers.value.filter(t => t.groupId === selectedGroupId.value)
})

// count helpers
function getItemCount(groupId: string | null): number {
  if (groupId === null) {
    return triggers.value.filter(t => !t.groupId).length +
           aliases.value.filter(a => !a.groupId).length +
           timers.value.filter(t => !t.groupId).length
  }
  return triggers.value.filter(t => t.groupId === groupId).length +
         aliases.value.filter(a => a.groupId === groupId).length +
         timers.value.filter(t => t.groupId === groupId).length
}

function getTotalItemCount(groupId: string): number {
  let count = getItemCount(groupId)
  const children = getChildGroups(groupId)
  for (const child of children) {
    count += getItemCount(child.id)
  }
  return count
}

function toggleExpand(id: string, e?: Event) {
  e?.stopPropagation()
  if (expandedGroups.value.has(id)) {
    expandedGroups.value.delete(id)
  } else {
    expandedGroups.value.add(id)
  }
}

function selectGroup(id: string | null) {
  selectedGroupId.value = id
}

function startEdit(group: Group) {
  editingId.value = group.id
  editingName.value = group.name
}

function saveEdit() {
  if (!editingId.value || !editingName.value.trim()) return

  const group = groups.value.find(g => g.id === editingId.value)
  if (!group) return

  if (isNameInUse(editingName.value, group.parentId, editingId.value)) {
    toast.error('Name already in use')
    return
  }

  updateGroup(editingId.value, { name: editingName.value })
  editingId.value = null
  editingName.value = ''
}

function cancelEdit() {
  editingId.value = null
  editingName.value = ''
}

function handleAddGroup() {
  if (!newGroupName.value.trim()) return

  if (isNameInUse(newGroupName.value, null)) {
    toast.error('Group name already exists')
    return
  }

  addGroup({
    name: newGroupName.value.trim(),
    parentId: null,
    enabled: true,
  })
  newGroupName.value = ''
  toast.success('Group created')
}

function handleAddSubgroup(parentId: string, e?: Event) {
  e?.stopPropagation()
  newSubgroupParent.value = parentId
  expandedGroups.value.add(parentId)
}

function confirmAddSubgroup(parentId: string, name: string) {
  if (!name.trim()) {
    newSubgroupParent.value = null
    return
  }

  if (isNameInUse(name, parentId)) {
    toast.error('Subgroup name already exists in this group')
    return
  }

  addGroup({
    name: name.trim(),
    parentId,
    enabled: true,
  })
  newSubgroupParent.value = null
  toast.success('Subgroup created')
}

function confirmDelete(group: Group, e?: Event) {
  e?.stopPropagation()
  groupToDelete.value = group
  deleteDialogOpen.value = true
}

function handleDelete() {
  if (!groupToDelete.value) return

  if (selectedGroupId.value === groupToDelete.value.id) {
    selectedGroupId.value = null
  }

  deleteGroup(groupToDelete.value.id)
  toast.success('Group deleted')
  deleteDialogOpen.value = false
  groupToDelete.value = null
}

function handleToggle(id: string, e?: Event) {
  e?.stopPropagation()
  toggleGroup(id)
}

// drag handlers
function handleDragStart(e: DragEvent, type: ItemType, id: string) {
  dragItem.value = { type, id }
  if (e.dataTransfer) {
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', `${type}:${id}`)
  }
}

function handleDragEnd() {
  dragItem.value = null
  dragOverGroupId.value = null
}

function handleDragOver(e: DragEvent, groupId: string | null) {
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
  if (!dragItem.value) return

  const { type, id } = dragItem.value

  if (type === 'trigger') {
    const trigger = triggers.value.find(t => t.id === id)
    if (trigger && trigger.groupId !== groupId) {
      setTriggerGroup(id, groupId)
    }
  } else if (type === 'alias') {
    const alias = aliases.value.find(a => a.id === id)
    if (alias && alias.groupId !== groupId) {
      setAliasGroup(id, groupId)
    }
  } else if (type === 'timer') {
    const timer = timers.value.find(t => t.id === id)
    if (timer && timer.groupId !== groupId) {
      setTimerGroup(id, groupId)
    }
  }

  dragItem.value = null
  dragOverGroupId.value = null
}
</script>

<template>
  <Dialog :open="props.open" @update:open="emit('update:open', $event)">
    <DialogContent class="sm:!max-w-4xl h-[85vh] flex flex-col">
      <DialogHeader>
        <DialogTitle>Group Manager</DialogTitle>
        <DialogDescription>
          Drag items to groups on left. Toggle switch to enable/disable groups.
        </DialogDescription>
      </DialogHeader>

      <!-- Two-panel layout -->
      <div class="flex-1 flex gap-2 min-h-0 overflow-hidden">
        <!-- Left panel: Tree -->
        <div class="w-1/3 flex flex-col border rounded-md overflow-hidden">
          <!-- Add group input -->
          <div class="flex gap-1 p-2 border-b bg-muted/30">
            <Input
              v-model="newGroupName"
              placeholder="New group..."
              class="h-7 text-sm"
              @keyup.enter="handleAddGroup"
            />
            <Button size="sm" class="h-7 px-2" @click="handleAddGroup" :disabled="!newGroupName.trim()">
              <Plus class="h-3 w-3" />
            </Button>
          </div>

          <!-- Tree -->
          <div class="flex-1 overflow-y-auto py-1">
            <!-- Ungrouped -->
            <div
              class="flex items-center h-8 px-2 cursor-pointer select-none"
              :class="{
                'bg-accent': selectedGroupId === null,
                'bg-blue-500/20': dragOverGroupId === '__ungrouped__'
              }"
              @click="selectGroup(null)"
              @dragover="handleDragOver($event, null)"
              @dragleave="handleDragLeave"
              @drop="handleDrop(null)"
            >
              <span class="w-6"></span>
              <Folder class="h-4 w-4 mr-2 text-muted-foreground" />
              <span class="flex-1 text-sm">Ungrouped</span>
              <span class="text-xs text-muted-foreground pr-2">{{ getItemCount(null) }}</span>
            </div>

            <!-- Groups -->
            <template v-for="group in rootGroups" :key="group.id">
              <!-- Group row -->
              <div
                class="flex items-center h-8 px-2 cursor-pointer select-none"
                :class="{
                  'bg-accent': selectedGroupId === group.id,
                  'bg-blue-500/20': dragOverGroupId === group.id,
                  'text-muted-foreground': !group.enabled
                }"
                @click="selectGroup(group.id)"
                @dragover="handleDragOver($event, group.id)"
                @dragleave="handleDragLeave"
                @drop="handleDrop(group.id)"
              >
                <!-- Expand toggle -->
                <button
                  v-if="getChildGroups(group.id).length > 0"
                  class="w-6 flex items-center justify-center hover:bg-muted rounded"
                  @click="toggleExpand(group.id, $event)"
                >
                  <component :is="expandedGroups.has(group.id) ? ChevronDown : ChevronRight" class="h-4 w-4" />
                </button>
                <span v-else class="w-6"></span>

                <!-- Folder icon -->
                <component
                  :is="expandedGroups.has(group.id) ? FolderOpen : Folder"
                  class="h-4 w-4 mr-2 text-muted-foreground"
                />

                <!-- Name -->
                <template v-if="editingId === group.id">
                  <Input
                    v-model="editingName"
                    class="h-6 flex-1 text-sm"
                    @click.stop
                    @keyup.enter="saveEdit"
                    @keyup.escape="cancelEdit"
                    @blur="saveEdit"
                    autofocus
                  />
                </template>
                <span
                  v-else
                  class="flex-1 text-sm truncate"
                  @dblclick.stop="startEdit(group)"
                >
                  {{ group.name }}
                </span>

                <span class="text-xs text-muted-foreground">{{ getTotalItemCount(group.id) }}</span>

                <!-- Actions -->
                <Switch
                  :model-value="group.enabled"
                  class="scale-75 mx-1"
                  @click.stop
                  @update:model-value="handleToggle(group.id)"
                />
                <button
                  class="p-1 hover:bg-muted rounded"
                  title="Add subgroup"
                  @click="handleAddSubgroup(group.id, $event)"
                >
                  <FolderPlus class="h-3 w-3" />
                </button>
                <button
                  class="p-1 hover:bg-muted rounded text-destructive"
                  @click="confirmDelete(group, $event)"
                >
                  <Trash2 class="h-3 w-3" />
                </button>
              </div>

              <!-- Subgroups -->
              <template v-if="expandedGroups.has(group.id)">
                <template v-for="sub in getChildGroups(group.id)" :key="sub.id">
                  <div
                    class="flex items-center h-8 px-2 pl-8 cursor-pointer select-none"
                    :class="{
                      'bg-accent': selectedGroupId === sub.id,
                      'bg-blue-500/20': dragOverGroupId === sub.id,
                      'text-muted-foreground': !group.enabled || !sub.enabled
                    }"
                    @click="selectGroup(sub.id)"
                    @dragover="handleDragOver($event, sub.id)"
                    @dragleave="handleDragLeave"
                    @drop="handleDrop(sub.id)"
                  >
                    <span class="w-6"></span>
                    <Folder class="h-4 w-4 mr-2 text-muted-foreground" />

                    <template v-if="editingId === sub.id">
                      <Input
                        v-model="editingName"
                        class="h-6 flex-1 text-sm"
                        @click.stop
                        @keyup.enter="saveEdit"
                        @keyup.escape="cancelEdit"
                        @blur="saveEdit"
                        autofocus
                      />
                    </template>
                    <span
                      v-else
                      class="flex-1 text-sm truncate"
                      @dblclick.stop="startEdit(sub)"
                    >
                      {{ sub.name }}
                    </span>

                    <span class="text-xs text-muted-foreground">{{ getItemCount(sub.id) }}</span>

                    <Switch
                      :model-value="sub.enabled"
                      :disabled="!group.enabled"
                      class="scale-75 mx-1"
                      @click.stop
                      @update:model-value="handleToggle(sub.id)"
                    />
                    <span class="w-7"></span>
                    <button
                      class="p-1 hover:bg-muted rounded text-destructive"
                      @click="confirmDelete(sub, $event)"
                    >
                      <Trash2 class="h-3 w-3" />
                    </button>
                  </div>
                </template>

                <!-- New subgroup input -->
                <div v-if="newSubgroupParent === group.id" class="flex items-center h-8 px-2 pl-8">
                  <span class="w-6"></span>
                  <Input
                    placeholder="Subgroup name..."
                    class="h-6 flex-1 text-sm"
                    @keyup.enter="(e: KeyboardEvent) => confirmAddSubgroup(group.id, (e.target as HTMLInputElement).value)"
                    @keyup.escape="newSubgroupParent = null"
                    @blur="(e: FocusEvent) => confirmAddSubgroup(group.id, (e.target as HTMLInputElement).value)"
                    autofocus
                  />
                </div>
              </template>
            </template>
          </div>
        </div>

        <!-- Right panel: Items -->
        <div class="flex-1 flex flex-col border rounded-md overflow-hidden">
          <!-- Header -->
          <div class="flex items-center gap-2 px-3 py-2 border-b bg-muted/30">
            <span class="font-medium text-sm">
              {{ selectedGroup?.name || 'Ungrouped' }}
            </span>
            <span class="text-xs text-muted-foreground">
              ({{ selectedTriggers.length + selectedAliases.length + selectedTimers.length }} items)
            </span>
          </div>

          <!-- Items list -->
          <div class="flex-1 overflow-y-auto p-2 space-y-1">
            <!-- Triggers -->
            <div
              v-for="trigger in selectedTriggers"
              :key="trigger.id"
              class="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-muted/50 cursor-grab border"
              draggable="true"
              @dragstart="handleDragStart($event, 'trigger', trigger.id)"
              @dragend="handleDragEnd"
            >
              <Zap class="h-4 w-4 text-yellow-500 shrink-0" />
              <div class="flex-1 min-w-0">
                <div class="truncate text-sm font-medium">{{ trigger.name }}</div>
                <div class="truncate text-xs text-muted-foreground">{{ trigger.patterns[0]?.value }}</div>
              </div>
              <span class="text-xs px-1.5 py-0.5 rounded bg-muted shrink-0">
                {{ trigger.scope === 'global' ? 'Global' : trigger.characterName }}
              </span>
            </div>

            <!-- Aliases -->
            <div
              v-for="alias in selectedAliases"
              :key="alias.id"
              class="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-muted/50 cursor-grab border"
              draggable="true"
              @dragstart="handleDragStart($event, 'alias', alias.id)"
              @dragend="handleDragEnd"
            >
              <Terminal class="h-4 w-4 text-green-500 shrink-0" />
              <div class="flex-1 min-w-0">
                <div class="truncate text-sm font-medium">{{ alias.trigger }}</div>
                <div class="truncate text-xs text-muted-foreground">→ {{ alias.expansion }}</div>
              </div>
              <span class="text-xs px-1.5 py-0.5 rounded bg-muted shrink-0">
                {{ alias.scope === 'global' ? 'Global' : alias.characterName }}
              </span>
            </div>

            <!-- Timers -->
            <div
              v-for="timer in selectedTimers"
              :key="timer.id"
              class="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-muted/50 cursor-grab border"
              draggable="true"
              @dragstart="handleDragStart($event, 'timer', timer.id)"
              @dragend="handleDragEnd"
            >
              <Clock class="h-4 w-4 text-blue-500 shrink-0" />
              <div class="flex-1 min-w-0">
                <div class="truncate text-sm font-medium">{{ timer.name }}</div>
                <div class="truncate text-xs text-muted-foreground">{{ formatInterval(timer.intervalMs) }}{{ timer.isOneShot ? ' (one-shot)' : '' }}</div>
              </div>
              <span class="text-xs px-1.5 py-0.5 rounded bg-muted shrink-0">
                {{ timer.scope === 'global' ? 'Global' : timer.characterName }}
              </span>
            </div>

            <!-- Empty state -->
            <div
              v-if="selectedTriggers.length === 0 && selectedAliases.length === 0 && selectedTimers.length === 0"
              class="text-center text-muted-foreground text-sm py-8"
            >
              No items in this group
            </div>
          </div>

          <!-- Legend -->
          <div class="flex items-center gap-4 px-3 py-1.5 border-t text-xs text-muted-foreground bg-muted/30">
            <span class="flex items-center gap-1"><Zap class="h-3 w-3 text-yellow-500" /> Trigger</span>
            <span class="flex items-center gap-1"><Terminal class="h-3 w-3 text-green-500" /> Alias</span>
            <span class="flex items-center gap-1"><Clock class="h-3 w-3 text-blue-500" /> Timer</span>
          </div>
        </div>
      </div>
    </DialogContent>
  </Dialog>

  <!-- Delete confirmation -->
  <AlertDialog v-model:open="deleteDialogOpen">
    <AlertDialogContent>
      <AlertDialogHeader>
        <AlertDialogTitle>Delete Group</AlertDialogTitle>
        <AlertDialogDescription>
          Are you sure you want to delete "{{ groupToDelete?.name }}"?
          Items in this group will become ungrouped. Subgroups will also be deleted.
        </AlertDialogDescription>
      </AlertDialogHeader>
      <AlertDialogFooter>
        <AlertDialogCancel>Cancel</AlertDialogCancel>
        <AlertDialogAction @click="handleDelete">Delete</AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
</template>
