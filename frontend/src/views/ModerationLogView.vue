<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { useRouter } from 'vue-router'
import { forumApi, adminApi } from '@/services/api'
import { useAuth } from '@/composables/useAuth'
import { useToast } from '@/composables/useToast'
import { useQuery, useQueryClient } from '@tanstack/vue-query'
import type { ModerationLogEntry, ForumCategory } from '@/types'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import Pagination from '@/components/forum/PaginationWithEllipsis.vue'
import { Shield, Filter, Archive, RotateCcw, Trash2, MessageSquare, FileText } from 'lucide-vue-next'
import { parseAnsiToHtml } from '@/utils/ansiParser'

const router = useRouter()
const { isAuthenticated, permissions } = useAuth()
const toast = useToast()
const queryClient = useQueryClient()

const logs = ref<ModerationLogEntry[]>([])
const categories = ref<ForumCategory[]>([])
const isLoading = ref(true)
const error = ref<string | null>(null)
const currentPage = ref(1)
const totalPages = ref(1)
const total = ref(0)

// Filters
const filterModerator = ref('')
const filterActionType = ref<string>('all')
const filterCategoryId = ref<string>('all')

const isModerator = computed(() => permissions.value?.canModerate || false)
const isOverlord = computed(() => (permissions.value?.immortalLevel ?? 0) >= 60)

// Active tab
const activeTab = ref('log')

// Restore confirmation dialog
const showRestoreDialog = ref(false)
const restoreType = ref<'category' | 'thread' | 'post'>('category')
const restoreItem = ref<any>(null)

// Delete confirmation dialog
const showDeleteDialog = ref(false)
const deleteType = ref<'category' | 'thread' | 'post'>('category')
const deleteItem = ref<any>(null)

// Fetch archived categories
const { data: archivedCategories, isLoading: loadingCategories } = useQuery({
  queryKey: ['archived-categories'],
  queryFn: async () => {
    const response = await adminApi.getArchivedCategories()
    return response.categories
  },
  enabled: isOverlord,
})

// Fetch deleted threads (paginated)
const threadsPage = ref(1)
const { data: deletedThreadsData, isLoading: loadingThreads } = useQuery({
  queryKey: ['deleted-threads', threadsPage],
  queryFn: async () => {
    const response = await adminApi.getDeletedThreads(threadsPage.value, 50)
    return response
  },
  enabled: isOverlord,
})

// Fetch deleted posts (paginated)
const postsPage = ref(1)
const { data: deletedPostsData, isLoading: loadingPosts } = useQuery({
  queryKey: ['deleted-posts', postsPage],
  queryFn: async () => {
    const response = await adminApi.getDeletedPosts(postsPage.value, 50)
    return response
  },
  enabled: isOverlord,
})

async function loadCategories() {
  try {
    categories.value = await forumApi.getCategories()
  } catch {
  }
}

async function loadLogs(page: number = 1) {
  isLoading.value = true
  error.value = null

  try {
    const filters: any = {}
    if (filterModerator.value) filters.moderator = filterModerator.value
    if (filterActionType.value && filterActionType.value !== 'all') filters.actionType = filterActionType.value
    if (filterCategoryId.value && filterCategoryId.value !== 'all') filters.categoryId = parseInt(filterCategoryId.value)

    const result = await forumApi.getModerationLog(page, 50, filters)
    logs.value = result.logs
    currentPage.value = result.pagination.page
    totalPages.value = result.pagination.totalPages
    total.value = result.pagination.total
  } catch (err: any) {
    error.value = err.response?.data?.error || 'Failed to load moderation logs'
  } finally {
    isLoading.value = false
  }
}

function applyFilters() {
  currentPage.value = 1
  loadLogs(1)
}

function clearFilters() {
  filterModerator.value = ''
  filterActionType.value = 'all'
  filterCategoryId.value = 'all'
  applyFilters()
}

function getActionColor(action: string): 'default' | 'secondary' | 'destructive' | 'outline' {
  switch (action) {
    case 'delete_post':
    case 'delete_thread':
      return 'destructive'
    case 'restore_post':
    case 'restore_thread':
      return 'default'
    case 'move_thread':
      return 'secondary'
    case 'lock_thread':
    case 'unlock_thread':
      return 'outline'
    case 'pin_thread':
    case 'unpin_thread':
      return 'secondary'
    default:
      return 'default'
  }
}

function formatActionType(action: string): string {
  return action.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}

function formatDate(dateString: string | null): string {
  if (!dateString) return 'Unknown'
  const date = new Date(dateString)
  return date.toLocaleString()
}

function openRestoreDialog(type: 'category' | 'thread' | 'post', item: any) {
  restoreType.value = type
  restoreItem.value = item
  showRestoreDialog.value = true
}

async function confirmRestore() {
  if (!restoreItem.value) return

  try {
    if (restoreType.value === 'category') {
      await adminApi.restoreCategory(restoreItem.value.id)
      toast.success(`Category "${restoreItem.value.name}" restored`, 'Success')
      queryClient.invalidateQueries({ queryKey: ['archived-categories'] })
      queryClient.invalidateQueries({ queryKey: ['forum-categories', false] })
      queryClient.invalidateQueries({ queryKey: ['forum-categories', true] })
    } else if (restoreType.value === 'thread') {
      await adminApi.restoreThread(restoreItem.value.id)
      toast.success(`Thread "${restoreItem.value.title}" restored`, 'Success')
      queryClient.invalidateQueries({ queryKey: ['deleted-threads'] })
    } else if (restoreType.value === 'post') {
      await adminApi.restorePost(restoreItem.value.id)
      toast.success('Post restored', 'Success')
      queryClient.invalidateQueries({ queryKey: ['deleted-posts'] })
    }

    showRestoreDialog.value = false
    restoreItem.value = null
  } catch (error: any) {
    toast.error(error.response?.data?.error || 'Failed to restore item', 'Error')
  }
}

function openDeleteDialog(type: 'category' | 'thread' | 'post', item: any) {
  deleteType.value = type
  deleteItem.value = item
  showDeleteDialog.value = true
}

async function confirmDelete() {
  if (!deleteItem.value) return

  try {
    if (deleteType.value === 'category') {
      await adminApi.deleteCategoryPermanent(deleteItem.value.id)
      toast.success(`Category "${deleteItem.value.name}" permanently deleted`, 'Success')
      queryClient.invalidateQueries({ queryKey: ['archived-categories'] })
    } else if (deleteType.value === 'thread') {
      await adminApi.deleteThreadPermanent(deleteItem.value.id)
      toast.success(`Thread "${deleteItem.value.title}" permanently deleted`, 'Success')
      queryClient.invalidateQueries({ queryKey: ['deleted-threads'] })
    } else if (deleteType.value === 'post') {
      await adminApi.deletePostPermanent(deleteItem.value.id)
      toast.success('Post permanently deleted', 'Success')
      queryClient.invalidateQueries({ queryKey: ['deleted-posts'] })
    }

    showDeleteDialog.value = false
    deleteItem.value = null
  } catch (error: any) {
    toast.error(error.response?.data?.error || 'Failed to delete item', 'Error')
  }
}

onMounted(() => {
  if (!isAuthenticated.value) {
    router.push('/login')
    return
  }

  if (!isModerator.value) {
    router.push('/forum')
    return
  }

  loadCategories()
  loadLogs()
})
</script>

<template>
  <div>
    <!-- Header -->
    <div class="flex items-center justify-between mb-6">
      <div>
        <div class="flex items-center gap-2">
          <Shield class="h-8 w-8" />
          <h1 class="text-3xl font-bold">Moderation</h1>
        </div>
        <p class="text-muted-foreground mt-1">View moderation actions and manage archives</p>
      </div>
      <Button variant="ghost" @click="router.back()">← Back</Button>
    </div>

    <Tabs v-model="activeTab" class="space-y-4">
      <TabsList>
        <TabsTrigger value="log">
          <Shield class="w-4 h-4 mr-2" />
          Moderation Log
        </TabsTrigger>
        <TabsTrigger v-if="isOverlord" value="archives">
          <Archive class="w-4 h-4 mr-2" />
          Archives
        </TabsTrigger>
      </TabsList>

      <!-- Moderation Log Tab -->
      <TabsContent value="log">

    <!-- Filters -->
    <Card class="mb-6">
      <CardHeader>
        <div class="flex items-center gap-2">
          <Filter class="h-5 w-5" />
          <CardTitle>Filters</CardTitle>
        </div>
      </CardHeader>
      <CardContent>
        <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div class="space-y-2">
            <Label for="moderator">Moderator</Label>
            <Input
              id="moderator"
              v-model="filterModerator"
              placeholder="Enter moderator account name"
              @keyup.enter="applyFilters"
            />
          </div>
          <div class="space-y-2">
            <Label for="action">Action Type</Label>
            <Select v-model="filterActionType">
              <SelectTrigger id="action">
                <SelectValue placeholder="All actions" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All actions</SelectItem>
                <SelectItem value="delete_post">Delete Post</SelectItem>
                <SelectItem value="delete_thread">Delete Thread</SelectItem>
                <SelectItem value="restore_post">Restore Post</SelectItem>
                <SelectItem value="restore_thread">Restore Thread</SelectItem>
                <SelectItem value="move_thread">Move Thread</SelectItem>
                <SelectItem value="lock_thread">Lock Thread</SelectItem>
                <SelectItem value="unlock_thread">Unlock Thread</SelectItem>
                <SelectItem value="pin_thread">Pin Thread</SelectItem>
                <SelectItem value="unpin_thread">Unpin Thread</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div class="space-y-2">
            <Label for="category">Category</Label>
            <Select v-model="filterCategoryId">
              <SelectTrigger id="category">
                <SelectValue placeholder="All categories" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All categories</SelectItem>
                <SelectItem
                  v-for="category in categories"
                  :key="category.id"
                  :value="category.id.toString()"
                >
                  {{ category.name }}
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <div class="flex gap-2 mt-4">
          <Button @click="applyFilters">Apply Filters</Button>
          <Button variant="outline" @click="clearFilters">Clear Filters</Button>
        </div>
      </CardContent>
    </Card>

    <!-- Loading State -->
    <div v-if="isLoading" class="text-center py-12">
      <p class="text-muted-foreground">Loading moderation logs...</p>
    </div>

    <!-- Error State -->
    <Card v-else-if="error" class="border-destructive">
      <CardContent class="pt-6">
        <p class="text-destructive">{{ error }}</p>
        <Button @click="loadLogs(currentPage)" class="mt-4">Retry</Button>
      </CardContent>
    </Card>

    <!-- Empty State -->
    <Card v-else-if="logs.length === 0">
      <CardContent class="pt-6 text-center py-12">
        <p class="text-muted-foreground">No moderation logs found</p>
      </CardContent>
    </Card>

    <!-- Logs List -->
    <div v-else class="space-y-3">
      <Card
        v-for="log in logs"
        :key="log.id"
      >
        <CardContent class="pt-6">
          <div class="flex items-start gap-4">
            <!-- Icon -->
            <div class="flex-shrink-0">
              <Shield class="h-5 w-5 text-muted-foreground" />
            </div>

            <!-- Content -->
            <div class="flex-1 min-w-0">
              <div class="flex items-start justify-between gap-4 mb-2">
                <div>
                  <Badge :variant="getActionColor(log.action_type)">
                    {{ formatActionType(log.action_type) }}
                  </Badge>
                  <span class="text-sm text-muted-foreground ml-2">
                    on {{ log.target_type }}
                  </span>
                </div>
                <div class="text-sm text-muted-foreground text-right">
                  {{ formatDate(log.created_at) }}
                </div>
              </div>

              <p class="text-sm">
                <span class="font-medium">{{ log.moderator_account }}</span>
                performed action on <span class="font-medium">{{ log.target_type }} #{{ log.target_id }}</span>
              </p>

              <div v-if="log.reason" class="mt-2 p-2 bg-muted rounded text-sm">
                <span class="font-medium">Reason:</span> {{ log.reason }}
              </div>

              <div v-if="log.new_category_id" class="mt-2 text-sm text-muted-foreground">
                Moved to category #{{ log.new_category_id }}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>

    <!-- Pagination -->
    <div v-if="totalPages > 1" class="mt-6">
      <Pagination
        :current-page="currentPage"
        :total-pages="totalPages"
        @update:current-page="loadLogs"
      />
    </div>
      </TabsContent>

      <!-- Archives Tab -->
      <TabsContent v-if="isOverlord" value="archives">
        <Tabs default-value="categories" class="space-y-4">
          <TabsList>
            <TabsTrigger value="categories">
              <FileText class="w-4 h-4 mr-2" />
              Categories
            </TabsTrigger>
            <TabsTrigger value="threads">
              <MessageSquare class="w-4 h-4 mr-2" />
              Threads
            </TabsTrigger>
            <TabsTrigger value="posts">
              <MessageSquare class="w-4 h-4 mr-2" />
              Posts
            </TabsTrigger>
          </TabsList>

          <!-- Categories Tab -->
          <TabsContent value="categories">
            <Card>
              <CardHeader>
                <CardTitle>Archived Categories</CardTitle>
                <CardDescription>
                  Categories that have been archived. Restoring a category will make it visible again.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div v-if="loadingCategories" class="space-y-4">
                  <Skeleton v-for="i in 3" :key="i" class="h-16 w-full" />
                </div>

                <div v-else-if="!archivedCategories || archivedCategories.length === 0" class="text-center py-8 text-muted-foreground">
                  <Archive class="w-12 h-12 mx-auto mb-4 opacity-50" />
                  <p>No archived categories</p>
                </div>

                <Table v-else>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Description</TableHead>
                      <TableHead>Archived By</TableHead>
                      <TableHead>Archived At</TableHead>
                      <TableHead>Threads</TableHead>
                      <TableHead class="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    <TableRow v-for="category in archivedCategories" :key="category.id">
                      <TableCell class="font-medium">
                        <span v-html="parseAnsiToHtml(category.name)"></span>
                      </TableCell>
                      <TableCell class="text-muted-foreground">
                        <span v-html="parseAnsiToHtml(category.description || '')"></span>
                      </TableCell>
                      <TableCell>{{ category.archived_by || 'Unknown' }}</TableCell>
                      <TableCell>{{ formatDate(category.archived_at) }}</TableCell>
                      <TableCell>
                        <div class="flex gap-2">
                          <Badge variant="outline">{{ category.active_thread_count }} active</Badge>
                          <Badge variant="destructive">{{ category.deleted_thread_count }} deleted</Badge>
                        </div>
                      </TableCell>
                      <TableCell class="text-right">
                        <div class="flex items-center justify-end gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            @click="openRestoreDialog('category', category)"
                          >
                            <RotateCcw class="w-4 h-4 mr-2" />
                            Restore
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            @click="openDeleteDialog('category', category)"
                          >
                            <Trash2 class="w-4 h-4 mr-2 text-destructive" />
                            Delete
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          <!-- Threads Tab -->
          <TabsContent value="threads">
            <Card>
              <CardHeader>
                <CardTitle>Deleted Threads</CardTitle>
                <CardDescription>
                  Threads that have been deleted. Restoring a thread will make it visible again.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div v-if="loadingThreads" class="space-y-4">
                  <Skeleton v-for="i in 5" :key="i" class="h-16 w-full" />
                </div>

                <div v-else-if="!deletedThreadsData?.threads || deletedThreadsData.threads.length === 0" class="text-center py-8 text-muted-foreground">
                  <Trash2 class="w-12 h-12 mx-auto mb-4 opacity-50" />
                  <p>No deleted threads</p>
                </div>

                <div v-else>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Title</TableHead>
                        <TableHead>Category</TableHead>
                        <TableHead>Author</TableHead>
                        <TableHead>Deleted By</TableHead>
                        <TableHead>Deleted At</TableHead>
                        <TableHead class="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      <TableRow v-for="thread in deletedThreadsData.threads" :key="thread.id">
                        <TableCell class="font-medium">{{ thread.title }}</TableCell>
                        <TableCell>{{ thread.category_name }}</TableCell>
                        <TableCell>{{ thread.author_account }}</TableCell>
                        <TableCell>{{ thread.deleted_by || 'Unknown' }}</TableCell>
                        <TableCell>{{ formatDate(thread.deleted_at) }}</TableCell>
                        <TableCell class="text-right">
                          <Button
                            variant="ghost"
                            size="sm"
                            @click="openRestoreDialog('thread', thread)"
                          >
                            <RotateCcw class="w-4 h-4 mr-2" />
                            Restore
                          </Button>
                        </TableCell>
                      </TableRow>
                    </TableBody>
                  </Table>

                  <!-- Pagination -->
                  <div v-if="deletedThreadsData.pagination" class="flex items-center justify-between mt-4">
                    <div class="text-sm text-muted-foreground">
                      Page {{ deletedThreadsData.pagination.page }} of {{ deletedThreadsData.pagination.totalPages }}
                      ({{ deletedThreadsData.pagination.total }} total)
                    </div>
                    <div class="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        :disabled="threadsPage <= 1"
                        @click="threadsPage--"
                      >
                        Previous
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        :disabled="threadsPage >= deletedThreadsData.pagination.totalPages"
                        @click="threadsPage++"
                      >
                        Next
                      </Button>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <!-- Posts Tab -->
          <TabsContent value="posts">
            <Card>
              <CardHeader>
                <CardTitle>Deleted Posts</CardTitle>
                <CardDescription>
                  Posts that have been deleted. Restoring a post will make it visible again.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div v-if="loadingPosts" class="space-y-4">
                  <Skeleton v-for="i in 5" :key="i" class="h-16 w-full" />
                </div>

                <div v-else-if="!deletedPostsData?.posts || deletedPostsData.posts.length === 0" class="text-center py-8 text-muted-foreground">
                  <Trash2 class="w-12 h-12 mx-auto mb-4 opacity-50" />
                  <p>No deleted posts</p>
                </div>

                <div v-else>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Content Preview</TableHead>
                        <TableHead>Thread</TableHead>
                        <TableHead>Author</TableHead>
                        <TableHead>Deleted By</TableHead>
                        <TableHead>Deleted At</TableHead>
                        <TableHead class="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      <TableRow v-for="post in deletedPostsData.posts" :key="post.id">
                        <TableCell class="max-w-md">
                          <div class="line-clamp-2 text-sm">
                            {{ post.content.substring(0, 100) }}{{ post.content.length > 100 ? '...' : '' }}
                          </div>
                        </TableCell>
                        <TableCell>{{ post.thread_title }}</TableCell>
                        <TableCell>{{ post.author_account }}</TableCell>
                        <TableCell>{{ post.deleted_by || 'Unknown' }}</TableCell>
                        <TableCell>{{ formatDate(post.deleted_at) }}</TableCell>
                        <TableCell class="text-right">
                          <Button
                            variant="ghost"
                            size="sm"
                            @click="openRestoreDialog('post', post)"
                          >
                            <RotateCcw class="w-4 h-4 mr-2" />
                            Restore
                          </Button>
                        </TableCell>
                      </TableRow>
                    </TableBody>
                  </Table>

                  <!-- Pagination -->
                  <div v-if="deletedPostsData.pagination" class="flex items-center justify-between mt-4">
                    <div class="text-sm text-muted-foreground">
                      Page {{ deletedPostsData.pagination.page }} of {{ deletedPostsData.pagination.totalPages }}
                      ({{ deletedPostsData.pagination.total }} total)
                    </div>
                    <div class="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        :disabled="postsPage <= 1"
                        @click="postsPage--"
                      >
                        Previous
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        :disabled="postsPage >= deletedPostsData.pagination.totalPages"
                        @click="postsPage++"
                      >
                        Next
                      </Button>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </TabsContent>
    </Tabs>

    <!-- Restore Confirmation Dialog -->
    <Dialog v-model:open="showRestoreDialog">
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Restore {{ restoreType }}?</DialogTitle>
          <DialogDescription>
            Are you sure you want to restore this {{ restoreType }}? It will become visible again.
          </DialogDescription>
        </DialogHeader>

        <div v-if="restoreItem" class="py-4">
          <div class="font-semibold">
            {{ restoreType === 'category' ? restoreItem.name : restoreType === 'thread' ? restoreItem.title : 'Post' }}
          </div>
          <div class="text-sm text-muted-foreground mt-2">
            Deleted by: {{ restoreItem.deleted_by || restoreItem.archived_by || 'Unknown' }}
          </div>
          <div class="text-sm text-muted-foreground">
            Deleted at: {{ formatDate(restoreItem.deleted_at || restoreItem.archived_at) }}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" @click="showRestoreDialog = false">Cancel</Button>
          <Button @click="confirmRestore">
            <RotateCcw class="w-4 h-4 mr-2" />
            Restore
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <!-- Delete Confirmation Dialog -->
    <Dialog v-model:open="showDeleteDialog">
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Permanently Delete {{ deleteType }}?</DialogTitle>
          <DialogDescription>
            This action cannot be undone. This will permanently delete this {{ deleteType }} from the database.
          </DialogDescription>
        </DialogHeader>

        <div v-if="deleteItem" class="py-4">
          <div class="font-semibold">
            {{ deleteType === 'category' ? deleteItem.name : deleteType === 'thread' ? deleteItem.title : 'Post' }}
          </div>
          <div class="text-sm text-muted-foreground mt-2">
            Archived/Deleted by: {{ deleteItem.deleted_by || deleteItem.archived_by || 'Unknown' }}
          </div>
          <div class="text-sm text-muted-foreground">
            Archived/Deleted at: {{ formatDate(deleteItem.deleted_at || deleteItem.archived_at) }}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" @click="showDeleteDialog = false">Cancel</Button>
          <Button variant="destructive" @click="confirmDelete">
            <Trash2 class="w-4 h-4 mr-2" />
            Permanently Delete
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </div>
</template>
