<template>
  <div class="min-h-screen bg-gray-950 flex items-center justify-center px-4">
    <div class="max-w-md w-full text-center">
      <!-- Error Icon -->
      <div class="flex justify-center mb-6">
        <div class="rounded-full bg-red-500/10 p-6">
          <ShieldXIcon class="h-16 w-16 text-red-500" />
        </div>
      </div>

      <!-- Error Message -->
      <h1 class="text-4xl font-bold text-white mb-4">403 - Access Forbidden</h1>
      <p class="text-gray-400 mb-2">
        You do not have permission to access this area.
      </p>
      <p class="text-sm text-gray-500 mb-8">
        {{ errorMessage }}
      </p>

      <!-- Required Level Info -->
      <div v-if="requiredLevel" class="bg-gray-900 border border-gray-800 rounded-lg p-4 mb-8">
        <p class="text-sm text-gray-400 mb-2">Required Permission Level:</p>
        <p class="text-lg font-semibold text-red-400">{{ requiredLevel }}</p>
        <p v-if="currentLevel" class="text-sm text-gray-500 mt-2">
          Your Level: <span class="text-gray-400">{{ currentLevel }}</span>
        </p>
      </div>

      <!-- Actions -->
      <div class="flex flex-col sm:flex-row gap-4 justify-center">
        <RouterLink
          :to="{ name: 'forum' }"
          class="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors"
        >
          <HomeIcon class="h-4 w-4 inline-block mr-2" />
          Go to Forum
        </RouterLink>
        <button
          @click="goBack"
          class="px-6 py-3 bg-gray-800 hover:bg-gray-700 text-white rounded-lg font-medium transition-colors"
        >
          <ArrowLeftIcon class="h-4 w-4 inline-block mr-2" />
          Go Back
        </button>
      </div>

      <!-- Contact Info -->
      <p class="text-xs text-gray-600 mt-8">
        If you believe this is an error, please contact a Greater God or Overlord in-game.
      </p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuth } from '@/composables/useAuth'
import { ShieldXIcon, HomeIcon, ArrowLeftIcon } from 'lucide-vue-next'

const route = useRoute()
const router = useRouter()
const { permissions } = useAuth()

const errorMessage = computed(() => {
  const error = route.query.error as string
  switch (error) {
    case 'immortal_required':
      return 'This area is restricted to Immortals (Level 57+).'
    case 'moderator_required':
      return 'This area is restricted to Lesser Gods and above (Level 59+).'
    case 'greater_god_required':
      return 'This area is restricted to Greater Gods and above (Level 60+).'
    case 'overlord_required':
      return 'This area is restricted to Overlords only.'
    default:
      return 'You do not have the required permissions to view this page.'
  }
})

const requiredLevel = computed(() => {
  const error = route.query.error as string
  switch (error) {
    case 'immortal_required':
      return 'Level 57+ (Avatar/Immortal)'
    case 'moderator_required':
      return 'Level 59+ (Lesser God)'
    case 'greater_god_required':
      return 'Level 60+ (Greater God)'
    case 'overlord_required':
      return 'Overlord Status'
    default:
      return null
  }
})

const currentLevel = computed(() => {
  if (permissions.value?.immortalLevel) {
    return `Level ${permissions.value.immortalLevel}`
  }
  return 'Mortal'
})

const goBack = () => {
  router.back()
}
</script>
