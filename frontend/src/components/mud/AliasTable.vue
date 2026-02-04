<script setup lang="ts">
import { computed } from 'vue'
import type { Alias } from '@/types/alias'
import { useGroups } from '@/composables/useGroups'
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
  aliases: Alias[]
}>()

const emit = defineEmits<{
  edit: [alias: Alias]
  delete: [alias: Alias]
  toggle: [id: string, enabled: boolean]
  duplicate: [alias: Alias]
}>()

const { getGroupPath } = useGroups()

// Sort aliases: enabled first, then by trigger alphabetically
const sortedAliases = computed(() => {
  return [...props.aliases].sort((a, b) => {
    // Enabled aliases first
    if (a.enabled !== b.enabled) {
      return a.enabled ? -1 : 1
    }
    // Then alphabetically by trigger
    return a.trigger.localeCompare(b.trigger)
  })
})

function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text
  return text.substring(0, maxLength) + '...'
}
</script>

<template>
  <div class="rounded-md border">
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead class="w-[60px]">On</TableHead>
          <TableHead class="w-[120px]">Trigger</TableHead>
          <TableHead>Expansion</TableHead>
          <TableHead class="w-[100px]">Scope</TableHead>
          <TableHead class="w-[120px]">Group</TableHead>
          <TableHead class="w-[50px]"></TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        <TableRow v-if="sortedAliases.length === 0">
          <TableCell colspan="6" class="h-24 text-center text-muted-foreground">
            No aliases defined. Click "Add Alias" to create one.
          </TableCell>
        </TableRow>
        <TableRow
          v-for="alias in sortedAliases"
          :key="`${alias.id}-${alias.enabled}`"
          :class="{ 'opacity-50': !alias.enabled }"
        >
          <TableCell>
            <Switch :model-value="alias.enabled" @update:model-value="(val: boolean) => emit('toggle', alias.id, val)" />
          </TableCell>
          <TableCell class="font-mono font-medium">
            {{ alias.trigger }}
          </TableCell>
          <TableCell class="font-mono text-sm text-muted-foreground" :title="alias.expansion">
            {{ truncate(alias.expansion, 50) }}
          </TableCell>
          <TableCell>
            <Badge v-if="alias.scope === 'global'" variant="secondary">Global</Badge>
            <Badge v-else variant="outline" :title="alias.characterName ?? undefined">
              {{ truncate(alias.characterName || '', 10) }}
            </Badge>
          </TableCell>
          <TableCell>
            <span class="text-xs text-muted-foreground">
              {{ alias.groupId ? getGroupPath(alias.groupId) : '—' }}
            </span>
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
          </TableCell>
        </TableRow>
      </TableBody>
    </Table>
  </div>
</template>
