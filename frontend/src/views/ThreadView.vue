<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useHead } from '@unhead/vue'
import { toast } from 'vue-sonner'
import { forumApi } from '@/services/api'
import { useAuth } from '@/composables/useAuth'
import { useWebSocket } from '@/composables/useWebSocket'
import { usePostThread } from '@/composables/usePostThread'
import { useDraftAutosave } from '@/composables/useDraftAutosave'
import { useMentionAutocomplete } from '@/composables/useMentionAutocomplete'
import { parseQuotes, hasQuotes } from '@/utils/quoteParser'
import { parseAnsiForVue, parseAnsiToHtml, slugify, stripAnsiCodes } from '@/utils/ansiParser'
import type { ForumThread, ForumPost, PostReaction } from '@/types'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
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
import TipTapEditor from '@/components/forum/editor/TipTapEditor.vue'
import PostActionsMenu from '@/components/forum/PostActionsMenu.vue'
import SelectionQuoteButton from '@/components/forum/SelectionQuoteButton.vue'
import RenderedQuote from '@/components/forum/RenderedQuote.vue'
import PostContent from '@/components/forum/PostContent.vue'
import BreadcrumbsNav from '@/components/layout/BreadcrumbsNav.vue'
import PaginationWithEllipsis from '@/components/forum/PaginationWithEllipsis.vue'
import ReactionDisplay from '@/components/forum/ReactionDisplay.vue'
import ModeratorToolbar from '@/components/forum/ModeratorToolbar.vue'
import ThreadMoveDialog from '@/components/forum/ThreadMoveDialog.vue'
import SubscribeButton from '@/components/forum/SubscribeButton.vue'
import MentionAutocomplete from '@/components/forum/MentionAutocomplete.vue'
import PollDisplay from '@/components/forum/PollDisplay.vue'
import ImageLightbox from '@/components/ui/ImageLightbox.vue'
import { RotateCcw } from 'lucide-vue-next'

const props = defineProps<{
  threadId: string
}>()

const router = useRouter()
const { isAuthenticated, accountName, selectedCharacter, permissions } = useAuth()
const { onForumPost, offForumPost } = useWebSocket()

const thread = ref<ForumThread | null>(null)
const category = ref<{ id: number; name: string } | null>(null)
const posts = ref<ForumPost[]>([])
const isLoading = ref(true)
const error = ref<string | null>(null)
const currentPage = ref(1)
const totalPages = ref(1)

// Dynamic page title
const pageTitle = computed(() => {
  if (thread.value?.title) {
    const cleanTitle = stripAnsiCodes(thread.value.title)
    return `DurisMUD | ${cleanTitle}`
  }
  return 'DurisMUD | Forum Thread'
})

useHead({
  title: pageTitle,
})

// Reply state
const replyContent = ref('')
const isSubmitting = ref(false)
const replyingToPostId = ref<number | null>(null)
const replyingToPost = ref<ForumPost | null>(null)
const isQuoting = ref(false) // Track if user is quoting vs replying

// Edit state
const editingPostId = ref<number | null>(null)
const editContent = ref('')

// Delete state
const deletingPostId = ref<number | null>(null)

// Restore state
const restoringPostId = ref<number | null>(null)
const restoringThread = ref(false)
const restoreError = ref<string | null>(null)

// Moderation state
const showMoveDialog = ref(false)

// New post animation state
const newPostId = ref<number | null>(null)

// Lightbox state
const lightboxOpen = ref(false)
const lightboxSrc = ref('')
const lightboxAlt = ref('')

// Threading
const { threadedPosts, getParentPost } = usePostThread(posts)

const threadIdNum = computed(() => parseInt(props.threadId))
const isModerator = computed(() => permissions.value?.canModerate || false)
const isOverlord = computed(() => (permissions.value?.immortalLevel ?? 0) >= 60)

// Convert thread to post-like object for PostActionsMenu
const threadAsPost = computed(() => {
  if (!thread.value) return null
  return {
    id: thread.value.id,
    thread_id: thread.value.id,
    author: thread.value.author_account_name || thread.value.author,
    character_name: thread.value.character_name,
    character_pid: thread.value.character_pid,
    content: thread.value.content || '',
    ip_address: thread.value.ip_address,
    parent_post_id: null,
    created_at: thread.value.created_at,
    edited_at: thread.value.updated_at,
    is_deleted: thread.value.is_deleted,
    reactions: thread.value.reactions || [],
    guild_name: thread.value.guild_name,
    guild_id: thread.value.guild_id,
    guild_rank_title: thread.value.guild_rank_title,
    character_title: thread.value.character_title,
  } as ForumPost
})

// Draft autosave for replies
const draftKey = computed(() => `forum_draft_reply_${threadIdNum.value}`)
const {
  hasDraft,
  formatDraftTime,
  restoreDraft,
  clearDraft: clearReplyDraft,
} = useDraftAutosave(draftKey.value, replyContent, undefined, replyingToPostId)
const showDraftPrompt = ref(false)

// Mention autocomplete
const replyTextareaRef = ref<HTMLTextAreaElement | null>(null)
const {
  suggestions: mentionSuggestions,
  selectedIndex: mentionSelectedIndex,
  isOpen: isMentionDropdownOpen,
  selectMention,
  getDropdownPosition,
} = useMentionAutocomplete(replyTextareaRef)

const mentionDropdownPosition = computed(() => getDropdownPosition())

// Check for draft on mount
watch(
  thread,
  (newThread) => {
    if (newThread && hasDraft.value && !replyContent.value) {
      showDraftPrompt.value = true
    }
  },
  { immediate: true },
)

async function loadThread(page: number = 1) {
  isLoading.value = true
  error.value = null

  try {
    const response = await forumApi.getThread(threadIdNum.value, page, 50)
    thread.value = response.thread
    category.value = response.category
    posts.value = response.posts
    currentPage.value = response.pagination.page
    totalPages.value = response.pagination.totalPages
  } catch (err: any) {
    error.value = err.response?.data?.error || 'Failed to load thread'
  } finally {
    isLoading.value = false
  }
}

// ============================================================================
// Reply Functions
// ============================================================================

async function submitReply() {
  if (!replyContent.value.trim()) return

  isSubmitting.value = true
  try {
    const result = await forumApi.createPost(
      threadIdNum.value,
      replyContent.value,
      selectedCharacter.value?.pid,
      replyingToPostId.value || undefined,
    )

    // Append new post to local state instead of reloading
    if (result.post) {
      posts.value.push(result.post)
      // Update thread reply count
      if (thread.value) {
        thread.value.reply_count = (thread.value.reply_count || 0) + 1
      }
      // Trigger fade-in animation
      newPostId.value = result.post.id
      setTimeout(() => {
        newPostId.value = null
      }, 1000)
    }

    replyContent.value = ''
    replyingToPostId.value = null
    replyingToPost.value = null
    isQuoting.value = false
    clearReplyDraft() // Clear draft after successful submission

    // Scroll to the new post
    setTimeout(() => {
      const postElements = document.querySelectorAll('[class*="Card"]')
      const lastPost = postElements[postElements.length - 1]
      lastPost?.scrollIntoView({ behavior: 'smooth' })
    }, 100)
  } catch (err: any) {
    error.value = err.response?.data?.error || 'Failed to post reply'
  } finally {
    isSubmitting.value = false
  }
}

function startReply(post: ForumPost | null) {
  if (post) {
    replyingToPostId.value = post.id
    replyingToPost.value = post
  } else {
    replyingToPostId.value = null
    replyingToPost.value = null
  }
  replyContent.value = '' // Clear any quote content
  isQuoting.value = false

  // Scroll to reply form
  setTimeout(() => {
    document.querySelector('.reply-form')?.scrollIntoView({ behavior: 'smooth' })
  }, 100)
}

function cancelReply() {
  replyingToPostId.value = null
  replyingToPost.value = null
  isQuoting.value = false
}

// ============================================================================
// Quote Functions
// ============================================================================

function startQuote(post: ForumPost, selectedText?: string) {
  const quotedAuthor = post.character_name || post.author || 'Unknown'

  // Use selected text if provided, otherwise first 5 lines of content
  const textToQuote = selectedText || post.content.split('\n').slice(0, 5).join('\n')

  // Format as BBCode quote
  const formattedQuote = `[quote=${quotedAuthor}]${textToQuote}[/quote]\n\n`

  replyingToPostId.value = post.id
  replyingToPost.value = post
  replyContent.value = formattedQuote
  isQuoting.value = true

  // Scroll to reply form
  setTimeout(() => {
    document.querySelector('.reply-form')?.scrollIntoView({ behavior: 'smooth' })
  }, 100)
}

function handleSelectionQuote(data: { selectedText: string; postId: number }) {
  // Find the post by ID
  const post = posts.value.find((p) => p.id === data.postId)
  if (post) {
    startQuote(post, data.selectedText)
  }
}

function startQuoteThread() {
  if (!thread.value || !thread.value.content) return

  const quotedAuthor =
    thread.value.character_name ||
    thread.value.author_account_name ||
    thread.value.author ||
    'Unknown'
  const textToQuote = thread.value.content.split('\n').slice(0, 5).join('\n')
  const formattedQuote = `[quote=${quotedAuthor}]${textToQuote}[/quote]\n\n`

  replyingToPostId.value = null
  replyingToPost.value = null
  replyContent.value = formattedQuote
  isQuoting.value = true

  // Scroll to reply form
  setTimeout(() => {
    document.querySelector('.reply-form')?.scrollIntoView({ behavior: 'smooth' })
  }, 100)
}

// ============================================================================
// Edit Functions
// ============================================================================

function startEdit(post: ForumPost) {
  editingPostId.value = post.id
  editContent.value = post.content
}

async function saveEdit(postId: number) {
  if (!editContent.value.trim()) return

  try {
    await forumApi.updatePost(postId, editContent.value)
    await loadThread(currentPage.value) // Reload to show changes
    editingPostId.value = null
    editContent.value = ''
  } catch (err: any) {
    error.value = err.response?.data?.error || 'Failed to update post'
  }
}

function cancelEdit() {
  editingPostId.value = null
  editContent.value = ''
}

// ============================================================================
// Delete Functions
// ============================================================================

function startDelete(postId: number) {
  deletingPostId.value = postId
}

async function confirmDelete() {
  if (!deletingPostId.value) return

  try {
    // Find the post to check if user is the author
    const post = posts.value.find((p) => p.id === deletingPostId.value)
    const isAuthor = post && post.author === accountName.value

    if (isModerator.value) {
      // Moderators always use soft delete
      await forumApi.moderatorDeletePost(deletingPostId.value)
    } else if (isAuthor) {
      // Authors can only delete their own posts (soft delete)
      await forumApi.moderatorDeletePost(deletingPostId.value)
    } else {
      throw new Error('You do not have permission to delete this post')
    }

    await loadThread(currentPage.value) // Reload to update list
    deletingPostId.value = null
  } catch (err: any) {
    error.value = err.response?.data?.error || 'Failed to delete post'
    deletingPostId.value = null
  }
}

function cancelDelete() {
  deletingPostId.value = null
}

function startRestorePost(postId: number) {
  restoringPostId.value = postId
}

async function confirmRestorePost() {
  if (!restoringPostId.value) return

  try {
    await forumApi.restorePost(restoringPostId.value)
    // Reload thread to show restored post
    loadThread(currentPage.value)
    restoringPostId.value = null
    restoreError.value = null
  } catch (err: any) {
    restoreError.value = err.response?.data?.error || 'Failed to restore post'
  }
}

function cancelRestorePost() {
  restoringPostId.value = null
  restoreError.value = null
}

// ============================================================================
// Reaction Functions
// ============================================================================

async function handleAddReaction(postId: number, emoji: string) {
  try {
    await forumApi.addReaction(postId, emoji)

    // Update local state instead of reloading entire page
    const post = posts.value.find((p) => p.id === postId)
    if (post) {
      if (!post.reactions) {
        post.reactions = []
      }

      const existingReaction = post.reactions.find((r) => r.emoji === emoji)
      if (existingReaction) {
        existingReaction.count++
        existingReaction.userReacted = true
      } else {
        post.reactions.push({
          emoji,
          count: 1,
          userReacted: true,
        })
      }
    }
  } catch (err: any) {
    error.value = err.response?.data?.error || 'Failed to add reaction'
  }
}

async function handleRemoveReaction(postId: number, emoji: string) {
  try {
    await forumApi.removeReaction(postId, emoji)

    // Update local state instead of reloading entire page
    const post = posts.value.find((p) => p.id === postId)
    if (post && post.reactions) {
      const reaction = post.reactions.find((r) => r.emoji === emoji)
      if (reaction) {
        reaction.count--
        reaction.userReacted = false

        // Remove reaction from array if count is 0
        if (reaction.count === 0) {
          post.reactions = post.reactions.filter((r) => r.emoji !== emoji)
        }
      }
    }
  } catch (err: any) {
    error.value = err.response?.data?.error || 'Failed to remove reaction'
  }
}

// Thread reactions
async function handleAddReactionToThread(emoji: string) {
  try {
    await forumApi.addReaction(thread.value!.id, emoji, true)

    // Update local state
    if (thread.value) {
      if (!thread.value.reactions) {
        thread.value.reactions = []
      }

      const existingReaction = thread.value.reactions.find((r: PostReaction) => r.emoji === emoji)
      if (existingReaction) {
        existingReaction.count++
        existingReaction.userReacted = true
      } else {
        thread.value.reactions.push({
          emoji,
          count: 1,
          userReacted: true,
        })
      }
    }
  } catch (err: any) {
    error.value = err.response?.data?.error || 'Failed to add reaction'
  }
}

async function handleRemoveReactionFromThread(emoji: string) {
  try {
    await forumApi.removeReaction(thread.value!.id, emoji, true)

    // Update local state
    if (thread.value && thread.value.reactions) {
      const reaction = thread.value.reactions.find((r: PostReaction) => r.emoji === emoji)
      if (reaction) {
        reaction.count--
        reaction.userReacted = false

        // Remove reaction from array if count is 0
        if (reaction.count === 0) {
          thread.value.reactions = thread.value.reactions.filter(
            (r: PostReaction) => r.emoji !== emoji,
          )
        }
      }
    }
  } catch (err: any) {
    error.value = err.response?.data?.error || 'Failed to remove reaction'
  }
}

// ============================================================================
// Moderation Functions
// ============================================================================

async function handleToggleLock() {
  if (!thread.value) return

  try {
    await forumApi.toggleLock(thread.value.id, !thread.value.is_locked)
    // Update local state
    thread.value.is_locked = !thread.value.is_locked
  } catch (err: any) {
    error.value = err.response?.data?.error || 'Failed to toggle lock'
  }
}

async function handleTogglePin() {
  if (!thread.value) return

  try {
    await forumApi.togglePin(thread.value.id, !thread.value.is_pinned)
    // Update local state
    thread.value.is_pinned = !thread.value.is_pinned
  } catch (err: any) {
    error.value = err.response?.data?.error || 'Failed to toggle pin'
  }
}

async function handleDeleteThread(reason: string | null) {
  if (!thread.value) return

  try {
    await forumApi.moderatorDeleteThread(thread.value.id, reason || undefined)
    // Redirect to category after deletion
    if (category.value) {
      router.push(`/forum/category/${category.value.id}`)
    } else {
      router.push('/forum')
    }
  } catch (err: any) {
    error.value = err.response?.data?.error || 'Failed to delete thread'
  }
}

function handleMoveThread() {
  showMoveDialog.value = true
}

function handleMoveSuccess() {
  // Reload thread to get updated category
  loadThread(currentPage.value)
}

function startRestoreThread() {
  if (!thread.value) return
  restoringThread.value = true
}

async function confirmRestoreThread() {
  if (!thread.value) return

  try {
    await forumApi.restoreThread(thread.value.id)
    // Reload thread to show restored state
    loadThread(currentPage.value)
    restoringThread.value = false
    restoreError.value = null
  } catch (err: any) {
    restoreError.value = err.response?.data?.error || 'Failed to restore thread'
  }
}

function cancelRestoreThread() {
  restoringThread.value = false
  restoreError.value = null
}

// Thread editing
const editingThread = ref(false)
const editThreadContent = ref('')

function startEditThread() {
  if (!thread.value) return
  editingThread.value = true
  editThreadContent.value = thread.value.content || ''
}

async function saveThreadEdit() {
  if (!thread.value || !editThreadContent.value.trim()) return

  try {
    await forumApi.updateThread(thread.value.id, thread.value.title, editThreadContent.value)
    await loadThread(currentPage.value)
    editingThread.value = false
    editThreadContent.value = ''
  } catch (err: any) {
    error.value = err.response?.data?.error || 'Failed to update thread'
  }
}

function cancelThreadEdit() {
  editingThread.value = false
  editThreadContent.value = ''
}

// ============================================================================
// Utility Functions
// ============================================================================

function formatDate(dateString: string): string {
  const date = new Date(dateString)
  return date.toLocaleString()
}

function getIndentStyle(depth: number) {
  return {
    marginLeft: `${depth * 2}rem`,
    borderLeft: depth > 0 ? '2px solid rgb(55, 65, 81)' : 'none',
  }
}

// Lightbox functions
function openLightbox(src: string, alt?: string) {
  lightboxSrc.value = src
  lightboxAlt.value = alt || ''
  lightboxOpen.value = true
}

function closeLightbox() {
  lightboxOpen.value = false
}

// Setup click handlers for images in post content
function setupImageClickHandlers() {
  // Use event delegation on the document for dynamically rendered content
  document.addEventListener('click', handleImageClick)
}

function handleImageClick(event: MouseEvent) {
  const target = event.target as HTMLElement
  if (target.tagName === 'IMG' && target.closest('.prose')) {
    const img = target as HTMLImageElement
    // Don't open lightbox for:
    // - Images inside TipTap editor (has .tiptap ancestor)
    // - Avatars or small UI images
    if (img.closest('.tiptap')) {
      return // Don't intercept editor clicks
    }
    if (img.classList.contains('forum-inline-image') || img.closest('.forum-post-content')) {
      event.preventDefault()
      openLightbox(img.src, img.alt)
    }
  }
}

// WebSocket handler for new forum posts
function handleNewForumPost(data: { threadId: number; post: any; authorAccount: string }) {
  // Only show toast if:
  // 1. The post is for the current thread
  // 2. The author is not the current user
  if (data.threadId === threadIdNum.value && data.authorAccount !== accountName.value) {
    const authorName = data.post.character_name || data.authorAccount
    toast('New Reply', {
      description: `${authorName} posted a new reply`,
      action: {
        label: 'View',
        onClick: () => {
          // Append the post and scroll to it
          if (!posts.value.find((p) => p.id === data.post.id)) {
            posts.value.push(data.post)
            // Update thread reply count
            if (thread.value) {
              thread.value.reply_count = (thread.value.reply_count || 0) + 1
            }
            // Trigger fade-in animation
            newPostId.value = data.post.id
            setTimeout(() => {
              newPostId.value = null
            }, 1000)
          }
          // Scroll to the new post
          setTimeout(() => {
            const postElements = document.querySelectorAll('[class*="Card"]')
            const lastPost = postElements[postElements.length - 1]
            lastPost?.scrollIntoView({ behavior: 'smooth' })
          }, 100)
        },
      },
      duration: 10000,
    })
  }
}

onMounted(() => {
  loadThread()
  setupImageClickHandlers()
  onForumPost(handleNewForumPost)
})

onUnmounted(() => {
  document.removeEventListener('click', handleImageClick)
  offForumPost(handleNewForumPost)
})
</script>

<template>
  <div>
    <!-- Breadcrumbs -->
    <BreadcrumbsNav :category="category" :thread="thread ? { id: thread.id, title: thread.title } : null" />

    <!-- Header -->
    <div class="mb-8">
      <Button variant="ghost" @click="router.back()">← Back</Button>
    </div>

    <!-- Loading State -->
    <div v-if="isLoading" class="space-y-4">
      <Card>
        <CardHeader>
          <Skeleton class="h-8 w-96" />
          <Skeleton class="h-4 w-48 mt-2" />
        </CardHeader>
      </Card>
      <Card v-for="i in 3" :key="i">
        <CardContent class="pt-6">
          <Skeleton class="h-20 w-full" />
        </CardContent>
      </Card>
    </div>

    <!-- Error State -->
    <Card v-else-if="error" class="border-destructive">
      <CardContent class="pt-6">
        <p class="text-destructive">{{ error }}</p>
        <Button @click="loadThread(currentPage)" class="mt-4">Retry</Button>
      </CardContent>
    </Card>

    <!-- Thread Content -->
    <div v-else class="space-y-4">
      <!-- Thread Header -->
      <Card>
        <CardHeader class="p-4 lg:p-6">
          <div class="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-3">
            <div class="flex-1 min-w-0">
              <div class="flex items-center gap-2 flex-wrap">
                <Badge v-if="thread?.is_pinned" variant="default">📌 Pinned</Badge>
                <Badge v-if="thread?.is_locked" variant="secondary">🔒 Locked</Badge>
              </div>
              <CardTitle class="text-xl lg:text-2xl mt-2 break-words">{{ thread?.title }}</CardTitle>
              <div class="text-xs lg:text-sm text-muted-foreground mt-2">
                Started by <span class="font-medium">{{ thread?.author }}</span>
                <span v-if="thread?.character_name" class="text-xs">({{ thread.character_name }})</span>
                • {{ formatDate(thread?.created_at || '') }}
              </div>
            </div>
            <div class="flex items-center lg:items-start gap-4">
              <div class="text-xs lg:text-sm text-muted-foreground">
                <span class="lg:block">👁️ {{ thread?.view_count }} views</span>
                <span class="lg:hidden"> • </span>
                <span class="lg:block">💬 {{ thread?.reply_count }} replies</span>
              </div>
              <SubscribeButton
                v-if="thread"
                :thread-id="thread.id"
                :is-authenticated="isAuthenticated"
              />
            </div>
          </div>
        </CardHeader>
      </Card>

      <!-- Moderator Toolbar -->
      <ModeratorToolbar
        v-if="thread && isModerator"
        :thread="thread"
        :is-moderator="isModerator"
        @toggle-lock="handleToggleLock"
        @toggle-pin="handleTogglePin"
        @delete-thread="handleDeleteThread"
        @restore-thread="startRestoreThread"
        @move-thread="handleMoveThread"
      />

      <!-- Thread Move Dialog -->
      <ThreadMoveDialog
        v-if="thread && category"
        v-model:open="showMoveDialog"
        :thread-id="thread.id"
        :current-category-id="category.id"
        @success="handleMoveSuccess"
      />

      <!-- Thread Opening Post -->
      <Card
        v-if="thread && thread.content"
        :class="{
          'border-l-4 border-l-primary': (thread.author_account_name || thread.author) === accountName
        }"
        class="mb-6"
      >
        <CardContent class="p-0">
          <!-- Mobile horizontal author header -->
          <div class="lg:hidden p-3 border-b flex items-center gap-3">
            <!-- Small Avatar -->
            <div class="w-10 h-10 flex-shrink-0 overflow-hidden rounded-full">
              <img
                v-if="thread.author_avatar_url"
                :src="thread.author_avatar_url"
                :alt="thread.character_name || thread.author_account_name || thread.author || 'Avatar'"
                class="w-full h-full object-cover"
              />
              <div
                v-else
                class="w-full h-full bg-primary/10 flex items-center justify-center"
              >
                <span class="text-sm font-bold text-primary">
                  {{ ((thread.character_name || thread.author_account_name || thread.author || '?').charAt(0).toUpperCase()) }}
                </span>
              </div>
            </div>
            <!-- Author info -->
            <div class="flex-1 min-w-0">
              <div class="flex items-center gap-2 flex-wrap">
                <RouterLink
                  v-if="thread.author_account_name || thread.author"
                  :to="`/user/${thread.author_account_name || thread.author}`"
                  class="font-semibold text-sm hover:underline"
                >
                  {{ thread.author_account_name || thread.author }}
                </RouterLink>
                <span v-if="thread.character_name" class="text-xs text-muted-foreground">
                  ({{ thread.character_name }})
                </span>
              </div>
              <div class="flex items-center gap-2 text-xs text-muted-foreground flex-wrap">
                <span
                  v-if="thread.guild_rank_title || thread.character_title"
                  v-html="parseAnsiToHtml(thread.character_title || thread.guild_rank_title || '')"
                ></span>
                <RouterLink
                  v-if="thread.guild_name"
                  :to="`/guild/${slugify(thread.guild_name)}`"
                  class="hover:underline"
                >
                  <span v-html="parseAnsiForVue(thread.guild_name)"></span>
                </RouterLink>
              </div>
            </div>
            <!-- Post number -->
            <div class="text-sm font-semibold text-muted-foreground">#1</div>
          </div>

          <div class="flex gap-0">
            <!-- Left Column: Author Info (desktop only) -->
            <div class="hidden lg:block w-44 flex-shrink-0 p-4 border-r">
              <!-- Avatar -->
              <div class="w-20 h-20 mb-3 mx-auto overflow-hidden">
                <img
                  v-if="thread.author_avatar_url"
                  :src="thread.author_avatar_url"
                  :alt="thread.character_name || thread.author_account_name || thread.author || 'Avatar'"
                  class="w-full h-full object-cover"
                />
                <div
                  v-else
                  class="w-full h-full bg-primary/10 flex items-center justify-center"
                >
                  <span class="text-2xl font-bold text-primary">
                    {{ ((thread.character_name || thread.author_account_name || thread.author || '?').charAt(0).toUpperCase()) }}
                  </span>
                </div>
              </div>

              <!-- Username -->
              <div class="text-center space-y-1">
                <RouterLink
                  v-if="thread.author_account_name || thread.author"
                  :to="`/user/${thread.author_account_name || thread.author}`"
                  class="font-semibold text-sm hover:underline"
                >
                  {{ thread.author_account_name || thread.author }}
                </RouterLink>

                <!-- Character Name (links to user profile) -->
                <div v-if="thread.character_name">
                  <RouterLink
                    :to="`/user/${thread.author_account_name || thread.author}`"
                    class="text-xs hover:underline"
                  >
                    {{ thread.character_name }}
                  </RouterLink>
                </div>

                <!-- Title (rank or god-set title) -->
                <div
                  v-if="thread.guild_rank_title || thread.character_title"
                  class="text-xs text-muted-foreground"
                  v-html="parseAnsiToHtml(thread.character_title || thread.guild_rank_title || '')"
                ></div>

                <!-- Guild Name with ANSI colors -->
                <div v-if="thread.guild_name">
                  <RouterLink
                    :to="`/guild/${slugify(thread.guild_name)}`"
                    class="text-xs hover:underline"
                  >
                    <span v-html="parseAnsiForVue(thread.guild_name)"></span>
                  </RouterLink>
                </div>

                <!-- IP Address (Overlord-only) -->
                <div v-if="isOverlord && thread.ip_address" class="text-xs text-amber-500 mt-2 font-mono">
                  IP: {{ thread.ip_address }}
                </div>
              </div>
            </div>

            <!-- Right Column: Post Content -->
            <div class="flex-1 min-w-0 p-3 lg:p-4">
              <!-- Header -->
              <div class="flex items-center justify-between mb-3 pb-2 border-b">
                <div class="text-xs text-muted-foreground">
                  Posted {{ formatDate(thread.created_at) }}
                  <span v-if="thread.updated_at && thread.updated_at !== thread.created_at">
                    • Edited {{ formatDate(thread.updated_at) }}
                  </span>
                </div>
                <div class="hidden lg:block text-sm font-semibold text-muted-foreground">
                  #1
                </div>
              </div>

              <!-- Thread Content - Edit Mode -->
              <div v-if="editingThread">
                <TipTapEditor
                  v-model="editThreadContent"
                  placeholder="Edit your thread..."
                  class="mb-3"
                />
                <div class="flex gap-2">
                  <Button size="sm" @click="saveThreadEdit">Save</Button>
                  <Button size="sm" variant="outline" @click="cancelThreadEdit">Cancel</Button>
                </div>
              </div>

              <!-- Thread Content - View Mode -->
              <div v-else class="prose prose-sm dark:prose-invert max-w-none mb-4 overflow-x-auto">
                <PostContent :content="thread.content" />
              </div>

              <!-- Poll Display -->
              <PollDisplay
                v-if="thread?.has_poll"
                :thread-id="threadIdNum"
                class="mt-4"
              />

              <!-- Actions & Reactions -->
              <div class="flex items-center justify-between gap-3 pt-4 border-t">
                <div class="flex-1">
                  <ReactionDisplay
                    :reactions="thread.reactions || []"
                    :post-id="thread.id"
                    :is-authenticated="isAuthenticated"
                    @add-reaction="handleAddReactionToThread($event)"
                    @remove-reaction="handleRemoveReactionFromThread($event)"
                  />
                </div>

                <!-- Post Actions Menu (using thread as fake post) -->
                <PostActionsMenu
                  v-if="threadAsPost"
                  :post="threadAsPost"
                  :is-author="(thread.author_account_name || thread.author) === accountName"
                  :is-moderator="isModerator"
                  :is-authenticated="isAuthenticated"
                  :hide-reply="true"
                  @edit="startEditThread"
                  @delete="startDelete(thread.id)"
                  @quote="startQuoteThread"
                />
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <!-- Posts (Replies start at #2) -->
      <template v-for="(post, index) in threadedPosts" :key="post.id">
        <!-- Deleted Post - Simple Line -->
        <div
          v-if="post.is_deleted"
          class="flex items-center gap-3 text-muted-foreground text-sm py-3"
          :style="getIndentStyle(post.depth)"
        >
          <div class="flex-1 flex items-center gap-3">
            <hr class="flex-1 border-t border-muted-foreground/30" />
            <span class="whitespace-nowrap">
              [Deleted] - Post by {{ post.character_name || post.author }} on {{ formatDate(post.created_at) }}
            </span>
            <hr class="flex-1 border-t border-muted-foreground/30" />
          </div>
          <Button
            v-if="isModerator"
            variant="ghost"
            size="sm"
            @click="startRestorePost(post.id)"
            class="flex-shrink-0"
          >
            <RotateCcw class="h-4 w-4 mr-1" />
            Restore
          </Button>
        </div>

        <!-- Normal Post - Classic Forum Layout -->
        <Card
          v-else
          :class="{
            'border-l-4 border-l-primary': post.author === accountName,
            'animate-fade-in': post.id === newPostId
          }"
          :style="getIndentStyle(post.depth)"
        >
          <CardContent class="p-0">
            <!-- Mobile horizontal author header -->
            <div class="lg:hidden p-3 border-b flex items-center gap-3">
              <!-- Small Avatar -->
              <div class="w-10 h-10 flex-shrink-0 overflow-hidden rounded-full">
                <img
                  v-if="post.author_avatar_url"
                  :src="post.author_avatar_url"
                  :alt="post.character_name || post.author || 'Avatar'"
                  class="w-full h-full object-cover"
                />
                <div
                  v-else
                  class="w-full h-full bg-primary/10 flex items-center justify-center"
                >
                  <span class="text-sm font-bold text-primary">
                    {{ (post.character_name || post.author).charAt(0).toUpperCase() }}
                  </span>
                </div>
              </div>
              <!-- Author info -->
              <div class="flex-1 min-w-0">
                <div class="flex items-center gap-2 flex-wrap">
                  <RouterLink
                    :to="`/user/${post.author}`"
                    class="font-semibold text-sm hover:underline"
                  >
                    {{ post.author }}
                  </RouterLink>
                  <span v-if="post.character_name" class="text-xs text-muted-foreground">
                    ({{ post.character_name }})
                  </span>
                </div>
                <div class="flex items-center gap-2 text-xs text-muted-foreground flex-wrap">
                  <span
                    v-if="post.guild_rank_title || post.character_title"
                    v-html="parseAnsiToHtml(post.character_title || post.guild_rank_title || '')"
                  ></span>
                  <RouterLink
                    v-if="post.guild_name"
                    :to="`/guild/${slugify(post.guild_name)}`"
                    class="hover:underline"
                  >
                    <span v-html="parseAnsiForVue(post.guild_name)"></span>
                  </RouterLink>
                </div>
              </div>
              <!-- Post number -->
              <div class="text-sm font-semibold text-muted-foreground">#{{ (currentPage - 1) * 50 + index + 2 }}</div>
            </div>

            <div class="flex gap-0">
              <!-- Left Column: Author Info (desktop only) -->
              <div class="hidden lg:block w-44 flex-shrink-0 p-4 border-r">
                <!-- Avatar -->
                <div class="w-20 h-20 mb-3 mx-auto overflow-hidden">
                  <img
                    v-if="post.author_avatar_url"
                    :src="post.author_avatar_url"
                    :alt="post.character_name || post.author || 'Avatar'"
                    class="w-full h-full object-cover"
                  />
                  <div
                    v-else
                    class="w-full h-full bg-primary/10 flex items-center justify-center"
                  >
                    <span class="text-2xl font-bold text-primary">
                      {{ (post.character_name || post.author).charAt(0).toUpperCase() }}
                    </span>
                  </div>
                </div>

                <!-- Username -->
                <div class="text-center space-y-1">
                  <RouterLink
                    :to="`/user/${post.author}`"
                    class="font-semibold text-sm hover:underline"
                  >
                    {{ post.author }}
                  </RouterLink>

                  <!-- Character Name (links to user profile) -->
                  <div v-if="post.character_name">
                    <RouterLink
                      :to="`/user/${post.author}`"
                      class="text-xs hover:underline"
                    >
                      {{ post.character_name }}
                    </RouterLink>
                  </div>

                  <!-- Title (rank or god-set title) -->
                  <div
                    v-if="post.guild_rank_title || post.character_title"
                    class="text-xs text-muted-foreground"
                    v-html="parseAnsiToHtml(post.character_title || post.guild_rank_title || '')"
                  ></div>

                  <!-- Guild Name with ANSI colors (clickable) -->
                  <div v-if="post.guild_name">
                    <RouterLink
                      :to="`/guild/${slugify(post.guild_name)}`"
                      class="text-xs hover:underline"
                    >
                      <span v-html="parseAnsiForVue(post.guild_name)"></span>
                    </RouterLink>
                  </div>

                  <!-- IP Address (Overlord-only) -->
                  <div v-if="isOverlord && post.ip_address" class="text-xs text-amber-500 mt-2 font-mono">
                    IP: {{ post.ip_address }}
                  </div>
                </div>
              </div>

              <!-- Right Column: Post Content -->
              <div class="flex-1 min-w-0 p-3 lg:p-4">
                <!-- Header with Post Number -->
                <div class="flex items-center justify-between mb-3 pb-2 border-b">
                  <div class="text-xs text-muted-foreground">
                    Posted {{ formatDate(post.created_at) }}
                    <span v-if="post.edited_at">
                      • Edited {{ formatDate(post.edited_at) }}
                    </span>
                  </div>
                  <div class="hidden lg:block text-sm font-semibold text-muted-foreground">
                    #{{ (currentPage - 1) * 50 + index + 2 }}
                  </div>
                </div>

                <!-- Parent Post Reference (for replies/quotes) -->
                <div v-if="post.parent_post_id && getParentPost(post.id)" class="text-xs text-muted-foreground mb-3 bg-muted/50 p-2 rounded">
                  <span v-if="hasQuotes(post.content)" class="inline-flex items-center gap-1">
                    💬 Quoting
                    <span class="font-semibold">
                      {{ getParentPost(post.id)?.character_name || getParentPost(post.id)?.author }}
                    </span>
                  </span>
                  <span v-else class="inline-flex items-center gap-1">
                    ↩ Replying to
                    <span class="font-semibold">
                      {{ getParentPost(post.id)?.character_name || getParentPost(post.id)?.author }}
                    </span>
                  </span>
                </div>

                <!-- Edit Mode -->
                <div v-if="editingPostId === post.id">
                  <TipTapEditor
                    v-model="editContent"
                    placeholder="Edit your post..."
                    class="mb-3"
                  />
                  <div class="flex gap-2">
                    <Button size="sm" @click="saveEdit(post.id)">Save</Button>
                    <Button size="sm" variant="outline" @click="cancelEdit">Cancel</Button>
                  </div>
                </div>

                <!-- View Mode -->
                <div v-else>
                  <!-- Content -->
                  <div
                    class="prose prose-sm dark:prose-invert max-w-none mb-4 overflow-x-auto"
                    :data-post-id="post.id"
                  >
                    <!-- Parse and render quotes and mentions -->
                    <template v-for="(part, idx) in parseQuotes(post.content)" :key="idx">
                      <RenderedQuote
                        v-if="part.type === 'quote'"
                        :author="part.author || 'Unknown'"
                        :content="part.content"
                      />
                      <p v-else class="whitespace-pre-wrap">
                        <PostContent :content="part.content" />
                      </p>
                    </template>
                  </div>

                  <!-- Footer: Reactions and Actions -->
                  <div class="flex items-center justify-between gap-3 pt-3 border-t">
                    <!-- Reactions -->
                    <div class="flex-1">
                      <ReactionDisplay
                        :reactions="post.reactions || []"
                        :post-id="post.id"
                        :is-authenticated="isAuthenticated"
                        @add-reaction="handleAddReaction(post.id, $event)"
                        @remove-reaction="handleRemoveReaction(post.id, $event)"
                      />
                    </div>

                    <!-- Post Actions Menu -->
                    <PostActionsMenu
                      :post="post"
                      :is-author="post.author === accountName"
                      :is-moderator="isModerator"
                      :is-authenticated="isAuthenticated"
                      @edit="startEdit(post)"
                      @delete="startDelete(post.id)"
                      @reply="startReply(post)"
                      @quote="startQuote(post)"
                    />
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </template>

      <!-- Pagination -->
      <div v-if="totalPages > 1" class="mt-8">
        <PaginationWithEllipsis
          :current-page="currentPage"
          :total-pages="totalPages"
          @page-change="loadThread"
        />
      </div>

      <!-- Reply Form -->
      <Card v-if="isAuthenticated && !thread?.is_locked" class="reply-form">
        <CardHeader>
          <CardTitle class="text-lg">
            {{ isQuoting ? 'Quote & Reply' : replyingToPost ? 'Reply' : 'Post Reply' }}
          </CardTitle>
          <div class="text-sm text-muted-foreground">
            <div v-if="selectedCharacter">
              Posting as: {{ selectedCharacter.name }}
            </div>
            <div v-if="replyingToPost">
              <span v-if="isQuoting">💬 Quoting: {{ replyingToPost.character_name || replyingToPost.author }}</span>
              <span v-else>↩ Replying to: {{ replyingToPost.character_name || replyingToPost.author }}</span>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <!-- Draft Restore Prompt -->
          <div v-if="showDraftPrompt" class="mb-4 p-3 bg-muted rounded-md flex items-center justify-between">
            <div class="text-sm">
              <span class="font-medium">Draft found</span>
              <span class="text-muted-foreground ml-2">(saved {{ formatDraftTime() }})</span>
            </div>
            <div class="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                @click="() => { showDraftPrompt = false; clearReplyDraft() }"
              >
                Discard
              </Button>
              <Button
                size="sm"
                @click="() => { restoreDraft(); showDraftPrompt = false }"
              >
                Restore Draft
              </Button>
            </div>
          </div>

          <TipTapEditor
            v-model="replyContent"
            placeholder="Write your reply... (use @username to mention)"
            :editable="!isSubmitting"
          />

          <!-- Draft Status Indicator -->
          <div v-if="hasDraft && replyContent.trim()" class="mt-2 text-xs text-muted-foreground">
            Draft saved {{ formatDraftTime() }}
          </div>

          <div class="mt-4 flex justify-between items-center">
            <Button
              v-if="hasDraft && replyContent.trim()"
              variant="ghost"
              size="sm"
              @click="clearReplyDraft"
            >
              Clear Draft
            </Button>
            <div v-else></div>

            <div class="flex gap-2">
              <Button
                v-if="replyingToPost"
                variant="outline"
                @click="cancelReply"
                :disabled="isSubmitting"
              >
                Cancel
              </Button>
              <Button @click="submitReply" :disabled="isSubmitting || !replyContent.trim()">
                {{ isSubmitting ? 'Posting...' : 'Post Reply' }}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <!-- Locked Notice -->
      <Card v-else-if="thread?.is_locked">
        <CardContent class="pt-6 text-center text-muted-foreground">
          🔒 This thread is locked. No new replies can be posted.
        </CardContent>
      </Card>

      <!-- Login Notice -->
      <Card v-else>
        <CardContent class="pt-6 text-center">
          <p class="text-muted-foreground mb-4">Login to post a reply</p>
          <Button @click="router.push('/login')">Login</Button>
        </CardContent>
      </Card>
    </div>

    <!-- Delete Confirmation Dialog -->
    <AlertDialog :open="deletingPostId !== null">
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete Post</AlertDialogTitle>
          <AlertDialogDescription>
            Are you sure you want to delete this post? This action cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel @click="cancelDelete">Cancel</AlertDialogCancel>
          <AlertDialogAction @click="confirmDelete" class="bg-destructive text-destructive-foreground hover:bg-destructive/90">
            Delete
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>

    <!-- Restore Post Confirmation Dialog -->
    <AlertDialog :open="restoringPostId !== null">
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Restore Post</AlertDialogTitle>
          <AlertDialogDescription>
            Are you sure you want to restore this post? It will become visible to all users again.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel @click="cancelRestorePost">Cancel</AlertDialogCancel>
          <AlertDialogAction @click="confirmRestorePost">
            Restore
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>

    <!-- Restore Thread Confirmation Dialog -->
    <AlertDialog :open="restoringThread">
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Restore Thread</AlertDialogTitle>
          <AlertDialogDescription>
            Are you sure you want to restore this thread? It will become visible to all users again.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel @click="cancelRestoreThread">Cancel</AlertDialogCancel>
          <AlertDialogAction @click="confirmRestoreThread">
            Restore
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>

    <!-- Restore Error Dialog -->
    <AlertDialog :open="restoreError !== null">
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Restore Failed</AlertDialogTitle>
          <AlertDialogDescription>
            {{ restoreError }}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogAction @click="restoreError = null">
            OK
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>

    <!-- Selection Quote Button -->
    <SelectionQuoteButton @quote="handleSelectionQuote" />

    <!-- Mention Autocomplete Dropdown -->
    <MentionAutocomplete
      :suggestions="mentionSuggestions"
      :selected-index="mentionSelectedIndex"
      :is-open="isMentionDropdownOpen"
      :position="mentionDropdownPosition"
      @select-mention="selectMention"
      @update:selected-index="(index) => mentionSelectedIndex = index"
    />

    <!-- Image Lightbox -->
    <ImageLightbox
      :is-open="lightboxOpen"
      :src="lightboxSrc"
      :alt="lightboxAlt"
      @close="closeLightbox"
    />
  </div>
</template>

<style scoped>
/* Restrict image sizes in posts and make them clickable */
:deep(.prose img) {
  max-height: 300px;
  width: auto;
  max-width: 100%;
  cursor: pointer;
  transition: opacity 0.2s;
}

:deep(.prose img:hover) {
  opacity: 0.9;
}

/* Image alignment in posts */
:deep(.prose img[data-alignment="left"]) {
  float: left;
  margin-right: 1rem;
  margin-bottom: 0.5rem;
  max-width: 50%;
}

:deep(.prose img[data-alignment="right"]) {
  float: right;
  margin-left: 1rem;
  margin-bottom: 0.5rem;
  max-width: 50%;
}

:deep(.prose img[data-alignment="center"]) {
  display: block;
  margin-left: auto;
  margin-right: auto;
  float: none;
}

/* Clear floats at end of content container, not after each paragraph */
:deep(.prose)::after {
  content: "";
  display: table;
  clear: both;
}

/* New post fade-in animation */
.animate-fade-in {
  animation: fadeIn 0.5s ease-out;
}

@keyframes fadeIn {
  from {
    opacity: 0;
    transform: translateY(20px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
</style>
