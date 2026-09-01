<script setup lang="ts">
import { ref, computed } from 'vue'
import { useQuery, useMutation, useQueryClient } from '@tanstack/vue-query'
import { builderApi } from '@/services/api'
import { useAuth } from '@/composables/useAuth'
import { useToast } from '@/composables/useToast'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import ProcRequestDialog from './ProcRequestDialog.vue'
import {
  Plus,
  AlertCircle,
  Search,
  MoreVertical,
  Edit,
  Trash2,
  CheckCircle2,
  Clock,
  PlayCircle,
  UserCheck,
  Home,
  User,
  Package,
  MessageSquare,
} from 'lucide-vue-next'
import type { ProcRequest, ProcRequestStatus, ProcRequestEntityType } from '@/types'
import { highlightMentions } from '@/utils/mentionHighlight'
import { sanitizeChangelogContent } from '@/utils/sanitizeChangelogContent'

const props = defineProps<{
  zoneId: string
  canEdit: boolean
}>()

const _auth = useAuth()
const toast = useToast()
const queryClient = useQueryClient()

// Filters
const statusFilter = ref<ProcRequestStatus | 'all'>('all')
const entityTypeFilter = ref<ProcRequestEntityType | 'all'>('all')
const searchQuery = ref('')

// Dialog state
const dialogOpen = ref(false)
const editingRequest = ref<ProcRequest | null>(null)

// Fetch proc requests
const {
  data: requests,
  isLoading,
  error,
} = useQuery({
  queryKey: ['proc-requests', props.zoneId],
  queryFn: () => builderApi.getProcRequests(props.zoneId),
})

// Delete mutation
const deleteMutation = useMutation({
  mutationFn: (requestId: number) => builderApi.deleteProcRequest(props.zoneId, requestId),
  onSuccess: () => {
    toast.success('Request deleted')
    queryClient.invalidateQueries({ queryKey: ['proc-requests', props.zoneId] })
  },
  onError: (err: Error) => {
    toast.error(`Failed to delete: ${err.message}`)
  },
})

// Update status mutation
const updateStatusMutation = useMutation({
  mutationFn: ({ id, status }: { id: number; status: ProcRequestStatus }) =>
    builderApi.updateProcRequestStatus(props.zoneId, id, status),
  onSuccess: () => {
    toast.success('Status updated')
    queryClient.invalidateQueries({ queryKey: ['proc-requests', props.zoneId] })
  },
  onError: (err: Error) => {
    toast.error(`Failed to update status: ${err.message}`)
  },
})

// Filtered requests
const filteredRequests = computed(() => {
  if (!requests.value) return []
  return requests.value.filter((req) => {
    if (statusFilter.value !== 'all' && req.status !== statusFilter.value) return false
    if (entityTypeFilter.value !== 'all' && req.entityType !== entityTypeFilter.value) return false
    if (searchQuery.value) {
      const q = searchQuery.value.toLowerCase()
      if (!req.title.toLowerCase().includes(q) && !req.vnum.toString().includes(q)) return false
    }
    return true
  })
})

// Status badge variant
function getStatusBadge(status: ProcRequestStatus) {
  switch (status) {
    case 'requested':
      return { variant: 'secondary' as const, icon: Clock, label: 'Requested', class: '' }
    case 'assigned':
      return {
        variant: 'outline' as const,
        icon: UserCheck,
        label: 'Assigned',
        class: 'border-blue-500 text-blue-500',
      }
    case 'in_progress':
      return { variant: 'default' as const, icon: PlayCircle, label: 'In Progress', class: '' }
    case 'completed':
      return {
        variant: 'secondary' as const,
        icon: CheckCircle2,
        label: 'Completed',
        class: 'bg-green-500/20 text-green-500',
      }
  }
}

// Entity type icon
function getEntityIcon(type: ProcRequestEntityType) {
  switch (type) {
    case 'room':
      return Home
    case 'mob':
      return User
    case 'object':
      return Package
  }
}

// Open dialog for new request
function openNewDialog() {
  editingRequest.value = null
  dialogOpen.value = true
}

// Open dialog for editing
function openEditDialog(request: ProcRequest) {
  editingRequest.value = request
  dialogOpen.value = true
}

// Handle dialog close
function handleDialogClose() {
  dialogOpen.value = false
  editingRequest.value = null
  queryClient.invalidateQueries({ queryKey: ['proc-requests', props.zoneId] })
}

// Delete request
function deleteRequest(request: ProcRequest) {
  if (confirm(`Delete proc request "${request.title}"?`)) {
    deleteMutation.mutate(request.id)
  }
}

// Update status
function updateStatus(requestId: number, status: ProcRequestStatus) {
  updateStatusMutation.mutate({ id: requestId, status })
}

// Get highlighted description with mentions styled
function getHighlightedDescription(request: ProcRequest): string | null {
  if (request.descriptionHtml) {
    return highlightMentions(sanitizeChangelogContent(request.descriptionHtml))
  }
  if (request.description) {
    return highlightMentions(sanitizeChangelogContent(request.description))
  }
  return null
}
</script>

<template>
  <div class="p-6">
    <!-- Loading -->
    <div v-if="isLoading">
      <Skeleton class="h-6 w-32 mb-4" />
      <Skeleton class="h-10 w-full mb-4" />
      <Skeleton class="h-24 w-full mb-2" />
      <Skeleton class="h-24 w-full mb-2" />
      <Skeleton class="h-24 w-full" />
    </div>

    <!-- Error -->
    <Alert v-else-if="error" variant="destructive">
      <AlertCircle class="h-4 w-4" />
      <AlertDescription>
        Failed to load proc requests.
      </AlertDescription>
    </Alert>

    <!-- Content -->
    <div v-else>
      <!-- Header -->
      <div class="flex items-center justify-between mb-6">
        <div>
          <h3 class="text-lg font-semibold">Proc Requests</h3>
          <p class="text-sm text-muted-foreground">
            Track special coding requests for mobs, objects, and rooms.
          </p>
        </div>
        <Button v-if="canEdit" @click="openNewDialog">
          <Plus class="h-4 w-4 mr-2" />
          New Request
        </Button>
      </div>

      <!-- Filters -->
      <div class="flex gap-3 mb-6">
        <div class="relative flex-1">
          <Search class="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            v-model="searchQuery"
            placeholder="Search by title or VNUM..."
            class="pl-8"
          />
        </div>
        <Select v-model="statusFilter">
          <SelectTrigger class="w-40">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="requested">Requested</SelectItem>
            <SelectItem value="assigned">Assigned</SelectItem>
            <SelectItem value="in_progress">In Progress</SelectItem>
            <SelectItem value="completed">Completed</SelectItem>
          </SelectContent>
        </Select>
        <Select v-model="entityTypeFilter">
          <SelectTrigger class="w-36">
            <SelectValue placeholder="Type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            <SelectItem value="room">Rooms</SelectItem>
            <SelectItem value="mob">Mobs</SelectItem>
            <SelectItem value="object">Objects</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <!-- Requests list -->
      <div class="space-y-3">
        <div
          v-for="request in filteredRequests"
          :key="request.id"
          class="p-4 bg-muted/30 rounded-lg border hover:border-primary/50 transition-colors"
        >
          <div class="flex items-start justify-between">
            <div class="flex items-start gap-3">
              <div class="p-2 bg-muted rounded">
                <component :is="getEntityIcon(request.entityType)" class="h-5 w-5 text-muted-foreground" />
              </div>
              <div>
                <h4 class="font-medium">{{ request.title }}</h4>
                <div class="flex items-center gap-2 mt-1 text-sm text-muted-foreground">
                  <span class="font-mono">#{{ request.vnum }}</span>
                  <span class="capitalize">{{ request.entityType }}</span>
                </div>
                <div
                  v-if="getHighlightedDescription(request)"
                  class="mt-2 text-sm text-muted-foreground line-clamp-2 proc-description"
                  v-html="getHighlightedDescription(request)"
                />
              </div>
            </div>
            <div class="flex items-center gap-2">
              <Badge
                :variant="getStatusBadge(request.status).variant"
                :class="getStatusBadge(request.status).class"
              >
                <component :is="getStatusBadge(request.status).icon" class="h-3 w-3 mr-1" />
                {{ getStatusBadge(request.status).label }}
              </Badge>
              <DropdownMenu v-if="canEdit">
                <DropdownMenuTrigger as-child>
                  <Button variant="ghost" size="icon" class="h-8 w-8">
                    <MoreVertical class="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem @click="openEditDialog(request)">
                    <Edit class="h-4 w-4 mr-2" />
                    Edit
                  </DropdownMenuItem>
                  <DropdownMenuItem @click="updateStatus(request.id, 'assigned')">
                    <UserCheck class="h-4 w-4 mr-2" />
                    Mark Assigned
                  </DropdownMenuItem>
                  <DropdownMenuItem @click="updateStatus(request.id, 'in_progress')">
                    <PlayCircle class="h-4 w-4 mr-2" />
                    Mark In Progress
                  </DropdownMenuItem>
                  <DropdownMenuItem @click="updateStatus(request.id, 'completed')">
                    <CheckCircle2 class="h-4 w-4 mr-2" />
                    Mark Completed
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem class="text-destructive" @click="deleteRequest(request)">
                    <Trash2 class="h-4 w-4 mr-2" />
                    Delete
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
          <div class="flex items-center gap-4 mt-3 pt-3 border-t text-xs text-muted-foreground">
            <span>Requested by {{ request.requestedBy }}</span>
            <span>{{ new Date(request.requestedAt).toLocaleDateString() }}</span>
            <span v-if="request.assignedTo">Assigned to {{ request.assignedTo }}</span>
          </div>
        </div>

        <!-- Empty state -->
        <div v-if="filteredRequests.length === 0" class="text-center py-12 text-muted-foreground">
          <MessageSquare class="h-12 w-12 mx-auto mb-4 opacity-50" />
          <p v-if="requests && requests.length > 0">No requests match your filters.</p>
          <p v-else>No proc requests have been created yet.</p>
          <Button v-if="canEdit && requests?.length === 0" variant="outline" class="mt-4" @click="openNewDialog">
            <Plus class="h-4 w-4 mr-2" />
            Create First Request
          </Button>
        </div>
      </div>
    </div>

    <!-- Create/Edit Dialog -->
    <ProcRequestDialog
      :open="dialogOpen"
      :zone-id="props.zoneId"
      :request="editingRequest"
      @close="handleDialogClose"
    />
  </div>
</template>

<style>
/* Mention highlight styles for proc request descriptions */
.proc-description .mention-highlight {
  color: rgb(34 211 238); /* cyan-400 */
  background-color: rgba(34, 211, 238, 0.1);
  padding: 0.125rem 0.25rem;
  border-radius: 0.25rem;
  font-weight: 500;
}
</style>
