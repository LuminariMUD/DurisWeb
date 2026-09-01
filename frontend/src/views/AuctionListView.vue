<script setup lang="ts">
import { ref, computed } from 'vue'
import { useHead } from '@unhead/vue'
import { useRouter } from 'vue-router'
import {
  useAuctionListings,
  useAuctionStats,
  useAuctionWebSocket,
  formatPrice,
  formatTimeRemaining,
  getTimeUrgency,
} from '@/composables/useAuction'
import { useAuth } from '@/composables/useAuth'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import PaginationWithEllipsis from '@/components/forum/PaginationWithEllipsis.vue'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import {
  Gavel,
  Clock,
  Search,
  Loader2,
  Filter,
  X,
  User,
  ChevronDown,
  ArrowUp,
  ArrowDown,
  ArrowUpDown,
  History,
} from 'lucide-vue-next'
import type { AuctionFilters, AuctionListItem } from '@/types'
import AnsiText from '@/components/ui/AnsiText.vue'

useHead({
  title: 'DurisMUD | Auction House',
})

const router = useRouter()
const { user } = useAuth()

// Keyword categories for filtering
const keywordCategories = {
  'Equipment Slot': [
    'wield',
    'head',
    'neck',
    'body',
    'arms',
    'hands',
    'waist',
    'legs',
    'feet',
    'finger',
    'wrist',
    'shield',
    'about',
    'back',
    'ear',
    'face',
    'eyes',
    'badge',
    'quiver',
    'horns',
    'nose',
    'tail',
  ],
  Class: [
    'warrior',
    'ranger',
    'paladin',
    'antipaladin',
    'cleric',
    'monk',
    'druid',
    'shaman',
    'thief',
    'assassin',
    'mercenary',
    'bard',
    'sorcerer',
    'necromancer',
    'conjurer',
    'illusionist',
    'psionicist',
    'ethermancer',
    'alchemist',
    'berserker',
    'reaver',
    'dreadlord',
  ],
  'Item Type': ['potions', 'scrolls', 'spellbooks', 'containers', 'instruments', 'totems'],
  Stats: [
    'hitroll',
    'damroll',
    'hitpoints',
    'mana',
    'moves',
    'str',
    'dex',
    'int',
    'wis',
    'con',
    'agi',
    'pow',
    'cha',
    'luck',
    'karma',
  ],
  Affects: [
    'haste',
    'fly',
    'invisibility',
    'infravision',
    'sanctuary',
    'regen',
    'det_invis',
    'sense_life',
    'sneak',
    'hide',
    'waterwalk',
    'levitate',
    'stone_skin',
    'barkskin',
    'fireshield',
    'soulshield',
  ],
  'Item Flags': [
    'magic',
    'glow',
    'humming',
    'invisible',
    'twohands',
    'artifact',
    'nolocate',
    'float',
  ],
}

const filters = ref<AuctionFilters>({
  page: 1,
  limit: 10,
  sortBy: 'id',
  sortOrder: 'asc',
})

const searchInput = ref('')
const sellerInput = ref('')
const selectedKeywords = ref<string[]>([])
const hasBuyNow = ref(false)
const showFilters = ref(false)

const { data, isLoading, error } = useAuctionListings(filters)
const { data: stats } = useAuctionStats()

// Enable live updates via websocket
useAuctionWebSocket()

const hasActiveFilters = computed(() => {
  return selectedKeywords.value.length > 0 || sellerInput.value || hasBuyNow.value
})

function applySearch() {
  filters.value = {
    ...filters.value,
    search: searchInput.value || undefined,
    page: 1,
  }
}

function applyFilters() {
  filters.value = {
    ...filters.value,
    keywords: selectedKeywords.value.length > 0 ? selectedKeywords.value : undefined,
    seller: sellerInput.value || undefined,
    hasBuyNow: hasBuyNow.value || undefined,
    page: 1,
  }
}

function toggleKeyword(keyword: string) {
  const index = selectedKeywords.value.indexOf(keyword)
  if (index === -1) {
    selectedKeywords.value.push(keyword)
  } else {
    selectedKeywords.value.splice(index, 1)
  }
  applyFilters()
}

function clearFilters() {
  selectedKeywords.value = []
  sellerInput.value = ''
  hasBuyNow.value = false
  filters.value = {
    ...filters.value,
    keywords: undefined,
    seller: undefined,
    hasBuyNow: undefined,
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

function viewAuction(auction: AuctionListItem) {
  router.push({ name: 'auction-detail', params: { id: auction.id } })
}

function toggleSort(column: 'id' | 'startTime' | 'endTime' | 'price' | 'bidCount') {
  if (filters.value.sortBy === column) {
    // toggle order
    filters.value = {
      ...filters.value,
      sortOrder: filters.value.sortOrder === 'asc' ? 'desc' : 'asc',
      page: 1,
    }
  } else {
    // new column, default asc
    filters.value = {
      ...filters.value,
      sortBy: column,
      sortOrder: 'asc',
      page: 1,
    }
  }
}

function formatDate(unixTime: number): string {
  const date = new Date(unixTime * 1000)
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function getSortIcon(column: string) {
  if (filters.value.sortBy !== column) return ArrowUpDown
  return filters.value.sortOrder === 'asc' ? ArrowUp : ArrowDown
}

const pagination = computed(() => data.value?.pagination)
const auctions = computed(() => data.value?.data || [])
</script>

<template>
  <div class="space-y-6">
    <!-- Header -->
    <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
      <div class="flex items-center gap-3">
        <Gavel class="w-7 h-7 lg:w-8 lg:h-8 text-yellow-500 flex-shrink-0" />
        <div>
          <h1 class="text-2xl lg:text-3xl font-bold">Auction House</h1>
          <p class="text-sm text-muted-foreground">
            Browse and bid on items listed by players
          </p>
        </div>
      </div>
      <Button variant="outline" size="sm" class="self-start sm:self-auto" @click="router.push({ name: 'auction-history' })">
        <History class="h-4 w-4 mr-2" />
        Sale History
      </Button>
    </div>

    <!-- Stats Cards -->
    <div class="grid grid-cols-3 gap-2 lg:gap-4" v-if="stats">
      <Card class="p-3 lg:p-0">
        <CardHeader class="p-0 lg:p-6 lg:pb-2">
          <CardTitle class="text-xs lg:text-sm font-medium text-muted-foreground">Active</CardTitle>
        </CardHeader>
        <CardContent class="p-0 lg:p-6 lg:pt-0">
          <div class="text-lg lg:text-2xl font-bold">{{ stats.totalOpen }}</div>
        </CardContent>
      </Card>
      <Card class="p-3 lg:p-0">
        <CardHeader class="p-0 lg:p-6 lg:pb-2">
          <CardTitle class="text-xs lg:text-sm font-medium text-muted-foreground">Total Value</CardTitle>
        </CardHeader>
        <CardContent class="p-0 lg:p-6 lg:pt-0">
          <div class="text-lg lg:text-2xl font-bold">{{ formatPrice(stats.totalValue) }}</div>
        </CardContent>
      </Card>
      <Card class="p-3 lg:p-0">
        <CardHeader class="p-0 lg:p-6 lg:pb-2">
          <CardTitle class="text-xs lg:text-sm font-medium text-muted-foreground">Ending Soon</CardTitle>
        </CardHeader>
        <CardContent class="p-0 lg:p-6 lg:pt-0">
          <div class="text-lg lg:text-2xl font-bold text-orange-500">{{ stats.endingSoon }}</div>
        </CardContent>
      </Card>
    </div>

    <!-- Search and Filters -->
    <Card>
      <CardContent class="pt-6 space-y-4">
        <div class="flex flex-col md:flex-row gap-4">
          <!-- Search -->
          <div class="flex-1 flex gap-2">
            <div class="relative flex-1">
              <Search class="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                v-model="searchInput"
                placeholder="Search items..."
                class="pl-10"
                @keyup.enter="applySearch"
              />
            </div>
            <Button @click="applySearch">Search</Button>
          </div>
        </div>

        <!-- Advanced Filters Toggle -->
        <Collapsible v-model:open="showFilters">
          <div class="flex items-center justify-between">
            <CollapsibleTrigger asChild>
              <Button variant="ghost" size="sm" class="gap-2">
                <Filter class="h-4 w-4" />
                Advanced Filters
                <ChevronDown class="h-4 w-4 transition-transform" :class="{ 'rotate-180': showFilters }" />
                <Badge v-if="hasActiveFilters" variant="secondary" class="ml-1">
                  {{ selectedKeywords.length + (sellerInput ? 1 : 0) + (hasBuyNow ? 1 : 0) }}
                </Badge>
              </Button>
            </CollapsibleTrigger>
            <Button v-if="hasActiveFilters" variant="ghost" size="sm" @click="clearFilters" class="gap-1 text-muted-foreground">
              <X class="h-4 w-4" />
              Clear filters
            </Button>
          </div>

          <CollapsibleContent class="mt-4 space-y-4">
            <!-- Seller Filter -->
            <div class="flex flex-col sm:flex-row sm:items-center gap-3">
              <div class="flex items-center gap-2 flex-1 sm:max-w-xs">
                <User class="h-4 w-4 text-muted-foreground flex-shrink-0" />
                <Input
                  v-model="sellerInput"
                  placeholder="Filter by seller..."
                  @keyup.enter="applyFilters"
                  class="flex-1"
                />
                <Button size="sm" variant="secondary" @click="applyFilters">Apply</Button>
              </div>

              <!-- Buy Now Only -->
              <div class="flex items-center gap-2">
                <Checkbox
                  id="buyNowOnly"
                  :checked="hasBuyNow"
                  @update:checked="(val: boolean) => { hasBuyNow = val; applyFilters() }"
                />
                <Label for="buyNowOnly" class="text-sm cursor-pointer whitespace-nowrap">Buy-now only</Label>
              </div>
            </div>

            <!-- Active Keywords -->
            <div v-if="selectedKeywords.length > 0" class="flex flex-wrap gap-2">
              <span class="text-sm text-muted-foreground">Active:</span>
              <Badge
                v-for="keyword in selectedKeywords"
                :key="keyword"
                variant="default"
                class="cursor-pointer"
                @click="toggleKeyword(keyword)"
              >
                {{ keyword }}
                <X class="h-3 w-3 ml-1" />
              </Badge>
            </div>

            <!-- Keyword Categories -->
            <div class="space-y-3">
              <div v-for="(keywords, category) in keywordCategories" :key="category">
                <div class="text-sm font-medium text-muted-foreground mb-2">{{ category }}</div>
                <div class="flex flex-wrap gap-1.5">
                  <Badge
                    v-for="keyword in keywords"
                    :key="keyword"
                    :variant="selectedKeywords.includes(keyword) ? 'default' : 'outline'"
                    class="cursor-pointer hover:bg-primary/80 transition-colors"
                    @click="toggleKeyword(keyword)"
                  >
                    {{ keyword }}
                  </Badge>
                </div>
              </div>
            </div>
          </CollapsibleContent>
        </Collapsible>
      </CardContent>
    </Card>

    <!-- Loading State -->
    <div v-if="isLoading" class="flex justify-center py-12">
      <Loader2 class="h-8 w-8 animate-spin text-muted-foreground" />
    </div>

    <!-- Error State -->
    <div v-else-if="error" class="text-center py-12 text-red-500">
      Failed to load auctions. Please try again.
    </div>

    <!-- Empty State -->
    <div v-else-if="auctions.length === 0" class="text-center py-12 text-muted-foreground">
      <Gavel class="h-12 w-12 mx-auto mb-4 opacity-50" />
      <p>No auctions found matching your criteria.</p>
    </div>

    <!-- Auction Table (Desktop) -->
    <div v-else class="space-y-4">
      <!-- Mobile Cards -->
      <div class="lg:hidden space-y-3">
        <Card
          v-for="auction in auctions"
          :key="auction.id"
          class="cursor-pointer hover:bg-muted/50 transition-colors"
          @click="viewAuction(auction)"
        >
          <CardContent class="p-4">
            <div class="flex items-start justify-between gap-3">
              <div class="flex-1 min-w-0">
                <div class="font-medium truncate">
                  <AnsiText :text="auction.objShort" />
                </div>
                <div class="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                  <span>{{ auction.sellerName }}</span>
                  <span v-if="auction.quantity > 1">(x{{ auction.quantity }})</span>
                </div>
              </div>
              <Badge
                :variant="getTimeUrgency(auction.secsRemaining) === 'urgent' ? 'destructive' : getTimeUrgency(auction.secsRemaining) === 'warning' ? 'secondary' : 'outline'"
                class="whitespace-nowrap text-xs flex-shrink-0"
              >
                <Clock class="h-3 w-3 mr-1" />
                {{ formatTimeRemaining(auction.secsRemaining) }}
              </Badge>
            </div>
            <div class="flex items-center justify-between mt-3 pt-3 border-t">
              <div>
                <div class="text-xs text-muted-foreground">Current Bid</div>
                <div class="font-semibold">{{ formatPrice(auction.curPrice) }}</div>
              </div>
              <div v-if="auction.buyPrice > 0" class="text-right">
                <div class="text-xs text-muted-foreground">Buy Now</div>
                <div class="font-semibold text-green-500">{{ formatPrice(auction.buyPrice) }}</div>
              </div>
              <div class="text-right">
                <div class="text-xs text-muted-foreground">Bids</div>
                <div class="font-semibold">{{ auction.bidCount }}</div>
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
              <TableHead
                class="cursor-pointer hover:bg-muted/50 select-none w-16"
                @click="toggleSort('id')"
              >
                <div class="flex items-center gap-1">
                  #
                  <component :is="getSortIcon('id')" class="h-4 w-4" />
                </div>
              </TableHead>
              <TableHead class="w-[35%]">Item</TableHead>
              <TableHead>Seller</TableHead>
              <TableHead
                class="cursor-pointer hover:bg-muted/50 select-none"
                @click="toggleSort('startTime')"
              >
                <div class="flex items-center gap-1">
                  Posted
                  <component :is="getSortIcon('startTime')" class="h-4 w-4" />
                </div>
              </TableHead>
              <TableHead
                class="cursor-pointer hover:bg-muted/50 select-none"
                @click="toggleSort('price')"
              >
                <div class="flex items-center gap-1">
                  Price
                  <component :is="getSortIcon('price')" class="h-4 w-4" />
                </div>
              </TableHead>
              <TableHead>Buy Now</TableHead>
              <TableHead
                class="cursor-pointer hover:bg-muted/50 select-none"
                @click="toggleSort('bidCount')"
              >
                <div class="flex items-center gap-1">
                  Bids
                  <component :is="getSortIcon('bidCount')" class="h-4 w-4" />
                </div>
              </TableHead>
              <TableHead
                class="cursor-pointer hover:bg-muted/50 select-none"
                @click="toggleSort('endTime')"
              >
                <div class="flex items-center gap-1">
                  Time Left
                  <component :is="getSortIcon('endTime')" class="h-4 w-4" />
                </div>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRow
              v-for="auction in auctions"
              :key="auction.id"
              class="cursor-pointer hover:bg-muted/50"
              @click="viewAuction(auction)"
            >
              <TableCell class="text-muted-foreground">
                {{ auction.id }}
              </TableCell>
              <TableCell class="font-medium">
                <div class="truncate max-w-[300px]">
                  <AnsiText :text="auction.objShort" />
                </div>
                <span v-if="auction.quantity > 1" class="text-xs text-muted-foreground">
                  (x{{ auction.quantity }})
                </span>
              </TableCell>
              <TableCell class="text-muted-foreground">
                {{ auction.sellerName }}
              </TableCell>
              <TableCell class="text-muted-foreground text-sm">
                {{ formatDate(auction.startTime) }}
              </TableCell>
              <TableCell class="font-medium">
                {{ formatPrice(auction.curPrice) }}
              </TableCell>
              <TableCell>
                <span v-if="auction.buyPrice > 0" class="text-green-500">
                  {{ formatPrice(auction.buyPrice) }}
                </span>
                <span v-else class="text-muted-foreground">-</span>
              </TableCell>
              <TableCell>
                {{ auction.bidCount }}
              </TableCell>
              <TableCell>
                <Badge
                  :variant="getTimeUrgency(auction.secsRemaining) === 'urgent' ? 'destructive' : getTimeUrgency(auction.secsRemaining) === 'warning' ? 'secondary' : 'outline'"
                  class="whitespace-nowrap"
                >
                  <Clock class="h-3 w-3 mr-1" />
                  {{ formatTimeRemaining(auction.secsRemaining) }}
                </Badge>
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </Card>

      <!-- Pagination -->
      <div v-if="pagination && pagination.totalPages > 1" class="border-t px-4 py-3 flex flex-col sm:flex-row items-start sm:items-center gap-3">
        <p class="text-sm text-muted-foreground whitespace-nowrap">
          <span class="hidden sm:inline">Showing auction {{ (pagination.page - 1) * pagination.limit + 1 }} to {{ Math.min(pagination.page * pagination.limit, pagination.total) }} of {{ pagination.total }} total auctions</span>
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

    <!-- Login prompt for guests -->
    <Card v-if="!user" class="border-dashed">
      <CardContent class="py-6 text-center">
        <p class="text-muted-foreground">
          Log in to place bids on auction items.
        </p>
      </CardContent>
    </Card>
  </div>
</template>
