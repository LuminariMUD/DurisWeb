<script setup lang="ts">
import { ref, onMounted, computed, watch } from 'vue'
import { useRouter } from 'vue-router'
import { forumApi } from '@/services/api'
import { useAuth } from '@/composables/useAuth'
import { useDraftAutosave } from '@/composables/useDraftAutosave'
import { useMentionAutocomplete } from '@/composables/useMentionAutocomplete'
import type { ForumCategory, PollCreationData } from '@/types'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Switch } from '@/components/ui/switch'
import TipTapEditor from '@/components/forum/editor/TipTapEditor.vue'
import MentionAutocomplete from '@/components/forum/MentionAutocomplete.vue'
import PollCreator from '@/components/forum/PollCreator.vue'

const props = defineProps<{
  categoryId: string
}>()

const router = useRouter()
const { isAuthenticated, selectedCharacter, characters } = useAuth()

const category = ref<ForumCategory | null>(null)
const title = ref('')
const content = ref('')
const isSubmitting = ref(false)
const error = ref<string | null>(null)

// Poll state
const includePoll = ref(false)
const pollData = ref<PollCreationData | null>(null)

const categoryIdNum = computed(() => parseInt(props.categoryId))

// Draft autosave for new threads
const draftKey = computed(() => `forum_draft_thread_${categoryIdNum.value}`)
const {
  hasDraft,
  formatDraftTime,
  restoreDraft,
  clearDraft: clearThreadDraft
} = useDraftAutosave(draftKey.value, content, title)
const showDraftPrompt = ref(false)

// Check for draft on mount
watch(category, (newCategory) => {
  if (newCategory && hasDraft.value && !title.value && !content.value) {
    showDraftPrompt.value = true
  }
}, { immediate: true })

// Mention autocomplete
const contentTextareaRef = ref<HTMLTextAreaElement | null>(null)
const {
  suggestions: mentionSuggestions,
  selectedIndex: mentionSelectedIndex,
  isOpen: isMentionDropdownOpen,
  selectMention,
  getDropdownPosition
} = useMentionAutocomplete(contentTextareaRef)

const mentionDropdownPosition = computed(() => getDropdownPosition())

async function loadCategory() {
  try {
    category.value = await forumApi.getCategory(categoryIdNum.value)
  } catch (err: any) {
    error.value = err.response?.data?.error || 'Failed to load category'
  }
}

async function submitThread() {
  if (!title.value.trim() || !content.value.trim()) {
    error.value = 'Please fill in both title and content'
    return
  }

  // Validate poll if included
  if (includePoll.value && !pollData.value) {
    error.value = 'Please complete the poll or disable it'
    return
  }

  isSubmitting.value = true
  error.value = null

  try {
    const response = await forumApi.createThread(
      categoryIdNum.value,
      title.value,
      content.value,
      selectedCharacter.value?.pid
    )

    // Create poll if included
    if (includePoll.value && pollData.value) {
      try {
        await forumApi.createPoll(response.threadId, pollData.value)
      } catch {
        // Thread is created, but poll failed - still redirect
        error.value = 'Thread created but poll failed to create'
      }
    }

    // Clear draft after successful submission
    clearThreadDraft()

    // Redirect to the new thread
    router.push(`/forum/thread/${response.threadId}`)
  } catch (err: any) {
    error.value = err.response?.data?.error || 'Failed to create thread'
    isSubmitting.value = false
  }
}

onMounted(() => {
  if (!isAuthenticated.value) {
    router.push('/login')
    return
  }
  loadCategory()
})
</script>

<template>
  <div class="container mx-auto px-4 py-8 max-w-4xl">
    <!-- Header -->
    <div class="mb-8">
      <Button variant="ghost" @click="router.push(`/forum/category/${categoryId}`)">
        ← Back to {{ category?.name || 'Category' }}
      </Button>
      <h1 class="text-3xl font-bold mt-4">Create New Thread</h1>
      <p class="text-muted-foreground mt-2">
        Start a new discussion in {{ category?.name }}
      </p>
    </div>

    <!-- Form -->
    <Card>
      <CardHeader>
        <CardTitle>Thread Details</CardTitle>
        <div v-if="selectedCharacter" class="text-sm text-muted-foreground">
          Posting as: <span class="font-medium">{{ selectedCharacter.name }}</span>
          ({{ selectedCharacter.classname }})
        </div>
        <div v-else-if="characters.length > 0" class="text-sm text-yellow-600">
          No character selected - posting as account
        </div>
      </CardHeader>

      <CardContent class="space-y-4">
        <!-- Draft Restore Prompt -->
        <div v-if="showDraftPrompt" class="p-3 bg-muted rounded-md flex items-center justify-between">
          <div class="text-sm">
            <span class="font-medium">Draft found</span>
            <span class="text-muted-foreground ml-2">(saved {{ formatDraftTime() }})</span>
          </div>
          <div class="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              @click="() => { showDraftPrompt = false; clearThreadDraft() }"
            >
              Discard
            </Button>
            <Button
              size="sm"
              @click="() => { restoreDraft(); showDraftPrompt = false }"
            >
              Restore Draft
            </Button>
          </div>
        </div>

        <!-- Error Alert -->
        <Alert v-if="error" variant="destructive">
          <AlertDescription>{{ error }}</AlertDescription>
        </Alert>

        <!-- Title -->
        <div class="space-y-2">
          <Label for="title">Thread Title</Label>
          <Input
            id="title"
            v-model="title"
            placeholder="Enter a descriptive title..."
            :disabled="isSubmitting"
            maxlength="200"
          />
          <p class="text-xs text-muted-foreground">
            {{ title.length }}/200 characters
          </p>
        </div>

        <!-- Content -->
        <div class="space-y-2">
          <Label for="content">Content</Label>
          <TipTapEditor
            id="content"
            v-model="content"
            placeholder="Write your thread content... (use @username to mention)"
            :editable="!isSubmitting"
          />
          <p class="text-xs text-muted-foreground">
            Minimum 10 characters required
          </p>

          <!-- Draft Status Indicator -->
          <div v-if="hasDraft && (title.trim() || content.trim())" class="text-xs text-muted-foreground">
            Draft saved {{ formatDraftTime() }}
          </div>
        </div>

        <!-- Poll Section (Optional) -->
        <Card class="bg-muted/30">
          <CardHeader>
            <div class="flex items-center justify-between">
              <CardTitle class="text-base">📊 Add Poll (Optional)</CardTitle>
              <Switch v-model="includePoll" />
            </div>
          </CardHeader>
          <CardContent v-if="includePoll">
            <PollCreator @update:poll-data="pollData = $event" />
          </CardContent>
        </Card>

        <!-- Actions -->
        <div class="flex justify-between items-center pt-4">
          <Button
            v-if="hasDraft && (title.trim() || content.trim())"
            variant="ghost"
            size="sm"
            @click="clearThreadDraft"
          >
            Clear Draft
          </Button>
          <div v-else></div>

          <div class="flex gap-2">
            <Button
              variant="outline"
              @click="router.push(`/forum/category/${categoryId}`)"
              :disabled="isSubmitting"
            >
              Cancel
            </Button>
            <Button
              @click="submitThread"
              :disabled="isSubmitting || !title.trim() || content.length < 10"
            >
              {{ isSubmitting ? 'Creating...' : 'Create Thread' }}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>

    <!-- Mention Autocomplete Dropdown -->
    <MentionAutocomplete
      :suggestions="mentionSuggestions"
      :selected-index="mentionSelectedIndex"
      :is-open="isMentionDropdownOpen"
      :position="mentionDropdownPosition"
      @select-mention="selectMention"
      @update:selected-index="(index) => mentionSelectedIndex = index"
    />
  </div>
</template>
