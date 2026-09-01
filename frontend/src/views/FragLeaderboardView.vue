<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useHead } from '@unhead/vue'
import FragLeaderboardTable from '@/components/frag/FragLeaderboardTable.vue'
import FragFilters from '@/components/frag/FragFilters.vue'
import TopGainersCard from '@/components/frag/TopGainersCard.vue'
import { useFragLeaderboard } from '@/composables/useFragLeaderboard'
import { useWebSocket } from '@/composables/useWebSocket'
import { useQueryClient } from '@tanstack/vue-query'
import { Button } from '@/components/ui/button'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import {
  Trophy,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Filter,
  ChevronDown,
} from 'lucide-vue-next'
import type { FragLeaderboardFilters } from '@/types'

const showFilters = ref(false)

// Set page title using useHead (this will automatically clean up on unmount)
useHead({
  title: 'DurisMUD | Frag Leaderboard',
})

const filters = ref<FragLeaderboardFilters>({
  page: 1,
  limit: 10,
})

const { data, isLoading, error } = useFragLeaderboard(filters)
const queryClient = useQueryClient()
const { onFragUpdate } = useWebSocket()

// Handle real-time frag updates
onMounted(() => {
  onFragUpdate(() => {
    // Invalidate frag leaderboard queries to trigger refetch
    queryClient.invalidateQueries({ queryKey: ['frag-leaderboard'] })
    queryClient.invalidateQueries({ queryKey: ['frag-top-gainers'] })
    console.log('🏆 Frag leaderboard updated via WebSocket')
  })
})

function goToPage(page: number) {
  filters.value = {
    ...filters.value,
    page,
  }
  window.scrollTo({ top: 0, behavior: 'smooth' })
}

function getVisiblePages(currentPage: number, totalPages: number) {
  const delta = 2
  const range: (number | string)[] = []
  const rangeWithDots: (number | string)[] = []

  for (
    let i = Math.max(2, currentPage - delta);
    i <= Math.min(totalPages - 1, currentPage + delta);
    i++
  ) {
    range.push(i)
  }

  if (currentPage - delta > 2) {
    rangeWithDots.push(1, '...')
  } else {
    rangeWithDots.push(1)
  }

  rangeWithDots.push(...range)

  if (currentPage + delta < totalPages - 1) {
    rangeWithDots.push('...', totalPages)
  } else if (totalPages > 1) {
    rangeWithDots.push(totalPages)
  }

  return rangeWithDots
}
</script>

<template>
  <div class="space-y-4 lg:space-y-6">
    <!-- Header -->
    <div class="flex items-center gap-3">
      <Trophy class="w-7 h-7 lg:w-8 lg:h-8 text-yellow-500 flex-shrink-0" />
      <div>
        <h1 class="text-2xl lg:text-3xl font-bold">Frag Leaderboard</h1>
        <p class="text-sm text-muted-foreground">
          Top players ranked by total frags
        </p>
      </div>
    </div>

    <!-- Top Gainers Card -->
    <TopGainersCard />

    <!-- Mobile Filters (Collapsible) -->
    <div class="lg:hidden">
      <Collapsible v-model:open="showFilters">
        <CollapsibleTrigger asChild>
          <Button variant="outline" class="w-full justify-between">
            <span class="flex items-center gap-2">
              <Filter class="w-4 h-4" />
              Filters
            </span>
            <ChevronDown class="w-4 h-4 transition-transform" :class="{ 'rotate-180': showFilters }" />
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent class="mt-4">
          <FragFilters v-model="filters" />
        </CollapsibleContent>
      </Collapsible>
    </div>

    <!-- Main Content Grid -->
    <div class="grid grid-cols-1 lg:grid-cols-4 gap-6">
      <!-- Filters Sidebar (Desktop only) -->
      <aside class="hidden lg:block lg:col-span-1">
        <div class="sticky top-4">
          <FragFilters v-model="filters" />
        </div>
      </aside>

      <!-- Leaderboard Table -->
      <main class="lg:col-span-3 space-y-4">
        <!-- Results Summary -->
        <div
          v-if="data?.pagination && !isLoading"
          class="text-xs lg:text-sm text-muted-foreground"
        >
          <span class="hidden sm:inline">Showing {{ (data.pagination.page - 1) * data.pagination.limit + 1 }}
            to
            {{
              Math.min(
                data.pagination.page * data.pagination.limit,
                data.pagination.total
              )
            }}
            of {{ data.pagination.total }} entries</span>
          <span class="sm:hidden">{{ data.pagination.total }} entries</span>
        </div>

        <!-- Table -->
        <FragLeaderboardTable
          :entries="data?.data || []"
          :is-loading="isLoading"
        />

        <!-- Error State -->
        <div
          v-if="error"
          class="text-center py-12 text-red-500"
        >
          Failed to load leaderboard. Please try again.
        </div>

        <!-- Pagination -->
        <div v-if="data?.pagination && data.pagination.totalPages > 1" class="flex justify-center items-center gap-1 lg:gap-2 mt-4 lg:mt-6">
          <Button
            variant="outline"
            size="sm"
            class="h-8 w-8 p-0"
            @click="goToPage(1)"
            :disabled="data.pagination.page === 1"
          >
            <ChevronsLeft class="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            size="sm"
            class="h-8 w-8 p-0"
            @click="goToPage(Math.max(1, data.pagination.page - 1))"
            :disabled="data.pagination.page === 1"
          >
            <ChevronLeft class="h-4 w-4" />
          </Button>

          <template
            v-for="(page, index) in getVisiblePages(
              data.pagination.page,
              data.pagination.totalPages
            )"
            :key="index"
          >
            <span v-if="page === '...'" class="px-1 lg:px-2 text-sm">...</span>
            <Button
              v-else
              :variant="page === data.pagination.page ? 'default' : 'outline'"
              size="sm"
              class="h-8 w-8 p-0 text-sm"
              @click="goToPage(page as number)"
            >
              {{ page }}
            </Button>
          </template>

          <Button
            variant="outline"
            size="sm"
            class="h-8 w-8 p-0"
            @click="goToPage(Math.min(data.pagination.totalPages, data.pagination.page + 1))"
            :disabled="data.pagination.page === data.pagination.totalPages"
          >
            <ChevronRight class="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            size="sm"
            class="h-8 w-8 p-0"
            @click="goToPage(data.pagination.totalPages)"
            :disabled="data.pagination.page === data.pagination.totalPages"
          >
            <ChevronsRight class="h-4 w-4" />
          </Button>
        </div>
      </main>
    </div>
  </div>
</template>
