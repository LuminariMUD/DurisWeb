<script setup lang="ts">
import { inject, ref } from 'vue'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from '@/components/ui/command'
import { Badge } from '@/components/ui/badge'
import {
  Users,
  Navigation,
  Package,
  MessageSquare,
  Info,
  Map,
  AlertTriangle,
  Clock,
  ChevronRight,
} from 'lucide-vue-next'
import type { UseGodCommandsReturn } from './god-commands/useGodCommands'
import type { GodCommand, GodCommandCategory, RecentGodCommand } from './god-commands/types'

const emit = defineEmits<{
  (e: 'select', command: GodCommand): void
  (e: 'executeRecent', recent: RecentGodCommand): void
}>()

const godCommands = inject<UseGodCommandsReturn>('godCommands')!

// Category icons mapping
const categoryIcons: Record<GodCommandCategory, typeof Users> = {
  player: Users,
  teleportation: Navigation,
  loading: Package,
  communication: MessageSquare,
  information: Info,
  zone: Map,
  dangerous: AlertTriangle,
}

// Expanded categories
const expandedCategories = ref<Set<GodCommandCategory>>(new Set())

function toggleCategory(category: GodCommandCategory) {
  if (expandedCategories.value.has(category)) {
    expandedCategories.value.delete(category)
  } else {
    expandedCategories.value.add(category)
  }
  // Force reactivity
  expandedCategories.value = new Set(expandedCategories.value)
}

function handleSelectCommand(command: GodCommand) {
  emit('select', command)
}

function handleSelectRecent(recent: RecentGodCommand) {
  emit('executeRecent', recent)
}

function formatTime(timestamp: number): string {
  const now = Date.now()
  const diff = now - timestamp
  const minutes = Math.floor(diff / 60000)
  const hours = Math.floor(diff / 3600000)
  const days = Math.floor(diff / 86400000)

  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes}m ago`
  if (hours < 24) return `${hours}h ago`
  return `${days}d ago`
}

function getLevelBadgeVariant(level: number): 'default' | 'secondary' | 'destructive' | 'outline' {
  if (level >= 61) return 'destructive'
  if (level >= 60) return 'default'
  return 'secondary'
}
</script>

<template>
  <Command class="rounded-none border-0" v-model:search-term="godCommands.searchQuery.value">
    <CommandInput placeholder="Search god commands..." class="border-0" />

    <CommandList class="max-h-[60vh]">
      <CommandEmpty>No commands found.</CommandEmpty>

      <!-- Search Results -->
      <template v-if="godCommands.searchResults.value">
        <CommandGroup heading="Search Results">
          <CommandItem
            v-for="cmd in godCommands.searchResults.value"
            :key="cmd.name"
            :value="cmd.name"
            class="flex items-center justify-between cursor-pointer"
            @select="handleSelectCommand(cmd)"
          >
            <div class="flex items-center gap-2">
              <component :is="categoryIcons[cmd.category]" class="h-4 w-4 text-muted-foreground" />
              <span class="font-medium">{{ cmd.name }}</span>
              <span class="text-muted-foreground text-sm">{{ cmd.description }}</span>
            </div>
            <Badge :variant="getLevelBadgeVariant(cmd.level)" class="text-xs">
              L{{ cmd.level }}
            </Badge>
          </CommandItem>
        </CommandGroup>
      </template>

      <!-- Recent Commands & Categories (when not searching) -->
      <template v-else>
        <!-- Recent Commands -->
        <CommandGroup v-if="godCommands.recentCommands.value.length > 0" heading="Recent">
          <CommandItem
            v-for="recent in godCommands.recentCommands.value.slice(0, 5)"
            :key="recent.timestamp"
            :value="`recent-${recent.timestamp}`"
            class="flex items-center justify-between cursor-pointer"
            @select="handleSelectRecent(recent)"
          >
            <div class="flex items-center gap-2">
              <Clock class="h-4 w-4 text-muted-foreground" />
              <code class="text-sm font-mono">{{ recent.command }}</code>
            </div>
            <span class="text-xs text-muted-foreground">{{ formatTime(recent.timestamp) }}</span>
          </CommandItem>
        </CommandGroup>

        <CommandSeparator v-if="godCommands.recentCommands.value.length > 0" />

        <!-- Categories -->
        <template v-for="category in godCommands.categoriesWithCounts.value" :key="category.id">
          <!-- Category Header -->
          <CommandGroup>
            <CommandItem
              :value="`category-${category.id}`"
              class="flex items-center justify-between cursor-pointer font-medium"
              @select="toggleCategory(category.id)"
            >
              <div class="flex items-center gap-2">
                <component :is="categoryIcons[category.id]" class="h-4 w-4" />
                <span>{{ category.label }}</span>
                <Badge variant="outline" class="text-xs">{{ category.count }}</Badge>
              </div>
              <ChevronRight
                class="h-4 w-4 transition-transform"
                :class="{ 'rotate-90': expandedCategories.has(category.id) }"
              />
            </CommandItem>

            <!-- Category Commands (when expanded) -->
            <template v-if="expandedCategories.has(category.id)">
              <CommandItem
                v-for="cmd in category.commands"
                :key="cmd.name"
                :value="cmd.name"
                class="flex items-center justify-between cursor-pointer pl-8"
                @select="handleSelectCommand(cmd)"
              >
                <div class="flex flex-col">
                  <span class="font-medium">{{ cmd.name }}</span>
                  <span class="text-muted-foreground text-xs">{{ cmd.description }}</span>
                </div>
                <div class="flex items-center gap-2">
                  <AlertTriangle
                    v-if="cmd.dangerous"
                    class="h-3 w-3 text-destructive"
                  />
                  <Badge :variant="getLevelBadgeVariant(cmd.level)" class="text-xs">
                    L{{ cmd.level }}
                  </Badge>
                </div>
              </CommandItem>
            </template>
          </CommandGroup>
        </template>
      </template>
    </CommandList>
  </Command>
</template>
