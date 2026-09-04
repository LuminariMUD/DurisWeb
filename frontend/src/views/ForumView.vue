<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useQueryClient } from '@tanstack/vue-query'
import { useHead } from '@unhead/vue'
import { forumApi, adminApi } from '@/services/api'
import { useAuth } from '@/composables/useAuth'
import { useToast } from '@/composables/useToast'
import { useCategories } from '@/composables/useCategories'
import type { ForumCategory, CreateCategoryRequest, UpdateCategoryRequest } from '@/types'

useHead({
  title: 'DurisMUD | Forum',
})
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Switch } from '@/components/ui/switch'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Search,
  Pencil,
  Save,
  X,
  Archive,
  RotateCcw,
  Trash2,
  Shield,
  GripVertical,
  Plus,
  MessageSquare,
  FileText,
  MessagesSquare,
  Clock,
} from 'lucide-vue-next'
import Sortable from 'sortablejs'
import { ROLE_OPTIONS } from '@/utils/roleMapping'
import CategoryPermissionDialog from '@/components/admin/CategoryPermissionDialog.vue'
import DeleteCategoryDialog from '@/components/forum/DeleteCategoryDialog.vue'
import ArchiveCategoryDialog from '@/components/forum/ArchiveCategoryDialog.vue'
import * as LucideIcons from 'lucide-vue-next'
import { parseAnsiToHtml } from '@/utils/ansiParser'

const router = useRouter()
const { isAuthenticated, login, user } = useAuth()
const toast = useToast()
const queryClient = useQueryClient()

const username = ref('')
const password = ref('')
const loginError = ref<string | null>(null)
const isLoggingIn = ref(false)

// Edit mode state (only for users authorized to moderate the forum)
const editMode = ref(false)
// Match the permission enforced by the category-management API. The moderation
// threshold is configurable, so character level alone is not authorization.
const canManageForumCategories = computed(() => Boolean(user.value?.permissions.canModerate))

// Use TanStack Query for categories (switches between admin and public API based on editMode)
const {
  data: categories,
  isLoading,
  error: queryError,
} = useCategories(computed(() => editMode.value && canManageForumCategories.value))
const error = computed(() => (queryError.value ? 'Failed to load categories' : null))

// Editing states
const editingCategoryId = ref<number | null>(null)
const creatingCategory = ref(false)
const sortableContainer = ref<HTMLElement | null>(null)

// Permission dialog
const showPermissionDialog = ref(false)
const selectedCategory = ref<ForumCategory | null>(null)

// Create/edit form data
const formData = ref({
  name: '',
  description: '',
  accessType: 'public' as ForumCategory['access_type'],
  minLevel: '',
  guildName: '',
  parentId: 'none',
  sortOrder: '',
  icon: '',
})

// Guild autocomplete
const guildSearchQuery = ref('')
const guildSearchResults = ref<string[]>([])
const isSearchingGuilds = ref(false)
const showGuildDropdown = ref(false)
let guildSearchTimeout: ReturnType<typeof setTimeout> | null = null

async function searchGuilds(query: string) {
  if (guildSearchTimeout) {
    clearTimeout(guildSearchTimeout)
  }

  if (!query || query.length < 1) {
    guildSearchResults.value = []
    showGuildDropdown.value = false
    return
  }

  guildSearchTimeout = setTimeout(async () => {
    isSearchingGuilds.value = true
    showGuildDropdown.value = true
    try {
      guildSearchResults.value = await forumApi.searchGuilds(query)
    } catch {
      guildSearchResults.value = []
    } finally {
      isSearchingGuilds.value = false
    }
  }, 300)
}

watch(
  () => guildSearchQuery.value,
  (query) => {
    searchGuilds(query)
  },
)

// Invalidate categories query to trigger refetch
function invalidateCategories() {
  queryClient.invalidateQueries({ queryKey: ['forum-categories', false] })
  queryClient.invalidateQueries({ queryKey: ['forum-categories', true] })
}

function getCategoryBadgeVariant(accessType: string): 'default' | 'secondary' | 'outline' {
  switch (accessType) {
    case 'god':
    case 'immortal':
      return 'default'
    case 'guild':
      return 'secondary'
    default:
      return 'outline'
  }
}

function formatDate(dateString: string | null): string {
  if (!dateString) return 'Never'
  const date = new Date(dateString)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMs / 3600000)
  const diffDays = Math.floor(diffMs / 86400000)

  if (diffMins < 1) return 'Just now'
  if (diffMins < 60) return `${diffMins}m ago`
  if (diffHours < 24) return `${diffHours}h ago`
  if (diffDays < 7) return `${diffDays}d ago`
  return date.toLocaleDateString()
}

async function handleLogin() {
  isLoggingIn.value = true
  loginError.value = null

  const success = await login(username.value, password.value)

  if (success) {
    // Reload categories after successful login
    invalidateCategories()
  } else {
    loginError.value = 'Invalid credentials'
  }

  isLoggingIn.value = false
}

// Toggle edit mode
function toggleEditMode() {
  editMode.value = !editMode.value
  if (!editMode.value) {
    creatingCategory.value = false
    editingCategoryId.value = null
  }
  // Query will auto-update when editMode changes
}

// Convert icon name to PascalCase (e.g., "dna" -> "Dna", "message-square" -> "MessageSquare")
function toPascalCase(str: string): string {
  return str
    .split('-')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join('')
}

// Get Lucide icon component
function getIconComponent(iconName: string | null) {
  if (!iconName) return null
  // Try exact match first, then PascalCase conversion
  return (LucideIcons as any)[iconName] || (LucideIcons as any)[toPascalCase(iconName)] || null
}

// Available parents (top-level categories only)
const availableParents = computed(() => {
  return (categories.value || []).filter(
    (c) => c.parent_id === null && c.id !== editingCategoryId.value,
  )
})

// Start creating new category
function startCreating() {
  creatingCategory.value = true
  editingCategoryId.value = null
  formData.value = {
    name: '',
    description: '',
    accessType: 'public',
    minLevel: '',
    guildName: '',
    parentId: 'none',
    sortOrder: '',
    icon: '',
  }
  guildSearchQuery.value = ''
  guildSearchResults.value = []
  showGuildDropdown.value = false
}

// Let an administrator recover an empty forum without first finding edit mode.
function startInitialSetup() {
  editMode.value = true
  startCreating()
}

// Start editing category
function startEditing(category: ForumCategory) {
  editingCategoryId.value = category.id
  creatingCategory.value = false
  formData.value = {
    name: category.name,
    description: category.description || '',
    accessType: category.access_type,
    minLevel: category.min_level?.toString() || '',
    guildName: category.guild_name || '',
    parentId: category.parent_id?.toString() || 'none',
    sortOrder: category.sort_order.toString(),
    icon: category.icon || '',
  }
  guildSearchQuery.value = category.guild_name || ''
  guildSearchResults.value = []
  showGuildDropdown.value = false
}

// Cancel editing
function cancelEdit() {
  editingCategoryId.value = null
  creatingCategory.value = false
}

// Save category (create or update)
async function saveCategory() {
  try {
    // Filter out legacy access types
    const accessType = ['immortal', 'god'].includes(formData.value.accessType)
      ? 'role_based'
      : (formData.value.accessType as
          | 'public'
          | 'authenticated'
          | 'role_based'
          | 'guild'
          | 'custom_acl')

    if (creatingCategory.value) {
      const request: CreateCategoryRequest = {
        name: formData.value.name.trim(),
        description: formData.value.description.trim() || null,
        accessType: accessType,
        minLevel: formData.value.minLevel ? parseInt(formData.value.minLevel) : undefined,
        guildName: formData.value.guildName.trim() || undefined,
        parentId:
          formData.value.parentId && formData.value.parentId !== 'none'
            ? parseInt(formData.value.parentId)
            : undefined,
        sortOrder: formData.value.sortOrder ? parseInt(formData.value.sortOrder) : undefined,
        icon: formData.value.icon.trim() || undefined,
      }
      await adminApi.createCategory(request)
      toast.success('Category created successfully', 'Success')
    } else if (editingCategoryId.value) {
      const updates: UpdateCategoryRequest = {
        name: formData.value.name.trim(),
        description: formData.value.description.trim() || null,
        accessType: accessType,
        minLevel: formData.value.minLevel ? parseInt(formData.value.minLevel) : null,
        guildName: formData.value.guildName.trim() || null,
        parentId:
          formData.value.parentId && formData.value.parentId !== 'none'
            ? parseInt(formData.value.parentId)
            : null,
        sortOrder: formData.value.sortOrder ? parseInt(formData.value.sortOrder) : undefined,
        icon: formData.value.icon.trim() || null,
      }
      await adminApi.updateCategory(editingCategoryId.value, updates)
      toast.success('Category updated successfully', 'Success')
    }

    cancelEdit()
    invalidateCategories()
  } catch (err: any) {
    toast.error(err.response?.data?.error || 'Failed to save category', 'Error')
  }
}

// Archive category state
const archiveCategoryDialogRef = ref<InstanceType<typeof ArchiveCategoryDialog> | null>(null)
const categoryToArchive = ref<ForumCategory | null>(null)

// Open archive category dialog
function openArchiveDialog(category: ForumCategory, event: Event) {
  event.stopPropagation()
  categoryToArchive.value = category
  archiveCategoryDialogRef.value?.open()
}

// Confirm archive category
async function confirmArchiveCategory() {
  if (!categoryToArchive.value) return

  try {
    await adminApi.archiveCategory(categoryToArchive.value.id)
    toast.success(`Category "${categoryToArchive.value.name}" archived`, 'Success')
    invalidateCategories()
    queryClient.invalidateQueries({ queryKey: ['archived-categories'] })
    categoryToArchive.value = null
  } catch (err: any) {
    toast.error(err.response?.data?.error || 'Failed to archive category', 'Error')
  }
}

// Restore category
async function restoreCategory(category: ForumCategory, event: Event) {
  event.stopPropagation()

  try {
    await adminApi.restoreCategory(category.id)
    toast.success(`Category "${category.name}" restored`, 'Success')
    invalidateCategories()
  } catch (err: any) {
    toast.error(err.response?.data?.error || 'Failed to restore category', 'Error')
  }
}

// Delete category state
const deleteCategoryDialogRef = ref<InstanceType<typeof DeleteCategoryDialog> | null>(null)
const categoryToDelete = ref<ForumCategory | null>(null)

// Open delete category dialog
function openDeleteDialog(category: ForumCategory, event: Event) {
  console.log('[DELETE] Opening delete dialog for category:', category.name, 'ID:', category.id)
  event.stopPropagation()
  categoryToDelete.value = category
  console.log('[DELETE] categoryToDelete set to:', categoryToDelete.value?.name)
  console.log('[DELETE] deleteCategoryDialogRef exists?', !!deleteCategoryDialogRef.value)
  deleteCategoryDialogRef.value?.open()
  console.log('[DELETE] Dialog open() called')
}

// Confirm delete category
async function confirmDeleteCategory() {
  console.log('[DELETE] confirmDeleteCategory called')
  console.log(
    '[DELETE] categoryToDelete value:',
    categoryToDelete.value?.name,
    'ID:',
    categoryToDelete.value?.id,
  )

  if (!categoryToDelete.value) {
    console.log('[DELETE] No category to delete, returning early')
    return
  }

  try {
    console.log('[DELETE] Calling API deleteCategory with ID:', categoryToDelete.value.id)
    await adminApi.deleteCategory(categoryToDelete.value.id)
    console.log('[DELETE] API call successful')

    toast.success(`Category "${categoryToDelete.value.name}" deleted`, 'Success')
    console.log('[DELETE] Success toast shown')

    console.log('[DELETE] Invalidating categories cache')
    invalidateCategories()

    categoryToDelete.value = null
    console.log('[DELETE] categoryToDelete cleared')
  } catch (err: any) {
    console.error('[DELETE] API call failed:', err)
    console.error('[DELETE] Error response:', err.response?.data)
    toast.error(err.response?.data?.error || 'Failed to delete category', 'Error')
  }
}

// Open permission dialog
function openPermissionDialog(category: ForumCategory, event: Event) {
  event.stopPropagation()
  selectedCategory.value = category
  showPermissionDialog.value = true
}

// Handle permission success
function handlePermissionSuccess() {
  toast.success('Permissions updated successfully', 'Success')
  invalidateCategories()
}

// Setup drag and drop - watch for edit mode changes
let sortableInstance: Sortable | null = null

watch([editMode, sortableContainer], ([isEditMode, container]: [boolean, HTMLElement | null]) => {
  // Destroy existing instance
  if (sortableInstance) {
    sortableInstance.destroy()
    sortableInstance = null
  }

  // Create new instance when in edit mode
  if (isEditMode && container) {
    sortableInstance = new Sortable(container, {
      animation: 150,
      handle: '.drag-handle',
      onEnd: async (evt) => {
        const oldIndex = evt.oldIndex
        const newIndex = evt.newIndex

        if (
          oldIndex !== undefined &&
          newIndex !== undefined &&
          oldIndex !== newIndex &&
          categories.value
        ) {
          // Create a mutable copy of the array
          const reorderedCategories = [...categories.value]

          // Move the item in the array
          const movedItem = reorderedCategories[oldIndex]
          if (!movedItem) return

          reorderedCategories.splice(oldIndex, 1)
          reorderedCategories.splice(newIndex, 0, movedItem)

          // Optimistically update the cache
          queryClient.setQueryData(
            ['forum-categories', editMode.value && canManageForumCategories.value],
            reorderedCategories,
          )

          // Save new order
          const orders = reorderedCategories.map((cat, index) => ({
            id: cat.id,
            sortOrder: index * 10,
          }))

          try {
            await adminApi.reorderCategories(orders)
            toast.success('Category order saved', 'Success')
          } catch {
            toast.error('Failed to save order', 'Error')
            invalidateCategories() // Reload on error
          }
        }
      },
    })
  }
})

// No need for onMounted - useCategories will auto-fetch on mount
</script>

<template>
  <div>
    <!-- Header -->
    <div class="mb-6">
      <div class="flex items-center justify-between mb-6">
        <div>
          <h1 class="text-3xl font-bold">DurisMUD Forums</h1>
          <p class="text-muted-foreground mt-2">
            Community discussions for players and immortals
          </p>
        </div>
        <div class="flex items-center gap-3">
          <!-- Edit Mode Toggle (forum moderators only) -->
          <div v-if="isAuthenticated && canManageForumCategories" class="flex items-center gap-2">
            <Label for="edit-mode" class="text-sm">Edit Mode</Label>
            <Switch id="edit-mode" :model-value="editMode" @update:model-value="toggleEditMode" />
          </div>

          <Button
            v-if="isAuthenticated"
            variant="outline"
            @click="router.push('/forum/search')"
          >
            <Search class="h-4 w-4 mr-2" />
            Search
          </Button>
        </div>
      </div>
    </div>

    <!-- Loading State -->
    <div v-if="isLoading" class="space-y-4">
      <Card v-for="i in 3" :key="i">
        <CardHeader>
          <Skeleton class="h-6 w-48" />
          <Skeleton class="h-4 w-96 mt-2" />
        </CardHeader>
      </Card>
    </div>

    <!-- Login Form (when not authenticated) -->
    <Card v-else-if="error && error.includes('authenticated')" class="max-w-md mx-auto">
      <CardHeader>
        <CardTitle>Login to Forum</CardTitle>
        <CardDescription>Enter your MUD password to access the forums</CardDescription>
      </CardHeader>
      <CardContent>
        <form @submit.prevent="handleLogin" class="space-y-4">
          <div class="space-y-2">
            <Label for="username">Username</Label>
            <Input
              id="username"
              type="text"
              v-model="username"
              placeholder="Enter your MUD username"
              :disabled="isLoggingIn"
              required
            />
          </div>

          <div class="space-y-2">
            <Label for="password">Password</Label>
            <Input
              id="password"
              type="password"
              v-model="password"
              placeholder="Enter your MUD password"
              :disabled="isLoggingIn"
              required
            />
          </div>

          <Alert v-if="loginError" variant="destructive">
            <AlertDescription>{{ loginError }}</AlertDescription>
          </Alert>

          <Button type="submit" class="w-full" :disabled="isLoggingIn">
            {{ isLoggingIn ? 'Logging in...' : 'Login' }}
          </Button>
        </form>
      </CardContent>
    </Card>

    <!-- Other Error State -->
    <Card v-else-if="error" class="border-destructive">
      <CardContent class="pt-6">
        <p class="text-destructive">{{ error }}</p>
        <Button @click="invalidateCategories" class="mt-4">Retry</Button>
      </CardContent>
    </Card>

    <!-- Categories List -->
    <div v-else class="space-y-4">
      <!-- Create New Category Card (edit mode) -->
      <Card v-if="editMode && creatingCategory" class="border-primary">
        <CardHeader>
          <CardTitle class="flex items-center justify-between">
            <span>New Category</span>
            <Button variant="ghost" size="sm" @click="cancelEdit">
              <X class="w-4 h-4" />
            </Button>
          </CardTitle>
        </CardHeader>
        <CardContent class="space-y-4">
          <div class="grid grid-cols-2 gap-4">
            <div class="space-y-2">
              <Label for="create-name">Name *</Label>
              <Input id="create-name" v-model="formData.name" placeholder="Category name" />
            </div>
            <div class="space-y-2">
              <Label for="create-icon">Icon (Lucide)</Label>
              <Input id="create-icon" v-model="formData.icon" placeholder="e.g., MessageSquare" />
              <p class="text-xs text-muted-foreground">
                Browse icons at <a href="https://lucide.dev/icons/" target="_blank" rel="noopener noreferrer" class="text-primary hover:underline">lucide.dev/icons</a>
              </p>
            </div>
          </div>

          <div class="space-y-2">
            <Label for="create-desc">Description</Label>
            <Textarea id="create-desc" v-model="formData.description" placeholder="Category description" rows="2" />
          </div>

          <div class="grid grid-cols-2 gap-4">
            <div class="space-y-2">
              <Label for="create-access">Access Type</Label>
              <Select v-model="formData.accessType">
                <SelectTrigger id="create-access">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="public">Public</SelectItem>
                  <SelectItem value="authenticated">Authenticated</SelectItem>
                  <SelectItem value="role_based">Role-Based</SelectItem>
                  <SelectItem value="guild">Guild</SelectItem>
                  <SelectItem value="custom_acl">Custom ACL</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div v-if="formData.accessType === 'role_based'" class="space-y-2">
              <Label for="create-level">Min Level</Label>
              <Select v-model="formData.minLevel">
                <SelectTrigger id="create-level">
                  <SelectValue placeholder="Select level" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem v-for="option in ROLE_OPTIONS" :key="option.value" :value="option.value.toString()">
                    {{ option.label }}
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div v-if="formData.accessType === 'guild'" class="space-y-2 relative">
              <Label for="create-guild">Guild Name</Label>
              <!-- Show selected guild with colors, or input for searching -->
              <div v-if="formData.guildName && !showGuildDropdown" class="flex items-center gap-2">
                <div
                  class="flex-1 px-3 py-2 border border-input rounded-md bg-background"
                  v-html="parseAnsiToHtml(formData.guildName)"
                ></div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  @click="() => { formData.guildName = ''; guildSearchQuery = ''; showGuildDropdown = true }"
                >
                  <X class="w-4 h-4" />
                </Button>
              </div>
              <Input
                v-else
                id="create-guild"
                v-model="guildSearchQuery"
                placeholder="Type to search guild..."
                autocomplete="off"
                @input="formData.guildName = ''"
                @focus="showGuildDropdown = true"
              />
              <div
                v-if="showGuildDropdown && guildSearchQuery.length >= 1"
                class="absolute z-50 mt-1 w-full rounded-md border bg-popover shadow-lg"
              >
                <div class="max-h-[200px] overflow-y-auto p-1">
                  <div v-if="isSearchingGuilds" class="py-2 px-3 text-sm text-muted-foreground">
                    Searching...
                  </div>
                  <div v-else-if="guildSearchResults.length === 0" class="py-2 px-3 text-sm text-muted-foreground">
                    No guilds found
                  </div>
                  <button
                    v-for="guild in guildSearchResults"
                    :key="guild"
                    type="button"
                    class="w-full text-left px-3 py-2 text-sm rounded-sm hover:bg-accent hover:text-accent-foreground cursor-pointer"
                    @click="() => { formData.guildName = guild; guildSearchQuery = guild; showGuildDropdown = false }"
                    v-html="parseAnsiToHtml(guild)"
                  >
                  </button>
                </div>
              </div>
            </div>

            <div class="space-y-2">
              <Label for="create-parent">Parent Category</Label>
              <Select v-model="formData.parentId">
                <SelectTrigger id="create-parent">
                  <SelectValue placeholder="Top-level" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Top-level</SelectItem>
                  <SelectItem v-for="cat in availableParents" :key="cat.id" :value="cat.id.toString()">
                    {{ cat.name }}
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div class="flex gap-2">
            <Button @click="saveCategory">
              <Save class="w-4 h-4 mr-2" />
              Create
            </Button>
            <Button variant="outline" @click="cancelEdit">Cancel</Button>
          </div>
        </CardContent>
      </Card>

      <!-- New Category Button (edit mode, when not creating) -->
      <Button v-if="editMode && !creatingCategory" @click="startCreating" class="w-full">
        <Plus class="w-4 h-4 mr-2" />
        New Category
      </Button>

      <!-- Category Table -->
      <Card v-if="categories && categories.length > 0" class="overflow-hidden">
        <!-- Table Header (desktop only) -->
        <div class="hidden lg:grid grid-cols-[1fr_120px_120px_300px] gap-4 p-4 bg-muted/50 border-b font-semibold text-sm">
          <div>Forum</div>
          <div class="text-center">Topics</div>
          <div class="text-center">Replies</div>
          <div>Last Post Info</div>
        </div>

        <!-- Category Rows -->
        <div ref="sortableContainer">
        <div v-for="category in categories" :key="category.id">
        <!-- Edit Mode: Editing This Category -->
        <template v-if="editMode && editingCategoryId === category.id">
          <div class="border-b last:border-b-0 p-4 bg-accent/10">
            <div class="flex items-center justify-between mb-4">
              <h3 class="font-semibold">Edit Category</h3>
              <Button variant="ghost" size="sm" @click="cancelEdit">
                <X class="w-4 h-4" />
              </Button>
            </div>
            <div class="space-y-4">
            <div class="grid grid-cols-2 gap-4">
              <div class="space-y-2">
                <Label for="edit-name">Name *</Label>
                <Input id="edit-name" v-model="formData.name" />
              </div>
              <div class="space-y-2">
                <Label for="edit-icon">Icon (Lucide)</Label>
                <Input id="edit-icon" v-model="formData.icon" placeholder="e.g., MessageSquare" />
                <p class="text-xs text-muted-foreground">
                  Browse icons at <a href="https://lucide.dev/icons/" target="_blank" rel="noopener noreferrer" class="text-primary hover:underline">lucide.dev/icons</a>
                </p>
              </div>
            </div>

            <div class="space-y-2">
              <Label for="edit-desc">Description</Label>
              <Textarea id="edit-desc" v-model="formData.description" rows="2" />
            </div>

            <div class="grid grid-cols-2 gap-4">
              <div class="space-y-2">
                <Label for="edit-access">Access Type</Label>
                <Select v-model="formData.accessType">
                  <SelectTrigger id="edit-access">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="public">Public</SelectItem>
                    <SelectItem value="authenticated">Authenticated</SelectItem>
                    <SelectItem value="role_based">Role-Based</SelectItem>
                    <SelectItem value="guild">Guild</SelectItem>
                    <SelectItem value="custom_acl">Custom ACL</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div v-if="formData.accessType === 'role_based'" class="space-y-2">
                <Label for="edit-level">Min Level</Label>
                <Select v-model="formData.minLevel">
                  <SelectTrigger id="edit-level">
                    <SelectValue placeholder="Select level" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem v-for="option in ROLE_OPTIONS" :key="option.value" :value="option.value.toString()">
                      {{ option.label }}
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div v-if="formData.accessType === 'guild'" class="space-y-2 relative">
                <Label for="edit-guild">Guild Name</Label>
                <!-- Show selected guild with colors, or input for searching -->
                <div v-if="formData.guildName && !showGuildDropdown" class="flex items-center gap-2">
                  <div
                    class="flex-1 px-3 py-2 border border-input rounded-md bg-background"
                    v-html="parseAnsiToHtml(formData.guildName)"
                  ></div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    @click="() => { formData.guildName = ''; guildSearchQuery = ''; showGuildDropdown = true }"
                  >
                    <X class="w-4 h-4" />
                  </Button>
                </div>
                <Input
                  v-else
                  id="edit-guild"
                  v-model="guildSearchQuery"
                  placeholder="Type to search guild..."
                  autocomplete="off"
                  @input="formData.guildName = ''"
                  @focus="showGuildDropdown = true"
                />
                <div
                  v-if="showGuildDropdown && guildSearchQuery.length >= 1"
                  class="absolute z-50 mt-1 w-full rounded-md border bg-popover shadow-lg"
                >
                  <div class="max-h-[200px] overflow-y-auto p-1">
                    <div v-if="isSearchingGuilds" class="py-2 px-3 text-sm text-muted-foreground">
                      Searching...
                    </div>
                    <div v-else-if="guildSearchResults.length === 0" class="py-2 px-3 text-sm text-muted-foreground">
                      No guilds found
                    </div>
                    <button
                      v-for="guild in guildSearchResults"
                      :key="guild"
                      type="button"
                      class="w-full text-left px-3 py-2 text-sm rounded-sm hover:bg-accent hover:text-accent-foreground cursor-pointer"
                      @click="() => { formData.guildName = guild; guildSearchQuery = guild; showGuildDropdown = false }"
                      v-html="parseAnsiToHtml(guild)"
                    >
                    </button>
                  </div>
                </div>
              </div>

              <div class="space-y-2">
                <Label for="edit-parent">Parent Category</Label>
                <Select v-model="formData.parentId">
                  <SelectTrigger id="edit-parent">
                    <SelectValue placeholder="Top-level" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Top-level</SelectItem>
                    <SelectItem v-for="cat in availableParents" :key="cat.id" :value="cat.id.toString()">
                      {{ cat.name }}
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

              <div class="flex gap-2">
                <Button @click="saveCategory">
                  <Save class="w-4 h-4 mr-2" />
                  Save
                </Button>
                <Button variant="outline" @click="cancelEdit">Cancel</Button>
              </div>
            </div>
          </div>
        </template>

        <!-- Normal/View Mode -->
        <template v-else>
          <!-- Mobile compact view - individual cards -->
          <div
            class="lg:hidden group bg-card border rounded-lg mb-2 last:mb-0 hover:bg-accent/30 transition-all overflow-hidden"
            :class="!editMode && 'cursor-pointer'"
            @click="!editMode && !editingCategoryId && router.push(`/forum/category/${category.id}`)"
          >
            <div class="flex">
              <!-- Left accent bar -->
              <div
                class="w-1 flex-shrink-0"
                :class="{
                  'bg-primary': category.access_type === 'authenticated',
                  'bg-purple-500': category.access_type === 'guild',
                  'bg-amber-500': category.access_type === 'role_based',
                  'bg-cyan-600 group-hover:bg-cyan-500': category.access_type === 'public',
                  'bg-muted-foreground': category.is_archived
                }"
              ></div>

              <div class="flex-1 p-3">
                <div class="flex items-start gap-3">
                  <!-- Drag handle (edit mode only) -->
                  <GripVertical v-if="editMode" class="drag-handle w-5 h-5 text-muted-foreground cursor-move flex-shrink-0 mt-0.5" />

                  <!-- Icon -->
                  <div class="w-10 h-10 rounded-lg bg-muted/50 flex items-center justify-center flex-shrink-0">
                    <component
                      v-if="getIconComponent(category.icon)"
                      :is="getIconComponent(category.icon)"
                      class="w-5 h-5 text-muted-foreground"
                    />
                    <MessageSquare v-else class="w-5 h-5 text-muted-foreground" />
                  </div>

                  <div class="flex-1 min-w-0">
                    <!-- Name + Badge -->
                    <div class="flex items-center gap-2 flex-wrap">
                      <h3 class="font-medium text-sm group-hover:text-primary transition-colors">
                        <span v-html="parseAnsiToHtml(category.name)"></span>
                      </h3>
                      <Badge :variant="getCategoryBadgeVariant(category.access_type)" class="text-xs px-1.5 py-0">
                        {{ category.access_type }}
                      </Badge>
                      <Badge v-if="category.is_archived" variant="destructive" class="text-xs px-1.5 py-0">
                        Archived
                      </Badge>
                    </div>

                    <!-- Description -->
                    <p v-if="category.description" class="text-xs text-muted-foreground mt-1 line-clamp-1">
                      <span v-html="parseAnsiToHtml(category.description)"></span>
                    </p>

                    <!-- Stats -->
                    <div class="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
                      <span class="flex items-center gap-1">
                        <FileText class="w-3 h-3" />
                        {{ (category.thread_count || 0).toLocaleString() }}
                      </span>
                      <span class="flex items-center gap-1">
                        <MessagesSquare class="w-3 h-3" />
                        {{ (category.post_count || 0).toLocaleString() }}
                      </span>
                    </div>

                    <!-- Last post -->
                    <div v-if="category.last_post" class="flex items-center gap-1 mt-1.5 text-xs text-muted-foreground">
                      <Clock class="w-3 h-3" />
                      <span>{{ formatDate(category.last_post.created_at) }} by {{ category.last_post.author_name }}</span>
                    </div>
                  </div>

                  <!-- Edit mode actions (inline) -->
                  <div v-if="editMode" class="flex gap-1 flex-shrink-0">
                    <Button variant="ghost" size="sm" @click.stop="startEditing(category)" title="Edit">
                      <Pencil class="w-4 h-4" />
                    </Button>
                    <Button variant="ghost" size="sm" @click.stop="(e: Event) => openPermissionDialog(category, e)" title="Permissions">
                      <Shield class="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- Desktop grid view -->
          <div class="hidden lg:block border-b last:border-b-0">
            <div
              class="grid grid-cols-[1fr_120px_120px_300px] gap-4 p-4 hover:bg-accent/30 transition-colors"
              :class="!editMode && 'cursor-pointer'"
              @click="!editMode && !editingCategoryId && router.push(`/forum/category/${category.id}`)"
            >
              <!-- Forum Info Column -->
              <div class="flex items-start gap-3">
                <!-- Drag handle (edit mode only) -->
                <GripVertical v-if="editMode" class="drag-handle w-5 h-5 text-muted-foreground cursor-move flex-shrink-0 mt-1" />

                <component
                  v-if="getIconComponent(category.icon)"
                  :is="getIconComponent(category.icon)"
                  class="w-5 h-5 flex-shrink-0 mt-1 text-muted-foreground"
                />

                <div class="flex-1 min-w-0">
                  <div class="flex items-center gap-2 mb-1">
                    <h3 class="font-semibold text-base">
                      <span v-html="parseAnsiToHtml(category.name)"></span>
                    </h3>
                    <Badge :variant="getCategoryBadgeVariant(category.access_type)" class="text-xs">
                      {{ category.access_type }}
                    </Badge>
                    <Badge v-if="category.is_archived" variant="destructive" class="text-xs">
                      Archived
                    </Badge>
                  </div>
                  <p class="text-sm text-muted-foreground">
                    <span v-html="parseAnsiToHtml(category.description || '')"></span>
                  </p>
                </div>

                <!-- Edit mode actions (inline) -->
                <div v-if="editMode" class="flex gap-1 flex-shrink-0">
                  <Button variant="ghost" size="sm" @click.stop="startEditing(category)" title="Edit">
                    <Pencil class="w-4 h-4" />
                  </Button>
                  <Button variant="ghost" size="sm" @click.stop="(e: Event) => openPermissionDialog(category, e)" title="Permissions">
                    <Shield class="w-4 h-4" />
                  </Button>
                  <Button
                    v-if="!category.is_archived"
                    variant="ghost"
                    size="sm"
                    @click.stop="(e: Event) => openArchiveDialog(category, e)"
                    title="Archive"
                  >
                    <Archive class="w-4 h-4" />
                  </Button>
                  <Button
                    v-else
                    variant="ghost"
                    size="sm"
                    @click.stop="(e: Event) => restoreCategory(category, e)"
                    title="Restore"
                  >
                    <RotateCcw class="w-4 h-4" />
                  </Button>
                  <Button
                    v-if="category.is_archived"
                    variant="ghost"
                    size="sm"
                    @click.stop="(e: Event) => openDeleteDialog(category, e)"
                    title="Permanently Delete"
                    class="text-destructive hover:text-destructive"
                  >
                    <Trash2 class="w-4 h-4" />
                  </Button>
                </div>
              </div>

              <!-- Topics Column -->
              <div class="text-center self-center">
                <div class="text-2xl font-semibold">{{ (category.thread_count || 0).toLocaleString() }}</div>
                <div class="text-xs text-muted-foreground">Topics</div>
              </div>

              <!-- Replies Column -->
              <div class="text-center self-center">
                <div class="text-2xl font-semibold">{{ (category.post_count || 0).toLocaleString() }}</div>
                <div class="text-xs text-muted-foreground">Replies</div>
              </div>

              <!-- Last Post Info Column -->
              <div class="self-center text-sm">
                <template v-if="category.last_post">
                  <div class="font-medium text-foreground mb-1 truncate" :title="category.last_post.thread_title || undefined">
                    {{ category.last_post.thread_title }}
                  </div>
                  <div class="text-muted-foreground">
                    <span class="font-medium">{{ formatDate(category.last_post.created_at) }}</span>
                  </div>
                  <div class="text-muted-foreground">
                    by <span class="font-medium">{{ category.last_post.author_name }}</span>
                  </div>
                </template>
                <div v-else class="text-muted-foreground italic">No posts yet</div>
              </div>
            </div>
          </div>
        </template>
        </div>
        </div>
      </Card>

      <!-- Empty State -->
      <Card v-if="categories?.length === 0 && !creatingCategory">
        <CardContent class="pt-6 text-center text-muted-foreground space-y-4">
          <template v-if="canManageForumCategories">
            <p>No usable forum categories are configured.</p>
            <Button @click="startInitialSetup">Set up the first category</Button>
          </template>
          <p v-else>The forum is temporarily unavailable while an administrator completes setup.</p>
        </CardContent>
      </Card>
    </div>

    <!-- Permission Dialog -->
    <CategoryPermissionDialog
      v-model:open="showPermissionDialog"
      :category="selectedCategory"
      @success="handlePermissionSuccess"
    />

    <!-- Archive Category Dialog -->
    <ArchiveCategoryDialog
      ref="archiveCategoryDialogRef"
      :category="categoryToArchive"
      @confirm="confirmArchiveCategory"
    />

    <!-- Delete Category Dialog -->
    <DeleteCategoryDialog
      ref="deleteCategoryDialogRef"
      :category="categoryToDelete"
      @confirm="confirmDeleteCategory"
    />
  </div>
</template>
