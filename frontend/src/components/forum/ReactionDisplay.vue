<script setup lang="ts">
import { computed } from 'vue'
import type { PostReaction } from '@/types'
import { Button } from '@/components/ui/button'

interface Props {
  reactions: PostReaction[]
  postId: number
  isAuthenticated: boolean
}

const props = defineProps<Props>()

const emit = defineEmits<{
  addReaction: [emoji: string]
  removeReaction: [emoji: string]
}>()

// Get thumbs up reaction
const thumbsUp = computed(() => {
  return props.reactions.find((r) => r.emoji === '👍')
})

// Get thumbs down reaction
const thumbsDown = computed(() => {
  return props.reactions.find((r) => r.emoji === '👎')
})

function toggleReaction(emoji: string, userReacted: boolean) {
  if (!props.isAuthenticated) return

  if (userReacted) {
    emit('removeReaction', emoji)
  } else {
    emit('addReaction', emoji)
  }
}
</script>

<template>
  <div class="flex items-center gap-2">
    <!-- Thumbs Up -->
    <Button
      size="sm"
      :variant="thumbsUp?.userReacted ? 'default' : 'outline'"
      class="h-8 px-3 gap-1.5"
      @click="toggleReaction('👍', thumbsUp?.userReacted || false)"
      :disabled="!isAuthenticated || (thumbsDown?.userReacted || false)"
    >
      <span class="text-base">👍</span>
      <span class="text-sm">{{ thumbsUp?.count || 0 }}</span>
    </Button>

    <!-- Thumbs Down -->
    <Button
      size="sm"
      :variant="thumbsDown?.userReacted ? 'default' : 'outline'"
      class="h-8 px-3 gap-1.5"
      @click="toggleReaction('👎', thumbsDown?.userReacted || false)"
      :disabled="!isAuthenticated || (thumbsUp?.userReacted || false)"
    >
      <span class="text-base">👎</span>
      <span class="text-sm">{{ thumbsDown?.count || 0 }}</span>
    </Button>
  </div>
</template>
