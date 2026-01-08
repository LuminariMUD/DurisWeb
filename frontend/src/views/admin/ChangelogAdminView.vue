<script setup lang="ts">
import { ref, computed } from 'vue'
import { useQuery, useQueryClient } from '@tanstack/vue-query'
import { changelogApi } from '@/services/api'
import type { ChangelogEntry } from '@/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Badge } from '@/components/ui/badge'
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
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
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
import { Plus, Pencil, Trash2, Eye, EyeOff } from 'lucide-vue-next'
import { useToast } from '@/composables/useToast'
import TipTapEditor from '@/components/forum/editor/TipTapEditor.vue'

const toast = useToast()
const queryClient = useQueryClient()

// Pagination
const currentPage = ref(1)
const limit = 20

// Dialog states
const showCreateDialog = ref(false)
const showEditDialog = ref(false)
const showDeleteDialog = ref(false)
const editingEntry = ref<ChangelogEntry | null>(null)
const deletingEntryId = ref<number | null>(null)

// Form states
const formVersion = ref('')
const formTitle = ref('')
const formContent = ref('')
const formCategory = ref<'public' | 'admin'>('public')
const formIsPublished = ref(false)

// Loading state
const submitting = ref(false)

// Fetch changelog entries
const { data: changelogData, isLoading: loading } = useQuery({
  queryKey: ['admin-changelog', currentPage] as const,
  queryFn: async ({ queryKey }) => {
    const [, page] = queryKey
    return await changelogApi.getAdminEntries(page, limit)
  },
  staleTime: 1000 * 60 * 5,
})

// Computed values
const entries = computed(() => changelogData.value?.entries ?? [])
const totalEntries = computed(() => changelogData.value?.total ?? 0)
const totalPages = computed(() => Math.ceil(totalEntries.value / limit))

// CRUD operations
async function createEntry() {
  if (!formVersion.value || !formTitle.value || !formContent.value) {
    toast.show({
      title: 'validation error',
      message: 'version, title, and content are required',
      type: 'error',
    })
    return
  }

  submitting.value = true
  try {
    await changelogApi.createEntry({
      version: formVersion.value,
      title: formTitle.value,
      content: formContent.value,
      category: formCategory.value,
      isPublished: formIsPublished.value,
    })

    toast.show({
      title: 'success',
      message: 'changelog entry created',
    })

    showCreateDialog.value = false
    resetForm()
    await queryClient.invalidateQueries({ queryKey: ['admin-changelog'] })
    await queryClient.invalidateQueries({ queryKey: ['changelog-unread-count'] })
  } catch (error: any) {
    toast.show({
      title: 'error',
      message: error.response?.data?.error || error.message || 'failed to create entry',
      type: 'error',
    })
  } finally {
    submitting.value = false
  }
}

async function updateEntry() {
  if (!editingEntry.value || !formVersion.value || !formTitle.value || !formContent.value) {
    toast.show({
      title: 'validation error',
      message: 'version, title, and content are required',
      type: 'error',
    })
    return
  }

  submitting.value = true
  try {
    await changelogApi.updateEntry(editingEntry.value.id, {
      version: formVersion.value,
      title: formTitle.value,
      content: formContent.value,
      category: formCategory.value,
      isPublished: formIsPublished.value,
    })

    toast.show({
      title: 'success',
      message: 'changelog entry updated',
    })

    showEditDialog.value = false
    editingEntry.value = null
    resetForm()
    await queryClient.invalidateQueries({ queryKey: ['admin-changelog'] })
    await queryClient.invalidateQueries({ queryKey: ['changelog-unread-count'] })
  } catch (error: any) {
    toast.show({
      title: 'error',
      message: error.response?.data?.error || error.message || 'failed to update entry',
      type: 'error',
    })
  } finally {
    submitting.value = false
  }
}

async function deleteEntry() {
  if (!deletingEntryId.value) return

  submitting.value = true
  try {
    await changelogApi.deleteEntry(deletingEntryId.value)

    toast.show({
      title: 'success',
      message: 'changelog entry deleted',
    })

    showDeleteDialog.value = false
    deletingEntryId.value = null
    await queryClient.invalidateQueries({ queryKey: ['admin-changelog'] })
  } catch (error: any) {
    toast.show({
      title: 'error',
      message: error.response?.data?.error || error.message || 'failed to delete entry',
      type: 'error',
    })
  } finally {
    submitting.value = false
  }
}

async function togglePublished(entry: ChangelogEntry) {
  try {
    await changelogApi.updateEntry(entry.id, {
      isPublished: !entry.isPublished,
    })

    toast.show({
      title: 'success',
      message: entry.isPublished ? 'entry unpublished' : 'entry published',
    })

    await queryClient.invalidateQueries({ queryKey: ['admin-changelog'] })
    await queryClient.invalidateQueries({ queryKey: ['changelog-unread-count'] })
  } catch (error: any) {
    toast.show({
      title: 'error',
      message: error.response?.data?.error || error.message || 'failed to update entry',
      type: 'error',
    })
  }
}

// Form helpers
function resetForm() {
  formVersion.value = ''
  formTitle.value = ''
  formContent.value = ''
  formCategory.value = 'public'
  formIsPublished.value = false
}

function openCreateDialog() {
  resetForm()
  showCreateDialog.value = true
}

function openEditDialog(entry: ChangelogEntry) {
  editingEntry.value = entry
  formVersion.value = entry.version
  formTitle.value = entry.title
  formContent.value = entry.content
  formCategory.value = entry.category
  formIsPublished.value = entry.isPublished
  showEditDialog.value = true
}

function openDeleteDialog(entryId: number) {
  deletingEntryId.value = entryId
  showDeleteDialog.value = true
}

function formatDate(date: string) {
  return new Date(date).toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

// Pagination
function goToPage(page: number) {
  if (page >= 1 && page <= totalPages.value) {
    currentPage.value = page
  }
}
</script>

<template>
  <div class="p-6">
    <div class="flex justify-between items-center mb-6">
      <div>
        <h1 class="text-3xl font-bold text-white">Website Changelog</h1>
        <p class="text-muted-foreground mt-1">
          Manage website changelog entries and announcements
        </p>
      </div>
      <Button @click="openCreateDialog">
        <Plus class="w-4 h-4 mr-2" />
        New Entry
      </Button>
    </div>

    <!-- Loading State -->
    <div v-if="loading" class="flex items-center justify-center py-12">
      <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
    </div>

    <!-- Empty State -->
    <div v-else-if="entries.length === 0" class="text-center py-12">
      <p class="text-muted-foreground">No changelog entries yet.</p>
      <Button @click="openCreateDialog" variant="outline" class="mt-4">
        <Plus class="w-4 h-4 mr-2" />
        Create First Entry
      </Button>
    </div>

    <!-- Entries Table -->
    <div v-else>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead class="w-[100px]">Version</TableHead>
            <TableHead>Title</TableHead>
            <TableHead class="w-[100px]">Category</TableHead>
            <TableHead class="w-[100px]">Status</TableHead>
            <TableHead class="w-[150px]">Created</TableHead>
            <TableHead class="w-[100px]">By</TableHead>
            <TableHead class="w-[120px] text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          <TableRow v-for="entry in entries" :key="entry.id">
            <TableCell class="font-mono">{{ entry.version }}</TableCell>
            <TableCell>{{ entry.title }}</TableCell>
            <TableCell>
              <Badge :variant="entry.category === 'admin' ? 'destructive' : 'secondary'">
                {{ entry.category }}
              </Badge>
            </TableCell>
            <TableCell>
              <Button
                variant="ghost"
                size="sm"
                @click="togglePublished(entry)"
                :class="entry.isPublished ? 'text-green-500' : 'text-muted-foreground'"
              >
                <Eye v-if="entry.isPublished" class="w-4 h-4" />
                <EyeOff v-else class="w-4 h-4" />
              </Button>
            </TableCell>
            <TableCell class="text-muted-foreground text-sm">
              {{ formatDate(entry.createdAt) }}
            </TableCell>
            <TableCell class="text-muted-foreground text-sm">
              {{ entry.createdBy }}
            </TableCell>
            <TableCell class="text-right">
              <Button variant="ghost" size="icon" @click="openEditDialog(entry)">
                <Pencil class="w-4 h-4" />
              </Button>
              <Button variant="ghost" size="icon" @click="openDeleteDialog(entry.id)">
                <Trash2 class="w-4 h-4 text-destructive" />
              </Button>
            </TableCell>
          </TableRow>
        </TableBody>
      </Table>

      <!-- Pagination -->
      <div v-if="totalPages > 1" class="flex items-center justify-center gap-2 mt-6">
        <Button
          variant="outline"
          size="sm"
          :disabled="currentPage === 1"
          @click="goToPage(currentPage - 1)"
        >
          Previous
        </Button>
        <span class="text-sm text-muted-foreground">
          Page {{ currentPage }} of {{ totalPages }}
        </span>
        <Button
          variant="outline"
          size="sm"
          :disabled="currentPage === totalPages"
          @click="goToPage(currentPage + 1)"
        >
          Next
        </Button>
      </div>
    </div>

    <!-- Create Dialog -->
    <Dialog :open="showCreateDialog" @update:open="showCreateDialog = $event">
      <DialogContent class="!max-w-6xl !w-[95vw] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Create Changelog Entry</DialogTitle>
          <DialogDescription>
            Add a new changelog entry to announce website updates
          </DialogDescription>
        </DialogHeader>

        <div class="space-y-4 py-4">
          <div class="grid grid-cols-2 gap-4">
            <div class="space-y-2">
              <Label for="version">Version</Label>
              <Input
                id="version"
                v-model="formVersion"
                placeholder="e.g., v1.2.0, Jan 2026, Beta"
              />
            </div>
            <div class="space-y-2">
              <Label for="category">Category</Label>
              <Select v-model="formCategory">
                <SelectTrigger>
                  <SelectValue placeholder="Select category" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="public">Public</SelectItem>
                  <SelectItem value="admin">Admin Only</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div class="space-y-2">
            <Label for="title">Title</Label>
            <Input
              id="title"
              v-model="formTitle"
              placeholder="e.g., New PvP Features"
            />
          </div>

          <div class="space-y-2">
            <Label>Content</Label>
            <TipTapEditor
              v-model="formContent"
              placeholder="Describe the changes..."
              :min-height="300"
            />
          </div>

          <div class="flex items-center space-x-2">
            <Switch id="published" v-model="formIsPublished" />
            <Label for="published">Publish immediately</Label>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" @click="showCreateDialog = false" :disabled="submitting">
            Cancel
          </Button>
          <Button @click="createEntry" :disabled="submitting">
            {{ submitting ? 'Creating...' : 'Create Entry' }}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <!-- Edit Dialog -->
    <Dialog :open="showEditDialog" @update:open="showEditDialog = $event">
      <DialogContent class="!max-w-6xl !w-[95vw] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit Changelog Entry</DialogTitle>
          <DialogDescription>
            Update the changelog entry details
          </DialogDescription>
        </DialogHeader>

        <div class="space-y-4 py-4">
          <div class="grid grid-cols-2 gap-4">
            <div class="space-y-2">
              <Label for="edit-version">Version</Label>
              <Input
                id="edit-version"
                v-model="formVersion"
                placeholder="e.g., v1.2.0, Jan 2026, Beta"
              />
            </div>
            <div class="space-y-2">
              <Label for="edit-category">Category</Label>
              <Select v-model="formCategory">
                <SelectTrigger>
                  <SelectValue placeholder="Select category" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="public">Public</SelectItem>
                  <SelectItem value="admin">Admin Only</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div class="space-y-2">
            <Label for="edit-title">Title</Label>
            <Input
              id="edit-title"
              v-model="formTitle"
              placeholder="e.g., New PvP Features"
            />
          </div>

          <div class="space-y-2">
            <Label>Content</Label>
            <TipTapEditor
              v-model="formContent"
              placeholder="Describe the changes..."
              :min-height="300"
            />
          </div>

          <div class="flex items-center space-x-2">
            <Switch id="edit-published" v-model="formIsPublished" />
            <Label for="edit-published">Published</Label>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" @click="showEditDialog = false" :disabled="submitting">
            Cancel
          </Button>
          <Button @click="updateEntry" :disabled="submitting">
            {{ submitting ? 'Saving...' : 'Save Changes' }}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <!-- Delete Confirmation Dialog -->
    <AlertDialog :open="showDeleteDialog" @update:open="showDeleteDialog = $event">
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete Entry?</AlertDialogTitle>
          <AlertDialogDescription>
            This action cannot be undone. This will permanently delete the changelog entry.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel :disabled="submitting">Cancel</AlertDialogCancel>
          <AlertDialogAction
            @click="deleteEntry"
            :disabled="submitting"
            class="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {{ submitting ? 'Deleting...' : 'Delete' }}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </div>
</template>
