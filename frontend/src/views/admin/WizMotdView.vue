<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { apiClient as api } from '@/services/api'
import { Button } from '@/components/ui/button'
import { Save } from 'lucide-vue-next'
import { useToast } from '@/composables/useToast'
import TipTapEditor from '@/components/forum/editor/TipTapEditor.vue'
import { ansiToHtmlWithStyles, htmlToAnsi } from '@/utils/ansiParser'

const toast = useToast()

// State
const wizmotdContent = ref('')
const loading = ref(false)
const saving = ref(false)
const lastUpdate = ref<string | null>(null)

// Load current wizmotd
async function loadwizmotd() {
  loading.value = true
  try {
    const response = await api.get('/api/content/wizmotd')
    // Convert ANSI codes to HTML for TipTap editor
    const ansiText = response.data.wizmotd || ''
    wizmotdContent.value = ansiToHtmlWithStyles(ansiText)
  } catch (error: any) {
    toast.show({
      title: 'Error',
      message: error.response?.data?.error?.message || error.message || 'Failed to load wizmotd',
      type: 'error',
    })
  } finally {
    loading.value = false
  }
}

// Save wizmotd
async function savewizmotd() {
  if (!wizmotdContent.value.trim()) {
    toast.show({
      title: 'Validation Error',
      message: 'wizmotd content cannot be empty',
      type: 'error',
    })
    return
  }

  saving.value = true
  try {
    // Convert HTML back to ANSI codes for database storage
    const ansiText = htmlToAnsi(wizmotdContent.value)
    await api.put('/api/content/wizmotd', {
      content: ansiText,
    })

    toast.show({
      title: 'Success',
      message: 'wizmotd updated successfully',
    })

    lastUpdate.value = new Date().toISOString()
  } catch (error: any) {
    toast.show({
      title: 'Error',
      message: error.response?.data?.error?.message || error.message || 'Failed to save wizmotd',
      type: 'error',
    })
  } finally {
    saving.value = false
  }
}

function formatDate(date: string | null) {
  if (!date) return 'Never'
  return new Date(date).toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

onMounted(() => {
  loadwizmotd()
})
</script>

<template>
  <div class="p-6">
    <div class="flex justify-between items-center mb-6">
      <div>
        <h1 class="text-3xl font-bold text-white">wizmotd Management</h1>
        <p class="text-muted-foreground mt-1">
          Manage the Wizard Message of the Day shown to players on login
        </p>
        <p v-if="lastUpdate" class="text-xs text-muted-foreground mt-1">
          Last updated: {{ formatDate(lastUpdate) }}
        </p>
      </div>
      <Button @click="savewizmotd" :disabled="saving || loading">
        <Save class="w-4 h-4 mr-2" />
        {{ saving ? 'Saving...' : 'Save Changes' }}
      </Button>
    </div>

    <!-- Editor -->
    <div class="space-y-2">
      <div class="flex justify-between items-center">
        <label class="text-sm font-medium text-gray-200">
          wizmotd Content
        </label>
        <span class="text-xs text-muted-foreground">
          Use the color picker for MUD ANSI colors
        </span>
      </div>
      <TipTapEditor
        v-model="wizmotdContent"
        :disabled="loading"
        placeholder="Enter wizmotd content here..."
        :min-height="500"
      />
    </div>

    <!-- Info Box -->
    <div class="mt-6 border border-blue-500/30 bg-blue-500/10 rounded-lg p-4">
      <h3 class="font-medium text-blue-400 mb-2">About wizmotd</h3>
      <p class="text-sm text-gray-300">
        The Wizard Message of the Day (wizmotd) is displayed to all gods and immortals when immortals log into the MUD.
        Use this to communicate important server announcements, upcoming events, maintenance
        schedules, or welcome new players. Use the color picker in the editor to apply MUD ANSI colors.
      </p>
    </div>
  </div>
</template>
