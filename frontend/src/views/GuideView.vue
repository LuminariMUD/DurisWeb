<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue'
import { useDebounceFn } from '@vueuse/core'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Badge } from '@/components/ui/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import PaginationWithEllipsis from '@/components/forum/PaginationWithEllipsis.vue'
import HelpFileDialog from '@/components/guide/HelpFileDialog.vue'
import { guideApi } from '@/services/api'
import { stripAnsiCodes } from '@/utils/ansiParser'
import type { PublicHelpFile, GuideCategoryWithCount } from '@/types'
import { Search, BookOpen, X, ArrowUp, ArrowDown } from 'lucide-vue-next'

// State
const initialLoading = ref(true)
const tableLoading = ref(false)
const helpFiles = ref<PublicHelpFile[]>([])
const categories = ref<GuideCategoryWithCount[]>([])
const total = ref(0)
const currentPage = ref(1)
const totalPages = ref(1)
const limit = 20

// Filters
const search = ref('')
const selectedCategoryId = ref<number | null>(null)

// Sorting
type SortColumn = 'title' | 'category' | 'last_update_by' | 'last_update'
const sortColumn = ref<SortColumn>('title')
const sortDirection = ref<'asc' | 'desc'>('asc')

// Dialog state
const selectedHelpFile = ref<PublicHelpFile | null>(null)
const showDialog = ref(false)
const loadingHelpFile = ref(false)

// Load categories
async function loadCategories() {
  try {
    const result = await guideApi.getCategories()
    categories.value = result.categories
  } catch (e) {
    console.error('Failed to load categories:', e)
  }
}

// Load help files
async function loadHelpFiles(isInitial = false) {
  try {
    if (isInitial) {
      initialLoading.value = true
    } else {
      tableLoading.value = true
    }

    const params: { page: number; limit: number; category_id?: number; search?: string; sort?: string; sort_dir?: string } = {
      page: currentPage.value,
      limit,
      sort: sortColumn.value,
      sort_dir: sortDirection.value,
    }

    if (selectedCategoryId.value !== null) {
      params.category_id = selectedCategoryId.value
    }

    if (search.value && search.value.length >= 2) {
      params.search = search.value
    }

    const result = await guideApi.getHelpFiles(params)
    helpFiles.value = result.pages
    total.value = result.pagination.total
    totalPages.value = result.pagination.totalPages
  } catch (e) {
    console.error('Failed to load help files:', e)
  } finally {
    initialLoading.value = false
    tableLoading.value = false
  }
}

// Debounced search
const debouncedSearch = useDebounceFn(() => {
  currentPage.value = 1
  loadHelpFiles()
}, 300)

// Watch for search changes
watch(search, () => {
  debouncedSearch()
})

// Handle category filter click
function selectCategory(categoryId: number | null) {
  selectedCategoryId.value = categoryId
  currentPage.value = 1
  loadHelpFiles()
}

// Handle sort
function handleSort(column: SortColumn) {
  if (sortColumn.value === column) {
    sortDirection.value = sortDirection.value === 'asc' ? 'desc' : 'asc'
  } else {
    sortColumn.value = column
    sortDirection.value = 'asc'
  }
  currentPage.value = 1
  loadHelpFiles()
}

// Handle page change
function handlePageChange(page: number) {
  currentPage.value = page
  loadHelpFiles()
}

// Open help file dialog
async function openHelpFile(file: PublicHelpFile) {
  try {
    loadingHelpFile.value = true
    showDialog.value = true
    // Fetch full content
    const fullFile = await guideApi.getHelpFile(file.id)
    selectedHelpFile.value = fullFile
  } catch (e) {
    console.error('Failed to load help file:', e)
  } finally {
    loadingHelpFile.value = false
  }
}

// Close dialog
function closeDialog() {
  showDialog.value = false
  selectedHelpFile.value = null
}

// Clear filters
function clearFilters() {
  search.value = ''
  selectedCategoryId.value = null
  currentPage.value = 1
  loadHelpFiles()
}

// Check if any filters are active
const hasActiveFilters = computed(() => {
  return search.value || selectedCategoryId.value !== null
})

// Format date
function formatDate(dateStr: string | null): string {
  if (!dateStr) return '-'
  const date = new Date(dateStr)
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

// Get category badge color
function getCategoryColor(categoryName: string): string {
  const colors: Record<string, string> = {
    'General': 'bg-blue-500/20 text-blue-400 hover:bg-blue-500/30',
    'Class': 'bg-purple-500/20 text-purple-400 hover:bg-purple-500/30',
    'Class Skillsets': 'bg-violet-500/20 text-violet-400 hover:bg-violet-500/30',
    'Spec': 'bg-amber-500/20 text-amber-400 hover:bg-amber-500/30',
    'Race': 'bg-green-500/20 text-green-400 hover:bg-green-500/30',
    'Redirect': 'bg-gray-500/20 text-gray-400 hover:bg-gray-500/30',
  }
  return colors[categoryName] || 'bg-cyan-500/20 text-cyan-400 hover:bg-cyan-500/30'
}

// Load on mount
onMounted(() => {
  loadCategories()
  loadHelpFiles(true)
})
</script>

<template>
  <div class="h-full flex flex-col">
    <div class="flex-1 overflow-y-auto">
      <div class="container max-w-5xl mx-auto px-4 py-3 space-y-6">
        <!-- Header -->
        <div class="text-center mb-6 lg:mb-8">
          <div class="flex items-center justify-center gap-2 lg:gap-3 mb-2">
            <BookOpen class="h-6 w-6 lg:h-8 lg:w-8 text-cyan-400" />
            <h1 class="text-2xl lg:text-3xl font-bold text-white">Guide</h1>
          </div>
          <p class="text-sm text-muted-foreground">
            Browse in-game help files and documentation
          </p>
        </div>

        <!-- Search and Filters -->
        <Card>
          <CardContent class="pt-3 space-y-4">
            <!-- Search Input -->
            <div class="relative">
              <Search class="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                v-model="search"
                placeholder="Search help files... (min 2 characters)"
                class="pl-10"
              />
            </div>

            <!-- Category Filter Chips -->
            <div class="space-y-2">
              <div class="flex items-center justify-between">
                <span class="text-xs lg:text-sm text-muted-foreground">Categories:</span>
                <!-- Clear Filters -->
                <Button
                  v-if="hasActiveFilters"
                  variant="ghost"
                  size="sm"
                  @click="clearFilters"
                  class="gap-1 h-6 text-xs text-muted-foreground hover:text-foreground"
                >
                  <X class="h-3 w-3" />
                  Clear
                </Button>
              </div>
              <div class="flex gap-2 overflow-x-auto pb-2 -mx-3 px-3 lg:mx-0 lg:px-0 lg:flex-wrap lg:overflow-visible">
                <Button
                  variant="ghost"
                  size="sm"
                  :class="[
                    'h-7 px-3 text-xs rounded-full transition-colors flex-shrink-0',
                    selectedCategoryId === null
                      ? 'bg-cyan-500/20 text-cyan-400'
                      : 'bg-muted/50 text-muted-foreground hover:text-foreground'
                  ]"
                  @click="selectCategory(null)"
                >
                  All
                  <Badge v-if="total && selectedCategoryId === null" variant="secondary" class="ml-1.5 h-5 px-1.5">
                    {{ total }}
                  </Badge>
                </Button>
                <Button
                  v-for="cat in categories"
                  :key="cat.id"
                  variant="ghost"
                  size="sm"
                  :class="[
                    'h-7 px-3 text-xs rounded-full transition-colors flex-shrink-0',
                    selectedCategoryId === cat.id
                      ? getCategoryColor(cat.name)
                      : 'bg-muted/50 text-muted-foreground hover:text-foreground'
                  ]"
                  @click="selectCategory(cat.id)"
                >
                  {{ cat.name }}
                  <Badge variant="secondary" class="ml-1.5 h-5 px-1.5">
                    {{ cat.count }}
                  </Badge>
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        <!-- Results -->
        <Card class="py-2">
          <CardContent class="p-0">
            <!-- Initial Loading State -->
            <div v-if="initialLoading">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead class="pl-4">Title</TableHead>
                    <TableHead class="w-[150px]">Category</TableHead>
                    <TableHead class="w-[120px]">Edited By</TableHead>
                    <TableHead class="w-[120px] pr-4">Last Updated</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  <TableRow v-for="i in 10" :key="i">
                    <TableCell class="pl-4"><Skeleton class="h-4 w-48" /></TableCell>
                    <TableCell><Skeleton class="h-6 w-20 rounded-full" /></TableCell>
                    <TableCell><Skeleton class="h-4 w-20" /></TableCell>
                    <TableCell class="pr-4"><Skeleton class="h-4 w-24" /></TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </div>

            <!-- Empty State -->
            <div v-else-if="helpFiles.length === 0" class="text-center py-16 text-muted-foreground">
              <BookOpen class="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p class="text-lg">No help files found</p>
              <p class="text-sm mt-1">Try adjusting your search or filters</p>
            </div>

            <!-- Table -->
            <div v-else class="relative">
              <!-- Loading overlay -->
              <div
                v-if="tableLoading"
                class="absolute inset-0 bg-background/60 flex items-center justify-center z-10"
              >
                <div class="h-5 w-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
              </div>

              <!-- Mobile Cards -->
              <div class="lg:hidden divide-y">
                <div
                  v-for="file in helpFiles"
                  :key="file.id"
                  class="p-3 cursor-pointer hover:bg-muted/50 transition-colors"
                  @click="openHelpFile(file)"
                >
                  <div class="flex items-start justify-between gap-2">
                    <div class="font-medium text-sm">
                      {{ stripAnsiCodes(file.title || 'Untitled') }}
                    </div>
                    <span
                      :class="[
                        'px-2 py-0.5 text-xs rounded-full flex-shrink-0',
                        getCategoryColor(file.category_name)
                      ]"
                    >
                      {{ file.category_name }}
                    </span>
                  </div>
                  <div class="text-xs text-muted-foreground mt-1">
                    <span v-if="file.last_update_by">{{ file.last_update_by }} · </span>
                    {{ formatDate(file.last_update) }}
                  </div>
                </div>
              </div>

              <!-- Desktop Table -->
              <div class="hidden lg:block overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead class="pl-4 cursor-pointer hover:bg-muted/50 select-none" @click="handleSort('title')">
                        <span class="flex items-center gap-1">
                          Title
                          <ArrowUp v-if="sortColumn === 'title' && sortDirection === 'asc'" class="h-3 w-3" />
                          <ArrowDown v-else-if="sortColumn === 'title' && sortDirection === 'desc'" class="h-3 w-3" />
                        </span>
                      </TableHead>
                      <TableHead class="w-[150px] cursor-pointer hover:bg-muted/50 select-none" @click="handleSort('category')">
                        <span class="flex items-center gap-1">
                          Category
                          <ArrowUp v-if="sortColumn === 'category' && sortDirection === 'asc'" class="h-3 w-3" />
                          <ArrowDown v-else-if="sortColumn === 'category' && sortDirection === 'desc'" class="h-3 w-3" />
                        </span>
                      </TableHead>
                      <TableHead class="w-[120px] cursor-pointer hover:bg-muted/50 select-none" @click="handleSort('last_update_by')">
                        <span class="flex items-center gap-1">
                          Edited By
                          <ArrowUp v-if="sortColumn === 'last_update_by' && sortDirection === 'asc'" class="h-3 w-3" />
                          <ArrowDown v-else-if="sortColumn === 'last_update_by' && sortDirection === 'desc'" class="h-3 w-3" />
                        </span>
                      </TableHead>
                      <TableHead class="w-[140px] pr-4 cursor-pointer hover:bg-muted/50 select-none" @click="handleSort('last_update')">
                        <span class="flex items-center gap-1">
                          Last Updated
                          <ArrowUp v-if="sortColumn === 'last_update' && sortDirection === 'asc'" class="h-3 w-3" />
                          <ArrowDown v-else-if="sortColumn === 'last_update' && sortDirection === 'desc'" class="h-3 w-3" />
                        </span>
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    <TableRow
                      v-for="file in helpFiles"
                      :key="file.id"
                      class="cursor-pointer hover:bg-muted/50 transition-colors"
                      @click="openHelpFile(file)"
                    >
                      <TableCell class="font-medium pl-4">
                        {{ stripAnsiCodes(file.title || 'Untitled') }}
                      </TableCell>
                      <TableCell>
                        <span
                          :class="[
                            'px-2 py-1 text-xs rounded-full',
                            getCategoryColor(file.category_name)
                          ]"
                        >
                          {{ file.category_name }}
                        </span>
                      </TableCell>
                      <TableCell class="text-sm text-muted-foreground">
                        {{ file.last_update_by || '-' }}
                      </TableCell>
                      <TableCell class="text-sm text-muted-foreground pr-4">
                        {{ formatDate(file.last_update) }}
                      </TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </div>
            </div>

            <!-- Pagination -->
            <div v-if="!initialLoading && helpFiles.length > 0" class="border-t px-3 lg:px-4 py-3 flex flex-col sm:flex-row items-start sm:items-center gap-2 sm:gap-4">
              <p class="text-xs lg:text-sm text-muted-foreground whitespace-nowrap">
                <span class="hidden sm:inline">Showing {{ (currentPage - 1) * limit + 1 }}-{{ Math.min(currentPage * limit, total) }} of {{ total }} help files</span>
                <span class="sm:hidden">{{ total }} results</span>
              </p>
              <div class="sm:ml-auto">
                <PaginationWithEllipsis
                  :current-page="currentPage"
                  :total-pages="totalPages"
                  @page-change="handlePageChange"
                />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>

    <!-- Help File Dialog -->
    <HelpFileDialog
      :open="showDialog"
      :help-file="selectedHelpFile"
      :loading="loadingHelpFile"
      @close="closeDialog"
    />
  </div>
</template>
