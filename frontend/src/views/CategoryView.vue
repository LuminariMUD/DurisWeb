<script setup lang="ts">
import { ref, onMounted, computed, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useHead } from '@unhead/vue'
import { forumApi } from '@/services/api'
import { useAuth } from '@/composables/useAuth'
import { stripAnsiCodes, parseAnsiToHtml } from '@/utils/ansiParser'
import type { ForumCategory, ForumThread } from '@/types'
import { Card, CardHeader, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import BreadcrumbsNav from '@/components/layout/BreadcrumbsNav.vue'
import PaginationWithEllipsis from '@/components/forum/PaginationWithEllipsis.vue'
import AnsiText from '@/components/ui/AnsiText.vue'
import { Pin, Lock, MessageSquare, User, Eye, Clock } from 'lucide-vue-next'
import * as LucideIcons from 'lucide-vue-next'

const props = defineProps<{
  categoryId: string
}>()

const router = useRouter()
const { isAuthenticated } = useAuth()

const category = ref<ForumCategory | null>(null)
const childCategories = ref<ForumCategory[]>([])
const threads = ref<ForumThread[]>([])
const isLoading = ref(true)
const error = ref<string | null>(null)
const currentPage = ref(1)
const totalPages = ref(1)

const categoryIdNum = computed(() => parseInt(props.categoryId))

// Check if this category has children (show subcategories instead of threads)
const hasChildren = computed(() => childCategories.value.length > 0)

// Dynamic page title
const pageTitle = computed(() => {
  if (category.value?.name) {
    const cleanName = stripAnsiCodes(category.value.name)
    return `DurisMUD | ${cleanName}`
  }
  return 'DurisMUD | Forum Category'
})

useHead({
  title: pageTitle
})

async function loadCategory() {
  try {
    category.value = await forumApi.getCategory(categoryIdNum.value)
  } catch (err: any) {
    error.value = err.response?.data?.error || 'Failed to load category'
  }
}

async function loadChildCategories() {
  try {
    childCategories.value = await forumApi.getChildCategories(categoryIdNum.value)
  } catch {
    childCategories.value = []
  }
}

async function loadThreads(page: number = 1) {
  isLoading.value = true
  error.value = null

  try {
    const response = await forumApi.getThreads(categoryIdNum.value, page, 50)
    threads.value = response.data
    currentPage.value = response.pagination.page
    totalPages.value = response.pagination.totalPages
  } catch (err: any) {
    error.value = err.response?.data?.error || 'Failed to load threads'
  } finally {
    isLoading.value = false
  }
}

async function loadContent() {
  isLoading.value = true
  error.value = null

  try {
    await loadCategory()
    await loadChildCategories()

    // Only load threads if no child categories
    if (childCategories.value.length === 0) {
      await loadThreads()
    } else {
      isLoading.value = false
    }
  } catch (err: any) {
    error.value = err.response?.data?.error || 'Failed to load content'
    isLoading.value = false
  }
}

function formatDate(dateString: string): string {
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

function getCategoryBadgeVariant(accessType: string) {
  switch (accessType) {
    case 'public':
      return 'secondary'
    case 'authenticated':
      return 'default'
    case 'guild':
      return 'outline'
    case 'role_based':
      return 'destructive'
    default:
      return 'secondary'
  }
}

// Convert icon name to PascalCase (e.g., "dna" -> "Dna", "message-square" -> "MessageSquare")
function toPascalCase(str: string): string {
  return str
    .split('-')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join('')
}

// Get Lucide icon component
function getIconComponent(iconName: string | null) {
  if (!iconName) return null
  return (LucideIcons as any)[iconName] || (LucideIcons as any)[toPascalCase(iconName)] || null
}

// Watch for category ID changes (when clicking different categories in sidebar)
watch(() => props.categoryId, async (newId, oldId) => {
  if (newId !== oldId) {
    await loadContent()
  }
})

onMounted(async () => {
  await loadContent()
})
</script>

<template>
  <div class="container mx-auto px-4 py-8">
    <!-- Breadcrumbs -->
    <BreadcrumbsNav :category="category" />

    <!-- Header -->
    <div class="mb-8">

      <div v-if="category" class="flex items-center justify-between">
        <div>
          <AnsiText tag="h1" :text="category.name" class="text-3xl font-bold" />
          <AnsiText tag="p" :text="category.description" class="text-muted-foreground mt-2" />
        </div>
        <Button
          v-if="isAuthenticated && !hasChildren"
          @click="router.push(`/forum/new-thread/${categoryId}`)"
        >
          + New Thread
        </Button>
      </div>
    </div>

    <!-- Loading State -->
    <div v-if="isLoading" class="space-y-4">
      <Card v-for="i in 5" :key="i">
        <CardHeader>
          <Skeleton class="h-6 w-96" />
          <Skeleton class="h-4 w-48 mt-2" />
        </CardHeader>
      </Card>
    </div>

    <!-- Error State -->
    <Card v-else-if="error" class="border-destructive">
      <CardContent class="pt-6">
        <p class="text-destructive">{{ error }}</p>
        <Button @click="loadContent" class="mt-4">Retry</Button>
      </CardContent>
    </Card>

    <!-- Child Categories (Subcategories) -->
    <div v-else-if="hasChildren" class="space-y-2">
      <Card class="overflow-hidden">
        <!-- Column Headers (desktop only) -->
        <div class="hidden lg:grid grid-cols-[1fr_80px_80px_200px] gap-4 px-4 py-3 bg-muted/50 border-b text-sm font-medium text-muted-foreground">
          <div>Forum</div>
          <div class="text-center">Topics</div>
          <div class="text-center">Posts</div>
          <div>Last Post Info</div>
        </div>

        <!-- Child Category Rows -->
        <div
          v-for="childCat in childCategories"
          :key="childCat.id"
          class="border-b last:border-b-0"
        >
          <!-- Mobile compact view -->
          <div
            class="lg:hidden px-4 py-3 hover:bg-accent/50 transition-colors cursor-pointer"
            @click="router.push(`/forum/category/${childCat.id}`)"
          >
            <div class="flex items-start gap-3">
              <component
                v-if="getIconComponent(childCat.icon)"
                :is="getIconComponent(childCat.icon)"
                class="w-5 h-5 flex-shrink-0 mt-0.5 text-muted-foreground"
              />
              <div class="flex-1 min-w-0">
                <div class="flex items-center gap-2 flex-wrap">
                  <h3 class="font-semibold text-sm">
                    <span v-html="parseAnsiToHtml(childCat.name)"></span>
                  </h3>
                  <Badge :variant="getCategoryBadgeVariant(childCat.access_type)" class="text-xs">
                    {{ childCat.access_type }}
                  </Badge>
                </div>
                <p v-if="childCat.description" class="text-xs text-muted-foreground mt-1 line-clamp-1">
                  <span v-html="parseAnsiToHtml(childCat.description)"></span>
                </p>
                <div class="text-xs text-muted-foreground mt-2">
                  {{ ((childCat as any).thread_count || 0).toLocaleString() }} topics • {{ ((childCat as any).post_count || 0).toLocaleString() }} posts
                </div>
                <div v-if="(childCat as any).last_post" class="text-xs text-muted-foreground mt-1">
                  Last: {{ formatDate((childCat as any).last_post.created_at) }} by {{ (childCat as any).last_post.author_name }}
                </div>
              </div>
            </div>
          </div>

          <!-- Desktop grid view -->
          <div
            class="hidden lg:grid grid-cols-[1fr_80px_80px_200px] gap-4 px-4 py-4 hover:bg-accent/50 transition-colors cursor-pointer items-center"
            @click="router.push(`/forum/category/${childCat.id}`)"
          >
            <!-- Forum Info Column -->
            <div class="flex items-start gap-3">
              <component
                v-if="getIconComponent(childCat.icon)"
                :is="getIconComponent(childCat.icon)"
                class="w-5 h-5 flex-shrink-0 mt-1 text-muted-foreground"
              />
              <div class="flex-1 min-w-0">
                <div class="flex items-center gap-2 mb-1">
                  <h3 class="font-semibold text-base">
                    <span v-html="parseAnsiToHtml(childCat.name)"></span>
                  </h3>
                  <Badge :variant="getCategoryBadgeVariant(childCat.access_type)" class="text-xs">
                    {{ childCat.access_type }}
                  </Badge>
                </div>
                <p class="text-sm text-muted-foreground">
                  <span v-html="parseAnsiToHtml(childCat.description || '')"></span>
                </p>
              </div>
            </div>

            <!-- Topics Column -->
            <div class="text-center self-center">
              <div class="text-2xl font-semibold">{{ ((childCat as any).thread_count || 0).toLocaleString() }}</div>
              <div class="text-xs text-muted-foreground">Topics</div>
            </div>

            <!-- Posts Column -->
            <div class="text-center self-center">
              <div class="text-2xl font-semibold">{{ ((childCat as any).post_count || 0).toLocaleString() }}</div>
              <div class="text-xs text-muted-foreground">Posts</div>
            </div>

            <!-- Last Post Info Column -->
            <div class="self-center text-sm">
              <template v-if="(childCat as any).last_post">
                <div class="font-medium text-foreground mb-1 truncate" :title="(childCat as any).last_post.thread_title || undefined">
                  {{ (childCat as any).last_post.thread_title }}
                </div>
                <div class="text-muted-foreground">
                  <span class="font-medium">{{ formatDate((childCat as any).last_post.created_at) }}</span>
                </div>
                <div class="text-muted-foreground">
                  by <span class="font-medium">{{ (childCat as any).last_post.author_name }}</span>
                </div>
              </template>
              <div v-else class="text-muted-foreground italic">No posts yet</div>
            </div>
          </div>
        </div>
      </Card>

      <!-- Empty State for Child Categories -->
      <Card v-if="childCategories.length === 0">
        <CardContent class="pt-6 text-center text-muted-foreground">
          <p>No subcategories available.</p>
        </CardContent>
      </Card>
    </div>

    <!-- Threads List (when no child categories) -->
    <div v-else class="space-y-2">
      <div
        v-for="thread in threads"
        :key="thread.id"
        class="group bg-card border rounded-lg hover:bg-accent/30 transition-all cursor-pointer overflow-hidden"
        @click="router.push(`/forum/thread/${thread.id}`)"
      >
        <div class="flex">
          <!-- Left accent bar -->
          <div
            class="w-1 flex-shrink-0"
            :class="thread.is_pinned ? 'bg-primary' : thread.is_locked ? 'bg-muted-foreground' : 'bg-cyan-600 group-hover:bg-cyan-500'"
          ></div>

          <div class="flex-1 p-4">
            <!-- Header row: badges + title -->
            <div class="flex items-start gap-3">
              <!-- Reply count indicator -->
              <div class="hidden sm:flex flex-col items-center justify-center w-12 h-12 rounded-lg bg-muted/50 flex-shrink-0">
                <MessageSquare class="w-4 h-4 text-muted-foreground mb-0.5" />
                <span class="text-xs font-medium">{{ thread.reply_count }}</span>
              </div>

              <div class="flex-1 min-w-0">
                <!-- Badges -->
                <div v-if="thread.is_pinned || thread.is_locked" class="flex items-center gap-1.5 mb-1.5">
                  <Badge v-if="thread.is_pinned" variant="default" class="text-xs px-1.5 py-0">
                    <Pin class="w-3 h-3 mr-1" /> Pinned
                  </Badge>
                  <Badge v-if="thread.is_locked" variant="secondary" class="text-xs px-1.5 py-0">
                    <Lock class="w-3 h-3 mr-1" /> Locked
                  </Badge>
                </div>

                <!-- Title -->
                <h3 class="font-medium text-sm lg:text-base text-foreground group-hover:text-primary transition-colors line-clamp-2">
                  {{ thread.title }}
                </h3>

                <!-- Author info -->
                <div class="flex items-center gap-2 mt-1.5 text-xs text-muted-foreground">
                  <User class="w-3 h-3" />
                  <span class="font-medium text-foreground/80">{{ thread.author }}</span>
                  <span v-if="thread.character_name" class="text-muted-foreground">({{ thread.character_name }})</span>
                  <span>•</span>
                  <span>{{ formatDate(thread.created_at) }}</span>
                </div>

                <!-- Stats row (mobile) -->
                <div class="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                  <span class="sm:hidden flex items-center gap-1">
                    <MessageSquare class="w-3 h-3" />
                    {{ thread.reply_count }}
                  </span>
                  <span class="flex items-center gap-1">
                    <Eye class="w-3 h-3" />
                    {{ thread.view_count }}
                  </span>
                  <span class="flex items-center gap-1">
                    <Clock class="w-3 h-3" />
                    {{ formatDate(thread.last_post_at) }}
                  </span>
                </div>
              </div>

              <!-- Desktop: stats column -->
              <div class="hidden lg:flex flex-col items-end text-xs text-muted-foreground gap-1">
                <div class="flex items-center gap-1">
                  <Eye class="w-3.5 h-3.5" />
                  <span>{{ thread.view_count }}</span>
                </div>
                <div class="text-muted-foreground/70">
                  Last: {{ formatDate(thread.last_post_at) }}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Empty State -->
      <Card v-if="threads.length === 0">
        <CardContent class="pt-6 text-center text-muted-foreground">
          <p>No threads yet. Be the first to start a discussion!</p>
          <Button
            v-if="isAuthenticated"
            @click="router.push(`/forum/new-thread/${categoryId}`)"
            class="mt-4"
          >
            Create First Thread
          </Button>
        </CardContent>
      </Card>

      <!-- Pagination -->
      <div v-if="totalPages > 1" class="mt-8">
        <PaginationWithEllipsis
          :current-page="currentPage"
          :total-pages="totalPages"
          @page-change="loadThreads"
        />
      </div>
    </div>
  </div>
</template>
