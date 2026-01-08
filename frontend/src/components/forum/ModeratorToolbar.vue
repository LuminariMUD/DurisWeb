<script setup lang="ts">
import { Lock, LockOpen, Pin, PinOff, Trash2, MoveRight, RotateCcw } from 'lucide-vue-next'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
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
import { ref } from 'vue'
import type { ForumThread } from '@/types'

interface Props {
  thread: ForumThread
  isModerator: boolean
}

defineProps<Props>()

const emit = defineEmits<{
  toggleLock: []
  togglePin: []
  deleteThread: [reason: string | null]
  restoreThread: []
  moveThread: []
}>()

const showDeleteDialog = ref(false)
const deleteReason = ref('')

function handleToggleLock() {
  emit('toggleLock')
}

function handleTogglePin() {
  emit('togglePin')
}

function handleDeleteThread() {
  emit('deleteThread', deleteReason.value || null)
  showDeleteDialog.value = false
  deleteReason.value = ''
}

function handleMoveThread() {
  emit('moveThread')
}

function handleRestoreThread() {
  emit('restoreThread')
}
</script>

<template>
  <div v-if="isModerator" class="flex flex-wrap items-center gap-2 p-3 lg:p-4 border rounded-lg bg-muted/50">
    <span class="text-xs lg:text-sm font-medium text-muted-foreground mr-2 w-full lg:w-auto">Moderator Tools:</span>

    <!-- Restore button for deleted threads -->
    <Button
      v-if="thread.is_deleted"
      size="sm"
      variant="default"
      @click="handleRestoreThread"
      title="Restore thread"
    >
      <RotateCcw class="h-4 w-4 mr-2" />
      Restore Thread
    </Button>

    <!-- Normal moderation actions (only for non-deleted threads) -->
    <template v-if="!thread.is_deleted">
      <Button
        size="sm"
        variant="outline"
        @click="handleToggleLock"
        :title="thread.is_locked ? 'Unlock thread' : 'Lock thread'"
      >
        <LockOpen v-if="thread.is_locked" class="h-4 w-4 mr-2" />
        <Lock v-else class="h-4 w-4 mr-2" />
        {{ thread.is_locked ? 'Unlock' : 'Lock' }}
      </Button>

    <Button
      size="sm"
      variant="outline"
      @click="handleTogglePin"
      :title="thread.is_pinned ? 'Unpin thread' : 'Pin thread'"
    >
      <PinOff v-if="thread.is_pinned" class="h-4 w-4 mr-2" />
      <Pin v-else class="h-4 w-4 mr-2" />
      {{ thread.is_pinned ? 'Unpin' : 'Pin' }}
    </Button>

    <Separator orientation="vertical" class="h-6" />

    <Button
      size="sm"
      variant="outline"
      @click="handleMoveThread"
      title="Move to another category"
    >
      <MoveRight class="h-4 w-4 mr-2" />
      Move
    </Button>

      <Button
        size="sm"
        variant="destructive"
        @click="showDeleteDialog = true"
        title="Delete thread"
      >
        <Trash2 class="h-4 w-4 mr-2" />
        Delete
      </Button>
    </template>

    <!-- Delete Confirmation Dialog -->
    <AlertDialog v-model:open="showDeleteDialog">
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete Thread</AlertDialogTitle>
          <AlertDialogDescription>
            Are you sure you want to delete this thread? This action can be reversed by moderators from the moderation log.
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div class="my-4">
          <label for="delete-reason" class="text-sm font-medium">Reason (optional)</label>
          <textarea
            id="delete-reason"
            v-model="deleteReason"
            class="w-full mt-2 p-2 border rounded-md resize-none"
            rows="3"
            placeholder="Enter reason for deletion..."
          />
        </div>

        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction @click="handleDeleteThread" class="bg-destructive text-destructive-foreground hover:bg-destructive/90">
            Delete Thread
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </div>
</template>
