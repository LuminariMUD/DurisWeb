<script setup lang="ts">
import { ref, computed, nextTick } from 'vue'
import { useQuery, useQueryClient } from '@tanstack/vue-query'
import { changelogApi } from '@/services/api'
import { useAuth } from '@/composables/useAuth'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ChevronDown, Circle, CheckCircle2 } from '@lucide/vue'
import { sanitizeChangelogContent } from '@/utils/sanitizeChangelogContent'

const { isAuthenticated, accountName } = useAuth()
const queryClient = useQueryClient()
const contentRefs = ref<Map<number, HTMLElement>>(new Map())

// Pagination
const currentPage = ref(1)
const limit = 10

// Expanded entries
const expandedEntries = ref<Set<number>>(new Set())

// Fetch changelog entries
const changelogQueryKey = computed(
  () =>
    [
      'changelog',
      accountName.value?.trim().toLowerCase() || 'anonymous',
      currentPage.value,
    ] as const,
)
const {
  data: changelogData,
  isLoading,
  isError,
  error,
  refetch,
} = useQuery({
  queryKey: changelogQueryKey,
  queryFn: async ({ queryKey }) => {
    const [, , page] = queryKey
    return await changelogApi.getEntries(page, limit)
  },
  staleTime: 1000 * 60 * 5,
})

// Computed values
const entries = computed(() => changelogData.value?.entries ?? [])
const totalEntries = computed(() => changelogData.value?.total ?? 0)
const totalPages = computed(() => Math.ceil(totalEntries.value / limit))

// Apply column background colors from data attributes
function applyColumnStyles(container: HTMLElement) {
  const columnsWithBg = container.querySelectorAll('[data-bg-color]')
  columnsWithBg.forEach((el) => {
    const color = el.getAttribute('data-bg-color')
    if (color) {
      ;(el as HTMLElement).style.backgroundColor = color
    }
  })
}

// Expand/collapse
async function toggleEntry(id: number) {
  if (expandedEntries.value.has(id)) {
    expandedEntries.value.delete(id)
  } else {
    expandedEntries.value.add(id)
    // mark as read when expanded (for logged-in users)
    if (isAuthenticated.value) {
      try {
        await changelogApi.markAsRead(id)
        await queryClient.invalidateQueries({ queryKey: ['changelog-unread-count'] })
        await queryClient.invalidateQueries({ queryKey: ['changelog'] })
      } catch {
        // Keep the entry expanded even if the read receipt is temporarily unavailable.
      }
    }
    // apply column styles after DOM updates
    await nextTick()
    const contentEl = contentRefs.value.get(id)
    if (contentEl) {
      applyColumnStyles(contentEl)
    }
  }
}

function isExpanded(id: number) {
  return expandedEntries.value.has(id)
}

// Format date
function formatDate(date: string) {
  return new Date(date).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

// Pagination
function goToPage(page: number) {
  if (page >= 1 && page <= totalPages.value) {
    currentPage.value = page
  }
}
</script>

<template>
  <div class="space-y-4">
    <!-- Loading State -->
    <div v-if="isLoading" class="flex items-center justify-center py-12">
      <div class="text-center">
        <div class="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-current border-r-transparent"></div>
        <p class="mt-4 text-muted-foreground">loading changelog...</p>
      </div>
    </div>

    <!-- Error State -->
    <div v-else-if="isError" class="rounded-lg border border-destructive bg-destructive/10 p-4">
      <h3 class="font-semibold text-destructive">error loading changelog</h3>
      <p class="text-sm text-destructive/80">{{ error?.message || 'unknown error occurred' }}</p>
      <Button variant="outline" size="sm" class="mt-3" @click="refetch()">
        Try again
      </Button>
    </div>

    <!-- Empty State -->
    <div v-else-if="entries.length === 0" class="text-center py-12">
      <p class="text-muted-foreground">no changelog entries yet</p>
    </div>

    <!-- Changelog Entries -->
    <div v-else class="space-y-3">
      <div
        v-for="entry in entries"
        :key="entry.id"
        class="rounded-lg border border-border bg-background overflow-hidden transition-colors"
        :class="{ 'border-vermilion/30': !entry.isRead && isAuthenticated }"
      >
        <!-- Header (clickable) -->
        <button
          type="button"
          @click="toggleEntry(entry.id)"
          :aria-expanded="isExpanded(entry.id)"
          :aria-controls="`changelog-entry-${entry.id}`"
          class="w-full flex items-center gap-4 p-4 text-left hover:bg-card/50 transition-colors"
        >
          <!-- Read indicator -->
          <div v-if="isAuthenticated" class="flex-shrink-0">
            <CheckCircle2 v-if="entry.isRead" class="h-4 w-4 text-faint" />
            <Circle v-else class="h-4 w-4 text-vermilion" />
          </div>

          <!-- Version -->
          <Badge variant="outline" class="hidden font-mono flex-shrink-0 sm:inline-flex">
            {{ entry.version }}
          </Badge>

          <!-- Title and date -->
          <div class="flex-1 min-w-0">
            <h3 class="font-medium leading-snug text-foreground">{{ entry.title }}</h3>
            <p class="text-xs text-muted-foreground">{{ formatDate(entry.createdAt) }}</p>
          </div>

          <!-- Category badge for admin entries -->
          <Badge v-if="entry.category === 'admin'" variant="destructive" class="flex-shrink-0">
            admin
          </Badge>

          <!-- Expand/collapse icon -->
          <ChevronDown
            class="h-5 w-5 text-faint flex-shrink-0 transition-transform duration-200"
            :class="{ 'rotate-180': isExpanded(entry.id) }"
          />
        </button>

        <!-- Content (collapsible) -->
        <div
          :id="`changelog-entry-${entry.id}`"
          v-show="isExpanded(entry.id)"
          :ref="(el) => { if (el) contentRefs.set(entry.id, el as HTMLElement) }"
          class="changelog-body border-t border-border px-4 py-4 prose prose-invert prose-sm max-w-none tiptap-content"
          v-html="sanitizeChangelogContent(entry.content)"
        ></div>
      </div>

      <!-- Pagination -->
      <div v-if="totalPages > 1" class="flex items-center justify-center gap-2 pt-4">
        <Button
          variant="outline"
          size="sm"
          :disabled="currentPage === 1"
          @click="goToPage(currentPage - 1)"
        >
          Previous
        </Button>
        <span class="text-sm text-muted-foreground">
          Page {{ currentPage }} of {{ totalPages }}
        </span>
        <Button
          variant="outline"
          size="sm"
          :disabled="currentPage === totalPages"
          @click="goToPage(currentPage + 1)"
        >
          Next
        </Button>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* Long entries read as short sections: display-face headings and clear spacing. */
.changelog-body :deep(:is(h2, h3, h4)) {
  margin: 1.25rem 0 0.4rem;
  color: var(--color-bone);
  font-family: var(--font-display);
  font-size: 1.35rem;
  font-weight: 400;
  line-height: 1.2;
}

.changelog-body :deep(:is(h2, h3, h4):first-child) {
  margin-top: 0;
}

.changelog-body :deep(p) {
  margin: 0 0 0.75rem;
  min-height: 0;
}

.changelog-body :deep(ul) {
  margin: 0 0 0.75rem;
}

.changelog-body :deep(li + li) {
  margin-top: 0.35rem;
}

.changelog-body :deep(li::marker) {
  color: var(--color-vermilion);
}

.changelog-body :deep(:is(p, ul):last-child) {
  margin-bottom: 0;
}
</style>
