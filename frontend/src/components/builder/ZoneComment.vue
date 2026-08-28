<script setup lang="ts">
import { computed } from 'vue'
import { Button } from '@/components/ui/button'
import { formatDistanceToNow } from 'date-fns'
import { Reply, Trash2, User } from 'lucide-vue-next'
import { highlightMentions } from '@/utils/mentionHighlight'
import { sanitizeChangelogContent } from '@/utils/sanitizeChangelogContent'
import type { ZoneComment } from '@/types'

const props = defineProps<{
  comment: ZoneComment
  canModify: boolean
  replyingTo: number | null
  isSubmitting: boolean
}>()

const emit = defineEmits<{
  (e: 'reply', commentId: number): void
  (e: 'cancel-reply'): void
  (e: 'submit-reply', parentId: number): void
  (e: 'delete', commentId: number): void
}>()

// Format date
const timeAgo = computed(() => {
  return formatDistanceToNow(new Date(props.comment.createdAt), { addSuffix: true })
})

// Is this comment being replied to
const isReplyingToThis = computed(() => props.replyingTo === props.comment.id)

function sanitizeAndHighlight(contentHtml: string): string {
  return highlightMentions(sanitizeChangelogContent(contentHtml))
}

// Highlighted content with @mentions styled
const highlightedContent = computed(() => {
  if (props.comment.contentHtml) {
    return sanitizeAndHighlight(props.comment.contentHtml)
  }
  return null
})

// Helper to highlight reply content
function getHighlightedReplyContent(reply: ZoneComment): string | null {
  if (reply.contentHtml) {
    return sanitizeAndHighlight(reply.contentHtml)
  }
  return null
}
</script>

<template>
  <div class="group">
    <!-- Main comment -->
    <div class="flex gap-3">
      <!-- Avatar placeholder -->
      <div class="shrink-0 w-10 h-10 rounded-full bg-muted flex items-center justify-center">
        <User class="h-5 w-5 text-muted-foreground" />
      </div>

      <!-- Content -->
      <div class="flex-1 min-w-0">
        <!-- Header -->
        <div class="flex items-center gap-2 mb-1">
          <span class="font-medium">{{ comment.accountName }}</span>
          <span v-if="comment.characterName" class="text-sm text-muted-foreground">
            as {{ comment.characterName }}
          </span>
          <span class="text-xs text-muted-foreground">{{ timeAgo }}</span>
          <span v-if="comment.updatedAt !== comment.createdAt" class="text-xs text-muted-foreground">
            (edited)
          </span>
        </div>

        <!-- Body -->
        <div
          v-if="highlightedContent"
          class="prose prose-invert prose-sm max-w-none comment-content"
          v-html="highlightedContent"
        />
        <p v-else class="text-sm text-muted-foreground whitespace-pre-wrap">
          {{ comment.content }}
        </p>

        <!-- Actions -->
        <div class="flex items-center gap-2 mt-2 opacity-0 group-hover:opacity-100 transition-opacity">
          <Button
            v-if="comment.parentId === null"
            variant="ghost"
            size="sm"
            class="h-7 text-xs"
            @click="emit('reply', comment.id)"
          >
            <Reply class="h-3 w-3 mr-1" />
            Reply
          </Button>
          <Button
            v-if="canModify"
            variant="ghost"
            size="sm"
            class="h-7 text-xs text-destructive hover:text-destructive"
            @click="emit('delete', comment.id)"
          >
            <Trash2 class="h-3 w-3 mr-1" />
            Delete
          </Button>
        </div>

        <!-- Reply form slot (shown when replying to this comment) -->
        <div v-if="isReplyingToThis">
          <slot name="reply-form" />
        </div>

        <!-- Replies (single level only) -->
        <div v-if="comment.replies && comment.replies.length > 0" class="mt-4 space-y-4 border-l-2 border-muted pl-4">
          <div
            v-for="reply in comment.replies"
            :key="reply.id"
            class="group/reply"
          >
            <div class="flex gap-3">
              <!-- Avatar placeholder -->
              <div class="shrink-0 w-8 h-8 rounded-full bg-muted flex items-center justify-center">
                <User class="h-4 w-4 text-muted-foreground" />
              </div>

              <!-- Content -->
              <div class="flex-1 min-w-0">
                <!-- Header -->
                <div class="flex items-center gap-2 mb-1">
                  <span class="font-medium text-sm">{{ reply.accountName }}</span>
                  <span v-if="reply.characterName" class="text-xs text-muted-foreground">
                    as {{ reply.characterName }}
                  </span>
                  <span class="text-xs text-muted-foreground">
                    {{ formatDistanceToNow(new Date(reply.createdAt), { addSuffix: true }) }}
                  </span>
                </div>

                <!-- Body -->
                <div
                  v-if="getHighlightedReplyContent(reply)"
                  class="prose prose-invert prose-sm max-w-none comment-content"
                  v-html="getHighlightedReplyContent(reply)"
                />
                <p v-else class="text-sm text-muted-foreground whitespace-pre-wrap">
                  {{ reply.content }}
                </p>

                <!-- Delete action for replies -->
                <div class="flex items-center gap-2 mt-1 opacity-0 group-hover/reply:opacity-100 transition-opacity">
                  <Button
                    v-if="canModify"
                    variant="ghost"
                    size="sm"
                    class="h-6 text-xs text-destructive hover:text-destructive"
                    @click="emit('delete', reply.id)"
                  >
                    <Trash2 class="h-3 w-3 mr-1" />
                    Delete
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style>
/* Mention highlight styles */
.comment-content .mention-highlight {
  color: rgb(34 211 238); /* cyan-400 */
  background-color: rgba(34, 211, 238, 0.1);
  padding: 0.125rem 0.25rem;
  border-radius: 0.25rem;
  font-weight: 500;
}
</style>
