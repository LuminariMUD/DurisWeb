<script setup lang="ts">
import { ref, computed } from 'vue'
import { useHead } from '@unhead/vue'
import { useRouter } from 'vue-router'
import { useAuctionHistory, formatPrice } from '@/composables/useAuction'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import PaginationWithEllipsis from '@/components/forum/PaginationWithEllipsis.vue'
import { History, Search, Loader2, ArrowLeft, ArrowUp, ArrowDown, ArrowUpDown } from 'lucide-vue-next'
import type { AuctionHistoryFilters } from '@/types'
import AnsiText from '@/components/ui/AnsiText.vue'

useHead({
  title: 'DurisMUD | Auction History'
})

const router = useRouter()

const filters = ref<AuctionHistoryFilters>({
  page: 1,
  limit: 10,
  sortBy: 'soldAt',
  sortOrder: 'desc',
})

const searchInput = ref('')
const sellerInput = ref('')
const buyerInput = ref('')

const { data, isLoading, error } = useAuctionHistory(filters)

function applySearch() {
  filters.value = {
    ...filters.value,
    search: searchInput.value || undefined,
    seller: sellerInput.value || undefined,
    buyer: buyerInput.value || undefined,
    page: 1,
  }
}

function goToPage(page: number) {
  filters.value = {
    ...filters.value,
    page,
  }
  window.scrollTo({ top: 0, behavior: 'smooth' })
}

function toggleSort(column: 'soldAt' | 'price') {
  if (filters.value.sortBy === column) {
    filters.value = {
      ...filters.value,
      sortOrder: filters.value.sortOrder === 'asc' ? 'desc' : 'asc',
      page: 1,
    }
  } else {
    filters.value = {
      ...filters.value,
      sortBy: column,
      sortOrder: 'desc',
      page: 1,
    }
  }
}

function getSortIcon(column: string) {
  if (filters.value.sortBy !== column) return ArrowUpDown
  return filters.value.sortOrder === 'asc' ? ArrowUp : ArrowDown
}

function formatDate(timestamp: number): string {
  return new Date(timestamp * 1000).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

const pagination = computed(() => data.value?.pagination)
const history = computed(() => data.value?.data || [])
</script>

<template>
  <div class="space-y-6">
    <!-- Header -->
    <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
      <div class="flex items-center gap-3">
        <History class="w-7 h-7 lg:w-8 lg:h-8 text-blue-500 flex-shrink-0" />
        <div>
          <h1 class="text-2xl lg:text-3xl font-bold">Auction History</h1>
          <p class="text-sm text-muted-foreground">
            Completed sales from the last 30 days
          </p>
        </div>
      </div>
      <Button variant="outline" size="sm" class="self-start sm:self-auto" @click="router.push({ name: 'auction-list' })">
        <ArrowLeft class="h-4 w-4 mr-2" />
        Back to Auctions
      </Button>
    </div>

    <!-- Search Filters -->
    <Card>
      <CardContent class="pt-4 lg:pt-6">
        <div class="flex flex-col gap-3">
          <!-- Search input -->
          <div class="relative">
            <Search class="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              v-model="searchInput"
              placeholder="Search items..."
              class="pl-10"
              @keyup.enter="applySearch"
            />
          </div>
          <!-- Seller/Buyer filters -->
          <div class="flex flex-col sm:flex-row gap-3">
            <Input
              v-model="sellerInput"
              placeholder="Seller name..."
              class="flex-1 sm:flex-initial sm:w-40"
              @keyup.enter="applySearch"
            />
            <Input
              v-model="buyerInput"
              placeholder="Buyer name..."
              class="flex-1 sm:flex-initial sm:w-40"
              @keyup.enter="applySearch"
            />
            <Button @click="applySearch" class="sm:flex-shrink-0">Search</Button>
          </div>
        </div>
      </CardContent>
    </Card>

    <!-- Loading State -->
    <div v-if="isLoading" class="flex justify-center py-12">
      <Loader2 class="h-8 w-8 animate-spin text-muted-foreground" />
    </div>

    <!-- Error State -->
    <div v-else-if="error" class="text-center py-12 text-red-500">
      Failed to load auction history. Please try again.
    </div>

    <!-- Empty State -->
    <div v-else-if="history.length === 0" class="text-center py-12 text-muted-foreground">
      <History class="h-12 w-12 mx-auto mb-4 opacity-50" />
      <p>No completed auctions found in the last 30 days.</p>
    </div>

    <!-- History Table -->
    <div v-else class="space-y-4">
      <!-- Mobile Cards -->
      <div class="lg:hidden space-y-3">
        <Card v-for="item in history" :key="item.id">
          <CardContent class="p-4">
            <div class="font-medium truncate mb-2">
              <AnsiText :text="item.objShort" />
            </div>
            <div class="grid grid-cols-2 gap-2 text-sm">
              <div>
                <span class="text-muted-foreground">Seller:</span>
                <span class="ml-1">{{ item.sellerName }}</span>
              </div>
              <div>
                <span class="text-muted-foreground">Buyer:</span>
                <span class="ml-1">{{ item.buyerName }}</span>
              </div>
            </div>
            <div class="flex items-center justify-between mt-3 pt-3 border-t">
              <div>
                <div class="text-xs text-muted-foreground">Sale Price</div>
                <div class="font-semibold text-green-500">{{ formatPrice(item.salePrice) }}</div>
              </div>
              <div class="text-center">
                <div class="text-xs text-muted-foreground">Bids</div>
                <div class="font-semibold">{{ item.bidCount }}</div>
              </div>
              <div class="text-right">
                <div class="text-xs text-muted-foreground">Sold</div>
                <div class="text-sm">{{ formatDate(item.soldAt) }}</div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <!-- Desktop Table -->
      <Card class="px-3 hidden lg:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead class="w-[35%]">Item</TableHead>
              <TableHead>Seller</TableHead>
              <TableHead>Buyer</TableHead>
              <TableHead
                class="cursor-pointer hover:bg-muted/50 select-none"
                @click="toggleSort('price')"
              >
                <div class="flex items-center gap-1">
                  Sale Price
                  <component :is="getSortIcon('price')" class="h-4 w-4" />
                </div>
              </TableHead>
              <TableHead>Bids</TableHead>
              <TableHead
                class="cursor-pointer hover:bg-muted/50 select-none"
                @click="toggleSort('soldAt')"
              >
                <div class="flex items-center gap-1">
                  Sold
                  <component :is="getSortIcon('soldAt')" class="h-4 w-4" />
                </div>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRow
              v-for="item in history"
              :key="item.id"
            >
              <TableCell class="font-medium">
                <div class="truncate max-w-[280px]">
                  <AnsiText :text="item.objShort" />
                </div>
              </TableCell>
              <TableCell class="text-muted-foreground">
                {{ item.sellerName }}
              </TableCell>
              <TableCell class="text-muted-foreground">
                {{ item.buyerName }}
              </TableCell>
              <TableCell class="font-medium text-green-500">
                {{ formatPrice(item.salePrice) }}
              </TableCell>
              <TableCell>
                {{ item.bidCount }}
              </TableCell>
              <TableCell class="text-muted-foreground whitespace-nowrap">
                {{ formatDate(item.soldAt) }}
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </Card>

      <!-- Pagination -->
      <div v-if="pagination && pagination.totalPages > 1" class="border-t px-4 py-3 flex flex-col sm:flex-row items-start sm:items-center gap-3">
        <p class="text-sm text-muted-foreground whitespace-nowrap">
          <span class="hidden sm:inline">Showing sale {{ (pagination.page - 1) * pagination.limit + 1 }} to {{ Math.min(pagination.page * pagination.limit, pagination.total) }} of {{ pagination.total }} total sales</span>
          <span class="sm:hidden">{{ (pagination.page - 1) * pagination.limit + 1 }}-{{ Math.min(pagination.page * pagination.limit, pagination.total) }} of {{ pagination.total }}</span>
        </p>
        <div class="sm:ml-auto">
          <PaginationWithEllipsis
            :current-page="pagination.page"
            :total-pages="pagination.totalPages"
            @page-change="goToPage"
          />
        </div>
      </div>
    </div>
  </div>
</template>
