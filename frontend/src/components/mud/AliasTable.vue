<script setup lang="ts">
import { ref, computed } from 'vue'
import type { Alias } from '@/types/alias'
import { useGroups } from '@/composables/useGroups'
import { useAliases } from '@/composables/useAliases'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { Badge } from '@/components/ui/badge'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from '@/components/ui/context-menu'
import {
  MoreHorizontal,
  Pencil,
  Trash2,
  Copy,
  ChevronRight,
  ChevronDown,
  GripVertical,
  ToggleLeft,
  ToggleRight,
  ChevronsUpDown,
} from 'lucide-vue-next'

const props = defineProps<{
  aliases: Alias[]
}>()

const emit = defineEmits<{
  edit: [alias: Alias]
  delete: [alias: Alias]
  toggle: [id: string, enabled: boolean]
  duplicate: [alias: Alias]
}>()

const { groups, rootGroups, getChildGroups, toggleGroup, isGroupEffectivelyEnabled } = useGroups()

const { setAliasGroup } = useAliases()

// expanded state for groups
const expandedGroups = ref<Set<string>>(new Set())

// drag state
const dragAlias = ref<Alias | null>(null)
const dragOverGroupId = ref<string | null | 'ungrouped'>(null)

// initialize all groups as expanded (including ungrouped)
function initExpanded() {
  expandedGroups.value.add('__ungrouped__')
  for (const g of groups.value) {
    expandedGroups.value.add(g.id)
  }
}
initExpanded()

function toggleExpand(id: string) {
  if (expandedGroups.value.has(id)) {
    expandedGroups.value.delete(id)
  } else {
    expandedGroups.value.add(id)
  }
}

function expandAll() {
  for (const g of groups.value) {
    expandedGroups.value.add(g.id)
  }
}

function collapseAll() {
  expandedGroups.value.clear()
}

// get aliases for a specific group
function getAliasesForGroup(groupId: string | null): Alias[] {
  return props.aliases
    .filter((a) => a.groupId === groupId)
    .sort((a, b) => {
      if (a.enabled !== b.enabled) return a.enabled ? -1 : 1
      return a.trigger.localeCompare(b.trigger)
    })
}

// ungrouped aliases
const ungroupedAliases = computed(() => getAliasesForGroup(null))

// drag handlers
function handleDragStart(e: DragEvent, alias: Alias) {
  dragAlias.value = alias
  if (e.dataTransfer) {
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', alias.id)
  }
}

function handleDragOver(e: DragEvent, groupId: string | null | 'ungrouped') {
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
  if (dragAlias.value && dragAlias.value.groupId !== groupId) {
    setAliasGroup(dragAlias.value.id, groupId)
  }
  dragAlias.value = null
  dragOverGroupId.value = null
}

function handleDragEnd() {
  dragAlias.value = null
  dragOverGroupId.value = null
}

// group actions
function enableAllInGroup(groupId: string) {
  const aliases = getAliasesForGroup(groupId)
  for (const a of aliases) {
    if (!a.enabled) emit('toggle', a.id, true)
  }
  for (const sub of getChildGroups(groupId)) {
    const subAliases = getAliasesForGroup(sub.id)
    for (const a of subAliases) {
      if (!a.enabled) emit('toggle', a.id, true)
    }
  }
}

function disableAllInGroup(groupId: string) {
  const aliases = getAliasesForGroup(groupId)
  for (const a of aliases) {
    if (a.enabled) emit('toggle', a.id, false)
  }
  for (const sub of getChildGroups(groupId)) {
    const subAliases = getAliasesForGroup(sub.id)
    for (const a of subAliases) {
      if (a.enabled) emit('toggle', a.id, false)
    }
  }
}

function getAliasCountForGroup(groupId: string): number {
  let count = getAliasesForGroup(groupId).length
  for (const sub of getChildGroups(groupId)) {
    count += getAliasesForGroup(sub.id).length
  }
  return count
}

function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text
  return text.substring(0, maxLength) + '...'
}
</script>

<template>
  <div class="space-y-1">
    <!-- Empty state -->
    <div v-if="aliases.length === 0" class="border rounded-md p-8 text-center text-muted-foreground">
      No aliases defined. Click "Add Alias" to create one.
    </div>

    <template v-else>
      <!-- Group tree -->
      <template v-for="group in rootGroups" :key="group.id">
        <!-- Root group header -->
        <ContextMenu>
          <ContextMenuTrigger>
            <div
              class="border rounded-md transition-colors"
              :class="{
                'ring-2 ring-primary': dragOverGroupId === group.id,
                'opacity-60': !group.enabled,
              }"
              @dragover="(e: DragEvent) => handleDragOver(e, group.id)"
              @dragleave="handleDragLeave"
              @drop="handleDrop(group.id)"
            >
              <!-- Group header -->
              <div
                class="flex items-center gap-2 p-2 bg-muted/30 cursor-pointer select-none"
                @click="toggleExpand(group.id)"
              >
                <component
                  :is="expandedGroups.has(group.id) ? ChevronDown : ChevronRight"
                  class="h-4 w-4 shrink-0"
                />
                <Switch
                  :model-value="group.enabled"
                  @update:model-value="toggleGroup(group.id)"
                  @click.stop
                />
                <span class="font-medium flex-1">{{ group.name }}</span>
                <Badge variant="outline" class="text-xs">
                  {{ getAliasCountForGroup(group.id) }}
                </Badge>
              </div>

              <!-- Group content -->
              <div v-if="expandedGroups.has(group.id)" class="border-t">
                <!-- Aliases directly in this group -->
                <div
                  v-for="alias in getAliasesForGroup(group.id)"
                  :key="alias.id"
                  draggable="true"
                  class="flex items-center gap-2 p-2 pl-8 hover:bg-muted/50 border-b last:border-b-0 cursor-grab"
                  :class="{
                    'opacity-50': !alias.enabled || !isGroupEffectivelyEnabled(alias.groupId),
                    'opacity-30': dragAlias?.id === alias.id,
                  }"
                  @dragstart="(e: DragEvent) => handleDragStart(e, alias)"
                  @dragend="handleDragEnd"
                >
                  <GripVertical class="h-4 w-4 text-muted-foreground/50 shrink-0" />
                  <Switch
                    :model-value="alias.enabled"
                    @update:model-value="(val: boolean) => emit('toggle', alias.id, val)"
                  />
                  <span class="font-mono font-medium w-24 truncate" :title="alias.trigger">
                    {{ truncate(alias.trigger, 12) }}
                  </span>
                  <span class="font-mono text-sm text-muted-foreground flex-1 truncate" :title="alias.expansion">
                    {{ truncate(alias.expansion, 40) }}
                  </span>
                  <Badge v-if="alias.scope === 'global'" variant="secondary" class="shrink-0">Global</Badge>
                  <Badge v-else variant="outline" class="shrink-0" :title="alias.characterName ?? undefined">
                    {{ truncate(alias.characterName || '', 8) }}
                  </Badge>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" class="h-7 w-7 shrink-0">
                        <MoreHorizontal class="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem @click="emit('edit', alias)">
                        <Pencil class="mr-2 h-4 w-4" />
                        Edit
                      </DropdownMenuItem>
                      <DropdownMenuItem @click="emit('duplicate', alias)">
                        <Copy class="mr-2 h-4 w-4" />
                        Duplicate
                      </DropdownMenuItem>
                      <DropdownMenuItem class="text-destructive" @click="emit('delete', alias)">
                        <Trash2 class="mr-2 h-4 w-4" />
                        Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>

                <!-- Subgroups -->
                <template v-for="subgroup in getChildGroups(group.id)" :key="subgroup.id">
                  <ContextMenu>
                    <ContextMenuTrigger>
                      <div
                        class="transition-colors"
                        :class="{
                          'ring-2 ring-primary ring-inset': dragOverGroupId === subgroup.id,
                          'opacity-60': !subgroup.enabled || !group.enabled,
                        }"
                        @dragover="(e: DragEvent) => handleDragOver(e, subgroup.id)"
                        @dragleave="handleDragLeave"
                        @drop="handleDrop(subgroup.id)"
                      >
                        <!-- Subgroup header -->
                        <div
                          class="flex items-center gap-2 p-2 pl-6 bg-muted/20 cursor-pointer select-none border-t"
                          @click="toggleExpand(subgroup.id)"
                        >
                          <component
                            :is="expandedGroups.has(subgroup.id) ? ChevronDown : ChevronRight"
                            class="h-4 w-4 shrink-0"
                          />
                          <Switch
                            :model-value="subgroup.enabled"
                            :disabled="!group.enabled"
                            @update:model-value="toggleGroup(subgroup.id)"
                            @click.stop
                          />
                          <span class="font-medium flex-1">{{ subgroup.name }}</span>
                          <Badge variant="outline" class="text-xs">
                            {{ getAliasesForGroup(subgroup.id).length }}
                          </Badge>
                        </div>

                        <!-- Subgroup aliases -->
                        <div v-if="expandedGroups.has(subgroup.id)">
                          <div
                            v-for="alias in getAliasesForGroup(subgroup.id)"
                            :key="alias.id"
                            draggable="true"
                            class="flex items-center gap-2 p-2 pl-12 hover:bg-muted/50 border-t cursor-grab"
                            :class="{
                              'opacity-50': !alias.enabled || !isGroupEffectivelyEnabled(alias.groupId),
                              'opacity-30': dragAlias?.id === alias.id,
                            }"
                            @dragstart="(e: DragEvent) => handleDragStart(e, alias)"
                            @dragend="handleDragEnd"
                          >
                            <GripVertical class="h-4 w-4 text-muted-foreground/50 shrink-0" />
                            <Switch
                              :model-value="alias.enabled"
                              @update:model-value="(val: boolean) => emit('toggle', alias.id, val)"
                            />
                            <span class="font-mono font-medium w-24 truncate" :title="alias.trigger">
                              {{ truncate(alias.trigger, 12) }}
                            </span>
                            <span class="font-mono text-sm text-muted-foreground flex-1 truncate" :title="alias.expansion">
                              {{ truncate(alias.expansion, 40) }}
                            </span>
                            <Badge v-if="alias.scope === 'global'" variant="secondary" class="shrink-0">Global</Badge>
                            <Badge v-else variant="outline" class="shrink-0" :title="alias.characterName ?? undefined">
                              {{ truncate(alias.characterName || '', 8) }}
                            </Badge>
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon" class="h-7 w-7 shrink-0">
                                  <MoreHorizontal class="h-4 w-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem @click="emit('edit', alias)">
                                  <Pencil class="mr-2 h-4 w-4" />
                                  Edit
                                </DropdownMenuItem>
                                <DropdownMenuItem @click="emit('duplicate', alias)">
                                  <Copy class="mr-2 h-4 w-4" />
                                  Duplicate
                                </DropdownMenuItem>
                                <DropdownMenuItem class="text-destructive" @click="emit('delete', alias)">
                                  <Trash2 class="mr-2 h-4 w-4" />
                                  Delete
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </div>
                          <div v-if="getAliasesForGroup(subgroup.id).length === 0" class="p-2 pl-12 text-sm text-muted-foreground border-t">
                            No aliases in this subgroup
                          </div>
                        </div>
                      </div>
                    </ContextMenuTrigger>
                    <ContextMenuContent>
                      <ContextMenuItem @click="enableAllInGroup(subgroup.id)">
                        <ToggleRight class="mr-2 h-4 w-4" />
                        Enable all
                      </ContextMenuItem>
                      <ContextMenuItem @click="disableAllInGroup(subgroup.id)">
                        <ToggleLeft class="mr-2 h-4 w-4" />
                        Disable all
                      </ContextMenuItem>
                    </ContextMenuContent>
                  </ContextMenu>
                </template>

                <!-- Empty group message -->
                <div v-if="getAliasesForGroup(group.id).length === 0 && getChildGroups(group.id).length === 0" class="p-2 pl-8 text-sm text-muted-foreground">
                  No aliases in this group
                </div>
              </div>
            </div>
          </ContextMenuTrigger>
          <ContextMenuContent>
            <ContextMenuItem @click="enableAllInGroup(group.id)">
              <ToggleRight class="mr-2 h-4 w-4" />
              Enable all
            </ContextMenuItem>
            <ContextMenuItem @click="disableAllInGroup(group.id)">
              <ToggleLeft class="mr-2 h-4 w-4" />
              Disable all
            </ContextMenuItem>
            <ContextMenuSeparator />
            <ContextMenuItem @click="expandAll">
              <ChevronsUpDown class="mr-2 h-4 w-4" />
              Expand all
            </ContextMenuItem>
            <ContextMenuItem @click="collapseAll">
              <ChevronsUpDown class="mr-2 h-4 w-4" />
              Collapse all
            </ContextMenuItem>
          </ContextMenuContent>
        </ContextMenu>
      </template>

      <!-- Ungrouped section -->
      <div
        v-if="ungroupedAliases.length > 0 || (aliases.length > 0 && rootGroups.length > 0)"
        class="border rounded-md transition-colors"
        :class="{ 'ring-2 ring-primary': dragOverGroupId === 'ungrouped' }"
        @dragover="(e: DragEvent) => handleDragOver(e, 'ungrouped')"
        @dragleave="handleDragLeave"
        @drop="handleDrop(null)"
      >
        <div
          class="flex items-center gap-2 p-2 bg-muted/30 cursor-pointer select-none"
          @click="toggleExpand('__ungrouped__')"
        >
          <component
            :is="expandedGroups.has('__ungrouped__') ? ChevronDown : ChevronRight"
            class="h-4 w-4 shrink-0"
          />
          <span class="font-medium flex-1 text-muted-foreground">Ungrouped</span>
          <Badge variant="outline" class="text-xs">
            {{ ungroupedAliases.length }}
          </Badge>
        </div>
        <div v-if="expandedGroups.has('__ungrouped__')" class="border-t">
          <div
            v-for="alias in ungroupedAliases"
            :key="alias.id"
            draggable="true"
            class="flex items-center gap-2 p-2 pl-8 hover:bg-muted/50 border-b last:border-b-0 cursor-grab"
            :class="{
              'opacity-50': !alias.enabled,
              'opacity-30': dragAlias?.id === alias.id,
            }"
            @dragstart="(e: DragEvent) => handleDragStart(e, alias)"
            @dragend="handleDragEnd"
          >
            <GripVertical class="h-4 w-4 text-muted-foreground/50 shrink-0" />
            <Switch
              :model-value="alias.enabled"
              @update:model-value="(val: boolean) => emit('toggle', alias.id, val)"
            />
            <span class="font-mono font-medium w-24 truncate" :title="alias.trigger">
              {{ truncate(alias.trigger, 12) }}
            </span>
            <span class="font-mono text-sm text-muted-foreground flex-1 truncate" :title="alias.expansion">
              {{ truncate(alias.expansion, 40) }}
            </span>
            <Badge v-if="alias.scope === 'global'" variant="secondary" class="shrink-0">Global</Badge>
            <Badge v-else variant="outline" class="shrink-0" :title="alias.characterName ?? undefined">
              {{ truncate(alias.characterName || '', 8) }}
            </Badge>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" class="h-7 w-7 shrink-0">
                  <MoreHorizontal class="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem @click="emit('edit', alias)">
                  <Pencil class="mr-2 h-4 w-4" />
                  Edit
                </DropdownMenuItem>
                <DropdownMenuItem @click="emit('duplicate', alias)">
                  <Copy class="mr-2 h-4 w-4" />
                  Duplicate
                </DropdownMenuItem>
                <DropdownMenuItem class="text-destructive" @click="emit('delete', alias)">
                  <Trash2 class="mr-2 h-4 w-4" />
                  Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
          <div v-if="ungroupedAliases.length === 0" class="p-2 pl-8 text-sm text-muted-foreground">
            No ungrouped aliases
          </div>
        </div>
      </div>
    </template>
  </div>
</template>
