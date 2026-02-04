<script setup lang="ts">
import { ref, computed } from 'vue'
import type { Trigger } from '@/types/trigger'
import { useGroups } from '@/composables/useGroups'
import { useTriggers } from '@/composables/useTriggers'
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
  triggers: Trigger[]
}>()

const emit = defineEmits<{
  edit: [trigger: Trigger]
  delete: [trigger: Trigger]
  toggle: [id: string, enabled: boolean]
  duplicate: [trigger: Trigger]
}>()

const {
  groups,
  rootGroups,
  getChildGroups,
  toggleGroup,
  isGroupEffectivelyEnabled,
} = useGroups()

const { setTriggerGroup } = useTriggers()

// expanded state for groups
const expandedGroups = ref<Set<string>>(new Set())

// drag state
const dragTrigger = ref<Trigger | null>(null)
const dragOverGroupId = ref<string | null | 'ungrouped'>(null)

// initialize all groups as expanded
function initExpanded() {
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

// get triggers for a specific group
function getTriggersForGroup(groupId: string | null): Trigger[] {
  return props.triggers
    .filter(t => t.groupId === groupId)
    .sort((a, b) => {
      if (a.enabled !== b.enabled) return a.enabled ? -1 : 1
      if (a.priority !== b.priority) return b.priority - a.priority
      return a.name.localeCompare(b.name)
    })
}

// ungrouped triggers
const ungroupedTriggers = computed(() => getTriggersForGroup(null))

// check if any group has triggers
const hasGroupedTriggers = computed(() => {
  return props.triggers.some(t => t.groupId !== null)
})

// drag handlers
function handleDragStart(e: DragEvent, trigger: Trigger) {
  dragTrigger.value = trigger
  if (e.dataTransfer) {
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', trigger.id)
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
  if (dragTrigger.value && dragTrigger.value.groupId !== groupId) {
    setTriggerGroup(dragTrigger.value.id, groupId)
  }
  dragTrigger.value = null
  dragOverGroupId.value = null
}

function handleDragEnd() {
  dragTrigger.value = null
  dragOverGroupId.value = null
}

// group actions
function enableAllInGroup(groupId: string) {
  const triggers = getTriggersForGroup(groupId)
  for (const t of triggers) {
    if (!t.enabled) emit('toggle', t.id, true)
  }
  // also enable triggers in subgroups
  for (const sub of getChildGroups(groupId)) {
    const subTriggers = getTriggersForGroup(sub.id)
    for (const t of subTriggers) {
      if (!t.enabled) emit('toggle', t.id, true)
    }
  }
}

function disableAllInGroup(groupId: string) {
  const triggers = getTriggersForGroup(groupId)
  for (const t of triggers) {
    if (t.enabled) emit('toggle', t.id, false)
  }
  // also disable triggers in subgroups
  for (const sub of getChildGroups(groupId)) {
    const subTriggers = getTriggersForGroup(sub.id)
    for (const t of subTriggers) {
      if (t.enabled) emit('toggle', t.id, false)
    }
  }
}

function getTriggerCountForGroup(groupId: string): number {
  let count = getTriggersForGroup(groupId).length
  for (const sub of getChildGroups(groupId)) {
    count += getTriggersForGroup(sub.id).length
  }
  return count
}

function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text
  return text.substring(0, maxLength) + '...'
}

function getActionSummary(trigger: Trigger): string {
  const types = trigger.actions.map((a) => a.type)
  const unique = [...new Set(types)]
  return unique.join(', ')
}
</script>

<template>
  <div class="space-y-1">
    <!-- Empty state -->
    <div v-if="triggers.length === 0" class="border rounded-md p-8 text-center text-muted-foreground">
      No triggers defined. Click "Add Trigger" to create one.
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
                  {{ getTriggerCountForGroup(group.id) }}
                </Badge>
              </div>

              <!-- Group content (triggers + subgroups) -->
              <div v-if="expandedGroups.has(group.id)" class="border-t">
                <!-- Triggers directly in this group -->
                <div
                  v-for="trigger in getTriggersForGroup(group.id)"
                  :key="trigger.id"
                  draggable="true"
                  class="flex items-center gap-2 p-2 pl-8 hover:bg-muted/50 border-b last:border-b-0 cursor-grab"
                  :class="{
                    'opacity-50': !trigger.enabled || !isGroupEffectivelyEnabled(trigger.groupId),
                    'opacity-30': dragTrigger?.id === trigger.id,
                  }"
                  @dragstart="(e: DragEvent) => handleDragStart(e, trigger)"
                  @dragend="handleDragEnd"
                >
                  <GripVertical class="h-4 w-4 text-muted-foreground/50 shrink-0" />
                  <Switch
                    :model-value="trigger.enabled"
                    @update:model-value="(val: boolean) => emit('toggle', trigger.id, val)"
                  />
                  <span class="font-medium w-32 truncate" :title="trigger.name">
                    {{ truncate(trigger.name, 15) }}
                    <Badge v-if="trigger.stopProcessing" variant="outline" class="text-[10px] px-1 ml-1">
                      stop
                    </Badge>
                  </span>
                  <span class="font-mono text-sm text-muted-foreground flex-1 truncate" :title="trigger.patterns.map(p => p.value).join('\n')">
                    <span v-if="trigger.patterns[0]?.isGmcp" class="text-cyan-400 mr-1">[GMCP]</span>
                    {{ truncate(trigger.patterns[0]?.value ?? '', 30) }}
                    <Badge v-if="trigger.patterns.length > 1" variant="outline" class="text-[10px] px-1 ml-1">
                      +{{ trigger.patterns.length - 1 }}
                    </Badge>
                  </span>
                  <Badge :variant="trigger.patternType === 'regex' ? 'default' : 'secondary'" class="shrink-0">
                    {{ trigger.patternType === 'regex' ? 'Regex' : 'Text' }}
                  </Badge>
                  <Badge variant="outline" class="shrink-0" :title="getActionSummary(trigger)">
                    {{ trigger.actions.length }}
                  </Badge>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" class="h-7 w-7 shrink-0">
                        <MoreHorizontal class="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem @click="emit('edit', trigger)">
                        <Pencil class="mr-2 h-4 w-4" />
                        Edit
                      </DropdownMenuItem>
                      <DropdownMenuItem @click="emit('duplicate', trigger)">
                        <Copy class="mr-2 h-4 w-4" />
                        Duplicate
                      </DropdownMenuItem>
                      <DropdownMenuItem class="text-destructive" @click="emit('delete', trigger)">
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
                            {{ getTriggersForGroup(subgroup.id).length }}
                          </Badge>
                        </div>

                        <!-- Subgroup triggers -->
                        <div v-if="expandedGroups.has(subgroup.id)">
                          <div
                            v-for="trigger in getTriggersForGroup(subgroup.id)"
                            :key="trigger.id"
                            draggable="true"
                            class="flex items-center gap-2 p-2 pl-12 hover:bg-muted/50 border-t cursor-grab"
                            :class="{
                              'opacity-50': !trigger.enabled || !isGroupEffectivelyEnabled(trigger.groupId),
                              'opacity-30': dragTrigger?.id === trigger.id,
                            }"
                            @dragstart="(e: DragEvent) => handleDragStart(e, trigger)"
                            @dragend="handleDragEnd"
                          >
                            <GripVertical class="h-4 w-4 text-muted-foreground/50 shrink-0" />
                            <Switch
                              :model-value="trigger.enabled"
                              @update:model-value="(val: boolean) => emit('toggle', trigger.id, val)"
                            />
                            <span class="font-medium w-32 truncate" :title="trigger.name">
                              {{ truncate(trigger.name, 15) }}
                              <Badge v-if="trigger.stopProcessing" variant="outline" class="text-[10px] px-1 ml-1">
                                stop
                              </Badge>
                            </span>
                            <span class="font-mono text-sm text-muted-foreground flex-1 truncate">
                              <span v-if="trigger.patterns[0]?.isGmcp" class="text-cyan-400 mr-1">[GMCP]</span>
                              {{ truncate(trigger.patterns[0]?.value ?? '', 30) }}
                              <Badge v-if="trigger.patterns.length > 1" variant="outline" class="text-[10px] px-1 ml-1">
                                +{{ trigger.patterns.length - 1 }}
                              </Badge>
                            </span>
                            <Badge :variant="trigger.patternType === 'regex' ? 'default' : 'secondary'" class="shrink-0">
                              {{ trigger.patternType === 'regex' ? 'Regex' : 'Text' }}
                            </Badge>
                            <Badge variant="outline" class="shrink-0" :title="getActionSummary(trigger)">
                              {{ trigger.actions.length }}
                            </Badge>
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon" class="h-7 w-7 shrink-0">
                                  <MoreHorizontal class="h-4 w-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem @click="emit('edit', trigger)">
                                  <Pencil class="mr-2 h-4 w-4" />
                                  Edit
                                </DropdownMenuItem>
                                <DropdownMenuItem @click="emit('duplicate', trigger)">
                                  <Copy class="mr-2 h-4 w-4" />
                                  Duplicate
                                </DropdownMenuItem>
                                <DropdownMenuItem class="text-destructive" @click="emit('delete', trigger)">
                                  <Trash2 class="mr-2 h-4 w-4" />
                                  Delete
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </div>
                          <div v-if="getTriggersForGroup(subgroup.id).length === 0" class="p-2 pl-12 text-sm text-muted-foreground border-t">
                            No triggers in this subgroup
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
                <div v-if="getTriggersForGroup(group.id).length === 0 && getChildGroups(group.id).length === 0" class="p-2 pl-8 text-sm text-muted-foreground">
                  No triggers in this group
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
        v-if="ungroupedTriggers.length > 0 || (triggers.length > 0 && rootGroups.length > 0)"
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
            {{ ungroupedTriggers.length }}
          </Badge>
        </div>
        <div v-if="expandedGroups.has('__ungrouped__') || !hasGroupedTriggers" class="border-t">
          <div
            v-for="trigger in ungroupedTriggers"
            :key="trigger.id"
            draggable="true"
            class="flex items-center gap-2 p-2 pl-8 hover:bg-muted/50 border-b last:border-b-0 cursor-grab"
            :class="{
              'opacity-50': !trigger.enabled,
              'opacity-30': dragTrigger?.id === trigger.id,
            }"
            @dragstart="(e: DragEvent) => handleDragStart(e, trigger)"
            @dragend="handleDragEnd"
          >
            <GripVertical class="h-4 w-4 text-muted-foreground/50 shrink-0" />
            <Switch
              :model-value="trigger.enabled"
              @update:model-value="(val: boolean) => emit('toggle', trigger.id, val)"
            />
            <span class="font-medium w-32 truncate" :title="trigger.name">
              {{ truncate(trigger.name, 15) }}
              <Badge v-if="trigger.stopProcessing" variant="outline" class="text-[10px] px-1 ml-1">
                stop
              </Badge>
            </span>
            <span class="font-mono text-sm text-muted-foreground flex-1 truncate" :title="trigger.patterns.map(p => p.value).join('\n')">
              <span v-if="trigger.patterns[0]?.isGmcp" class="text-cyan-400 mr-1">[GMCP]</span>
              {{ truncate(trigger.patterns[0]?.value ?? '', 30) }}
              <Badge v-if="trigger.patterns.length > 1" variant="outline" class="text-[10px] px-1 ml-1">
                +{{ trigger.patterns.length - 1 }}
              </Badge>
            </span>
            <Badge :variant="trigger.patternType === 'regex' ? 'default' : 'secondary'" class="shrink-0">
              {{ trigger.patternType === 'regex' ? 'Regex' : 'Text' }}
            </Badge>
            <Badge variant="outline" class="shrink-0" :title="getActionSummary(trigger)">
              {{ trigger.actions.length }}
            </Badge>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" class="h-7 w-7 shrink-0">
                  <MoreHorizontal class="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem @click="emit('edit', trigger)">
                  <Pencil class="mr-2 h-4 w-4" />
                  Edit
                </DropdownMenuItem>
                <DropdownMenuItem @click="emit('duplicate', trigger)">
                  <Copy class="mr-2 h-4 w-4" />
                  Duplicate
                </DropdownMenuItem>
                <DropdownMenuItem class="text-destructive" @click="emit('delete', trigger)">
                  <Trash2 class="mr-2 h-4 w-4" />
                  Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
          <div v-if="ungroupedTriggers.length === 0" class="p-2 pl-8 text-sm text-muted-foreground">
            No ungrouped triggers
          </div>
        </div>
      </div>

      <!-- If no groups exist, show flat list -->
      <template v-if="rootGroups.length === 0">
        <div class="border rounded-md">
          <div
            v-for="trigger in ungroupedTriggers"
            :key="trigger.id"
            class="flex items-center gap-2 p-2 hover:bg-muted/50 border-b last:border-b-0"
            :class="{ 'opacity-50': !trigger.enabled }"
          >
            <Switch
              :model-value="trigger.enabled"
              @update:model-value="(val: boolean) => emit('toggle', trigger.id, val)"
            />
            <span class="font-medium w-32 truncate" :title="trigger.name">
              {{ truncate(trigger.name, 15) }}
              <Badge v-if="trigger.stopProcessing" variant="outline" class="text-[10px] px-1 ml-1">
                stop
              </Badge>
            </span>
            <span class="font-mono text-sm text-muted-foreground flex-1 truncate" :title="trigger.patterns.map(p => p.value).join('\n')">
              <span v-if="trigger.patterns[0]?.isGmcp" class="text-cyan-400 mr-1">[GMCP]</span>
              {{ truncate(trigger.patterns[0]?.value ?? '', 30) }}
              <Badge v-if="trigger.patterns.length > 1" variant="outline" class="text-[10px] px-1 ml-1">
                +{{ trigger.patterns.length - 1 }}
              </Badge>
            </span>
            <Badge :variant="trigger.patternType === 'regex' ? 'default' : 'secondary'" class="shrink-0">
              {{ trigger.patternType === 'regex' ? 'Regex' : 'Text' }}
            </Badge>
            <Badge variant="outline" class="shrink-0" :title="getActionSummary(trigger)">
              {{ trigger.actions.length }}
            </Badge>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" class="h-7 w-7 shrink-0">
                  <MoreHorizontal class="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem @click="emit('edit', trigger)">
                  <Pencil class="mr-2 h-4 w-4" />
                  Edit
                </DropdownMenuItem>
                <DropdownMenuItem @click="emit('duplicate', trigger)">
                  <Copy class="mr-2 h-4 w-4" />
                  Duplicate
                </DropdownMenuItem>
                <DropdownMenuItem class="text-destructive" @click="emit('delete', trigger)">
                  <Trash2 class="mr-2 h-4 w-4" />
                  Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </template>
    </template>
  </div>
</template>
