<script setup lang="ts">
import { computed } from 'vue'
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationFirst,
  PaginationItem,
  PaginationLast,
  PaginationNext,
  PaginationPrevious,
} from '@/components/ui/pagination'
import { Button } from '@/components/ui/button'

interface Props {
  currentPage: number
  totalPages: number
  siblingCount?: number // Number of pages to show on each side of current page
}

const props = withDefaults(defineProps<Props>(), {
  siblingCount: 1,
})

const emit = defineEmits<{
  pageChange: [page: number]
}>()

/**
 * Generate page numbers with ellipsis
 * Example for totalPages=100, currentPage=50, siblingCount=1:
 * [1, '...', 49, 50, 51, '...', 100]
 */
const pages = computed<(number | 'ellipsis')[]>(() => {
  const { currentPage, totalPages, siblingCount } = props

  // If total pages is small, show all pages
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, i) => i + 1)
  }

  const leftSibling = Math.max(currentPage - siblingCount, 1)
  const rightSibling = Math.min(currentPage + siblingCount, totalPages)

  const showLeftEllipsis = leftSibling > 2
  const showRightEllipsis = rightSibling < totalPages - 1

  const result: (number | 'ellipsis')[] = []

  // Always show first page
  result.push(1)

  // Left ellipsis
  if (showLeftEllipsis) {
    result.push('ellipsis')
  } else if (leftSibling === 2) {
    // Show page 2 instead of ellipsis
    result.push(2)
  }

  // Middle pages
  for (let i = leftSibling; i <= rightSibling; i++) {
    if (i !== 1 && i !== totalPages) {
      result.push(i)
    }
  }

  // Right ellipsis
  if (showRightEllipsis) {
    result.push('ellipsis')
  } else if (rightSibling === totalPages - 1) {
    // Show second-to-last page instead of ellipsis
    result.push(totalPages - 1)
  }

  // Always show last page
  if (totalPages > 1) {
    result.push(totalPages)
  }

  return result
})

function goToPage(page: number) {
  if (page >= 1 && page <= props.totalPages && page !== props.currentPage) {
    emit('pageChange', page)
  }
}
</script>

<template>
  <Pagination
    :total="totalPages * 10"
    :items-per-page="10"
    :sibling-count="siblingCount"
    :default-page="currentPage"
  >
    <PaginationContent class="gap-1">
      <!-- First Page Button -->
      <PaginationFirst
        as-child
        :disabled="currentPage === 1"
      >
        <Button variant="outline" size="sm" class="!h-8 !w-8 !p-0 !min-w-0" @click="goToPage(1)">
          <span class="sr-only">First</span>
          «
        </Button>
      </PaginationFirst>

      <!-- Previous Button -->
      <PaginationPrevious
        as-child
        :disabled="currentPage === 1"
      >
        <Button variant="outline" size="sm" class="!h-8 !w-8 !p-0 !min-w-0" @click="goToPage(currentPage - 1)">
          <span class="sr-only">Previous</span>
          ‹
        </Button>
      </PaginationPrevious>

      <!-- Page Numbers with Ellipsis -->
      <template v-for="(page, index) in pages" :key="index">
        <PaginationEllipsis v-if="page === 'ellipsis'" />
        <PaginationItem v-else :value="typeof page === 'number' ? page : 0">
          <button
            :class="[
              'inline-flex items-center justify-center whitespace-nowrap rounded-md text-xs font-medium transition-colors',
              'h-8 w-8',
              page === currentPage
                ? 'bg-primary text-primary-foreground hover:bg-primary/90'
                : 'hover:bg-accent hover:text-accent-foreground'
            ]"
            @click="goToPage(typeof page === 'number' ? page : 1)"
          >
            {{ page }}
          </button>
        </PaginationItem>
      </template>

      <!-- Next Button -->
      <PaginationNext
        as-child
        :disabled="currentPage === totalPages"
      >
        <Button variant="outline" size="sm" class="!h-8 !w-8 !p-0 !min-w-0" @click="goToPage(currentPage + 1)">
          <span class="sr-only">Next</span>
          ›
        </Button>
      </PaginationNext>

      <!-- Last Page Button -->
      <PaginationLast
        as-child
        :disabled="currentPage === totalPages"
      >
        <Button variant="outline" size="sm" class="!h-8 !w-8 !p-0 !min-w-0" @click="goToPage(totalPages)">
          <span class="sr-only">Last</span>
          »
        </Button>
      </PaginationLast>
    </PaginationContent>
  </Pagination>
</template>
