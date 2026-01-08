<script setup lang="ts">
import { ref, onMounted, computed, watch } from 'vue'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
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
  DialogFooter,
} from '@/components/ui/dialog'
import { Skeleton } from '@/components/ui/skeleton'
import PaginationWithEllipsis from '@/components/forum/PaginationWithEllipsis.vue'
import { helpSuggestionApi } from '@/services/api'
import { useToast } from '@/composables/useToast'
import { parseAnsiForVue, stripAnsiCodes } from '@/utils/ansiParser'
import type { HelpSuggestion, SuggestionStatus } from '@/types'
import {
  FileText,
  Clock,
  CheckCircle,
  XCircle,
  AlertCircle,
  Eye,
  Check,
  X,
  RotateCcw,
  User,
  Calendar,
  Tag,
} from 'lucide-vue-next'

const toast = useToast()

// State
const loading = ref(true)
const suggestions = ref<HelpSuggestion[]>([])
const currentPage = ref(1)
const totalPages = ref(1)
const total = ref(0)
const limit = 20
const statusFilter = ref<string>('pending')

// Review dialog
const showReviewDialog = ref(false)
const reviewingSuggestion = ref<HelpSuggestion | null>(null)
const reviewAction = ref<'approve' | 'reject' | 'needs_revision'>('approve')
const reviewNotes = ref('')
const submitting = ref(false)

// Load suggestions
async function loadSuggestions() {
  loading.value = true
  try {
    const result = await helpSuggestionApi.getAdminQueue({
      page: currentPage.value,
      limit,
      status: statusFilter.value === 'all' ? undefined : (statusFilter.value as SuggestionStatus),
    })
    suggestions.value = result.suggestions
    totalPages.value = result.pagination.totalPages
    total.value = result.pagination.total
  } catch {
    toast.error('Failed to load suggestions')
  } finally {
    loading.value = false
  }
}

// Handle page change
function handlePageChange(page: number) {
  currentPage.value = page
  loadSuggestions()
}

// Watch for filter changes
watch(statusFilter, () => {
  currentPage.value = 1
  loadSuggestions()
})

// Open review dialog
async function openReviewDialog(suggestion: HelpSuggestion) {
  try {
    // Fetch full details including original content
    const fullSuggestion = await helpSuggestionApi.getAdminSuggestion(suggestion.id)
    reviewingSuggestion.value = fullSuggestion
    reviewAction.value = 'approve'
    reviewNotes.value = ''
    showReviewDialog.value = true
  } catch {
    toast.error('Failed to load suggestion details')
  }
}

// Submit review
async function submitReview() {
  if (!reviewingSuggestion.value) return

  submitting.value = true
  try {
    await helpSuggestionApi.reviewSuggestion(reviewingSuggestion.value.id, {
      action: reviewAction.value,
      reviewerNotes: reviewNotes.value.trim() || undefined,
    })

    const actionLabels = {
      approve: 'approved',
      reject: 'rejected',
      needs_revision: 'marked for revision',
    }
    toast.success(`Suggestion ${actionLabels[reviewAction.value]}`)
    showReviewDialog.value = false
    loadSuggestions()
  } catch (error: any) {
    toast.error(error.response?.data?.error || 'Failed to submit review')
  } finally {
    submitting.value = false
  }
}

// Status helpers
function getStatusBadge(status: SuggestionStatus) {
  const badges: Record<SuggestionStatus, { class: string; icon: any }> = {
    pending: { class: 'bg-yellow-500/20 text-yellow-400', icon: Clock },
    in_review: { class: 'bg-blue-500/20 text-blue-400', icon: Eye },
    approved: { class: 'bg-green-500/20 text-green-400', icon: CheckCircle },
    rejected: { class: 'bg-red-500/20 text-red-400', icon: XCircle },
    needs_revision: { class: 'bg-orange-500/20 text-orange-400', icon: AlertCircle },
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

// Parsed content
const parsedContent = computed(() => {
  if (!reviewingSuggestion.value?.text) return ''
  return parseAnsiForVue(reviewingSuggestion.value.text)
})

const parsedOriginalContent = computed(() => {
  if (!reviewingSuggestion.value?.original_text) return ''
  return parseAnsiForVue(reviewingSuggestion.value.original_text)
})

onMounted(() => {
  loadSuggestions()
})
</script>

<template>
  <div class="p-6 space-y-6">
    <!-- Header -->
    <div class="flex items-center justify-between">
      <div>
        <h1 class="text-3xl font-bold text-white">Help File Suggestions</h1>
        <p class="text-muted-foreground mt-1">
          Review and manage player-submitted help file suggestions
        </p>
      </div>
    </div>

    <!-- Filters -->
    <Card>
      <CardContent class="pt-6">
        <div class="flex items-center gap-4">
          <div class="flex items-center gap-2">
            <Label>Status:</Label>
            <Select v-model="statusFilter">
              <SelectTrigger class="w-[180px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="needs_revision">Needs Revision</SelectItem>
                <SelectItem value="approved">Approved</SelectItem>
                <SelectItem value="rejected">Rejected</SelectItem>
                <SelectItem value="all">All</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div class="ml-auto text-sm text-muted-foreground">
            {{ total }} suggestion{{ total !== 1 ? 's' : '' }}
          </div>
        </div>
      </CardContent>
    </Card>

    <!-- Loading -->
    <Card v-if="loading">
      <CardContent class="pt-6 space-y-3">
        <Skeleton class="h-12 w-full" />
        <Skeleton class="h-12 w-full" />
        <Skeleton class="h-12 w-full" />
      </CardContent>
    </Card>

    <!-- Empty state -->
    <Card v-else-if="suggestions.length === 0">
      <CardContent class="py-12 text-center">
        <FileText class="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-50" />
        <h3 class="text-lg font-medium mb-2">No suggestions found</h3>
        <p class="text-muted-foreground">
          {{ statusFilter === 'pending' ? 'No pending suggestions to review.' : 'No suggestions match the selected filter.' }}
        </p>
      </CardContent>
    </Card>

    <!-- Suggestions table -->
    <Card v-else>
      <CardContent class="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead class="pl-4">Title</TableHead>
              <TableHead class="w-[80px]">Type</TableHead>
              <TableHead class="w-[120px]">Submitter</TableHead>
              <TableHead class="w-[120px]">Status</TableHead>
              <TableHead class="w-[150px]">Submitted</TableHead>
              <TableHead class="w-[100px] pr-4"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRow
              v-for="suggestion in suggestions"
              :key="suggestion.id"
              class="hover:bg-muted/50 cursor-pointer"
              @click="openReviewDialog(suggestion)"
            >
              <TableCell class="font-medium pl-4">
                {{ stripAnsiCodes(suggestion.title) }}
              </TableCell>
              <TableCell>
                <Badge variant="outline" class="text-xs">
                  {{ suggestion.suggestion_type === 'new' ? 'New' : 'Edit' }}
                </Badge>
              </TableCell>
              <TableCell class="text-sm text-muted-foreground">
                {{ suggestion.submitted_by }}
              </TableCell>
              <TableCell>
                <Badge :class="getStatusBadge(suggestion.status).class" class="gap-1">
                  <component :is="getStatusBadge(suggestion.status).icon" class="h-3 w-3" />
                  {{ getStatusLabel(suggestion.status) }}
                </Badge>
              </TableCell>
              <TableCell class="text-sm text-muted-foreground">
                {{ formatDate(suggestion.submitted_at) }}
              </TableCell>
              <TableCell class="pr-4">
                <Button variant="ghost" size="sm">
                  <Eye class="h-4 w-4" />
                </Button>
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>

        <!-- Pagination -->
        <div v-if="totalPages > 1" class="border-t px-4 py-3 flex items-center gap-4">
          <p class="text-sm text-muted-foreground whitespace-nowrap">
            Page {{ currentPage }} of {{ totalPages }}
          </p>
          <div class="ml-auto">
            <PaginationWithEllipsis
              :current-page="currentPage"
              :total-pages="totalPages"
              @page-change="handlePageChange"
            />
          </div>
        </div>
      </CardContent>
    </Card>

    <!-- Review Dialog -->
    <Dialog v-model:open="showReviewDialog">
      <DialogContent class="sm:!max-w-5xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle class="flex items-center gap-2">
            <FileText class="h-5 w-5 text-cyan-400" />
            Review: {{ stripAnsiCodes(reviewingSuggestion?.title || '') }}
          </DialogTitle>
          <DialogDescription as="div" class="flex flex-wrap items-center gap-3 mt-2">
            <Badge
              v-if="reviewingSuggestion"
              :class="getStatusBadge(reviewingSuggestion.status).class"
              class="gap-1"
            >
              <component :is="getStatusBadge(reviewingSuggestion.status).icon" class="h-3 w-3" />
              {{ getStatusLabel(reviewingSuggestion.status) }}
            </Badge>
            <span class="flex items-center gap-1 text-xs text-muted-foreground">
              <User class="h-3 w-3" />
              {{ reviewingSuggestion?.submitted_by }}
            </span>
            <span class="flex items-center gap-1 text-xs text-muted-foreground">
              <Calendar class="h-3 w-3" />
              {{ formatDate(reviewingSuggestion?.submitted_at || null) }}
            </span>
            <span class="flex items-center gap-1 text-xs text-muted-foreground">
              <Tag class="h-3 w-3" />
              {{ reviewingSuggestion?.category_name }}
            </span>
          </DialogDescription>
        </DialogHeader>

        <div v-if="reviewingSuggestion" class="space-y-6 mt-4">
          <!-- Submitter notes -->
          <div v-if="reviewingSuggestion.submitter_notes" class="p-4 bg-muted rounded-lg">
            <p class="text-sm font-medium mb-1">Submitter's Notes:</p>
            <p class="text-sm text-muted-foreground">
              {{ reviewingSuggestion.submitter_notes }}
            </p>
          </div>

          <!-- Content comparison for edits -->
          <div v-if="reviewingSuggestion.suggestion_type === 'edit' && reviewingSuggestion.original_text" class="grid grid-cols-2 gap-4">
            <div>
              <h4 class="text-sm font-medium mb-2">Original Content:</h4>
              <div
                class="font-mono text-xs leading-relaxed whitespace-pre-wrap break-words p-3 bg-red-500/5 border border-red-500/20 rounded-lg max-h-[300px] overflow-y-auto"
                v-html="parsedOriginalContent"
              />
            </div>
            <div>
              <h4 class="text-sm font-medium mb-2">Proposed Changes:</h4>
              <div
                class="font-mono text-xs leading-relaxed whitespace-pre-wrap break-words p-3 bg-green-500/5 border border-green-500/20 rounded-lg max-h-[300px] overflow-y-auto"
                v-html="parsedContent"
              />
            </div>
          </div>

          <!-- Content for new files -->
          <div v-else>
            <h4 class="text-sm font-medium mb-2">Proposed Content:</h4>
            <div
              class="font-mono text-sm leading-relaxed whitespace-pre-wrap break-words p-4 bg-muted rounded-lg max-h-[400px] overflow-y-auto"
              v-html="parsedContent"
            />
          </div>

          <!-- See Also -->
          <div v-if="reviewingSuggestion.see_also">
            <h4 class="text-sm font-medium mb-2">See Also:</h4>
            <p class="text-sm text-muted-foreground">
              {{ reviewingSuggestion.see_also }}
            </p>
          </div>

          <!-- Review form -->
          <div v-if="reviewingSuggestion.status === 'pending' || reviewingSuggestion.status === 'needs_revision'" class="border-t pt-6 space-y-4">
            <h4 class="text-sm font-medium">Your Decision:</h4>

            <div class="flex gap-2">
              <Button
                :variant="reviewAction === 'approve' ? 'default' : 'outline'"
                size="sm"
                class="gap-1"
                :class="reviewAction === 'approve' ? 'bg-green-600 hover:bg-green-700' : ''"
                @click="reviewAction = 'approve'"
              >
                <Check class="h-4 w-4" />
                Approve
              </Button>
              <Button
                :variant="reviewAction === 'reject' ? 'default' : 'outline'"
                size="sm"
                class="gap-1"
                :class="reviewAction === 'reject' ? 'bg-red-600 hover:bg-red-700' : ''"
                @click="reviewAction = 'reject'"
              >
                <X class="h-4 w-4" />
                Reject
              </Button>
              <Button
                :variant="reviewAction === 'needs_revision' ? 'default' : 'outline'"
                size="sm"
                class="gap-1"
                :class="reviewAction === 'needs_revision' ? 'bg-orange-600 hover:bg-orange-700' : ''"
                @click="reviewAction = 'needs_revision'"
              >
                <RotateCcw class="h-4 w-4" />
                Request Revision
              </Button>
            </div>

            <div class="space-y-2">
              <Label for="reviewNotes">
                Notes for Submitter
                <span v-if="reviewAction !== 'approve'" class="text-red-400"> *</span>
              </Label>
              <Textarea
                id="reviewNotes"
                v-model="reviewNotes"
                :placeholder="
                  reviewAction === 'approve'
                    ? 'Optional: Thank them for their contribution...'
                    : reviewAction === 'reject'
                    ? 'Explain why this suggestion was not accepted...'
                    : 'Explain what changes are needed...'
                "
                rows="3"
              />
            </div>
          </div>
        </div>

        <DialogFooter v-if="reviewingSuggestion?.status === 'pending' || reviewingSuggestion?.status === 'needs_revision'">
          <Button variant="outline" @click="showReviewDialog = false" :disabled="submitting">
            Cancel
          </Button>
          <Button
            @click="submitReview"
            :disabled="submitting || (reviewAction !== 'approve' && !reviewNotes.trim())"
            :class="{
              'bg-green-600 hover:bg-green-700': reviewAction === 'approve',
              'bg-red-600 hover:bg-red-700': reviewAction === 'reject',
              'bg-orange-600 hover:bg-orange-700': reviewAction === 'needs_revision',
            }"
          >
            {{ submitting ? 'Submitting...' : reviewAction === 'approve' ? 'Approve & Publish' : reviewAction === 'reject' ? 'Reject Suggestion' : 'Request Revision' }}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </div>
</template>
