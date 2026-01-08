<template>
  <div class="space-y-4">
    <p v-if="userVotes.length > 0" class="text-sm text-muted-foreground mb-2">
      You are updating your vote
    </p>

    <p v-if="poll.isMultipleChoice" class="text-sm font-medium">
      Select {{ poll.minChoices === poll.maxChoices ? poll.maxChoices : `${poll.minChoices}-${poll.maxChoices}` }} option{{ poll.maxChoices > 1 ? 's' : '' }}
    </p>

    <!-- Options -->
    <div class="space-y-2">
      <label
        v-for="option in options"
        :key="option.id"
        class="flex items-center gap-3 p-3 border rounded-md cursor-pointer hover:bg-accent transition-colors"
        :class="{ 'bg-accent': selectedOptions.includes(option.id) }"
      >
        <input
          v-if="poll.isMultipleChoice"
          type="checkbox"
          :value="option.id"
          v-model="selectedOptions"
          :disabled="isSubmitting"
          class="w-4 h-4"
        />
        <input
          v-else
          type="radio"
          :value="option.id"
          v-model="selectedOptions[0]"
          :disabled="isSubmitting"
          class="w-4 h-4"
        />
        <span class="flex-1">{{ option.optionText }}</span>
      </label>
    </div>

    <!-- Error message -->
    <p v-if="error" class="text-sm text-destructive">
      {{ error }}
    </p>

    <!-- Actions -->
    <div class="flex gap-2">
      <Button
        @click="submitVote"
        :disabled="!canSubmit || isSubmitting"
        class="flex-1"
      >
        {{ isSubmitting ? 'Submitting...' : (userVotes.length > 0 ? 'Update Vote' : 'Submit Vote') }}
      </Button>
      <Button
        v-if="userVotes.length > 0"
        variant="outline"
        @click="showRemoveDialog = true"
        :disabled="isSubmitting"
      >
        Remove Vote
      </Button>
    </div>
  </div>

  <!-- Remove Vote Confirmation Dialog -->
  <AlertDialog :open="showRemoveDialog" @update:open="showRemoveDialog = $event">
    <AlertDialogContent>
      <AlertDialogHeader>
        <AlertDialogTitle>Remove Vote?</AlertDialogTitle>
        <AlertDialogDescription>
          Are you sure you want to remove your vote from this poll?
        </AlertDialogDescription>
      </AlertDialogHeader>
      <AlertDialogFooter>
        <AlertDialogCancel>Cancel</AlertDialogCancel>
        <AlertDialogAction @click="confirmRemoveVote">Remove Vote</AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { forumApi } from '@/services/api'
import { Button } from '@/components/ui/button'
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
import type { ForumPoll, PollOption } from '@/types'

const props = defineProps<{
  poll: ForumPoll
  options: PollOption[]
  userVotes: number[]
}>()

const emit = defineEmits<{
  'vote-submitted': []
}>()

const selectedOptions = ref<number[]>([...props.userVotes])
const isSubmitting = ref(false)
const error = ref('')
const showRemoveDialog = ref(false)

const canSubmit = computed(() => {
  if (props.poll.isMultipleChoice) {
    return (
      selectedOptions.value.length >= props.poll.minChoices &&
      selectedOptions.value.length <= props.poll.maxChoices
    )
  }
  return selectedOptions.value.length === 1
})

async function submitVote() {
  if (!canSubmit.value) {
    if (props.poll.isMultipleChoice) {
      error.value = `Please select ${props.poll.minChoices === props.poll.maxChoices ? props.poll.maxChoices : `${props.poll.minChoices}-${props.poll.maxChoices}`} option${props.poll.maxChoices > 1 ? 's' : ''}`
    } else {
      error.value = 'Please select an option'
    }
    return
  }

  try {
    isSubmitting.value = true
    error.value = ''
    await forumApi.votePoll(props.poll.id, selectedOptions.value)
    emit('vote-submitted')
  } catch (err: any) {
    error.value = err.response?.data?.error || 'Failed to submit vote'
  } finally {
    isSubmitting.value = false
  }
}

async function confirmRemoveVote() {
  try {
    isSubmitting.value = true
    error.value = ''
    await forumApi.removeVote(props.poll.id)
    showRemoveDialog.value = false
    emit('vote-submitted')
  } catch (err: any) {
    error.value = err.response?.data?.error || 'Failed to remove vote'
  } finally {
    isSubmitting.value = false
  }
}
</script>
