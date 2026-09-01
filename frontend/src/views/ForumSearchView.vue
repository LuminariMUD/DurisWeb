<script setup lang="ts">
import { ref, onMounted, watch } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { forumApi } from '@/services/api'
import type { ForumSearchResult } from '@/types'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { Badge } from '@/components/ui/badge'
import BreadcrumbsNav from '@/components/layout/BreadcrumbsNav.vue'
import PaginationWithEllipsis from '@/components/forum/PaginationWithEllipsis.vue'

const router = useRouter()
const route = useRoute()

const searchQuery = ref('')
const results = ref<ForumSearchResult[]>([])
const isLoading = ref(false)
const error = ref<string | null>(null)
const currentPage = ref(1)
const totalPages = ref(1)

async function performSearch(page: number = 1) {
  if (!searchQuery.value.trim() || searchQuery.value.trim().length < 2) {
    error.value = 'Search query must be at least 2 characters'
    return
  }

  isLoading.value = true
  error.value = null

  try {
    const response = await forumApi.searchForum(searchQuery.value, page, 50)
    results.value = response.results
    currentPage.value = response.pagination.page
    totalPages.value = response.pagination.pages
  } catch (err: any) {
    error.value = err.response?.data?.error || 'Failed to perform search'
  } finally {
    isLoading.value = false
  }
}

function handleSearch() {
  // Update URL with search query
  router.push({ query: { q: searchQuery.value } })
  performSearch(1)
}

function truncateContent(content: string, maxLength: number = 200): string {
  if (content.length <= maxLength) return content
  return content.substring(0, maxLength) + '...'
}

function formatDate(dateString: string): string {
  const date = new Date(dateString)
  return date.toLocaleDateString()
}

function navigateToResult(result: ForumSearchResult) {
  router.push(`/forum/thread/${result.thread_id}`)
}

// Initialize search from URL query parameter
onMounted(() => {
  const queryParam = route.query.q as string
  if (queryParam) {
    searchQuery.value = queryParam
    performSearch(1)
  }
})

// Watch for URL query changes
watch(
  () => route.query.q,
  (newQuery) => {
    if (newQuery && newQuery !== searchQuery.value) {
      searchQuery.value = newQuery as string
      performSearch(1)
    }
  },
)
</script>

<template>
  <div class="container mx-auto px-4 py-8">
    <!-- Breadcrumbs -->
    <BreadcrumbsNav />

    <!-- Search Header -->
    <div class="mb-8">
      <h1 class="text-3xl font-bold mb-4">Search Forum</h1>

      <!-- Search Bar -->
      <div class="flex gap-2">
        <Input
          v-model="searchQuery"
          type="text"
          placeholder="Search threads and posts..."
          @keyup.enter="handleSearch"
          class="flex-1"
        />
        <Button @click="handleSearch" :disabled="isLoading">
          {{ isLoading ? 'Searching...' : 'Search' }}
        </Button>
      </div>
    </div>

    <!-- Loading State -->
    <div v-if="isLoading" class="space-y-4">
      <Card v-for="i in 5" :key="i">
        <CardHeader>
          <Skeleton class="h-6 w-96" />
          <Skeleton class="h-4 w-full mt-2" />
        </CardHeader>
      </Card>
    </div>

    <!-- Error State -->
    <Card v-else-if="error" class="border-destructive">
      <CardContent class="pt-6">
        <p class="text-destructive">{{ error }}</p>
      </CardContent>
    </Card>

    <!-- No Results -->
    <Card v-else-if="results.length === 0 && searchQuery">
      <CardContent class="pt-6 text-center text-muted-foreground">
        <p>No results found for "{{ searchQuery }}"</p>
        <p class="text-sm mt-2">Try different keywords or check your spelling</p>
      </CardContent>
    </Card>

    <!-- Results -->
    <div v-else-if="results.length > 0" class="space-y-4">
      <div class="text-sm text-muted-foreground mb-4">
        Found {{ results.length }} results for "{{ searchQuery }}"
      </div>

      <Card
        v-for="result in results"
        :key="`${result.type}-${result.id}`"
        class="hover:bg-accent/50 transition-colors cursor-pointer"
        @click="navigateToResult(result)"
      >
        <CardHeader>
          <div class="flex items-start justify-between gap-4">
            <div class="flex-1">
              <div class="flex items-center gap-2 mb-2">
                <Badge :variant="result.type === 'thread' ? 'default' : 'secondary'">
                  {{ result.type === 'thread' ? '📄 Thread' : '💬 Post' }}
                </Badge>
                <span class="text-xs text-muted-foreground">
                  in {{ result.category_name }}
                </span>
              </div>

              <CardTitle class="text-lg mb-2">{{ result.thread_title }}</CardTitle>

              <div class="text-sm text-muted-foreground mb-3">
                by
                <span class="font-medium">{{ result.author }}</span>
                <span v-if="result.character_name" class="text-xs">({{ result.character_name }})</span>
                • {{ formatDate(result.created_at) }}
              </div>

              <p class="text-sm text-muted-foreground">
                {{ truncateContent(result.content) }}
              </p>
            </div>

            <div class="text-xs text-muted-foreground">
              Score: {{ result.relevance_score.toFixed(2) }}
            </div>
          </div>
        </CardHeader>
      </Card>

      <!-- Pagination -->
      <div v-if="totalPages > 1" class="mt-8">
        <PaginationWithEllipsis
          :current-page="currentPage"
          :total-pages="totalPages"
          @page-change="performSearch"
        />
      </div>
    </div>

    <!-- Empty State (no search yet) -->
    <Card v-else>
      <CardContent class="pt-6 text-center text-muted-foreground">
        <p>Enter a search query to find threads and posts</p>
      </CardContent>
    </Card>
  </div>
</template>
