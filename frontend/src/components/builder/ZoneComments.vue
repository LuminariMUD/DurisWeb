<script setup lang="ts">
import { ref, computed } from 'vue'
import { useQuery, useMutation, useQueryClient } from '@tanstack/vue-query'
import { builderApi } from '@/services/api'
import { useAuth } from '@/composables/useAuth'
import { useToast } from '@/composables/useToast'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Alert, AlertDescription } from '@/components/ui/alert'
import TipTapEditor from '@/components/forum/editor/TipTapEditor.vue'
import ZoneComment from './ZoneComment.vue'
import { Send, AlertCircle, MessageSquare, RefreshCw } from 'lucide-vue-next'
import type { ZoneComment as ZoneCommentType, CreateZoneComment } from '@/types'

const props = defineProps<{
  zoneId: string
  procRequestId?: number | null
}>()

const { user } = useAuth()
const toast = useToast()
const queryClient = useQueryClient()

// New comment state
const newCommentContent = ref('')
const replyingTo = ref<number | null>(null)
const replyContent = ref('')

// Fetch comments
const {
  data: comments,
  isLoading,
  error,
  refetch,
} = useQuery({
  queryKey: computed(() => ['zone-comments', props.zoneId, props.procRequestId ?? null]),
  queryFn: () => builderApi.getZoneComments(props.zoneId, props.procRequestId),
})

// Create comment mutation
const createMutation = useMutation({
  mutationFn: (data: CreateZoneComment) => builderApi.createZoneComment(props.zoneId, data),
  onSuccess: () => {
    toast.success('Comment posted')
    newCommentContent.value = ''
    replyContent.value = ''
    replyingTo.value = null
    queryClient.invalidateQueries({ queryKey: ['zone-comments', props.zoneId] })
  },
  onError: (err: Error) => {
    toast.error(`Failed to post comment: ${err.message}`)
  },
})

// Delete comment mutation
const deleteMutation = useMutation({
  mutationFn: (commentId: number) => builderApi.deleteZoneComment(props.zoneId, commentId),
  onSuccess: () => {
    toast.success('Comment deleted')
    queryClient.invalidateQueries({ queryKey: ['zone-comments', props.zoneId] })
  },
  onError: (err: Error) => {
    toast.error(`Failed to delete comment: ${err.message}`)
  },
})

// Submit new comment
function submitComment() {
  if (!newCommentContent.value.trim()) {
    toast.error('Please enter a comment')
    return
  }

  createMutation.mutate({
    zoneId: props.zoneId,
    procRequestId: props.procRequestId ?? null,
    content: newCommentContent.value.replace(/<[^>]+>/g, ''),
    contentHtml: newCommentContent.value,
  })
}

// Start replying to a comment
function startReply(commentId: number) {
  replyingTo.value = commentId
  replyContent.value = ''
}

// Cancel reply
function cancelReply() {
  replyingTo.value = null
  replyContent.value = ''
}

// Submit reply
function submitReply(parentId: number) {
  if (!replyContent.value.trim()) {
    toast.error('Please enter a reply')
    return
  }

  createMutation.mutate({
    zoneId: props.zoneId,
    parentId,
    procRequestId: props.procRequestId ?? null,
    content: replyContent.value.replace(/<[^>]+>/g, ''),
    contentHtml: replyContent.value,
  })
}

// Delete comment
function deleteComment(commentId: number) {
  if (confirm('Delete this comment?')) {
    deleteMutation.mutate(commentId)
  }
}

// Check if user can edit/delete a comment
function canModifyComment(comment: ZoneCommentType) {
  return (
    user.value?.accountName === comment.accountName || user.value?.permissions?.role === 'overlord'
  )
}
</script>

<template>
  <div class="p-6">
    <!-- Loading -->
    <div v-if="isLoading">
      <Skeleton class="h-6 w-32 mb-4" />
      <Skeleton class="h-32 w-full mb-4" />
      <Skeleton class="h-24 w-full mb-2" />
      <Skeleton class="h-24 w-full" />
    </div>

    <!-- Error -->
    <Alert v-else-if="error" variant="destructive">
      <AlertCircle class="h-4 w-4" />
      <AlertDescription>
        Failed to load comments.
        <Button variant="link" size="sm" @click="refetch()">Try again</Button>
      </AlertDescription>
    </Alert>

    <!-- Content -->
    <div v-else>
      <!-- Header -->
      <div class="flex items-center justify-between mb-6">
        <div>
          <h3 class="text-lg font-semibold">Discussion</h3>
          <p class="text-sm text-muted-foreground">
            {{ props.procRequestId ? 'Comments on this proc request' : 'General zone discussion' }}
          </p>
        </div>
        <Button variant="outline" size="sm" @click="refetch()">
          <RefreshCw class="h-4 w-4 mr-2" />
          Refresh
        </Button>
      </div>

      <!-- New Comment Form -->
      <div v-if="user" class="mb-8 p-4 bg-muted/30 rounded-lg">
        <h4 class="text-sm font-medium mb-3">Add a comment</h4>
        <TipTapEditor
          v-model="newCommentContent"
          placeholder="Share your thoughts, ideas, or feedback... Use @ to mention users"
          :max-length="2000"
          :enable-mentions="true"
        />
        <div class="mt-3 flex justify-end">
          <Button @click="submitComment" :disabled="createMutation.isPending.value">
            <Send v-if="!createMutation.isPending.value" class="h-4 w-4 mr-2" />
            <RefreshCw v-else class="h-4 w-4 mr-2 animate-spin" />
            Post Comment
          </Button>
        </div>
      </div>
      <div v-else class="mb-8 p-4 bg-muted/30 rounded-lg text-center text-muted-foreground">
        <p>Please log in to participate in the discussion.</p>
      </div>

      <!-- Comments List -->
      <div class="space-y-6">
        <ZoneComment
          v-for="comment in comments"
          :key="comment.id"
          :comment="comment"
          :can-modify="canModifyComment(comment)"
          :replying-to="replyingTo"
          :is-submitting="createMutation.isPending.value"
          @reply="startReply"
          @cancel-reply="cancelReply"
          @submit-reply="submitReply"
          @delete="deleteComment"
        >
          <template #reply-form>
            <div class="mt-3 ml-10">
              <TipTapEditor
                v-model="replyContent"
                placeholder="Write a reply... Use @ to mention users"
                :max-length="2000"
                :enable-mentions="true"
              />
              <div class="mt-2 flex gap-2 justify-end">
                <Button variant="outline" size="sm" @click="cancelReply">
                  Cancel
                </Button>
                <Button size="sm" @click="submitReply(comment.id)" :disabled="createMutation.isPending.value">
                  <Send v-if="!createMutation.isPending.value" class="h-4 w-4 mr-2" />
                  <RefreshCw v-else class="h-4 w-4 mr-2 animate-spin" />
                  Reply
                </Button>
              </div>
            </div>
          </template>
        </ZoneComment>

        <!-- Empty state -->
        <div v-if="!comments || comments.length === 0" class="text-center py-12 text-muted-foreground">
          <MessageSquare class="h-12 w-12 mx-auto mb-4 opacity-50" />
          <p>No comments yet. Be the first to start the discussion!</p>
        </div>
      </div>
    </div>
  </div>
</template>
