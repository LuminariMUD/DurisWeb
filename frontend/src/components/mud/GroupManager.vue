<script setup lang="ts">
import { ref } from 'vue'
import { useGroups } from '@/composables/useGroups'
import { useTriggers } from '@/composables/useTriggers'
import { useAliases } from '@/composables/useAliases'
import { useTimers } from '@/composables/useTimers'
import type { Group } from '@/types/group'
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
import { Plus, Trash2, ChevronRight, ChevronDown, FolderPlus } from 'lucide-vue-next'
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

const { triggers } = useTriggers()
const { aliases } = useAliases()
const { timers } = useTimers()

// expanded state for groups
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

function toggleExpand(id: string) {
  if (expandedGroups.value.has(id)) {
    expandedGroups.value.delete(id)
  } else {
    expandedGroups.value.add(id)
  }
}

function getItemCount(groupId: string): number {
  const triggerCount = triggers.value.filter(t => t.groupId === groupId).length
  const aliasCount = aliases.value.filter(a => a.groupId === groupId).length
  const timerCount = timers.value.filter(t => t.groupId === groupId).length
  return triggerCount + aliasCount + timerCount
}

function getTotalItemCount(groupId: string): number {
  let count = getItemCount(groupId)
  const children = getChildGroups(groupId)
  for (const child of children) {
    count += getItemCount(child.id)
  }
  return count
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

function handleAddSubgroup(parentId: string) {
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

function confirmDelete(group: Group) {
  groupToDelete.value = group
  deleteDialogOpen.value = true
}

function handleDelete() {
  if (!groupToDelete.value) return

  deleteGroup(groupToDelete.value.id)
  toast.success('Group deleted')
  deleteDialogOpen.value = false
  groupToDelete.value = null
}

function handleToggle(id: string) {
  toggleGroup(id)
}
</script>

<template>
  <Dialog :open="props.open" @update:open="emit('update:open', $event)">
    <DialogContent class="sm:!max-w-lg max-h-[80vh] flex flex-col">
      <DialogHeader>
        <DialogTitle>Group Manager</DialogTitle>
        <DialogDescription>
          Organize triggers, aliases, and timers into groups. Toggle groups to enable/disable all items within.
        </DialogDescription>
      </DialogHeader>

      <!-- Add new group -->
      <div class="flex gap-2">
        <Input
          v-model="newGroupName"
          placeholder="New group name..."
          @keyup.enter="handleAddGroup"
        />
        <Button size="sm" @click="handleAddGroup" :disabled="!newGroupName.trim()">
          <Plus class="h-4 w-4 mr-1" />
          Add
        </Button>
      </div>

      <!-- Group tree -->
      <div class="flex-1 overflow-y-auto min-h-[200px] space-y-1">
        <template v-if="rootGroups.length === 0">
          <div class="text-center text-muted-foreground py-8">
            No groups yet. Create one above.
          </div>
        </template>

        <template v-for="group in rootGroups" :key="group.id">
          <!-- Root group -->
          <div class="border rounded-md">
            <div class="flex items-center gap-2 p-2 hover:bg-muted/50">
              <button
                class="p-1 hover:bg-muted rounded"
                @click="toggleExpand(group.id)"
              >
                <component
                  :is="expandedGroups.has(group.id) ? ChevronDown : ChevronRight"
                  class="h-4 w-4"
                />
              </button>

              <Switch
                :model-value="group.enabled"
                @update:model-value="handleToggle(group.id)"
              />

              <template v-if="editingId === group.id">
                <Input
                  v-model="editingName"
                  class="h-7 flex-1"
                  @keyup.enter="saveEdit"
                  @keyup.escape="cancelEdit"
                  @blur="saveEdit"
                  autofocus
                />
              </template>
              <template v-else>
                <span
                  class="flex-1 cursor-pointer"
                  @dblclick="startEdit(group)"
                >
                  {{ group.name }}
                </span>
              </template>

              <span class="text-xs text-muted-foreground">
                {{ getTotalItemCount(group.id) }} items
              </span>

              <Button
                variant="ghost"
                size="icon"
                class="h-7 w-7"
                @click="handleAddSubgroup(group.id)"
                title="Add subgroup"
              >
                <FolderPlus class="h-4 w-4" />
              </Button>

              <Button
                variant="ghost"
                size="icon"
                class="h-7 w-7 text-destructive hover:text-destructive"
                @click="confirmDelete(group)"
              >
                <Trash2 class="h-4 w-4" />
              </Button>
            </div>

            <!-- Subgroups -->
            <div v-if="expandedGroups.has(group.id)" class="border-t">
              <template v-for="sub in getChildGroups(group.id)" :key="sub.id">
                <div class="flex items-center gap-2 p-2 pl-8 hover:bg-muted/50">
                  <Switch
                    :model-value="sub.enabled"
                    @update:model-value="handleToggle(sub.id)"
                    :disabled="!group.enabled"
                  />

                  <template v-if="editingId === sub.id">
                    <Input
                      v-model="editingName"
                      class="h-7 flex-1"
                      @keyup.enter="saveEdit"
                      @keyup.escape="cancelEdit"
                      @blur="saveEdit"
                      autofocus
                    />
                  </template>
                  <template v-else>
                    <span
                      class="flex-1 cursor-pointer"
                      :class="{ 'text-muted-foreground': !group.enabled }"
                      @dblclick="startEdit(sub)"
                    >
                      {{ sub.name }}
                    </span>
                  </template>

                  <span class="text-xs text-muted-foreground">
                    {{ getItemCount(sub.id) }} items
                  </span>

                  <Button
                    variant="ghost"
                    size="icon"
                    class="h-7 w-7 text-destructive hover:text-destructive"
                    @click="confirmDelete(sub)"
                  >
                    <Trash2 class="h-4 w-4" />
                  </Button>
                </div>
              </template>

              <!-- New subgroup input -->
              <div v-if="newSubgroupParent === group.id" class="flex items-center gap-2 p-2 pl-8">
                <Input
                  placeholder="Subgroup name..."
                  class="h-7 flex-1"
                  @keyup.enter="(e) => confirmAddSubgroup(group.id, (e.target as HTMLInputElement).value)"
                  @keyup.escape="newSubgroupParent = null"
                  @blur="(e) => confirmAddSubgroup(group.id, (e.target as HTMLInputElement).value)"
                  autofocus
                />
              </div>

              <div
                v-if="getChildGroups(group.id).length === 0 && newSubgroupParent !== group.id"
                class="text-center text-muted-foreground text-sm py-2"
              >
                No subgroups
              </div>
            </div>
          </div>
        </template>
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
