<script setup lang="ts">
import { ref } from 'vue'
import { useQuery, useQueryClient } from '@tanstack/vue-query'
import { adminApi } from '@/services/api'
import { useToast } from '@/composables/useToast'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Archive, RotateCcw, Trash2, MessageSquare, FileText } from 'lucide-vue-next'
import { parseAnsiToHtml } from '@/utils/ansiParser'

const toast = useToast()
const queryClient = useQueryClient()

// Active tab
const activeTab = ref('categories')

// Restore confirmation dialog
const showRestoreDialog = ref(false)
const restoreType = ref<'category' | 'thread' | 'post'>('category')
const restoreItem = ref<any>(null)

// Fetch archived categories
const { data: archivedCategories, isLoading: loadingCategories } = useQuery({
  queryKey: ['archived-categories'],
  queryFn: async () => {
    const response = await adminApi.getArchivedCategories()
    return response.categories
  },
})

// Fetch deleted threads (paginated)
const threadsPage = ref(1)
const { data: deletedThreadsData, isLoading: loadingThreads } = useQuery({
  queryKey: ['deleted-threads', threadsPage],
  queryFn: async () => {
    const response = await adminApi.getDeletedThreads(threadsPage.value, 50)
    return response
  },
})

// Fetch deleted posts (paginated)
const postsPage = ref(1)
const { data: deletedPostsData, isLoading: loadingPosts } = useQuery({
  queryKey: ['deleted-posts', postsPage],
  queryFn: async () => {
    const response = await adminApi.getDeletedPosts(postsPage.value, 50)
    return response
  },
})

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
</script>

<template>
  <div class="container mx-auto p-6">
    <div class="mb-6">
      <h1 class="text-3xl font-bold flex items-center gap-2">
        <Archive class="w-8 h-8" />
        Archives
      </h1>
      <p class="text-muted-foreground mt-2">
        View and restore archived categories, deleted threads, and deleted posts
      </p>
    </div>

    <Tabs v-model="activeTab" class="space-y-4">
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
                    <Button
                      variant="ghost"
                      size="sm"
                      @click="openRestoreDialog('category', category)"
                    >
                      <RotateCcw class="w-4 h-4 mr-2" />
                      Restore
                    </Button>
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
  </div>
</template>
