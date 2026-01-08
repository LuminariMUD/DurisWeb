<script setup lang="ts">
import { computed } from 'vue'
import type { Trigger } from '@/types/trigger'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { Badge } from '@/components/ui/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { MoreHorizontal, Pencil, Trash2, Copy } from 'lucide-vue-next'

const props = defineProps<{
  triggers: Trigger[]
}>()

const emit = defineEmits<{
  edit: [trigger: Trigger]
  delete: [trigger: Trigger]
  toggle: [id: string, enabled: boolean]
  duplicate: [trigger: Trigger]
}>()

// Sort triggers: enabled first, then by priority (descending), then by name
const sortedTriggers = computed(() => {
  return [...props.triggers].sort((a, b) => {
    // Enabled triggers first
    if (a.enabled !== b.enabled) {
      return a.enabled ? -1 : 1
    }
    // Then by priority (higher first)
    if (a.priority !== b.priority) {
      return b.priority - a.priority
    }
    // Then alphabetically by name
    return a.name.localeCompare(b.name)
  })
})

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
  <div class="rounded-md border">
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead class="w-[60px]">On</TableHead>
          <TableHead class="w-[140px]">Name</TableHead>
          <TableHead>Patterns</TableHead>
          <TableHead class="w-[80px]">Type</TableHead>
          <TableHead class="w-[100px]">Actions</TableHead>
          <TableHead class="w-[100px]">Scope</TableHead>
          <TableHead class="w-[50px]"></TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        <TableRow v-if="sortedTriggers.length === 0">
          <TableCell colspan="7" class="h-24 text-center text-muted-foreground">
            No triggers defined. Click "Add Trigger" to create one.
          </TableCell>
        </TableRow>
        <TableRow
          v-for="trigger in sortedTriggers"
          :key="`${trigger.id}-${trigger.enabled}`"
          :class="{ 'opacity-50': !trigger.enabled }"
        >
          <TableCell>
            <Switch
              :model-value="trigger.enabled"
              @update:model-value="(val: boolean) => emit('toggle', trigger.id, val)"
            />
          </TableCell>
          <TableCell class="font-medium">
            <div class="flex items-center gap-1">
              {{ truncate(trigger.name, 15) }}
              <Badge v-if="trigger.stopProcessing" variant="outline" class="text-[10px] px-1">
                stop
              </Badge>
            </div>
          </TableCell>
          <TableCell class="font-mono text-sm text-muted-foreground" :title="trigger.patterns.map(p => p.value).join('\n')">
            <span v-if="trigger.patterns.length === 1">
              <span v-if="trigger.patterns[0]?.isGmcp" class="text-cyan-400 mr-1">[GMCP]</span>
              {{ truncate(trigger.patterns[0]?.value ?? '', 30) }}
            </span>
            <span v-else-if="trigger.patterns.length > 1" class="flex items-center gap-1">
              <span v-if="trigger.patterns[0]?.isGmcp" class="text-cyan-400 mr-1">[GMCP]</span>
              {{ truncate(trigger.patterns[0]?.value ?? '', 20) }}
              <Badge variant="outline" class="text-[10px] px-1">
                +{{ trigger.patterns.length - 1 }}
              </Badge>
            </span>
            <span v-else class="text-muted-foreground italic">No pattern</span>
          </TableCell>
          <TableCell>
            <Badge :variant="trigger.patternType === 'regex' ? 'default' : 'secondary'">
              {{ trigger.patternType === 'regex' ? 'Regex' : 'Text' }}
            </Badge>
          </TableCell>
          <TableCell>
            <Badge variant="outline" :title="getActionSummary(trigger)">
              {{ trigger.actions.length }} action{{ trigger.actions.length !== 1 ? 's' : '' }}
            </Badge>
          </TableCell>
          <TableCell>
            <Badge v-if="trigger.scope === 'global'" variant="secondary">Global</Badge>
            <Badge v-else variant="outline" :title="trigger.characterName ?? undefined">
              {{ truncate(trigger.characterName || '', 10) }}
            </Badge>
          </TableCell>
          <TableCell>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" class="h-8 w-8">
                  <MoreHorizontal class="h-4 w-4" />
                  <span class="sr-only">Open menu</span>
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
          </TableCell>
        </TableRow>
      </TableBody>
    </Table>
  </div>
</template>
