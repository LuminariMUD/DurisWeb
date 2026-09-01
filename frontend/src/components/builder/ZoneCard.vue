<script setup lang="ts">
import { computed } from 'vue'
import { RouterLink } from 'vue-router'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Home,
  Users,
  Package,
  RefreshCw,
  Calendar,
  Edit,
  MoreVertical,
  Copy,
  Trash2,
} from 'lucide-vue-next'
import { parseAnsiToHtml } from '@/utils/ansiParser'
import type { ZoneIndex } from '@/types'

const props = defineProps<{
  zone: ZoneIndex
}>()

const emit = defineEmits<{
  (e: 'clone', zone: ZoneIndex): void
  (e: 'delete', zone: ZoneIndex): void
}>()

const zoneNameHtml = computed(() => {
  // Parse ANSI codes to HTML for colored display
  return parseAnsiToHtml(props.zone.name)
})

const lastModified = computed(() => {
  if (!props.zone.lastModified) return 'Unknown'
  const date = new Date(props.zone.lastModified)
  return (
    date.toLocaleDateString() +
    ' ' +
    date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  )
})
</script>

<template>
  <Card class="hover:border-primary/50 transition-colors h-full flex flex-col">
    <CardHeader class="pb-3">
      <div class="flex items-start justify-between">
        <div>
          <CardTitle class="text-lg">
            <span v-html="zoneNameHtml"></span>
          </CardTitle>
        </div>
        <Badge variant="outline" class="text-xs">
          Zone {{ zone.number }}
        </Badge>
      </div>
    </CardHeader>
    <CardContent class="space-y-4 flex-1 flex flex-col">
      <!-- Stats Grid -->
      <div class="grid grid-cols-2 gap-3 text-sm">
        <div class="flex items-center gap-2 text-muted-foreground">
          <Home class="h-4 w-4" />
          <span>{{ zone.roomCount }} Rooms</span>
        </div>
        <div class="flex items-center gap-2 text-muted-foreground">
          <Users class="h-4 w-4" />
          <span>{{ zone.mobCount }} Mobs</span>
        </div>
        <div class="flex items-center gap-2 text-muted-foreground">
          <Package class="h-4 w-4" />
          <span>{{ zone.objCount }} Objects</span>
        </div>
        <div class="flex items-center gap-2 text-muted-foreground">
          <RefreshCw class="h-4 w-4" />
          <span>{{ zone.resetCount }} Resets</span>
        </div>
      </div>

      <!-- Last Modified -->
      <div class="flex items-center gap-2 text-xs text-muted-foreground border-t pt-3">
        <Calendar class="h-3 w-3" />
        <span>Modified: {{ lastModified }}</span>
      </div>

      <!-- Actions -->
      <div class="flex gap-2 mt-auto">
        <Button variant="default" size="sm" class="flex-1" asChild>
          <RouterLink :to="`/builder/zone/${zone.id}`">
            <Edit class="h-4 w-4 mr-2" />
            Edit Zone
          </RouterLink>
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm">
              <MoreVertical class="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem @click="emit('clone', zone)">
              <Copy class="h-4 w-4 mr-2" />
              Clone Zone
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              class="text-destructive focus:text-destructive"
              @click="emit('delete', zone)"
            >
              <Trash2 class="h-4 w-4 mr-2" />
              Delete Zone
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </CardContent>
  </Card>
</template>
