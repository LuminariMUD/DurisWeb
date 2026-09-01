<script setup lang="ts">
import { ref, watch } from 'vue'
import { ThumbsUp } from 'lucide-vue-next'
import { Button } from '@/components/ui/button'
import { pvpApi } from '@/services/api'
import { useAuth } from '@/composables/useAuth'

interface Props {
  eventId: number
  initialLikeCount: number
  initialUserLiked: boolean
}

const props = defineProps<Props>()

const emit = defineEmits<{
  likesUpdated: [count: number, userLiked: boolean]
}>()

const { isAuthenticated } = useAuth()

// Local state for optimistic updates
const likeCount = ref(props.initialLikeCount)
const userLiked = ref(props.initialUserLiked)
const isLoading = ref(false)

// Sync with props when they change
watch(
  () => props.initialLikeCount,
  (newVal) => {
    likeCount.value = newVal
  },
)
watch(
  () => props.initialUserLiked,
  (newVal) => {
    userLiked.value = newVal
  },
)

async function toggleLike() {
  if (!isAuthenticated.value || isLoading.value) return

  isLoading.value = true
  const wasLiked = userLiked.value

  // Optimistic update
  userLiked.value = !wasLiked
  likeCount.value += wasLiked ? -1 : 1

  try {
    if (wasLiked) {
      await pvpApi.unlikeBattle(props.eventId)
    } else {
      await pvpApi.likeBattle(props.eventId)
    }
    emit('likesUpdated', likeCount.value, userLiked.value)
  } catch (error) {
    // Revert on error
    userLiked.value = wasLiked
    likeCount.value += wasLiked ? 1 : -1
    console.error('Failed to toggle like:', error)
  } finally {
    isLoading.value = false
  }
}
</script>

<template>
  <Button
    size="sm"
    :variant="userLiked ? 'default' : 'outline'"
    class="h-8 px-3 gap-1.5"
    :disabled="!isAuthenticated || isLoading"
    @click="toggleLike"
  >
    <ThumbsUp
      :class="[
        'h-4 w-4',
        userLiked ? 'fill-current' : ''
      ]"
    />
    <span class="text-sm">{{ likeCount }}</span>
  </Button>
</template>
