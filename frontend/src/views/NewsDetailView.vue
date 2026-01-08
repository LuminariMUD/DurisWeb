<script setup lang="ts">
import { useRouter } from 'vue-router'
import { useNews } from '@/composables/useNews'
import { parseAnsiForVue } from '@/utils/ansiParser'
import { computed } from 'vue'

const router = useRouter()

// Fetch news content (same as NewsView - news is single content, not individual articles)
const { data, isLoading, isError, error } = useNews()

// Parse ANSI codes to HTML
const parsedContent = computed(() => {
  if (!data.value?.news) return ''
  return parseAnsiForVue(data.value.news)
})

// Go back to news list
const goBack = () => {
  router.push({ name: 'news' })
}
</script>

<template>
  <div class="space-y-6">
    <!-- Back Button -->
    <button
      @click="goBack"
      class="inline-flex items-center text-sm text-muted-foreground hover:text-foreground"
    >
      ← Back to News
    </button>

    <!-- Loading State -->
    <div v-if="isLoading" class="flex items-center justify-center py-12">
      <div class="text-center">
        <div class="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-current border-r-transparent align-[-0.125em]"></div>
        <p class="mt-4 text-muted-foreground">Loading article...</p>
      </div>
    </div>

    <!-- Error State -->
    <div v-else-if="isError" class="rounded-lg border border-destructive bg-destructive/10 p-4">
      <h3 class="font-semibold text-destructive">Error loading article</h3>
      <p class="text-sm text-destructive/80">{{ error?.message || 'Unknown error occurred' }}</p>
    </div>

    <!-- News Content -->
    <div v-else-if="data && data.news" class="rounded-lg border border-gray-800 bg-gray-950 p-6">
      <div class="rounded-md bg-black p-6 font-mono text-sm text-gray-100 overflow-x-auto">
        <pre class="whitespace-pre-wrap" v-html="parsedContent"></pre>
      </div>
    </div>

    <!-- Empty State -->
    <div v-else class="text-center py-12">
      <p class="text-gray-400">No news available</p>
      <button
        @click="goBack"
        class="mt-4 inline-flex items-center text-sm text-cyan-400 hover:text-cyan-300"
      >
        ← Back to News
      </button>
    </div>
  </div>
</template>
