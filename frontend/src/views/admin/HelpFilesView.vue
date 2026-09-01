<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useQuery, useQueryClient } from '@tanstack/vue-query'
import { watchDebounced } from '@vueuse/core'
import { apiClient as api } from '@/services/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Search, Plus, Pencil, Trash2 } from 'lucide-vue-next'
import { useToast } from '@/composables/useToast'
import TipTapEditor from '@/components/forum/editor/TipTapEditor.vue'
import { ansiToHtmlWithStyles, htmlToAnsi } from '@/utils/ansiParser'

interface HelpPage {
  id: number
  title: string | null
  text: string | null
  last_update: string | null
  last_update_by: string | null
  category_id: number | null
  category_name?: string | null
  ip_number: string | null
}

interface Category {
  id: number
  name: string | null
  desc: string | null
}

const toast = useToast()
const route = useRoute()
const router = useRouter()

// Hardcoded categories based on MUD wikihelp.c
const HELP_CATEGORIES: Category[] = [
  { id: 0, name: 'General', desc: null },
  { id: 1, name: 'Redirect', desc: null },
  { id: 9, name: 'Class', desc: null },
  { id: 10, name: 'Class Skillsets', desc: null },
  { id: 16, name: 'Spec', desc: null },
  { id: 25, name: 'Race', desc: null },
]

const queryClient = useQueryClient()

// State
const categories = ref<Category[]>(HELP_CATEGORIES)
const searchQuery = ref('')
const debouncedSearchQuery = ref('')
const selectedCategory = ref<string>('all')
const currentPage = ref(1)

// Dialog states
const showCreateDialog = ref(false)
const showEditDialog = ref(false)
const showDeleteDialog = ref(false)
const showCategoryDialog = ref(false)
const editingPage = ref<HelpPage | null>(null)
const deletingPageId = ref<number | null>(null)

// Form states
const formTitle = ref('')
const formText = ref('')
const formCategoryId = ref<number>(0)
const categoryFormName = ref('')
const categoryFormDesc = ref('')
const editingCategory = ref<Category | null>(null)

// Debounce search query (300ms)
watchDebounced(
  searchQuery,
  (newValue) => {
    debouncedSearchQuery.value = newValue
    currentPage.value = 1 // Reset to first page on search
  },
  { debounce: 300 },
)

// Separate loading state for form submissions
const submitting = ref(false)

// TanStack Query for fetching help pages
const { data: helpData, isLoading: loading } = useQuery({
  queryKey: ['admin-help-pages', debouncedSearchQuery, selectedCategory, currentPage] as const,
  queryFn: async ({ queryKey }) => {
    const [, searchTerm, category, page] = queryKey

    // If search query exists and is >= 2 chars, use search endpoint
    if (searchTerm && searchTerm.length >= 2) {
      const response = await api.get('/api/content/help/search', {
        params: { q: searchTerm },
      })
      return {
        pages: response.data.results,
        pagination: {
          page: 1,
          total: response.data.results.length,
          totalPages: 1,
          limit: response.data.results.length,
        },
      }
    }

    // Otherwise use paginated list endpoint
    const categoryId = category === 'all' ? undefined : parseInt(category)
    const response = await api.get('/api/content/help', {
      params: {
        page: page,
        limit: 50,
        category_id: categoryId,
      },
    })
    return response.data
  },
  staleTime: 1000 * 60 * 5, // 5 minutes
})

// Computed values from query data
const pages = computed(() => helpData.value?.pages ?? [])
const filteredPages = computed(() => pages.value) // No client-side filtering
const totalPages = computed(() => helpData.value?.pagination.totalPages ?? 1)
const totalItems = computed(() => helpData.value?.pagination.total ?? 0)

// Ellipsis pagination
const paginationNumbers = computed(() => {
  const total = totalPages.value
  const current = currentPage.value
  const delta = 2 // Pages to show on each side of current page
  const range: (number | string)[] = []

  if (total <= 7) {
    // Show all pages if 7 or fewer
    for (let i = 1; i <= total; i++) {
      range.push(i)
    }
    return range
  }

  // Always show first page
  range.push(1)

  // Calculate range around current page
  const start = Math.max(2, current - delta)
  const end = Math.min(total - 1, current + delta)

  // Add ellipsis after first page if needed
  if (start > 2) {
    range.push('...')
  }

  // Add pages around current
  for (let i = start; i <= end; i++) {
    range.push(i)
  }

  // Add ellipsis before last page if needed
  if (end < total - 1) {
    range.push('...')
  }

  // Always show last page
  range.push(total)

  return range
})

// Categories are hardcoded, no need to load from API
// async function loadCategories() removed

// CRUD operations
async function createPage() {
  if (!formTitle.value || !formText.value) {
    toast.show({
      title: 'Validation Error',
      message: 'Title and text are required',
      type: 'error',
    })
    return
  }

  submitting.value = true
  try {
    // Convert HTML back to ANSI codes for database storage
    const ansiText = htmlToAnsi(formText.value)
    await api.post('/api/content/help', {
      title: formTitle.value,
      text: ansiText,
      category_id: formCategoryId.value,
    })

    toast.show({
      title: 'Success',
      message: 'Help page created successfully',
    })

    showCreateDialog.value = false
    resetForm()
    await queryClient.invalidateQueries({ queryKey: ['admin-help-pages'] })
  } catch (error: any) {
    toast.show({
      title: 'Error',
      message:
        error.response?.data?.error?.message || error.message || 'Failed to create help page',
      type: 'error',
    })
  } finally {
    submitting.value = false
  }
}

async function updatePage() {
  if (!editingPage.value || !formTitle.value || !formText.value) {
    toast.show({
      title: 'Validation Error',
      message: 'Title and text are required',
      type: 'error',
    })
    return
  }

  submitting.value = true
  try {
    // Convert HTML back to ANSI codes for database storage
    const ansiText = htmlToAnsi(formText.value)
    await api.patch(`/api/content/help/${editingPage.value.id}`, {
      title: formTitle.value,
      text: ansiText,
      category_id: formCategoryId.value,
    })

    toast.show({
      title: 'Success',
      message: 'Help page updated successfully',
    })

    showEditDialog.value = false
    editingPage.value = null
    resetForm()
    await queryClient.invalidateQueries({ queryKey: ['admin-help-pages'] })
  } catch (error: any) {
    toast.show({
      title: 'Error',
      message:
        error.response?.data?.error?.message || error.message || 'Failed to update help page',
      type: 'error',
    })
  } finally {
    submitting.value = false
  }
}

async function deletePage() {
  if (!deletingPageId.value) return

  submitting.value = true
  try {
    await api.delete(`/api/content/help/${deletingPageId.value}`)

    toast.show({
      title: 'Success',
      message: 'Help page deleted successfully',
    })

    showDeleteDialog.value = false
    deletingPageId.value = null
    await queryClient.invalidateQueries({ queryKey: ['admin-help-pages'] })
  } catch (error: any) {
    toast.show({
      title: 'Error',
      message:
        error.response?.data?.error?.message || error.message || 'Failed to delete help page',
      type: 'error',
    })
  } finally {
    submitting.value = false
  }
}

// Category CRUD
async function createCategory() {
  if (!categoryFormName.value) {
    toast.show({
      title: 'Validation Error',
      message: 'Category name is required',
      type: 'error',
    })
    return
  }

  submitting.value = true
  try {
    await api.post('/api/content/categories', {
      name: categoryFormName.value,
      desc: categoryFormDesc.value,
    })

    toast.show({
      title: 'Success',
      message: 'Category created successfully',
    })

    resetCategoryForm()
    // Categories are hardcoded, no reload needed
  } catch (error: any) {
    toast.show({
      title: 'Error',
      message: error.response?.data?.error?.message || error.message || 'Failed to create category',
      type: 'error',
    })
  } finally {
    submitting.value = false
  }
}

async function updateCategory() {
  if (!editingCategory.value || !categoryFormName.value) {
    toast.show({
      title: 'Validation Error',
      message: 'Category name is required',
      type: 'error',
    })
    return
  }

  submitting.value = true
  try {
    await api.patch(`/api/content/categories/${editingCategory.value.id}`, {
      name: categoryFormName.value,
      desc: categoryFormDesc.value,
    })

    toast.show({
      title: 'Success',
      message: 'Category updated successfully',
    })

    editingCategory.value = null
    resetCategoryForm()
    // Categories are hardcoded, no reload needed
  } catch (error: any) {
    toast.show({
      title: 'Error',
      message: error.response?.data?.error?.message || error.message || 'Failed to update category',
      type: 'error',
    })
  } finally {
    submitting.value = false
  }
}

async function deleteCategory(categoryId: number) {
  if (
    !confirm(
      'Are you sure? This will remove the category from all help pages (but not delete the pages).',
    )
  ) {
    return
  }

  submitting.value = true
  try {
    await api.delete(`/api/content/categories/${categoryId}`)

    toast.show({
      title: 'Success',
      message: 'Category deleted successfully',
    })

    // Categories are hardcoded, no reload needed
    await queryClient.invalidateQueries({ queryKey: ['admin-help-pages'] })
  } catch (error: any) {
    toast.show({
      title: 'Error',
      message: error.response?.data?.error?.message || error.message || 'Failed to delete category',
      type: 'error',
    })
  } finally {
    submitting.value = false
  }
}

// Helper functions
function resetForm() {
  formTitle.value = ''
  formText.value = ''
  formCategoryId.value = 0
}

function resetCategoryForm() {
  categoryFormName.value = ''
  categoryFormDesc.value = ''
}

function openCreateDialog() {
  resetForm()
  showCreateDialog.value = true
}

function openEditDialog(page: HelpPage) {
  editingPage.value = page
  formTitle.value = page.title || ''
  // Convert ANSI codes to HTML for TipTap editor
  const ansiText = page.text || ''
  formText.value = ansiToHtmlWithStyles(ansiText)
  formCategoryId.value = page.category_id ?? 0
  showEditDialog.value = true
}

function openDeleteDialog(pageId: number) {
  deletingPageId.value = pageId
  showDeleteDialog.value = true
}

function editCategory(category: Category) {
  editingCategory.value = category
  categoryFormName.value = category.name || ''
  categoryFormDesc.value = category.desc || ''
}

function cancelEditCategory() {
  editingCategory.value = null
  resetCategoryForm()
}

function formatDate(date: string | null) {
  if (!date) return 'N/A'
  return new Date(date).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function changePage(page: number) {
  currentPage.value = page
  // TanStack Query will refetch automatically
}

// Handle ?edit=id query param from Guide page
async function handleEditQueryParam() {
  const editId = route.query.edit
  if (editId) {
    try {
      const response = await api.get(`/api/content/help/${editId}`)
      if (response.data) {
        openEditDialog(response.data)
      }
    } catch (error) {
      console.error('Failed to load help file for editing:', error)
    }
    // Clear the query param
    router.replace({ query: {} })
  }
}

onMounted(() => {
  // TanStack Query loads data automatically
  handleEditQueryParam()
})
</script>

<template>
  <div class="p-6">
    <div class="flex justify-between items-center mb-6">
      <div>
        <h1 class="text-3xl font-bold text-white">Help Files Management</h1>
        <p class="text-muted-foreground mt-1">
          Manage in-game help documentation ({{ totalItems }} total)
        </p>
      </div>
      <div class="flex gap-2">
        <Button @click="openCreateDialog">
          <Plus class="w-4 h-4 mr-2" />
          New Help Page
        </Button>
      </div>
    </div>

    <!-- Filters -->
    <div class="flex gap-4 mb-6">
      <div class="relative flex-1">
        <Search class="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          v-model="searchQuery"
          placeholder="Search help pages..."
          class="pl-10"
        />
      </div>
      <Select v-model="selectedCategory">
        <SelectTrigger class="w-64">
          <SelectValue placeholder="All Categories" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All Categories</SelectItem>
          <SelectItem
            v-for="cat in categories"
            :key="cat.id"
            :value="cat.id.toString()"
          >
            {{ cat.name }}
          </SelectItem>
        </SelectContent>
      </Select>
    </div>

    <!-- Table -->
    <div class="border border-gray-800 rounded-lg overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Title</TableHead>
            <TableHead>Category</TableHead>
            <TableHead>Last Updated</TableHead>
            <TableHead>Updated By</TableHead>
            <TableHead class="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          <TableRow v-if="loading">
            <TableCell colspan="5" class="text-center text-muted-foreground">
              Loading...
            </TableCell>
          </TableRow>
          <TableRow v-else-if="filteredPages.length === 0">
            <TableCell colspan="5" class="text-center text-muted-foreground">
              No help pages found
            </TableCell>
          </TableRow>
          <TableRow v-for="page in filteredPages" :key="page.id">
            <TableCell class="font-medium">{{ page.title }}</TableCell>
            <TableCell>
              <span
                v-if="page.category_name"
                class="px-2 py-1 text-xs rounded bg-blue-500/20 text-blue-400"
              >
                {{ page.category_name }}
              </span>
              <span v-else class="text-muted-foreground text-sm">
                Uncategorized
              </span>
            </TableCell>
            <TableCell class="text-sm text-muted-foreground">
              {{ formatDate(page.last_update) }}
            </TableCell>
            <TableCell class="text-sm text-muted-foreground">
              {{ page.last_update_by || 'N/A' }}
            </TableCell>
            <TableCell class="text-right">
              <div class="flex justify-end gap-2">
                <Button
                  @click="openEditDialog(page)"
                  variant="ghost"
                  size="sm"
                >
                  <Pencil class="w-4 h-4" />
                </Button>
                <Button
                  @click="openDeleteDialog(page.id)"
                  variant="ghost"
                  size="sm"
                >
                  <Trash2 class="w-4 h-4 text-red-500" />
                </Button>
              </div>
            </TableCell>
          </TableRow>
        </TableBody>
      </Table>
    </div>

    <!-- Pagination -->
    <div v-if="totalPages > 1" class="flex justify-end gap-2 mt-6">
      <Button
        @click="changePage(currentPage - 1)"
        :disabled="currentPage === 1"
        variant="outline"
        size="sm"
      >
        Previous
      </Button>

      <template v-for="(page, index) in paginationNumbers" :key="index">
        <Button
          v-if="typeof page === 'number'"
          @click="changePage(page)"
          :variant="currentPage === page ? 'default' : 'outline'"
          size="sm"
          class="min-w-[2.5rem]"
        >
          {{ page }}
        </Button>
        <span
          v-else
          class="px-2 py-2 text-sm text-muted-foreground flex items-center"
        >
          {{ page }}
        </span>
      </template>

      <Button
        @click="changePage(currentPage + 1)"
        :disabled="currentPage === totalPages"
        variant="outline"
        size="sm"
      >
        Next
      </Button>
    </div>

    <!-- Create Dialog -->
    <Dialog v-model:open="showCreateDialog">
      <DialogContent class="!max-w-6xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Create Help Page</DialogTitle>
          <DialogDescription>
            Add a new help file to the in-game documentation
          </DialogDescription>
        </DialogHeader>
        <div class="space-y-4">
          <div>
            <label class="text-sm font-medium text-gray-200 mb-2 block">
              Title
            </label>
            <Input v-model="formTitle" placeholder="e.g., spells, combat, guilds" />
          </div>
          <div>
            <label class="text-sm font-medium text-gray-200 mb-2 block">
              Category
            </label>
            <Select v-model="formCategoryId">
              <SelectTrigger>
                <SelectValue placeholder="Select category" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem
                  v-for="cat in categories"
                  :key="cat.id"
                  :value="cat.id"
                >
                  {{ cat.name }}
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <label class="text-sm font-medium text-gray-200 mb-2 block">
              Content
            </label>
            <div class="text-xs text-muted-foreground mb-2">
              Use the color picker for MUD ANSI colors
            </div>
            <TipTapEditor
              v-model="formText"
              placeholder="Enter help file content here..."
              :min-height="400"
            />
          </div>
        </div>
        <DialogFooter>
          <Button @click="showCreateDialog = false" variant="outline">
            Cancel
          </Button>
          <Button @click="createPage" :disabled="submitting">
            Create Help Page
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <!-- Edit Dialog -->
    <Dialog v-model:open="showEditDialog">
      <DialogContent class="!max-w-6xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit Help Page</DialogTitle>
          <DialogDescription>
            Update help file content and settings
          </DialogDescription>
        </DialogHeader>
        <div class="space-y-4">
          <div>
            <label class="text-sm font-medium text-gray-200 mb-2 block">
              Title
            </label>
            <Input v-model="formTitle" />
          </div>
          <div>
            <label class="text-sm font-medium text-gray-200 mb-2 block">
              Category
            </label>
            <Select v-model="formCategoryId">
              <SelectTrigger>
                <SelectValue placeholder="Select category" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem
                  v-for="cat in categories"
                  :key="cat.id"
                  :value="cat.id"
                >
                  {{ cat.name }}
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <label class="text-sm font-medium text-gray-200 mb-2 block">
              Content
            </label>
            <div class="text-xs text-muted-foreground mb-2">
              Use the color picker for MUD ANSI colors
            </div>
            <TipTapEditor
              v-model="formText"
              placeholder="Enter help file content here..."
              :min-height="400"
            />
          </div>
        </div>
        <DialogFooter>
          <Button @click="showEditDialog = false" variant="outline">
            Cancel
          </Button>
          <Button @click="updatePage" :disabled="submitting">
            Save Changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <!-- Delete Dialog -->
    <AlertDialog v-model:open="showDeleteDialog">
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete Help Page</AlertDialogTitle>
          <AlertDialogDescription>
            Are you sure you want to delete this help page? This action cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel @click="showDeleteDialog = false">
            Cancel
          </AlertDialogCancel>
          <AlertDialogAction @click="deletePage" class="bg-red-600 hover:bg-red-700">
            Delete
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>

    <!-- Category Management Dialog -->
    <Dialog v-model:open="showCategoryDialog">
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Manage Categories</DialogTitle>
          <DialogDescription>
            Create and manage help file categories
          </DialogDescription>
        </DialogHeader>
        <div class="space-y-4">
          <!-- Create/Edit Form -->
          <div class="border border-gray-800 rounded-lg p-4 space-y-3">
            <h3 class="font-medium text-white">
              {{ editingCategory ? 'Edit Category' : 'Create Category' }}
            </h3>
            <div>
              <label class="text-sm text-gray-400 mb-1 block">Name</label>
              <Input v-model="categoryFormName" placeholder="Category name" />
            </div>
            <div>
              <label class="text-sm text-gray-400 mb-1 block">
                Description (optional)
              </label>
              <Input
                v-model="categoryFormDesc"
                placeholder="Category description"
              />
            </div>
            <div class="flex gap-2">
              <Button
                v-if="editingCategory"
                @click="updateCategory"
                :disabled="submitting"
                size="sm"
              >
                Update Category
              </Button>
              <Button
                v-else
                @click="createCategory"
                :disabled="submitting"
                size="sm"
              >
                Create Category
              </Button>
              <Button
                v-if="editingCategory"
                @click="cancelEditCategory"
                variant="outline"
                size="sm"
              >
                Cancel
              </Button>
            </div>
          </div>

          <!-- Categories List -->
          <div class="space-y-2">
            <h3 class="font-medium text-white">Existing Categories</h3>
            <div v-if="categories.length === 0" class="text-sm text-muted-foreground">
              No categories created yet
            </div>
            <div
              v-for="cat in categories"
              :key="cat.id"
              class="flex items-center justify-between p-3 border border-gray-800 rounded-lg hover:bg-gray-900/50"
            >
              <div>
                <div class="font-medium text-white">{{ cat.name }}</div>
                <div v-if="cat.desc" class="text-sm text-muted-foreground">
                  {{ cat.desc }}
                </div>
              </div>
              <div class="flex gap-2">
                <Button @click="editCategory(cat)" variant="ghost" size="sm">
                  <Pencil class="w-4 h-4" />
                </Button>
                <Button
                  @click="deleteCategory(cat.id)"
                  variant="ghost"
                  size="sm"
                >
                  <Trash2 class="w-4 h-4 text-red-500" />
                </Button>
              </div>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button @click="showCategoryDialog = false" variant="outline">
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </div>
</template>
