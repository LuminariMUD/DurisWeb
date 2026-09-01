<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useAuth } from '@/composables/useAuth'
import {
  useUserList,
  useRaces,
  useClasses,
  useBanUser,
  useUnbanUser,
  useDeleteCharacter,
  type UserManagementFilters,
} from '@/composables/useUserManagement'
import { useToast } from '@/composables/useToast'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
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
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { Ban, ShieldOff, Search, ArrowUpDown, Trash2 } from 'lucide-vue-next'
import { Skeleton } from '@/components/ui/skeleton'
import { parseAnsiToHtml } from '@/utils/ansiParser'
import { format } from 'date-fns'
import DeleteProgressModal from '@/components/admin/DeleteProgressModal.vue'
import { useQueryClient } from '@tanstack/vue-query'

const router = useRouter()
const { isOverlord } = useAuth()
const { show: toast } = useToast()

// Redirect if not overlord
if (!isOverlord.value) {
  router.push('/forum')
}

// Filters
const filters = ref<UserManagementFilters>({
  search: '',
  race: '',
  class: '',
  alignment: null,
  ban_status: 'all',
  page: 1,
  limit: 50,
  sort_by: 'last_login',
  sort_order: 'desc',
})

// Debounced search
const searchInput = ref('')
let searchTimeout: ReturnType<typeof setTimeout>

watch(searchInput, (newValue) => {
  clearTimeout(searchTimeout)
  searchTimeout = setTimeout(() => {
    filters.value.search = newValue
    filters.value.page = 1 // Reset to first page on search
  }, 300)
})

// Data fetching
const { data: userData, isLoading } = useUserList(filters)
const { data: races } = useRaces()
const { data: classes } = useClasses()

// Mutations
const { mutate: banUser, isPending: isBanning } = useBanUser()
const { mutate: unbanUser, isPending: isUnbanning } = useUnbanUser()
const { mutate: deleteCharacter, isPending: isDeleting } = useDeleteCharacter()
const queryClient = useQueryClient()

// Ban/Unban dialog
const showBanDialog = ref(false)
const showUnbanDialog = ref(false)
const selectedUser = ref<string | null>(null)
const banReason = ref('')

// Delete character dialog - confirmation step
const showDeleteDialog = ref(false)
const selectedCharacter = ref<{ accountName: string; characterName: string } | null>(null)

// Delete progress modal
const showProgressModal = ref(false)

function openBanDialog(accountName: string) {
  selectedUser.value = accountName
  banReason.value = ''
  showBanDialog.value = true
}

function openUnbanDialog(accountName: string) {
  selectedUser.value = accountName
  showUnbanDialog.value = true
}

function confirmBan() {
  if (!selectedUser.value || !banReason.value.trim()) {
    toast({
      type: 'error',
      title: 'Error',
      message: 'Ban reason is required',
    })
    return
  }

  banUser(
    { accountName: selectedUser.value, reason: banReason.value },
    {
      onSuccess: () => {
        toast({
          type: 'success',
          title: 'Success',
          message: `User ${selectedUser.value} has been banned`,
        })
        showBanDialog.value = false
        selectedUser.value = null
        banReason.value = ''
      },
      onError: (error: any) => {
        toast({
          type: 'error',
          title: 'Error',
          message: error.response?.data?.error || 'Failed to ban user',
        })
      },
    },
  )
}

function confirmUnban() {
  if (!selectedUser.value) return

  unbanUser(selectedUser.value, {
    onSuccess: () => {
      toast({
        type: 'success',
        title: 'Success',
        message: `User ${selectedUser.value} has been unbanned`,
      })
      showUnbanDialog.value = false
      selectedUser.value = null
    },
    onError: (error: any) => {
      toast({
        type: 'error',
        title: 'Error',
        message: error.response?.data?.error || 'Failed to unban user',
      })
    },
  })
}

function openDeleteDialog(accountName: string, characterName: string) {
  selectedCharacter.value = { accountName, characterName }
  showDeleteDialog.value = true
}

function confirmDelete() {
  if (!selectedCharacter.value) return

  // Close confirmation dialog and show progress modal
  showDeleteDialog.value = false
  showProgressModal.value = true

  // Trigger the delete mutation
  deleteCharacter(selectedCharacter.value, {
    onError: (error: any) => {
      // Error will be shown in the progress modal
      console.error('Delete error:', error)
    },
  })
}

function handleDeleteComplete(success: boolean) {
  showProgressModal.value = false

  if (success) {
    toast({
      type: 'success',
      title: 'Success',
      message: `Character ${selectedCharacter.value?.characterName} has been deleted`,
    })
    // Refresh the user list
    queryClient.invalidateQueries({ queryKey: ['users'] })
  } else {
    toast({
      type: 'error',
      title: 'Error',
      message: 'Character deletion failed',
    })
  }

  selectedCharacter.value = null
}

// Sorting
function toggleSort(column: string) {
  if (filters.value.sort_by === column) {
    filters.value.sort_order = filters.value.sort_order === 'asc' ? 'desc' : 'asc'
  } else {
    filters.value.sort_by = column
    filters.value.sort_order = 'desc'
  }
}

// Pagination
const totalPages = computed(() => userData.value?.pagination.totalPages || 0)
const currentPage = computed(() => filters.value.page)

function goToPage(page: number) {
  filters.value.page = page
}

// Ellipsis pagination (handles thousands of pages)
const paginationPages = computed(() => {
  const pages: (number | string)[] = []
  const total = totalPages.value
  const current = currentPage.value

  if (total <= 7) {
    // Show all pages if 7 or fewer
    for (let i = 1; i <= total; i++) {
      pages.push(i)
    }
  } else {
    // Always show first page
    pages.push(1)

    if (current > 3) {
      pages.push('...')
    }

    // Show pages around current
    const start = Math.max(2, current - 1)
    const end = Math.min(total - 1, current + 1)

    for (let i = start; i <= end; i++) {
      pages.push(i)
    }

    if (current < total - 2) {
      pages.push('...')
    }

    // Always show last page
    pages.push(total)
  }

  return pages
})

// Format date
function formatDate(date: string | null) {
  if (!date) return 'Never'
  return format(new Date(date), 'MMM d, yyyy HH:mm')
}

// Title case for character names
function titleCase(str: string | null) {
  if (!str) return ''
  return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase()
}

// Group users by account
const groupedUsers = computed(() => {
  if (!userData.value?.data) return []

  const groups = new Map()

  for (const user of userData.value.data) {
    if (!groups.has(user.account_name)) {
      groups.set(user.account_name, {
        account_name: user.account_name,
        email: user.email,
        last_ip: user.last_ip,
        last_login: user.last_login,
        web_last_login: user.web_last_login,
        is_banned: user.is_banned,
        ban_reason: user.ban_reason,
        banned_at: user.banned_at,
        banned_by: user.banned_by,
        characters: [],
      })
    }

    const group = groups.get(user.account_name)
    group.characters.push({
      pid: user.pid,
      character_name: user.character_name,
      race: user.race,
      class: user.class,
      level: user.level,
      racewar: user.racewar,
      is_deleted: user.is_deleted,
    })
  }

  return Array.from(groups.values())
})
</script>

<template>
  <div class="container mx-auto py-6 space-y-6">
    <Card>
      <CardHeader>
        <CardTitle>User Management</CardTitle>
        <CardDescription>
          Manage user accounts, view characters, and handle bans
        </CardDescription>
      </CardHeader>
      <CardContent class="space-y-4">
        <!-- Filters -->
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-4">
          <!-- Search -->
          <div class="lg:col-span-2">
            <div class="relative">
              <Search class="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                v-model="searchInput"
                placeholder="Search account, character, or IP..."
                class="pl-8"
              />
            </div>
          </div>

          <!-- Race Filter -->
          <Select
            :model-value="filters.race || 'all'"
            @update:model-value="(val) => { filters.race = val === 'all' ? '' : val as string; filters.page = 1 }"
          >
            <SelectTrigger>
              <SelectValue placeholder="All Races" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Races</SelectItem>
              <SelectItem v-for="race in races" :key="race" :value="race">
                <span v-html="parseAnsiToHtml(race)" />
              </SelectItem>
            </SelectContent>
          </Select>

          <!-- Class Filter -->
          <Select
            :model-value="filters.class || 'all'"
            @update:model-value="(val) => { filters.class = val === 'all' ? '' : val as string; filters.page = 1 }"
          >
            <SelectTrigger>
              <SelectValue placeholder="All Classes" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Classes</SelectItem>
              <SelectItem v-for="cls in classes" :key="cls" :value="cls">
                <span v-html="parseAnsiToHtml(cls)" />
              </SelectItem>
            </SelectContent>
          </Select>

          <!-- Alignment Filter -->
          <Select
            :model-value="filters.alignment?.toString() || 'all'"
            @update:model-value="(val) => { filters.alignment = val === 'all' ? null : parseInt(val as string); filters.page = 1 }"
          >
            <SelectTrigger>
              <SelectValue placeholder="All Alignments" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Alignments</SelectItem>
              <SelectItem value="1">Good</SelectItem>
              <SelectItem value="2">Evil</SelectItem>
              <SelectItem value="3">Neutral</SelectItem>
              <SelectItem value="4">Undead</SelectItem>
            </SelectContent>
          </Select>

          <!-- Ban Status Filter -->
          <Select v-model="filters.ban_status" @update:model-value="filters.page = 1">
            <SelectTrigger>
              <SelectValue placeholder="Ban Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Users</SelectItem>
              <SelectItem value="active">Active Only</SelectItem>
              <SelectItem value="banned">Banned Only</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <!-- Loading skeleton -->
        <div v-if="isLoading" class="space-y-2">
          <Skeleton class="h-12 w-full" />
          <Skeleton class="h-12 w-full" />
          <Skeleton class="h-12 w-full" />
        </div>

        <!-- Users Table -->
        <div v-else-if="userData?.data.length" class="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead @click="toggleSort('account_name')" class="cursor-pointer hover:bg-muted/50">
                  <div class="flex items-center gap-2">
                    Account
                    <ArrowUpDown class="h-4 w-4" />
                  </div>
                </TableHead>
                <TableHead @click="toggleSort('character_name')" class="cursor-pointer hover:bg-muted/50">
                  <div class="flex items-center gap-2">
                    Character
                    <ArrowUpDown class="h-4 w-4" />
                  </div>
                </TableHead>
                <TableHead @click="toggleSort('pid')" class="cursor-pointer hover:bg-muted/50">
                  <div class="flex items-center gap-2">
                    PID
                    <ArrowUpDown class="h-4 w-4" />
                  </div>
                </TableHead>
                <TableHead @click="toggleSort('race')" class="cursor-pointer hover:bg-muted/50">
                  <div class="flex items-center gap-2">
                    Race
                    <ArrowUpDown class="h-4 w-4" />
                  </div>
                </TableHead>
                <TableHead @click="toggleSort('class')" class="cursor-pointer hover:bg-muted/50">
                  <div class="flex items-center gap-2">
                    Class
                    <ArrowUpDown class="h-4 w-4" />
                  </div>
                </TableHead>
                <TableHead @click="toggleSort('email')" class="cursor-pointer hover:bg-muted/50">
                  <div class="flex items-center gap-2">
                    Email
                    <ArrowUpDown class="h-4 w-4" />
                  </div>
                </TableHead>
                <TableHead>Last IP</TableHead>
                <TableHead @click="toggleSort('last_login')" class="cursor-pointer hover:bg-muted/50">
                  <div class="flex items-center gap-2">
                    Last Login
                    <ArrowUpDown class="h-4 w-4" />
                  </div>
                </TableHead>
                <TableHead>Status</TableHead>
                <TableHead class="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <template v-for="account in groupedUsers" :key="account.account_name">
                <!-- First character row with account info -->
                <TableRow v-if="account.characters.length > 0">
                  <TableCell :rowspan="account.characters.length" class="font-medium align-middle border-r">
                    <RouterLink
                      :to="`/user/${encodeURIComponent(account.account_name)}`"
                      class="hover:underline text-primary"
                    >
                      {{ account.account_name }}
                    </RouterLink>
                  </TableCell>
                  <TableCell>
                    <div class="flex items-center gap-2">
                      <span
                        v-if="account.characters[0].character_name && account.characters[0].level"
                        :class="{ 'line-through text-muted-foreground': account.characters[0].is_deleted }"
                      >
                        {{ titleCase(account.characters[0].character_name) }} ({{ account.characters[0].level }})
                      </span>
                      <span
                        v-else-if="account.characters[0].character_name"
                        :class="{ 'line-through text-muted-foreground': account.characters[0].is_deleted }"
                      >
                        {{ titleCase(account.characters[0].character_name) }}
                      </span>
                      <span v-else class="text-muted-foreground">—</span>
                      <TooltipProvider v-if="account.characters[0].character_name && !account.characters[0].is_deleted">
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              size="icon"
                              variant="ghost"
                              class="h-7 w-7 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                              @click.stop="openDeleteDialog(account.account_name, account.characters[0].character_name)"
                              :disabled="isDeleting"
                            >
                              <Trash2 class="h-4 w-4" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>
                            <p>Delete character</p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </div>
                  </TableCell>
                  <TableCell class="text-sm font-mono text-muted-foreground">
                    {{ account.characters[0].pid || '—' }}
                  </TableCell>
                  <TableCell>
                    <span v-if="account.characters[0].race" v-html="parseAnsiToHtml(account.characters[0].race)" />
                    <span v-else class="text-muted-foreground">—</span>
                  </TableCell>
                  <TableCell>
                    <span v-if="account.characters[0].class" v-html="parseAnsiToHtml(account.characters[0].class)" />
                    <span v-else class="text-muted-foreground">—</span>
                  </TableCell>
                  <TableCell :rowspan="account.characters.length" class="text-sm text-muted-foreground align-middle border-l border-r">
                    {{ account.email || '—' }}
                  </TableCell>
                  <TableCell :rowspan="account.characters.length" class="text-sm font-mono text-muted-foreground align-middle border-r">
                    {{ account.last_ip || '—' }}
                  </TableCell>
                  <TableCell :rowspan="account.characters.length" class="text-sm align-middle border-r whitespace-pre-line">
                    <div>MUD : {{ formatDate(account.last_login) }}</div>
                    <div>Web : {{ formatDate(account.web_last_login) }}</div>
                  </TableCell>
                  <TableCell :rowspan="account.characters.length" class="align-middle border-r">
                    <Badge v-if="account.is_banned" variant="destructive">Banned</Badge>
                    <Badge v-else variant="outline">Active</Badge>
                  </TableCell>
                  <TableCell :rowspan="account.characters.length" class="text-right align-middle">
                    <div class="flex justify-end gap-2">
                      <TooltipProvider v-if="!account.is_banned">
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              size="sm"
                              variant="destructive"
                              @click="openBanDialog(account.account_name)"
                              :disabled="isBanning"
                            >
                              <Ban class="h-4 w-4" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>
                            <p>Ban account</p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                      <TooltipProvider v-else>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              size="sm"
                              variant="outline"
                              @click="openUnbanDialog(account.account_name)"
                              :disabled="isUnbanning"
                            >
                              <ShieldOff class="h-4 w-4" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>
                            <p>Unban account</p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </div>
                  </TableCell>
                </TableRow>

                <!-- Additional character rows (if any) -->
                <TableRow v-for="(char, charIndex) in account.characters.slice(1)" :key="`${account.account_name}-${charIndex}`">
                  <TableCell>
                    <div class="flex items-center gap-2">
                      <span
                        v-if="char.character_name && char.level"
                        :class="{ 'line-through text-muted-foreground': char.is_deleted }"
                      >
                        {{ titleCase(char.character_name) }} ({{ char.level }})
                      </span>
                      <span
                        v-else-if="char.character_name"
                        :class="{ 'line-through text-muted-foreground': char.is_deleted }"
                      >
                        {{ titleCase(char.character_name) }}
                      </span>
                      <span v-else class="text-muted-foreground">—</span>
                      <TooltipProvider v-if="char.character_name && !char.is_deleted">
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              size="icon"
                              variant="ghost"
                              class="h-7 w-7 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                              @click.stop="openDeleteDialog(account.account_name, char.character_name)"
                              :disabled="isDeleting"
                            >
                              <Trash2 class="h-4 w-4" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>
                            <p>Delete character</p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </div>
                  </TableCell>
                  <TableCell class="text-sm font-mono text-muted-foreground">
                    {{ char.pid || '—' }}
                  </TableCell>
                  <TableCell>
                    <span v-if="char.race" v-html="parseAnsiToHtml(char.race)" />
                    <span v-else class="text-muted-foreground">—</span>
                  </TableCell>
                  <TableCell>
                    <span v-if="char.class" v-html="parseAnsiToHtml(char.class)" />
                    <span v-else class="text-muted-foreground">—</span>
                  </TableCell>
                </TableRow>
              </template>
            </TableBody>
          </Table>
        </div>

        <!-- No results -->
        <div v-else class="text-center py-8 text-muted-foreground">
          No users found matching your filters.
        </div>

        <!-- Pagination -->
        <div v-if="userData?.data.length && totalPages > 1" class="flex items-center justify-between">
          <div class="text-sm text-muted-foreground">
            Showing {{ (currentPage - 1) * filters.limit + 1 }} to
            {{ Math.min(currentPage * filters.limit, userData.pagination.total) }} of
            {{ userData.pagination.total }} users
          </div>
          <div class="flex gap-1">
            <Button
              size="sm"
              variant="outline"
              :disabled="currentPage === 1"
              @click="goToPage(currentPage - 1)"
            >
              Previous
            </Button>
            <Button
              v-for="page in paginationPages"
              :key="page"
              size="sm"
              :variant="page === currentPage ? 'default' : 'outline'"
              @click="typeof page === 'number' && goToPage(page)"
              :disabled="typeof page === 'string'"
            >
              {{ page }}
            </Button>
            <Button
              size="sm"
              variant="outline"
              :disabled="currentPage === totalPages"
              @click="goToPage(currentPage + 1)"
            >
              Next
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>

    <!-- Ban Dialog -->
    <Dialog v-model:open="showBanDialog">
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Ban User</DialogTitle>
          <DialogDescription>
            Permanently ban {{ selectedUser }} from accessing the system.
          </DialogDescription>
        </DialogHeader>
        <div class="space-y-4 py-4">
          <div class="space-y-2">
            <Label for="ban-reason">Reason for Ban *</Label>
            <Textarea
              id="ban-reason"
              v-model="banReason"
              placeholder="Explain why this user is being banned..."
              rows="4"
              required
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" @click="showBanDialog = false" :disabled="isBanning">
            Cancel
          </Button>
          <Button variant="destructive" @click="confirmBan" :disabled="isBanning || !banReason.trim()">
            {{ isBanning ? 'Banning...' : 'Ban User' }}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <!-- Unban Dialog -->
    <Dialog v-model:open="showUnbanDialog">
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Unban User</DialogTitle>
          <DialogDescription>
            Restore access for {{ selectedUser }}?
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" @click="showUnbanDialog = false" :disabled="isUnbanning">
            Cancel
          </Button>
          <Button @click="confirmUnban" :disabled="isUnbanning">
            {{ isUnbanning ? 'Unbanning...' : 'Unban User' }}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <!-- Delete Character Dialog -->
    <Dialog v-model:open="showDeleteDialog">
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete Character</DialogTitle>
          <DialogDescription>
            Are you sure you want to delete character <strong>{{ selectedCharacter?.characterName }}</strong>
            from account <strong>{{ selectedCharacter?.accountName }}</strong>?
            This action cannot be undone.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" @click="showDeleteDialog = false" :disabled="isDeleting">
            Cancel
          </Button>
          <Button variant="destructive" @click="confirmDelete" :disabled="isDeleting">
            {{ isDeleting ? 'Deleting...' : 'Delete Character' }}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <!-- Delete Progress Modal -->
    <DeleteProgressModal
      :open="showProgressModal"
      :character-name="selectedCharacter?.characterName || ''"
      :account-name="selectedCharacter?.accountName || ''"
      @update:open="showProgressModal = $event"
      @complete="handleDeleteComplete"
    />
  </div>
</template>
