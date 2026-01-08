<script setup lang="ts">
import { ref, watch } from 'vue'
import { useQuery, useMutation, useQueryClient } from '@tanstack/vue-query'
import { builderApi } from '@/services/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { GitCommit, FileEdit, FilePlus, FileX, Loader2, Check, AlertCircle } from 'lucide-vue-next'

const props = defineProps<{
  open: boolean
  zoneId: string
  zoneName: string
}>()

const emit = defineEmits<{
  (e: 'update:open', value: boolean): void
  (e: 'committed', commitHash: string): void
}>()

const queryClient = useQueryClient()

// Commit message state
const commitMessage = ref('')
const commitResult = ref<{ success: boolean; commitHash?: string; error?: string } | null>(null)

// Reset state when dialog opens
watch(() => props.open, (open) => {
  if (open) {
    commitMessage.value = `Zone builder: Updated ${props.zoneName}`
    commitResult.value = null
  }
})

// Query for git status
const { data: gitStatus, isLoading: statusLoading, isError: statusError } = useQuery({
  queryKey: ['zone-git-status', props.zoneId],
  queryFn: () => builderApi.getZoneGitStatus(props.zoneId),
  enabled: () => props.open,
  staleTime: 0, // Always refetch when dialog opens
})

// Commit mutation
const commitMutation = useMutation({
  mutationFn: () => builderApi.commitZone(props.zoneId, commitMessage.value),
  onSuccess: (result) => {
    commitResult.value = result
    if (result.success && result.commitHash) {
      // Invalidate git status
      queryClient.invalidateQueries({ queryKey: ['zone-git-status', props.zoneId] })
      // Emit committed event
      emit('committed', result.commitHash)
    }
  },
  onError: (error: Error) => {
    commitResult.value = {
      success: false,
      error: error.message || 'Failed to commit changes',
    }
  },
})

// Handle commit
function handleCommit() {
  if (!commitMessage.value.trim()) return
  commitMutation.mutate()
}

// Close dialog
function closeDialog() {
  emit('update:open', false)
}

// Get status icon for file
function getStatusIcon(status: 'modified' | 'new' | 'deleted') {
  switch (status) {
    case 'modified':
      return FileEdit
    case 'new':
      return FilePlus
    case 'deleted':
      return FileX
  }
}

// Get status badge variant
function getStatusVariant(status: 'modified' | 'new' | 'deleted'): 'default' | 'secondary' | 'destructive' {
  switch (status) {
    case 'modified':
      return 'default'
    case 'new':
      return 'secondary'
    case 'deleted':
      return 'destructive'
  }
}
</script>

<template>
  <Dialog :open="props.open" @update:open="emit('update:open', $event)">
    <DialogContent class="sm:max-w-[500px]">
      <DialogHeader>
        <DialogTitle class="flex items-center gap-2">
          <GitCommit class="h-5 w-5" />
          Commit Zone Changes
        </DialogTitle>
        <DialogDescription>
          Commit changes to {{ zoneName }} zone files to git
        </DialogDescription>
      </DialogHeader>

      <!-- Success State -->
      <div v-if="commitResult?.success" class="py-6">
        <Alert variant="default" class="border-green-500/50 bg-green-500/10">
          <Check class="h-4 w-4 text-green-500" />
          <AlertDescription class="text-green-500">
            Changes committed successfully!
            <span v-if="commitResult.commitHash" class="font-mono ml-1">
              ({{ commitResult.commitHash }})
            </span>
          </AlertDescription>
        </Alert>
        <div class="flex justify-end mt-4">
          <Button @click="closeDialog">Close</Button>
        </div>
      </div>

      <!-- Error State -->
      <div v-else-if="commitResult && !commitResult.success" class="py-4">
        <Alert variant="destructive">
          <AlertCircle class="h-4 w-4" />
          <AlertDescription>
            {{ commitResult.error || 'Failed to commit changes' }}
          </AlertDescription>
        </Alert>
        <div class="flex justify-end gap-2 mt-4">
          <Button variant="outline" @click="commitResult = null">Try Again</Button>
          <Button variant="outline" @click="closeDialog">Close</Button>
        </div>
      </div>

      <!-- Loading Status -->
      <div v-else-if="statusLoading" class="py-8 flex items-center justify-center">
        <Loader2 class="h-8 w-8 animate-spin text-muted-foreground" />
      </div>

      <!-- Status Error -->
      <div v-else-if="statusError" class="py-4">
        <Alert variant="destructive">
          <AlertCircle class="h-4 w-4" />
          <AlertDescription>
            Failed to get git status. Git may not be initialized in the MUD directory.
          </AlertDescription>
        </Alert>
        <div class="flex justify-end mt-4">
          <Button variant="outline" @click="closeDialog">Close</Button>
        </div>
      </div>

      <!-- No Changes -->
      <div v-else-if="gitStatus && !gitStatus.modified" class="py-4">
        <Alert>
          <Check class="h-4 w-4" />
          <AlertDescription>
            No changes to commit. All zone files are up to date.
          </AlertDescription>
        </Alert>
        <div class="flex justify-end mt-4">
          <Button variant="outline" @click="closeDialog">Close</Button>
        </div>
      </div>

      <!-- Commit Form -->
      <div v-else-if="gitStatus" class="space-y-4">
        <!-- Changed Files -->
        <div>
          <Label class="mb-2 block">Changed Files</Label>
          <div class="space-y-1 max-h-32 overflow-y-auto border rounded-md p-2 bg-muted/50">
            <div
              v-for="file in gitStatus.files"
              :key="file.path"
              class="flex items-center gap-2 text-sm"
            >
              <component :is="getStatusIcon(file.status)" class="h-4 w-4 shrink-0" />
              <span class="font-mono text-xs truncate">{{ file.path }}</span>
              <Badge :variant="getStatusVariant(file.status)" class="text-xs ml-auto shrink-0">
                {{ file.status }}
              </Badge>
            </div>
          </div>
        </div>

        <!-- Commit Message -->
        <div>
          <Label for="commit-message" class="mb-2 block">Commit Message</Label>
          <Input
            id="commit-message"
            v-model="commitMessage"
            placeholder="Describe your changes..."
            :disabled="commitMutation.isPending.value"
          />
        </div>

        <DialogFooter>
          <Button variant="outline" @click="closeDialog" :disabled="commitMutation.isPending.value">
            Cancel
          </Button>
          <Button
            @click="handleCommit"
            :disabled="!commitMessage.trim() || commitMutation.isPending.value"
          >
            <Loader2 v-if="commitMutation.isPending.value" class="h-4 w-4 mr-2 animate-spin" />
            <GitCommit v-else class="h-4 w-4 mr-2" />
            Commit
          </Button>
        </DialogFooter>
      </div>
    </DialogContent>
  </Dialog>
</template>
