<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useQuery } from '@tanstack/vue-query'
import { builderApi } from '@/services/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Search, Home, User, Package, ChevronLeft, ChevronRight, Loader2 } from 'lucide-vue-next'
import { parseAnsiToHtml } from '@/utils/ansiParser'

const props = defineProps<{
  open: boolean
}>()

const emit = defineEmits<{
  (e: 'update:open', value: boolean): void
}>()

const router = useRouter()

// Search state
const searchQuery = ref('')
const searchType = ref<'all' | 'room' | 'mob' | 'object'>('all')
const page = ref(1)
const limit = 20

// Debounced query
const debouncedQuery = ref('')
let debounceTimer: ReturnType<typeof setTimeout> | null = null

watch(searchQuery, (newValue) => {
  if (debounceTimer) clearTimeout(debounceTimer)
  debounceTimer = setTimeout(() => {
    debouncedQuery.value = newValue
    page.value = 1 // Reset to first page on new search
  }, 300)
})

// Reset on type change
watch(searchType, () => {
  page.value = 1
})

// Query for search results
const {
  data: searchResults,
  isLoading,
  isError,
} = useQuery({
  queryKey: computed(() => [
    'builder-global-search',
    debouncedQuery.value,
    searchType.value,
    page.value,
  ]),
  queryFn: () => builderApi.globalSearch(debouncedQuery.value, searchType.value, page.value, limit),
  enabled: computed(() => debouncedQuery.value.length >= 2),
  staleTime: 60000, // 1 minute
})

// Navigate to result
function navigateToResult(result: { type: string; zoneId: string; vnum: number }) {
  emit('update:open', false)
  // Navigate to zone editor - the zone editor will need to handle selecting the specific item
  router.push({
    path: `/builder/zone/${result.zoneId}`,
    query: {
      select: result.type,
      vnum: result.vnum.toString(),
    },
  })
}

// Pagination
const canGoPrev = computed(() => page.value > 1)
const canGoNext = computed(() => searchResults.value && page.value < searchResults.value.totalPages)

function prevPage() {
  if (canGoPrev.value) page.value--
}

function nextPage() {
  if (canGoNext.value) page.value++
}

// Type icon mapping
function getTypeIcon(type: string) {
  switch (type) {
    case 'room':
      return Home
    case 'mob':
      return User
    case 'object':
      return Package
    default:
      return Home
  }
}

// Type badge color
function getTypeBadgeVariant(type: string): 'default' | 'secondary' | 'outline' {
  switch (type) {
    case 'room':
      return 'default'
    case 'mob':
      return 'secondary'
    case 'object':
      return 'outline'
    default:
      return 'default'
  }
}
</script>

<template>
  <Dialog :open="props.open" @update:open="emit('update:open', $event)">
    <DialogContent class="sm:max-w-[700px] max-h-[80vh] flex flex-col">
      <DialogHeader>
        <DialogTitle>Search All Zones</DialogTitle>
        <DialogDescription>
          Search for rooms, mobs, and objects across all zones by VNUM, name, or keywords
        </DialogDescription>
      </DialogHeader>

      <!-- Search Controls -->
      <div class="flex gap-2 mb-4">
        <div class="relative flex-1">
          <Search class="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            v-model="searchQuery"
            placeholder="Search by VNUM, name, or keywords..."
            class="pl-9"
            autofocus
          />
        </div>
        <Select v-model="searchType">
          <SelectTrigger class="w-32">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            <SelectItem value="room">Rooms</SelectItem>
            <SelectItem value="mob">Mobs</SelectItem>
            <SelectItem value="object">Objects</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <!-- Results -->
      <div class="flex-1 overflow-y-auto min-h-[300px]">
        <!-- Loading -->
        <div v-if="isLoading && debouncedQuery.length >= 2" class="flex items-center justify-center h-full">
          <Loader2 class="h-8 w-8 animate-spin text-muted-foreground" />
        </div>

        <!-- Error -->
        <div v-else-if="isError" class="flex items-center justify-center h-full text-destructive">
          Failed to search. Please try again.
        </div>

        <!-- No query -->
        <div v-else-if="debouncedQuery.length < 2" class="flex items-center justify-center h-full text-muted-foreground">
          Enter at least 2 characters to search
        </div>

        <!-- No results -->
        <div v-else-if="searchResults && searchResults.results.length === 0" class="flex items-center justify-center h-full text-muted-foreground">
          No results found for "{{ debouncedQuery }}"
        </div>

        <!-- Results list -->
        <div v-else-if="searchResults" class="space-y-2">
          <div
            v-for="result in searchResults.results"
            :key="`${result.type}-${result.zoneId}-${result.vnum}`"
            class="p-3 rounded-lg border hover:bg-accent cursor-pointer transition-colors"
            @click="navigateToResult(result)"
          >
            <div class="flex items-start justify-between gap-4">
              <div class="flex items-start gap-3 min-w-0">
                <component :is="getTypeIcon(result.type)" class="h-5 w-5 mt-0.5 shrink-0 text-muted-foreground" />
                <div class="min-w-0">
                  <div class="flex items-center gap-2 mb-1">
                    <Badge :variant="getTypeBadgeVariant(result.type)" class="text-xs">
                      {{ result.type }}
                    </Badge>
                    <span class="font-mono text-sm text-muted-foreground">#{{ result.vnum }}</span>
                    <span v-if="result.level !== undefined" class="text-xs text-muted-foreground">
                      Level {{ result.level }}
                    </span>
                  </div>
                  <div class="font-medium truncate" v-html="parseAnsiToHtml(result.name)" />
                  <div v-if="result.keywords" class="text-xs text-muted-foreground truncate">
                    Keywords: {{ result.keywords }}
                  </div>
                </div>
              </div>
              <div class="text-right shrink-0">
                <div class="text-xs text-muted-foreground truncate max-w-[150px]" v-html="parseAnsiToHtml(result.zoneName)" />
                <div class="text-xs text-muted-foreground font-mono">{{ result.zoneId }}</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Pagination -->
      <div v-if="searchResults && searchResults.total > 0" class="flex items-center justify-between pt-4 border-t">
        <div class="text-sm text-muted-foreground">
          Showing {{ (page - 1) * limit + 1 }}-{{ Math.min(page * limit, searchResults.total) }} of {{ searchResults.total }} results
        </div>
        <div class="flex items-center gap-2">
          <Button variant="outline" size="sm" :disabled="!canGoPrev" @click="prevPage">
            <ChevronLeft class="h-4 w-4" />
          </Button>
          <span class="text-sm">
            Page {{ page }} of {{ searchResults.totalPages }}
          </span>
          <Button variant="outline" size="sm" :disabled="!canGoNext" @click="nextPage">
            <ChevronRight class="h-4 w-4" />
          </Button>
        </div>
      </div>
    </DialogContent>
  </Dialog>
</template>
