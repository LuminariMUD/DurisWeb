<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import {
  MessageSquare,
  Reply,
  Pencil,
  Trash2,
  ChevronDown,
  ChevronUp,
  Send,
  X,
  Quote,
} from 'lucide-vue-next'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { ScrollArea } from '@/components/ui/scroll-area'
import AnsiText from '@/components/ui/AnsiText.vue'
import { pvpApi } from '@/services/api'
import { useAuth } from '@/composables/useAuth'
import type { PvPBattleComment } from '@/types'
import { formatDistanceToNow } from 'date-fns'

interface Props {
  eventId: number
  initialCommentCount: number
}

const props = defineProps<Props>()

const emit = defineEmits<{
  commentsUpdated: [count: number]
  navigateToQuote: [comment: PvPBattleComment]
  commentsLoaded: [comments: PvPBattleComment[]]
}>()

const { isAuthenticated, accountName, characters, selectedCharacter, selectCharacter } = useAuth()

// State
const comments = ref<PvPBattleComment[]>([])
const isLoading = ref(false)
const isSubmitting = ref(false)
const newCommentContent = ref('')
const replyToComment = ref<PvPBattleComment | null>(null)
const editingComment = ref<PvPBattleComment | null>(null)
const editContent = ref('')
const deleteConfirmOpen = ref(false)
const commentToDelete = ref<PvPBattleComment | null>(null)
const expandedReplies = ref<Set<number>>(new Set())

// Quoted line state
const quotedLine = ref<{ lineNumber: number; text: string; participantId: number } | null>(null)

// Computed
const commentCount = computed(() => {
  let count = comments.value.length
  for (const comment of comments.value) {
    count += comment.replies?.length || 0
  }
  return count
})

// Format relative time
function formatTime(dateStr: string): string {
  return formatDistanceToNow(new Date(dateStr), { addSuffix: true })
}

// Load comments
async function loadComments() {
  isLoading.value = true
  try {
    comments.value = await pvpApi.getComments(props.eventId)
    // Expand all replies by default
    for (const comment of comments.value) {
      if (comment.replies && comment.replies.length > 0) {
        expandedReplies.value.add(comment.id)
      }
    }
    // Emit top-level comments (with nested replies) for line badges
    emit('commentsLoaded', comments.value)
  } catch (error) {
    console.error('Failed to load comments:', error)
  } finally {
    isLoading.value = false
  }
}

// Submit new comment or reply
async function submitComment() {
  if (!newCommentContent.value.trim() || isSubmitting.value) return

  isSubmitting.value = true
  try {
    const newComment = await pvpApi.createComment(
      props.eventId,
      newCommentContent.value.trim(),
      selectedCharacter.value?.pid || undefined,
      replyToComment.value?.id || undefined,
      quotedLine.value?.text || undefined,
      quotedLine.value?.lineNumber || undefined,
      quotedLine.value?.participantId || undefined,
    )

    // Add to list
    if (replyToComment.value) {
      // Add as reply
      const parentComment = comments.value.find((c) => c.id === replyToComment.value?.id)
      if (parentComment) {
        if (!parentComment.replies) parentComment.replies = []
        parentComment.replies.push(newComment)
        expandedReplies.value.add(parentComment.id)
      }
    } else {
      // Add as top-level comment
      comments.value.push(newComment)
    }

    newCommentContent.value = ''
    replyToComment.value = null
    quotedLine.value = null
    emit('commentsUpdated', commentCount.value)
    // Re-emit comments for badges update
    emit('commentsLoaded', comments.value)
  } catch (error) {
    console.error('Failed to submit comment:', error)
  } finally {
    isSubmitting.value = false
  }
}

// Start editing a comment
function startEdit(comment: PvPBattleComment) {
  editingComment.value = comment
  editContent.value = comment.content
}

// Cancel editing
function cancelEdit() {
  editingComment.value = null
  editContent.value = ''
}

// Save edited comment
async function saveEdit() {
  if (!editingComment.value || !editContent.value.trim()) return

  try {
    await pvpApi.updateComment(editingComment.value.id, editContent.value.trim())

    // Update local state
    const updateComment = (list: PvPBattleComment[]) => {
      for (const c of list) {
        if (c.id === editingComment.value?.id) {
          c.content = editContent.value.trim()
          c.updatedAt = new Date().toISOString()
          return true
        }
        if (c.replies && updateComment(c.replies)) return true
      }
      return false
    }
    updateComment(comments.value)

    cancelEdit()
  } catch (error) {
    console.error('Failed to update comment:', error)
  }
}

// Confirm delete
function confirmDelete(comment: PvPBattleComment) {
  commentToDelete.value = comment
  deleteConfirmOpen.value = true
}

// Delete comment
async function deleteComment() {
  if (!commentToDelete.value) return

  try {
    await pvpApi.deleteComment(commentToDelete.value.id)

    // Remove from local state
    const removeComment = (list: PvPBattleComment[]): boolean => {
      const index = list.findIndex((c) => c.id === commentToDelete.value?.id)
      if (index !== -1) {
        list.splice(index, 1)
        return true
      }
      for (const c of list) {
        if (c.replies && removeComment(c.replies)) return true
      }
      return false
    }
    removeComment(comments.value)

    deleteConfirmOpen.value = false
    commentToDelete.value = null
    emit('commentsUpdated', commentCount.value)
  } catch (error) {
    console.error('Failed to delete comment:', error)
  }
}

// Toggle reply expansion
function toggleReplies(commentId: number) {
  if (expandedReplies.value.has(commentId)) {
    expandedReplies.value.delete(commentId)
  } else {
    expandedReplies.value.add(commentId)
  }
}

// Start reply
function startReply(comment: PvPBattleComment) {
  replyToComment.value = comment
  newCommentContent.value = ''
}

// Cancel reply
function cancelReply() {
  replyToComment.value = null
  newCommentContent.value = ''
}

// Check if user can edit/delete a comment
function canModify(comment: PvPBattleComment): boolean {
  return accountName.value === comment.accountName
}

// Character selection
function onCharacterSelect(pidStr: unknown) {
  if (pidStr === 'none' || pidStr === null || pidStr === undefined) {
    selectCharacter(null)
  } else {
    const pid = parseInt(String(pidStr), 10)
    const char = characters.value.find((c) => c.pid === pid)
    if (char) selectCharacter(char)
  }
}

// Set quoted line (called from parent via ref)
function setQuotedLine(lineNumber: number, text: string, participantId: number) {
  quotedLine.value = { lineNumber, text, participantId }
  replyToComment.value = null // Clear any reply state
}

// Clear quoted line
function clearQuotedLine() {
  quotedLine.value = null
}

// Handle clicking on a quoted text in a comment
function handleQuoteClick(comment: PvPBattleComment) {
  if (comment.quotedText && comment.lineNumber != null && comment.participantId != null) {
    emit('navigateToQuote', comment)
  }
}

// Truncate text for display
function truncateText(text: string, maxLength: number = 100): string {
  if (text.length <= maxLength) return text
  return text.slice(0, maxLength) + '...'
}

// Expose methods for parent component
defineExpose({
  setQuotedLine,
  clearQuotedLine,
})

onMounted(() => {
  loadComments()
})
</script>

<template>
  <Card class="h-full flex flex-col">
    <CardHeader class="py-3 px-4 border-b">
      <CardTitle class="text-sm font-medium flex items-center gap-2">
        <MessageSquare class="h-4 w-4" />
        Comments ({{ commentCount }})
      </CardTitle>
    </CardHeader>

    <CardContent class="flex-1 p-0 overflow-hidden flex flex-col">
      <!-- Comments List -->
      <ScrollArea class="flex-1">
        <div class="p-4 space-y-4">
          <div v-if="isLoading" class="text-center text-muted-foreground py-8">
            Loading comments...
          </div>

          <div v-else-if="comments.length === 0" class="text-center text-muted-foreground py-8">
            No comments yet. Be the first to comment!
          </div>

          <template v-else>
            <div v-for="comment in comments" :key="comment.id" class="space-y-2">
              <!-- Main comment -->
              <div class="bg-muted/50 rounded-lg p-3">
                <div class="flex items-start justify-between gap-2 mb-2">
                  <div class="flex items-center gap-2 flex-wrap">
                    <!-- Show character info if available, otherwise account name -->
                    <template v-if="comment.characterName">
                      <span class="font-medium text-sm">
                        [{{ comment.characterLevel }}
                        <AnsiText v-if="comment.characterClass" :text="comment.characterClass" tag="span" />]
                        {{ comment.characterName }}
                        (<AnsiText v-if="comment.characterRace" :text="comment.characterRace" tag="span" />)
                      </span>
                    </template>
                    <span v-else class="font-medium text-sm">{{ comment.accountName }}</span>
                  </div>
                  <span class="text-xs text-muted-foreground whitespace-nowrap">
                    {{ formatTime(comment.createdAt) }}
                  </span>
                </div>

                <!-- Edit mode -->
                <div v-if="editingComment?.id === comment.id" class="space-y-2">
                  <Textarea
                    v-model="editContent"
                    class="min-h-[60px] text-sm"
                    placeholder="Edit your comment..."
                  />
                  <div class="flex justify-end gap-2">
                    <Button size="sm" variant="ghost" @click="cancelEdit">Cancel</Button>
                    <Button size="sm" @click="saveEdit">Save</Button>
                  </div>
                </div>

                <!-- Normal view -->
                <template v-else>
                  <!-- Quoted text -->
                  <div
                    v-if="comment.quotedText"
                    class="mb-2 border-l-2 border-cyan-500/50 pl-2 py-1 bg-cyan-950/20 rounded-r cursor-pointer hover:bg-cyan-950/40 transition-colors"
                    @click="handleQuoteClick(comment)"
                    :title="comment.lineNumber ? `Line ${comment.lineNumber} - Click to view` : ''"
                  >
                    <div class="flex items-center gap-1 text-[10px] text-cyan-400/70 mb-0.5">
                      <Quote class="h-3 w-3" />
                      <span v-if="comment.lineNumber">Line {{ comment.lineNumber }}</span>
                    </div>
                    <p class="text-xs text-muted-foreground italic">{{ truncateText(comment.quotedText) }}</p>
                  </div>

                  <p class="text-sm whitespace-pre-wrap">{{ comment.content }}</p>

                  <div class="flex items-center gap-2 mt-2">
                    <Button
                      v-if="isAuthenticated"
                      size="sm"
                      variant="ghost"
                      class="h-7 px-2 text-xs"
                      @click="startReply(comment)"
                    >
                      <Reply class="h-3 w-3 mr-1" />
                      Reply
                    </Button>

                    <template v-if="canModify(comment)">
                      <Button
                        size="sm"
                        variant="ghost"
                        class="h-7 px-2 text-xs"
                        @click="startEdit(comment)"
                      >
                        <Pencil class="h-3 w-3 mr-1" />
                        Edit
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        class="h-7 px-2 text-xs text-destructive"
                        @click="confirmDelete(comment)"
                      >
                        <Trash2 class="h-3 w-3 mr-1" />
                        Delete
                      </Button>
                    </template>

                    <!-- Show replies toggle -->
                    <Button
                      v-if="comment.replies && comment.replies.length > 0"
                      size="sm"
                      variant="ghost"
                      class="h-7 px-2 text-xs ml-auto"
                      @click="toggleReplies(comment.id)"
                    >
                      <component
                        :is="expandedReplies.has(comment.id) ? ChevronUp : ChevronDown"
                        class="h-3 w-3 mr-1"
                      />
                      {{ comment.replies.length }} {{ comment.replies.length === 1 ? 'reply' : 'replies' }}
                    </Button>
                  </div>
                </template>
              </div>

              <!-- Replies -->
              <div
                v-if="comment.replies && comment.replies.length > 0 && expandedReplies.has(comment.id)"
                class="ml-4 space-y-2 border-l-2 border-muted pl-3"
              >
                <div
                  v-for="reply in comment.replies"
                  :key="reply.id"
                  class="bg-muted/30 rounded-lg p-3"
                >
                  <div class="flex items-start justify-between gap-2 mb-2">
                    <div class="flex items-center gap-2 flex-wrap">
                      <!-- Show character info if available, otherwise account name -->
                      <template v-if="reply.characterName">
                        <span class="font-medium text-sm">
                          [{{ reply.characterLevel }}
                          <AnsiText v-if="reply.characterClass" :text="reply.characterClass" tag="span" />]
                          {{ reply.characterName }}
                          (<AnsiText v-if="reply.characterRace" :text="reply.characterRace" tag="span" />)
                        </span>
                      </template>
                      <span v-else class="font-medium text-sm">{{ reply.accountName }}</span>
                    </div>
                    <span class="text-xs text-muted-foreground whitespace-nowrap">
                      {{ formatTime(reply.createdAt) }}
                    </span>
                  </div>

                  <!-- Edit mode for reply -->
                  <div v-if="editingComment?.id === reply.id" class="space-y-2">
                    <Textarea
                      v-model="editContent"
                      class="min-h-[60px] text-sm"
                      placeholder="Edit your comment..."
                    />
                    <div class="flex justify-end gap-2">
                      <Button size="sm" variant="ghost" @click="cancelEdit">Cancel</Button>
                      <Button size="sm" @click="saveEdit">Save</Button>
                    </div>
                  </div>

                  <!-- Normal view for reply -->
                  <template v-else>
                    <!-- Quoted text -->
                    <div
                      v-if="reply.quotedText"
                      class="mb-2 border-l-2 border-cyan-500/50 pl-2 py-1 bg-cyan-950/20 rounded-r cursor-pointer hover:bg-cyan-950/40 transition-colors"
                      @click="handleQuoteClick(reply)"
                      :title="reply.lineNumber ? `Line ${reply.lineNumber} - Click to view` : ''"
                    >
                      <div class="flex items-center gap-1 text-[10px] text-cyan-400/70 mb-0.5">
                        <Quote class="h-3 w-3" />
                        <span v-if="reply.lineNumber">Line {{ reply.lineNumber }}</span>
                      </div>
                      <p class="text-xs text-muted-foreground italic">{{ truncateText(reply.quotedText) }}</p>
                    </div>

                    <p class="text-sm whitespace-pre-wrap">{{ reply.content }}</p>

                    <div v-if="canModify(reply)" class="flex items-center gap-2 mt-2">
                      <Button
                        size="sm"
                        variant="ghost"
                        class="h-7 px-2 text-xs"
                        @click="startEdit(reply)"
                      >
                        <Pencil class="h-3 w-3 mr-1" />
                        Edit
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        class="h-7 px-2 text-xs text-destructive"
                        @click="confirmDelete(reply)"
                      >
                        <Trash2 class="h-3 w-3 mr-1" />
                        Delete
                      </Button>
                    </div>
                  </template>
                </div>
              </div>
            </div>
          </template>
        </div>
      </ScrollArea>

      <!-- New Comment Form -->
      <div v-if="isAuthenticated" class="border-t p-4 space-y-3">
        <!-- Quoted line indicator -->
        <div
          v-if="quotedLine"
          class="border-l-2 border-cyan-500 pl-3 py-2 bg-cyan-950/30 rounded-r"
        >
          <div class="flex items-center justify-between mb-1">
            <div class="flex items-center gap-1 text-xs text-cyan-400">
              <Quote class="h-3 w-3" />
              <span>Quoting line {{ quotedLine.lineNumber }}</span>
            </div>
            <Button size="sm" variant="ghost" class="h-5 w-5 p-0" @click="clearQuotedLine">
              <X class="h-3 w-3" />
            </Button>
          </div>
          <p class="text-xs text-muted-foreground italic truncate">{{ quotedLine.text }}</p>
        </div>

        <!-- Reply indicator -->
        <div
          v-if="replyToComment"
          class="flex items-center justify-between bg-muted/50 rounded px-3 py-2 text-sm"
        >
          <span class="text-muted-foreground">
            Replying to <span class="font-medium text-foreground">{{ replyToComment.accountName }}</span>
          </span>
          <Button size="sm" variant="ghost" class="h-6 px-2" @click="cancelReply">
            Cancel
          </Button>
        </div>

        <!-- Character selector -->
        <div v-if="characters.length > 0" class="flex items-center gap-2">
          <span class="text-xs text-muted-foreground">Post as:</span>
          <Select
            :model-value="selectedCharacter?.pid?.toString() || 'none'"
            @update:model-value="onCharacterSelect"
          >
            <SelectTrigger class="h-8 text-xs w-auto min-w-[180px]">
              <SelectValue placeholder="Select character" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">
                {{ accountName }} (Account)
              </SelectItem>
              <SelectItem
                v-for="char in characters"
                :key="char.pid"
                :value="char.pid.toString()"
              >
                <span class="flex items-center gap-1">
                  [{{ char.level }}
                  <AnsiText v-if="char.classname" :text="char.classname" tag="span" />]
                  {{ char.name }}
                </span>
              </SelectItem>
            </SelectContent>
          </Select>
        </div>

        <!-- Comment input -->
        <div class="flex gap-2">
          <Textarea
            v-model="newCommentContent"
            class="min-h-[60px] text-sm flex-1"
            :placeholder="replyToComment ? 'Write a reply...' : 'Write a comment...'"
            @keydown.enter.ctrl="submitComment"
          />
        </div>

        <div class="flex justify-end">
          <Button
            size="sm"
            :disabled="!newCommentContent.trim() || isSubmitting"
            @click="submitComment"
          >
            <Send class="h-4 w-4 mr-1" />
            {{ replyToComment ? 'Reply' : 'Comment' }}
          </Button>
        </div>
      </div>

      <!-- Not authenticated message -->
      <div v-else class="border-t p-4 text-center text-sm text-muted-foreground">
        Log in to leave a comment
      </div>
    </CardContent>
  </Card>

  <!-- Delete Confirmation Dialog -->
  <AlertDialog v-model:open="deleteConfirmOpen">
    <AlertDialogContent>
      <AlertDialogHeader>
        <AlertDialogTitle>Delete Comment</AlertDialogTitle>
        <AlertDialogDescription>
          Are you sure you want to delete this comment? This action cannot be undone.
        </AlertDialogDescription>
      </AlertDialogHeader>
      <AlertDialogFooter>
        <AlertDialogCancel>Cancel</AlertDialogCancel>
        <AlertDialogAction @click="deleteComment" class="bg-destructive text-destructive-foreground">
          Delete
        </AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
</template>
