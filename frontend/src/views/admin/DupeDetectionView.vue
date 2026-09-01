<template>
  <div class="container mx-auto p-6 space-y-6">
    <!-- Header -->
    <div>
      <h1 class="text-3xl font-bold">Item Dupe Detection</h1>
      <p class="text-muted-foreground mt-1">
        Items with same UID appearing on multiple players
      </p>
    </div>

    <!-- Stats Cards -->
    <div class="grid grid-cols-1 md:grid-cols-3 gap-4" v-if="summary">
      <Card>
        <CardContent class="pt-6">
          <div class="flex items-center justify-between">
            <div>
              <p class="text-sm text-muted-foreground">Duped UIDs</p>
              <p class="text-2xl font-bold">{{ summary.total_duped_uids }}</p>
            </div>
            <Copy class="h-8 w-8 text-destructive" />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent class="pt-6">
          <div class="flex items-center justify-between">
            <div>
              <p class="text-sm text-muted-foreground">Total Records</p>
              <p class="text-2xl font-bold text-amber-500">{{ summary.total_duped_records }}</p>
            </div>
            <Package class="h-8 w-8 text-amber-500" />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent class="pt-6">
          <div class="flex items-center justify-between">
            <div>
              <p class="text-sm text-muted-foreground">Player Pairs</p>
              <p class="text-2xl font-bold text-blue-500">{{ summary.player_pairs.length }}</p>
            </div>
            <Users class="h-8 w-8 text-blue-500" />
          </div>
        </CardContent>
      </Card>
    </div>

    <!-- Top Offenders -->
    <Card v-if="summary?.player_pairs.length">
      <CardHeader>
        <CardTitle>Top Offenders</CardTitle>
      </CardHeader>
      <CardContent>
        <div class="flex flex-wrap gap-2">
          <Badge
            v-for="pair in summary.player_pairs"
            :key="pair.players"
            variant="outline"
            class="text-sm"
          >
            {{ pair.players }}: {{ pair.duped_items }} items
          </Badge>
        </div>
      </CardContent>
    </Card>

    <!-- Main Table -->
    <Card>
      <CardHeader>
        <div class="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <CardTitle>Duplicated Items</CardTitle>
          <div class="flex items-center gap-2 w-full sm:w-auto">
            <div class="relative flex-1 sm:flex-initial">
              <Search class="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                v-model="searchQuery"
                placeholder="Search players/items..."
                class="pl-8 w-full sm:w-64"
              />
            </div>
            <Button variant="outline" size="sm" @click="fetchData" :disabled="isLoading">
              <RefreshCw class="h-4 w-4" :class="{ 'animate-spin': isLoading }" />
            </Button>
            <Button
              v-if="items.length > 0"
              variant="destructive"
              size="sm"
              @click="confirmDeleteAllOpen = true"
              :disabled="isLoading || deleteAllLoading"
            >
              <Trash2 class="h-4 w-4 mr-1" />
              Delete All
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div v-if="isLoading" class="flex items-center justify-center py-8">
          <Loader2 class="h-8 w-8 animate-spin text-muted-foreground" />
        </div>

        <div v-else-if="error" class="text-center py-8 text-destructive">
          <AlertTriangle class="h-8 w-8 mx-auto mb-2" />
          <p>{{ error }}</p>
        </div>

        <div v-else-if="items.length === 0" class="text-center py-8 text-muted-foreground">
          <CheckCircle class="h-8 w-8 mx-auto mb-2 text-green-500" />
          <p>No duplicated items found</p>
        </div>

        <div v-else class="space-y-4">
          <!-- Bulk actions -->
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-2">
              <span class="text-sm text-muted-foreground">
                {{ selectedCount }} selected
              </span>
              <Button
                v-if="selectedCount > 0"
                variant="destructive"
                size="sm"
                @click="confirmBulkDelete"
                :disabled="bulkDeleteLoading"
              >
                <Loader2 v-if="bulkDeleteLoading" class="h-4 w-4 mr-2 animate-spin" />
                <Trash2 v-else class="h-4 w-4 mr-2" />
                Delete Selected
              </Button>
            </div>
            <p class="text-sm text-muted-foreground">
              {{ (currentPage - 1) * pageSize + 1 }}-{{ Math.min(currentPage * pageSize, filteredItems.length) }} of {{ filteredItems.length }}
            </p>
          </div>

          <div class="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead class="w-10">
                    <Checkbox
                      :model-value="isAllSelected"
                      @update:model-value="(v) => toggleSelectAll(v === true)"
                    />
                  </TableHead>
                  <TableHead>UID</TableHead>
                  <TableHead>Item</TableHead>
                  <TableHead>VNUM</TableHead>
                  <TableHead>Players</TableHead>
                  <TableHead>Copies</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <TableRow v-for="item in paginatedItems" :key="`${item.obj_uid}-${item.vnum}`">
                  <TableCell>
                    <Checkbox
                      :model-value="selectedIds[`${item.obj_uid}-${item.vnum}`] || false"
                      @update:model-value="(v) => toggleSelect(item, v === true)"
                    />
                  </TableCell>
                  <TableCell class="font-mono">{{ item.obj_uid }}</TableCell>
                  <TableCell>
                    <AnsiText v-if="item.item_name_ansi" :text="item.item_name_ansi" />
                    <span v-else>{{ item.item_name || 'Unknown' }}</span>
                  </TableCell>
                  <TableCell class="font-mono">{{ item.vnum }}</TableCell>
                  <TableCell>
                    <div class="flex flex-wrap gap-1">
                      <Badge
                        v-for="player in item.players.split(',')"
                        :key="player"
                        variant="secondary"
                      >
                        {{ player }}
                      </Badge>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="destructive">{{ item.total_count }}</Badge>
                  </TableCell>
                  <TableCell class="text-sm text-muted-foreground whitespace-nowrap">
                    {{ formatDate(item.created_at) }}
                  </TableCell>
                  <TableCell>
                    <TooltipProvider>
                      <div class="flex items-center gap-2">
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="ghost"
                              size="sm"
                              @click="viewDetails(item)"
                            >
                              <Eye class="h-4 w-4" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>
                            <p>View details & choose which to delete</p>
                          </TooltipContent>
                        </Tooltip>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="destructive"
                              size="sm"
                              @click="confirmDeleteAll(item)"
                            >
                              <Trash2 class="h-4 w-4" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>
                            <p>Delete all dupes, keep one copy</p>
                          </TooltipContent>
                        </Tooltip>
                      </div>
                    </TooltipProvider>
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </div>

          <!-- Pagination -->
          <div class="flex justify-center" v-if="totalPages > 1">
            <PaginationWithEllipsis
              :current-page="currentPage"
              :total-pages="totalPages"
              @page-change="handlePageChange"
            />
          </div>
        </div>
      </CardContent>
    </Card>

    <!-- Details Dialog -->
    <Dialog v-model:open="detailsOpen">
      <DialogContent class="sm:!max-w-2xl">
        <DialogHeader>
          <DialogTitle>Item Details - UID {{ selectedItem?.obj_uid }}</DialogTitle>
          <DialogDescription>
            <AnsiText v-if="selectedItem?.item_name_ansi" :text="selectedItem.item_name_ansi" />
            <span v-else>{{ selectedItem?.item_name || 'Unknown Item' }}</span>
            (vnum: {{ selectedItem?.vnum }})
          </DialogDescription>
        </DialogHeader>

        <div v-if="detailsLoading" class="flex justify-center py-4">
          <Loader2 class="h-6 w-6 animate-spin" />
        </div>

        <Table v-else-if="details.length">
          <TableHeader>
            <TableRow>
              <TableHead>Player</TableHead>
              <TableHead>Location</TableHead>
              <TableHead>Item ID</TableHead>
              <TableHead>Created</TableHead>
              <TableHead>Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRow v-for="d in details" :key="`${d.source}-${d.id}`">
              <TableCell>{{ d.player_name }}</TableCell>
              <TableCell>
                <Badge :variant="d.source === 'locker' ? 'outline' : 'secondary'">
                  {{ d.location }}
                </Badge>
              </TableCell>
              <TableCell class="font-mono">{{ d.id }}</TableCell>
              <TableCell class="text-sm text-muted-foreground">{{ formatDate(d.created_at) }}</TableCell>
              <TableCell>
                <Button
                  variant="destructive"
                  size="sm"
                  @click="deleteSingleItem(d)"
                  :disabled="deleteLoading === `${d.source}-${d.id}`"
                >
                  <Loader2 v-if="deleteLoading === `${d.source}-${d.id}`" class="h-4 w-4 animate-spin" />
                  <Trash2 v-else class="h-4 w-4" />
                </Button>
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </DialogContent>
    </Dialog>

    <!-- Confirm Delete All Dialog -->
    <AlertDialog v-model:open="confirmDeleteOpen">
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete All Duplicates?</AlertDialogTitle>
          <AlertDialogDescription>
            This will delete all duplicate copies of "{{ itemToDelete?.item_name || 'Unknown' }}"
            (UID: {{ itemToDelete?.obj_uid }}), keeping only one copy.
            This action cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction @click="deleteAllDupes" class="bg-destructive text-white hover:bg-destructive/90">
            Delete Duplicates
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>

    <!-- Confirm Bulk Delete Dialog -->
    <AlertDialog v-model:open="confirmBulkDeleteOpen">
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete {{ selectedCount }} Selected Items?</AlertDialogTitle>
          <AlertDialogDescription>
            This will delete all duplicates for the selected items, keeping only one copy of each.
            This action cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction @click="executeBulkDelete" class="bg-destructive text-white hover:bg-destructive/90">
            Delete All Selected
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>

    <!-- Confirm Delete All Dialog -->
    <AlertDialog v-model:open="confirmDeleteAllOpen">
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete ALL Duplicates?</AlertDialogTitle>
          <AlertDialogDescription>
            This will delete all {{ summary?.total_duped_records }} duplicate records across {{ items.length }} items,
            keeping only one copy of each. This action cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction @click="executeDeleteAll" class="bg-destructive text-white hover:bg-destructive/90">
            Delete All Duplicates
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>

    <!-- Delete Progress Dialog -->
    <Dialog v-model:open="deleteProgressOpen">
      <DialogContent class="sm:!max-w-md" @pointer-down-outside.prevent @escape-key-down.prevent>
        <DialogHeader>
          <DialogTitle>Deleting Duplicates...</DialogTitle>
          <DialogDescription>
            Please wait while duplicates are being removed.
          </DialogDescription>
        </DialogHeader>
        <div class="space-y-4 py-4">
          <Progress :model-value="deleteProgress" class="h-3" />
          <div class="flex justify-between text-sm text-muted-foreground">
            <span>{{ deleteProgressCurrent }} / {{ deleteProgressTotal }}</span>
            <span>{{ Math.round(deleteProgress) }}%</span>
          </div>
          <div class="text-sm">
            <span class="text-muted-foreground">Deleting: </span>
            <AnsiText v-if="deleteProgressItemAnsi" :text="deleteProgressItemAnsi" />
            <span v-else>{{ deleteProgressItem }}</span>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { dupeApi, type DupedItem, type DupeDetail, type DupeSummary } from '@/services/api'
import { stripAnsiCodes } from '@/utils/ansiParser'
import { useToast } from '@/composables/useToast'
import {
  AlertTriangle,
  CheckCircle,
  Copy,
  Eye,
  Loader2,
  Package,
  RefreshCw,
  Search,
  Trash2,
  Users,
} from 'lucide-vue-next'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Checkbox } from '@/components/ui/checkbox'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
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
import PaginationWithEllipsis from '@/components/forum/PaginationWithEllipsis.vue'
import AnsiText from '@/components/ui/AnsiText.vue'
import { Progress } from '@/components/ui/progress'

const { success } = useToast()

const pageSize = 20
const items = ref<DupedItem[]>([])
const summary = ref<DupeSummary | null>(null)
const isLoading = ref(false)
const error = ref<string | null>(null)

const searchQuery = ref('')
const currentPage = ref(1)
const selectedIds = ref<Record<string, boolean>>({})

const detailsOpen = ref(false)
const selectedItem = ref<DupedItem | null>(null)
const details = ref<DupeDetail[]>([])
const detailsLoading = ref(false)
const deleteLoading = ref<string | null>(null)

const confirmDeleteOpen = ref(false)
const itemToDelete = ref<DupedItem | null>(null)

const confirmBulkDeleteOpen = ref(false)
const bulkDeleteLoading = ref(false)

const confirmDeleteAllOpen = ref(false)
const deleteAllLoading = ref(false)

const deleteProgressOpen = ref(false)
const deleteProgress = ref(0)
const deleteProgressCurrent = ref(0)
const deleteProgressTotal = ref(0)
const deleteProgressItem = ref('')
const deleteProgressItemAnsi = ref<string | null>(null)

// filtered based on search
const filteredItems = computed(() => {
  if (!searchQuery.value.trim()) return items.value
  const q = searchQuery.value.toLowerCase()
  return items.value.filter((item) => {
    const itemName = item.item_name_ansi
      ? stripAnsiCodes(item.item_name_ansi).toLowerCase()
      : (item.item_name || '').toLowerCase()
    const players = item.players.toLowerCase()
    return itemName.includes(q) || players.includes(q)
  })
})

const totalPages = computed(() => Math.ceil(filteredItems.value.length / pageSize))

// reset to page 1 when search changes
watch(searchQuery, () => {
  currentPage.value = 1
})

const paginatedItems = computed(() => {
  const start = (currentPage.value - 1) * pageSize
  return filteredItems.value.slice(start, start + pageSize)
})

const selectedCount = computed(
  () => Object.keys(selectedIds.value).filter((k) => selectedIds.value[k]).length,
)

const isAllSelected = computed(() => {
  if (paginatedItems.value.length === 0) return false
  return paginatedItems.value.every((item) => selectedIds.value[`${item.obj_uid}-${item.vnum}`])
})

function toggleSelectAll(checked: boolean) {
  paginatedItems.value.forEach((item) => {
    selectedIds.value[`${item.obj_uid}-${item.vnum}`] = checked
  })
}

function toggleSelect(item: DupedItem, checked: boolean) {
  selectedIds.value[`${item.obj_uid}-${item.vnum}`] = checked
}

function handlePageChange(page: number) {
  currentPage.value = page
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '-'
  const d = new Date(dateStr)
  return (
    d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  )
}

async function fetchData() {
  isLoading.value = true
  error.value = null
  selectedIds.value = {}
  try {
    const data = await dupeApi.getDupes()
    items.value = data.items
    summary.value = data.summary
    currentPage.value = 1
  } catch (e: any) {
    error.value = e.response?.data?.error || 'Failed to fetch data'
  } finally {
    isLoading.value = false
  }
}

async function viewDetails(item: DupedItem) {
  selectedItem.value = item
  detailsOpen.value = true
  detailsLoading.value = true
  try {
    const data = await dupeApi.getDupeDetails(item.obj_uid)
    details.value = data.details
  } catch (e) {
    console.error('Failed to load details:', e)
  } finally {
    detailsLoading.value = false
  }
}

async function deleteSingleItem(d: DupeDetail) {
  const key = `${d.source}-${d.id}`
  deleteLoading.value = key
  try {
    if (d.source === 'locker') {
      await dupeApi.deleteLockerItem(d.id)
    } else {
      await dupeApi.deleteItem(d.id)
    }
    details.value = details.value.filter((x) => !(x.source === d.source && x.id === d.id))
    success(`Removed item from ${d.player_name} (${d.location})`)
    await fetchData()
  } catch (e) {
    console.error('Failed to delete:', e)
  } finally {
    deleteLoading.value = null
  }
}

function confirmDeleteAll(item: DupedItem) {
  itemToDelete.value = item
  confirmDeleteOpen.value = true
}

async function deleteAllDupes() {
  if (!itemToDelete.value) return
  const itemName = itemToDelete.value.item_name || 'item'
  try {
    const result = await dupeApi.deleteAllDupes(itemToDelete.value.obj_uid, itemToDelete.value.vnum)
    success(`Deleted ${result.deletedCount} duplicate(s) of ${itemName}`)
    await fetchData()
  } catch (e) {
    console.error('Failed to delete dupes:', e)
  } finally {
    confirmDeleteOpen.value = false
    itemToDelete.value = null
  }
}

function confirmBulkDelete() {
  confirmBulkDeleteOpen.value = true
}

async function executeBulkDelete() {
  bulkDeleteLoading.value = true
  try {
    const selected = Object.keys(selectedIds.value).filter((k) => selectedIds.value[k])
    let totalDeleted = 0
    for (const key of selected) {
      const [objUid, vnum] = key.split('-').map(Number) as [number, number]
      const result = await dupeApi.deleteAllDupes(objUid, vnum)
      totalDeleted += result.deletedCount
    }
    success(`Deleted ${totalDeleted} duplicate(s) from ${selected.length} item(s)`)
    await fetchData()
  } catch (e) {
    console.error('Failed to bulk delete:', e)
  } finally {
    bulkDeleteLoading.value = false
    confirmBulkDeleteOpen.value = false
  }
}

async function executeDeleteAll() {
  confirmDeleteAllOpen.value = false
  deleteProgressOpen.value = true
  deleteProgress.value = 0
  deleteProgressCurrent.value = 0
  deleteProgressTotal.value = items.value.length
  deleteProgressItem.value = ''
  deleteProgressItemAnsi.value = null

  try {
    let totalDeleted = 0
    const itemsCopy = [...items.value]
    for (let i = 0; i < itemsCopy.length; i++) {
      const item = itemsCopy[i]!
      deleteProgressCurrent.value = i + 1
      deleteProgress.value = ((i + 1) / itemsCopy.length) * 100
      deleteProgressItem.value = item.item_name || 'Unknown item'
      deleteProgressItemAnsi.value = item.item_name_ansi

      const result = await dupeApi.deleteAllDupes(item.obj_uid, item.vnum)
      totalDeleted += result.deletedCount
    }
    success(`Deleted ${totalDeleted} duplicate(s) from ${itemsCopy.length} item(s)`)
    await fetchData()
  } catch (e) {
    console.error('Failed to delete all:', e)
  } finally {
    deleteProgressOpen.value = false
  }
}

onMounted(fetchData)
</script>
