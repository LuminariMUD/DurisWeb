<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useRouter } from 'vue-router'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Button } from '@/components/ui/button'
import { TrendingUp, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-vue-next'
import { useTopGainers } from '@/composables/useFragLeaderboard'
import { parseAnsiToHtml } from '@/utils/ansiParser'

const router = useRouter()
const period = ref<'7d' | '30d' | '90d'>('30d')
const currentPage = ref(1)
const itemsPerPage = 10

// Fetch more data for local pagination
const { data, isLoading, error } = useTopGainers(period, 100)

// Reset page when period changes
watch(period, () => {
  currentPage.value = 1
})

const periodLabel = {
  '7d': '7 Days',
  '30d': '30 Days',
  '90d': '90 Days',
}

// Pagination computed properties
const totalItems = computed(() => data.value?.data?.length || 0)
const totalPages = computed(() => Math.ceil(totalItems.value / itemsPerPage))

const paginatedData = computed(() => {
  if (!data.value?.data) return []
  const start = (currentPage.value - 1) * itemsPerPage
  return data.value.data.slice(start, start + itemsPerPage)
})

function goToPage(page: number) {
  currentPage.value = page
}

function getVisiblePages(current: number, total: number): (number | string)[] {
  if (total <= 7) {
    return Array.from({ length: total }, (_, i) => i + 1)
  }

  const delta = 2
  const range: (number | string)[] = []
  const rangeWithDots: (number | string)[] = []

  for (let i = Math.max(2, current - delta); i <= Math.min(total - 1, current + delta); i++) {
    range.push(i)
  }

  if (current - delta > 2) {
    rangeWithDots.push(1, '...')
  } else {
    rangeWithDots.push(1)
  }

  rangeWithDots.push(...range)

  if (current + delta < total - 1) {
    rangeWithDots.push('...', total)
  } else if (total > 1) {
    rangeWithDots.push(total)
  }

  return rangeWithDots
}

function goToUserProfile(accountName: string) {
  router.push(`/user/${encodeURIComponent(accountName)}`)
}
</script>

<template>
  <Card>
    <CardHeader>
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-2">
          <TrendingUp class="w-5 h-5 text-green-500" />
          <CardTitle>Top Frag Gainers</CardTitle>
        </div>
        <div class="flex gap-1">
          <Button
            v-for="p in ['7d', '30d', '90d']"
            :key="p"
            :variant="period === p ? 'default' : 'outline'"
            size="sm"
            @click="period = p as '7d' | '30d' | '90d'"
          >
            {{ periodLabel[p as '7d' | '30d' | '90d'] }}
          </Button>
        </div>
      </div>
    </CardHeader>
    <CardContent>
      <div v-if="isLoading" class="space-y-2">
        <Skeleton v-for="i in 10" :key="i" class="h-12 w-full" />
      </div>

      <div v-else-if="error" class="text-center py-8 text-muted-foreground">
        Failed to load top gainers
      </div>

      <div v-else-if="data && data.data.length > 0" class="space-y-2">
        <div
          v-for="gainer in paginatedData"
          :key="gainer.char_name"
          class="flex items-center justify-between p-2 rounded-lg hover:bg-accent cursor-pointer transition-colors"
          @click="goToUserProfile(gainer.account_name)"
        >
          <div class="flex items-center gap-3">
            <div class="flex items-center justify-center w-8 h-8 rounded-full bg-primary/10 text-primary font-semibold text-sm">
              #{{ gainer.rank }}
            </div>
            <div>
              <div class="font-medium" v-html="parseAnsiToHtml(gainer.char_name)"></div>
              <div class="text-xs text-muted-foreground">
                <span v-html="parseAnsiToHtml(gainer.race)"></span>
                <span class="mx-1">•</span>
                <span v-html="parseAnsiToHtml(gainer.class)"></span>
                <span class="mx-1">•</span>
                Level {{ gainer.level }}
              </div>
            </div>
          </div>
          <div class="flex items-center gap-2">
            <Badge variant="secondary" class="font-mono">
              +{{ gainer.frags_gained.toFixed(2) }}
            </Badge>
          </div>
        </div>

        <!-- Pagination -->
        <div v-if="totalPages > 1" class="flex justify-center items-center gap-1 pt-4 border-t">
          <Button
            variant="outline"
            size="icon"
            class="h-8 w-8"
            @click="goToPage(1)"
            :disabled="currentPage === 1"
          >
            <ChevronsLeft class="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            size="icon"
            class="h-8 w-8"
            @click="goToPage(Math.max(1, currentPage - 1))"
            :disabled="currentPage === 1"
          >
            <ChevronLeft class="h-4 w-4" />
          </Button>

          <template
            v-for="(page, index) in getVisiblePages(currentPage, totalPages)"
            :key="index"
          >
            <span v-if="page === '...'" class="px-2 text-muted-foreground">...</span>
            <Button
              v-else
              :variant="page === currentPage ? 'default' : 'outline'"
              size="icon"
              class="h-8 w-8"
              @click="goToPage(page as number)"
            >
              {{ page }}
            </Button>
          </template>

          <Button
            variant="outline"
            size="icon"
            class="h-8 w-8"
            @click="goToPage(Math.min(totalPages, currentPage + 1))"
            :disabled="currentPage === totalPages"
          >
            <ChevronRight class="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            size="icon"
            class="h-8 w-8"
            @click="goToPage(totalPages)"
            :disabled="currentPage === totalPages"
          >
            <ChevronsRight class="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div v-else class="text-center py-8 text-muted-foreground">
        No data available for this period
      </div>
    </CardContent>
  </Card>
</template>
