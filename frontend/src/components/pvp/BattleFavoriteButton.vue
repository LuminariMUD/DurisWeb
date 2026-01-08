<script setup lang="ts">
import { ref, watch } from 'vue'
import { Star } from 'lucide-vue-next'
import { Button } from '@/components/ui/button'
import { pvpApi } from '@/services/api'
import { useAuth } from '@/composables/useAuth'

interface Props {
  eventId: number
  initialFavorited: boolean
}

const props = defineProps<Props>()

const emit = defineEmits<{
  favoritesUpdated: [favorited: boolean]
}>()

const { isAuthenticated } = useAuth()

// Local state for optimistic updates
const isFavorited = ref(props.initialFavorited)
const isLoading = ref(false)

// Sync with props when they change
watch(() => props.initialFavorited, (newVal) => {
  isFavorited.value = newVal
})

async function toggleFavorite() {
  if (!isAuthenticated.value || isLoading.value) return

  isLoading.value = true
  const wasFavorited = isFavorited.value

  // Optimistic update
  isFavorited.value = !wasFavorited

  try {
    if (wasFavorited) {
      await pvpApi.unfavoriteBattle(props.eventId)
    } else {
      await pvpApi.favoriteBattle(props.eventId)
    }
    emit('favoritesUpdated', isFavorited.value)
  } catch (error) {
    // Revert on error
    isFavorited.value = wasFavorited
    console.error('Failed to toggle favorite:', error)
  } finally {
    isLoading.value = false
  }
}
</script>

<template>
  <Button
    size="sm"
    :variant="isFavorited ? 'default' : 'outline'"
    class="h-8 px-3 gap-1.5"
    :disabled="!isAuthenticated || isLoading"
    @click="toggleFavorite"
  >
    <Star
      :class="[
        'h-4 w-4',
        isFavorited ? 'fill-current' : ''
      ]"
    />
    <span class="text-sm">{{ isFavorited ? 'Saved' : 'Save' }}</span>
  </Button>
</template>
