<script setup lang="ts">
import { ref, watch } from 'vue'
import { forumApi } from '@/services/api'
import type { ForumCategory } from '@/types'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Alert, AlertDescription } from '@/components/ui/alert'

interface Props {
  open: boolean
  threadId: number
  currentCategoryId: number
}

const props = defineProps<Props>()

const emit = defineEmits<{
  'update:open': [value: boolean]
  success: []
}>()

const categories = ref<ForumCategory[]>([])
const selectedCategoryId = ref<string>('')
const reason = ref('')
const isLoading = ref(false)
const error = ref<string | null>(null)

async function loadCategories() {
  try {
    categories.value = await forumApi.getCategories()
    // Filter out current category
    categories.value = categories.value.filter((c) => c.id !== props.currentCategoryId)
  } catch {
    error.value = 'Failed to load categories'
  }
}

async function handleMove() {
  if (!selectedCategoryId.value) {
    error.value = 'Please select a category'
    return
  }

  isLoading.value = true
  error.value = null

  try {
    await forumApi.moveThread(
      props.threadId,
      parseInt(selectedCategoryId.value),
      reason.value || undefined,
    )

    emit('success')
    emit('update:open', false)

    // Reset form
    selectedCategoryId.value = ''
    reason.value = ''
  } catch (err: any) {
    error.value = err.response?.data?.error || 'Failed to move thread'
  } finally {
    isLoading.value = false
  }
}

function handleCancel() {
  emit('update:open', false)
  selectedCategoryId.value = ''
  reason.value = ''
  error.value = null
}

// Load categories when dialog opens
watch(
  () => props.open,
  (isOpen) => {
    if (isOpen) {
      loadCategories()
    }
  },
)
</script>

<template>
  <Dialog :open="open" @update:open="(val) => emit('update:open', val)">
    <DialogContent class="sm:max-w-[500px]">
      <DialogHeader>
        <DialogTitle>Move Thread to Another Category</DialogTitle>
        <DialogDescription>
          Select the category you want to move this thread to. This action will be logged in the moderation history.
        </DialogDescription>
      </DialogHeader>

      <div class="space-y-4 py-4">
        <!-- Category Selection -->
        <div class="space-y-2">
          <Label for="category">Target Category</Label>
          <Select v-model="selectedCategoryId">
            <SelectTrigger id="category">
              <SelectValue placeholder="Select a category" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem
                v-for="category in categories"
                :key="category.id"
                :value="category.id.toString()"
              >
                {{ category.name }}
              </SelectItem>
            </SelectContent>
          </Select>
        </div>

        <!-- Reason -->
        <div class="space-y-2">
          <Label for="reason">Reason (optional)</Label>
          <Textarea
            id="reason"
            v-model="reason"
            placeholder="Enter reason for moving this thread..."
            rows="3"
          />
        </div>

        <!-- Error Display -->
        <Alert v-if="error" variant="destructive">
          <AlertDescription>{{ error }}</AlertDescription>
        </Alert>
      </div>

      <DialogFooter>
        <Button variant="outline" @click="handleCancel" :disabled="isLoading">
          Cancel
        </Button>
        <Button @click="handleMove" :disabled="isLoading || !selectedCategoryId">
          {{ isLoading ? 'Moving...' : 'Move Thread' }}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
