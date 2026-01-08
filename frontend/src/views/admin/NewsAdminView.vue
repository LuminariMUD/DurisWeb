<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { apiClient as api } from '@/services/api'
import { Button } from '@/components/ui/button'
import { Save } from 'lucide-vue-next'
import { useToast } from '@/composables/useToast'
import TipTapEditor from '@/components/forum/editor/TipTapEditor.vue'
import { ansiToHtmlWithStyles, htmlToAnsi } from '@/utils/ansiParser'
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

const toast = useToast()

// State
const newsContent = ref('')
const loading = ref(false)
const saving = ref(false)
const announcing = ref(false)
const lastUpdate = ref<string | null>(null)
const showAnnounceDialog = ref(false)

// Load current news
async function loadNews() {
  loading.value = true
  try {
    const response = await api.get('/api/content/news')
    // Convert ANSI codes to HTML for TipTap editor
    const ansiText = response.data.news || ''
    newsContent.value = ansiToHtmlWithStyles(ansiText)
  } catch (error: any) {
    toast.show({
      title: 'Error',
      message: error.response?.data?.error?.message || error.message || 'Failed to load MUD news',
      type: 'error',
    })
  } finally {
    loading.value = false
  }
}

// Save news
async function saveNews() {
  if (!newsContent.value.trim()) {
    toast.show({
      title: 'Validation Error',
      message: 'News content cannot be empty',
      type: 'error',
    })
    return
  }

  saving.value = true
  try {
    // Convert HTML back to ANSI codes for database storage
    const ansiText = htmlToAnsi(newsContent.value)
    await api.put('/api/content/news', {
      content: ansiText,
    })

    toast.show({
      title: 'Success',
      message: 'MUD News updated successfully',
    })

    lastUpdate.value = new Date().toISOString()

    // show announce dialog
    showAnnounceDialog.value = true
  } catch (error: any) {
    toast.show({
      title: 'Error',
      message: error.response?.data?.error?.message || error.message || 'Failed to save MUD news',
      type: 'error',
    })
  } finally {
    saving.value = false
  }
}

// Announce news to all users
async function announceNews() {
  announcing.value = true
  try {
    const response = await api.post('/api/content/news/announce')
    toast.show({
      title: 'Success',
      message: `News update announced to all users (${response.data.date})`,
    })
  } catch (error: any) {
    toast.show({
      title: 'Error',
      message: error.response?.data?.error || error.message || 'Failed to announce news',
      type: 'error',
    })
  } finally {
    announcing.value = false
    showAnnounceDialog.value = false
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
  loadNews()
})
</script>

<template>
  <div class="p-6">
    <div class="flex justify-between items-center mb-6">
      <div>
        <h1 class="text-3xl font-bold text-white">MUD News Management</h1>
        <p class="text-muted-foreground mt-1">
          Manage the in-game news content displayed to all players
        </p>
        <p v-if="lastUpdate" class="text-xs text-muted-foreground mt-1">
          Last updated: {{ formatDate(lastUpdate) }}
        </p>
      </div>
      <Button @click="saveNews" :disabled="saving || loading">
        <Save class="w-4 h-4 mr-2" />
        {{ saving ? 'Saving...' : 'Save Changes' }}
      </Button>
    </div>

    <!-- Editor -->
    <div class="space-y-2">
      <div class="flex justify-between items-center">
        <label class="text-sm font-medium text-gray-200">
          News Content
        </label>
        <span class="text-xs text-muted-foreground">
          Use the color picker for MUD ANSI colors
        </span>
      </div>
      <TipTapEditor
        v-model="newsContent"
        :disabled="loading"
        placeholder="Enter MUD news content here..."
        :min-height="500"
      />
    </div>

    <!-- Info Box -->
    <div class="mt-6 border border-blue-500/30 bg-blue-500/10 rounded-lg p-4">
      <h3 class="font-medium text-blue-400 mb-2">About MUD News</h3>
      <p class="text-sm text-gray-300">
        The MUD News is displayed to players when they use the 'news' command in-game.
        Use this to share important updates, patch notes, new features, or community events.
        Use the color picker in the editor to apply MUD ANSI colors.
      </p>
    </div>

    <!-- Announce Dialog -->
    <AlertDialog :open="showAnnounceDialog" @update:open="showAnnounceDialog = $event">
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Announce Update?</AlertDialogTitle>
          <AlertDialogDescription>
            Do you want to notify all users about this news update? This will send a popup notification to online users and a push notification to subscribers.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel :disabled="announcing">No, Just Save</AlertDialogCancel>
          <AlertDialogAction @click="announceNews" :disabled="announcing">
            {{ announcing ? 'Announcing...' : 'Yes, Announce' }}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </div>
</template>
