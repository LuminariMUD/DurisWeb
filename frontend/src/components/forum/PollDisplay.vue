<template>
  <div>
  <Card v-if="!loading && pollData" class="bg-primary/5 border-primary/20">
    <CardHeader>
      <div class="flex items-start justify-between">
        <div class="flex-1">
          <CardTitle class="text-lg">📊 {{ pollData.poll.question }}</CardTitle>
          <div class="flex items-center gap-2 mt-2">
            <Badge :variant="pollData.isActive ? 'default' : 'secondary'">
              {{ pollData.isActive ? 'Active' : (pollData.poll.isClosed ? 'Closed' : 'Expired') }}
            </Badge>
            <span class="text-sm text-muted-foreground">
              {{ pollData.totalVotes }} {{ pollData.totalVotes === 1 ? 'vote' : 'votes' }}
            </span>
            <span v-if="pollData.poll.expiresAt && pollData.isActive" class="text-sm text-muted-foreground">
              • Expires {{ formatExpiration(pollData.poll.expiresAt) }}
            </span>
          </div>
        </div>

        <!-- Actions for creator/moderator -->
        <div v-if="canManagePoll" class="flex gap-2">
          <Button
            v-if="pollData.isActive"
            variant="outline"
            size="sm"
            @click="showCloseDialog = true"
          >
            Close Poll
          </Button>
          <Button
            variant="destructive"
            size="sm"
            @click="showDeleteDialog = true"
          >
            Delete
          </Button>
        </div>
      </div>
    </CardHeader>

    <CardContent>
      <!-- Show voting form if user hasn't voted, results not visible, or changing vote -->
      <PollVotingForm
        v-if="(!pollData.canViewResults || showVoting) && pollData.isActive"
        :poll="pollData.poll"
        :options="pollData.options"
        :user-votes="pollData.userVotes"
        @vote-submitted="handleVoteSubmitted"
      />

      <!-- Show results if user can view them and not changing vote -->
      <PollResults
        v-else-if="pollData.canViewResults && !showVoting"
        :poll="pollData.poll"
        :options="pollData.options"
        :total-votes="pollData.totalVotes"
        :user-votes="pollData.userVotes"
        :is-active="pollData.isActive"
        @change-vote="showVoting = true"
      />

      <!-- Show message if results not visible yet -->
      <div v-else class="text-center py-6 text-muted-foreground">
        <p v-if="pollData.poll.resultsVisibility === 'after_voting'">
          You must vote to see the results
        </p>
        <p v-else-if="pollData.poll.resultsVisibility === 'after_expiration'">
          Results will be visible after the poll expires
        </p>
      </div>
    </CardContent>
  </Card>

  <!-- Loading skeleton -->
  <Card v-else-if="loading" class="bg-primary/5 border-primary/20">
    <CardHeader>
      <Skeleton class="h-6 w-3/4" />
      <Skeleton class="h-4 w-1/2 mt-2" />
    </CardHeader>
    <CardContent>
      <div class="space-y-3">
        <Skeleton class="h-10 w-full" />
        <Skeleton class="h-10 w-full" />
        <Skeleton class="h-10 w-full" />
      </div>
    </CardContent>
  </Card>

  <!-- Close Poll Dialog -->
  <AlertDialog :open="showCloseDialog" @update:open="showCloseDialog = $event">
    <AlertDialogContent>
      <AlertDialogHeader>
        <AlertDialogTitle>Close Poll?</AlertDialogTitle>
        <AlertDialogDescription>
          This will prevent any new votes from being cast. This action cannot be undone.
        </AlertDialogDescription>
      </AlertDialogHeader>
      <div v-if="actionError" class="text-sm text-destructive">
        {{ actionError }}
      </div>
      <AlertDialogFooter>
        <AlertDialogCancel>Cancel</AlertDialogCancel>
        <AlertDialogAction @click="confirmClosePoll">Close Poll</AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>

  <!-- Delete Poll Dialog -->
  <AlertDialog :open="showDeleteDialog" @update:open="showDeleteDialog = $event">
    <AlertDialogContent>
      <AlertDialogHeader>
        <AlertDialogTitle>Delete Poll?</AlertDialogTitle>
        <AlertDialogDescription>
          This will permanently delete the poll and all votes. This action cannot be undone.
        </AlertDialogDescription>
      </AlertDialogHeader>
      <div v-if="actionError" class="text-sm text-destructive">
        {{ actionError }}
      </div>
      <AlertDialogFooter>
        <AlertDialogCancel>Cancel</AlertDialogCancel>
        <AlertDialogAction @click="confirmDeletePoll" class="bg-destructive hover:bg-destructive/90">
          Delete Poll
        </AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { forumApi } from '@/services/api'
import { useAuth } from '@/composables/useAuth'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
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
import PollVotingForm from './PollVotingForm.vue'
import PollResults from './PollResults.vue'
import type { PollResultData } from '@/types'

const props = defineProps<{
  threadId: number
}>()

const { accountName, permissions } = useAuth()

const loading = ref(true)
const pollData = ref<PollResultData | null>(null)
const showVoting = ref(false)
const showCloseDialog = ref(false)
const showDeleteDialog = ref(false)
const actionError = ref<string | null>(null)

const canManagePoll = computed(() => {
  if (!pollData.value || !accountName.value) return false
  return (
    pollData.value.poll.createdByAccount === accountName.value || permissions.value?.canModerate
  )
})

async function loadPoll() {
  try {
    loading.value = true
    pollData.value = await forumApi.getThreadPoll(props.threadId)
  } catch {
    // Poll doesn't exist - that's okay
    pollData.value = null
  } finally {
    loading.value = false
  }
}

function formatExpiration(dateStr: string): string {
  const date = new Date(dateStr)
  const now = new Date()
  const diff = date.getTime() - now.getTime()
  const hours = Math.floor(diff / (1000 * 60 * 60))
  const days = Math.floor(hours / 24)

  if (days > 0) return `in ${days} day${days > 1 ? 's' : ''}`
  if (hours > 0) return `in ${hours} hour${hours > 1 ? 's' : ''}`
  return 'soon'
}

async function handleVoteSubmitted() {
  // Reload poll to show updated results
  await loadPoll()
  showVoting.value = false
}

async function confirmClosePoll() {
  if (!pollData.value) return

  try {
    actionError.value = null
    await forumApi.closePoll(pollData.value.poll.id)
    showCloseDialog.value = false
    await loadPoll()
  } catch (error: any) {
    actionError.value = 'Failed to close poll: ' + (error.response?.data?.error || error.message)
  }
}

async function confirmDeletePoll() {
  if (!pollData.value) return

  try {
    actionError.value = null
    await forumApi.deletePoll(pollData.value.poll.id)
    showDeleteDialog.value = false
    pollData.value = null
  } catch (error: any) {
    actionError.value = 'Failed to delete poll: ' + (error.response?.data?.error || error.message)
  }
}

onMounted(() => {
  loadPoll()
})
</script>
