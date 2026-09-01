<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { useRouter } from 'vue-router'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
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
import { Skeleton } from '@/components/ui/skeleton'
import { helpSuggestionApi } from '@/services/api'
import { useAuth } from '@/composables/useAuth'
import { useToast } from '@/composables/useToast'
import { parseAnsiForVue, stripAnsiCodes } from '@/utils/ansiParser'
import type { HelpSuggestion, SuggestionStatus } from '@/types'
import {
  FileText,
  Plus,
  Eye,
  Trash2,
  Clock,
  CheckCircle,
  XCircle,
  AlertCircle,
  Edit,
} from 'lucide-vue-next'

const router = useRouter()
const { isAuthenticated } = useAuth()
const toast = useToast()

// State
const loading = ref(true)
const suggestions = ref<HelpSuggestion[]>([])
const selectedSuggestion = ref<HelpSuggestion | null>(null)
const showViewDialog = ref(false)
const showDeleteDialog = ref(false)
const deletingSuggestionId = ref<number | null>(null)
const deleting = ref(false)

// Load suggestions
async function loadSuggestions() {
  loading.value = true
  try {
    const result = await helpSuggestionApi.getMySuggestions()
    suggestions.value = result.suggestions
  } catch {
    toast.error('Failed to load suggestions')
  } finally {
    loading.value = false
  }
}

// View suggestion
function viewSuggestion(suggestion: HelpSuggestion) {
  selectedSuggestion.value = suggestion
  showViewDialog.value = true
}

// Edit suggestion - navigate to edit page
function editSuggestion(suggestion: HelpSuggestion) {
  router.push({ name: 'guide-suggest', query: { suggestion: suggestion.id } })
}

// Confirm delete
function confirmDelete(id: number) {
  deletingSuggestionId.value = id
  showDeleteDialog.value = true
}

// Delete suggestion
async function deleteSuggestion() {
  if (!deletingSuggestionId.value) return

  deleting.value = true
  try {
    await helpSuggestionApi.cancelSuggestion(deletingSuggestionId.value)
    suggestions.value = suggestions.value.filter((s) => s.id !== deletingSuggestionId.value)
    toast.success('Suggestion cancelled')
    showDeleteDialog.value = false
  } catch {
    toast.error('Failed to cancel suggestion')
  } finally {
    deleting.value = false
    deletingSuggestionId.value = null
  }
}

// Status helpers
function getStatusBadge(status: SuggestionStatus) {
  const badges: Record<
    SuggestionStatus,
    { variant: 'default' | 'secondary' | 'destructive' | 'outline'; class: string; icon: any }
  > = {
    pending: { variant: 'secondary', class: 'bg-yellow-500/20 text-yellow-400', icon: Clock },
    in_review: { variant: 'secondary', class: 'bg-blue-500/20 text-blue-400', icon: Eye },
    approved: { variant: 'default', class: 'bg-green-500/20 text-green-400', icon: CheckCircle },
    rejected: { variant: 'destructive', class: 'bg-red-500/20 text-red-400', icon: XCircle },
    needs_revision: {
      variant: 'outline',
      class: 'bg-orange-500/20 text-orange-400',
      icon: AlertCircle,
    },
  }
  return badges[status] || badges.pending
}

function getStatusLabel(status: SuggestionStatus): string {
  const labels: Record<SuggestionStatus, string> = {
    pending: 'Pending',
    in_review: 'In Review',
    approved: 'Approved',
    rejected: 'Rejected',
    needs_revision: 'Needs Revision',
  }
  return labels[status] || status
}

function canEdit(suggestion: HelpSuggestion): boolean {
  return suggestion.status === 'pending' || suggestion.status === 'needs_revision'
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '-'
  const date = new Date(dateStr)
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

// Computed
const hasSuggestions = computed(() => suggestions.value.length > 0)

// Parsed content for dialog
const parsedContent = computed(() => {
  if (!selectedSuggestion.value?.text) return ''
  return parseAnsiForVue(selectedSuggestion.value.text)
})

onMounted(() => {
  if (isAuthenticated.value) {
    loadSuggestions()
  }
})
</script>

<template>
  <div class="h-full flex flex-col">
    <div class="flex-1 overflow-y-auto">
      <div class="container max-w-5xl mx-auto px-4 py-6 space-y-6">
        <!-- Header -->
        <div class="flex items-center justify-between">
          <div>
            <div class="flex items-center gap-3 mb-2">
              <FileText class="h-8 w-8 text-cyan-400" />
              <h1 class="text-3xl font-bold text-white">My Suggestions</h1>
            </div>
            <p class="text-muted-foreground">
              Track the status of your help file suggestions
            </p>
          </div>
          <Button @click="router.push({ name: 'guide-suggest' })">
            <Plus class="h-4 w-4 mr-2" />
            New Suggestion
          </Button>
        </div>

        <!-- Loading -->
        <Card v-if="loading">
          <CardContent class="pt-6 space-y-3">
            <Skeleton class="h-12 w-full" />
            <Skeleton class="h-12 w-full" />
            <Skeleton class="h-12 w-full" />
          </CardContent>
        </Card>

        <!-- Empty state -->
        <Card v-else-if="!hasSuggestions">
          <CardContent class="py-12 text-center">
            <FileText class="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-50" />
            <h3 class="text-lg font-medium mb-2">No suggestions yet</h3>
            <p class="text-muted-foreground mb-4">
              You haven't submitted any help file suggestions yet.
            </p>
            <Button @click="router.push({ name: 'guide-suggest' })">
              <Plus class="h-4 w-4 mr-2" />
              Submit your first suggestion
            </Button>
          </CardContent>
        </Card>

        <!-- Suggestions list -->
        <Card v-else>
          <CardHeader>
            <CardTitle>Your Submissions</CardTitle>
            <CardDescription>
              {{ suggestions.length }} suggestion{{ suggestions.length !== 1 ? 's' : '' }}
            </CardDescription>
          </CardHeader>
          <CardContent class="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead class="pl-4">Title</TableHead>
                  <TableHead class="w-[80px]">Type</TableHead>
                  <TableHead class="w-[120px]">Status</TableHead>
                  <TableHead class="w-[150px]">Submitted</TableHead>
                  <TableHead class="w-[100px] pr-4"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <TableRow
                  v-for="suggestion in suggestions"
                  :key="suggestion.id"
                  class="hover:bg-muted/50"
                >
                  <TableCell class="font-medium pl-4">
                    {{ stripAnsiCodes(suggestion.title) }}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" class="text-xs">
                      {{ suggestion.suggestion_type === 'new' ? 'New' : 'Edit' }}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge
                      :class="getStatusBadge(suggestion.status).class"
                      class="gap-1"
                    >
                      <component :is="getStatusBadge(suggestion.status).icon" class="h-3 w-3" />
                      {{ getStatusLabel(suggestion.status) }}
                    </Badge>
                  </TableCell>
                  <TableCell class="text-sm text-muted-foreground">
                    {{ formatDate(suggestion.submitted_at) }}
                  </TableCell>
                  <TableCell class="pr-4">
                    <div class="flex items-center gap-1 justify-end">
                      <Button
                        variant="ghost"
                        size="sm"
                        @click="viewSuggestion(suggestion)"
                      >
                        <Eye class="h-4 w-4" />
                      </Button>
                      <Button
                        v-if="canEdit(suggestion)"
                        variant="ghost"
                        size="sm"
                        @click="editSuggestion(suggestion)"
                      >
                        <Edit class="h-4 w-4" />
                      </Button>
                      <Button
                        v-if="canEdit(suggestion)"
                        variant="ghost"
                        size="sm"
                        @click="confirmDelete(suggestion.id)"
                      >
                        <Trash2 class="h-4 w-4 text-red-400" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </div>

    <!-- View Dialog -->
    <Dialog v-model:open="showViewDialog">
      <DialogContent class="sm:!max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle class="flex items-center gap-2">
            <FileText class="h-5 w-5 text-cyan-400" />
            {{ stripAnsiCodes(selectedSuggestion?.title || '') }}
          </DialogTitle>
          <DialogDescription as="div" class="flex flex-wrap items-center gap-3 mt-2">
            <Badge
              v-if="selectedSuggestion"
              :class="getStatusBadge(selectedSuggestion.status).class"
              class="gap-1"
            >
              <component :is="getStatusBadge(selectedSuggestion.status).icon" class="h-3 w-3" />
              {{ getStatusLabel(selectedSuggestion.status) }}
            </Badge>
            <span class="text-xs text-muted-foreground">
              {{ selectedSuggestion?.suggestion_type === 'new' ? 'New help file' : 'Edit suggestion' }}
            </span>
            <span class="text-xs text-muted-foreground">
              Submitted {{ formatDate(selectedSuggestion?.submitted_at || null) }}
            </span>
          </DialogDescription>
        </DialogHeader>

        <div v-if="selectedSuggestion" class="space-y-4 mt-4">
          <!-- Reviewer feedback -->
          <div
            v-if="selectedSuggestion.reviewer_notes"
            :class="[
              'p-4 rounded-lg border',
              selectedSuggestion.status === 'approved' ? 'bg-green-500/10 border-green-500/30' :
              selectedSuggestion.status === 'rejected' ? 'bg-red-500/10 border-red-500/30' :
              'bg-orange-500/10 border-orange-500/30'
            ]"
          >
            <p class="text-sm font-medium mb-1">
              Reviewer Feedback ({{ selectedSuggestion.reviewer_account }}):
            </p>
            <p class="text-sm text-muted-foreground">
              {{ selectedSuggestion.reviewer_notes }}
            </p>
          </div>

          <!-- Content -->
          <div>
            <h4 class="text-sm font-medium mb-2">Content:</h4>
            <div
              class="font-mono text-sm leading-relaxed whitespace-pre-wrap break-words p-4 bg-muted rounded-lg"
              v-html="parsedContent"
            />
          </div>

          <!-- Submitter notes -->
          <div v-if="selectedSuggestion.submitter_notes">
            <h4 class="text-sm font-medium mb-2">Your Notes:</h4>
            <p class="text-sm text-muted-foreground">
              {{ selectedSuggestion.submitter_notes }}
            </p>
          </div>

          <!-- See Also -->
          <div v-if="selectedSuggestion.see_also">
            <h4 class="text-sm font-medium mb-2">See Also:</h4>
            <p class="text-sm text-muted-foreground">
              {{ selectedSuggestion.see_also }}
            </p>
          </div>
        </div>
      </DialogContent>
    </Dialog>

    <!-- Delete Confirmation -->
    <AlertDialog v-model:open="showDeleteDialog">
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Cancel Suggestion?</AlertDialogTitle>
          <AlertDialogDescription>
            This will permanently delete your suggestion. This action cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel :disabled="deleting">Keep It</AlertDialogCancel>
          <AlertDialogAction
            @click="deleteSuggestion"
            :disabled="deleting"
            class="bg-red-600 hover:bg-red-700"
          >
            {{ deleting ? 'Cancelling...' : 'Cancel Suggestion' }}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </div>
</template>
