<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useQuery, useMutation, useQueryClient } from '@tanstack/vue-query'
import { builderApi } from '@/services/api'
import { useAuth } from '@/composables/useAuth'
import { useToast } from '@/composables/useToast'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Alert, AlertDescription } from '@/components/ui/alert'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
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
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Plus,
  Trash2,
  AlertCircle,
  Eye,
  Edit,
  Shield,
  UserCheck,
  Crown,
  Check,
  ChevronsUpDown,
  Loader2,
} from 'lucide-vue-next'
import type { ZonePermissionLevel } from '@/types'

const props = defineProps<{
  zoneId: string
  zoneName: string
  isOwner: boolean
  canManageZones: boolean
}>()

const { user } = useAuth()
const toast = useToast()
const queryClient = useQueryClient()

// Add permission dialog
const addDialogOpen = ref(false)
const newPermissionLevel = ref<ZonePermissionLevel>('view')

// Popover + Command state for account search
const comboboxOpen = ref(false)
const selectedAccountName = ref('')
const accountSearchQuery = ref('')
const debouncedSearchQuery = ref('')
let debounceTimer: ReturnType<typeof setTimeout> | null = null

// Debounce search input
watch(accountSearchQuery, (val) => {
  if (debounceTimer) clearTimeout(debounceTimer)
  debounceTimer = setTimeout(() => {
    debouncedSearchQuery.value = val
  }, 300)
})

// Search accounts query - always enabled, empty string gets first 20 accounts
const { data: accountSearchResults, isLoading: isSearchingAccounts } = useQuery({
  queryKey: ['account-search', debouncedSearchQuery],
  queryFn: () => builderApi.searchAccounts(debouncedSearchQuery.value, 20),
  enabled: true,
})

// Filter accounts based on search
const filteredAccounts = computed((): string[] => {
  if (!accountSearchResults.value) return []
  return accountSearchResults.value.filter((a): a is string => !!a)
})

// Handle account selection
function selectAccount(accountName: string) {
  selectedAccountName.value = accountName
  comboboxOpen.value = false
}

// Delete confirmation dialog
const deleteDialogOpen = ref(false)
const accountToDelete = ref<string | null>(null)

// Fetch permissions list
const { data: permissions, isLoading, error } = useQuery({
  queryKey: ['zone-permissions', props.zoneId],
  queryFn: () => builderApi.getZonePermissions(props.zoneId),
})

// Grant permission mutation
const grantMutation = useMutation({
  mutationFn: ({ accountName, level }: { accountName: string; level: ZonePermissionLevel }) =>
    builderApi.grantZonePermission(props.zoneId, accountName, level),
  onSuccess: () => {
    toast.success('Permission granted')
    queryClient.invalidateQueries({ queryKey: ['zone-permissions', props.zoneId] })
    addDialogOpen.value = false
    selectedAccountName.value = ''
    accountSearchQuery.value = ''
    newPermissionLevel.value = 'view'
  },
  onError: (err: Error) => {
    toast.error(`Failed to grant permission: ${err.message}`)
  },
})

// Revoke permission mutation
const revokeMutation = useMutation({
  mutationFn: (accountName: string) => builderApi.revokeZonePermission(props.zoneId, accountName),
  onSuccess: () => {
    toast.success('Permission revoked')
    queryClient.invalidateQueries({ queryKey: ['zone-permissions', props.zoneId] })
    deleteDialogOpen.value = false
    accountToDelete.value = null
  },
  onError: (err: Error) => {
    toast.error(`Failed to revoke permission: ${err.message}`)
  },
})

// Get permission level badge variant and icon
function getPermissionBadge(level: ZonePermissionLevel) {
  switch (level) {
    case 'view':
      return { variant: 'secondary' as const, icon: Eye, label: 'View' }
    case 'edit':
      return { variant: 'default' as const, icon: Edit, label: 'Edit' }
    case 'manage':
      return { variant: 'destructive' as const, icon: Shield, label: 'Manage' }
  }
}

// Open add dialog
function openAddDialog() {
  selectedAccountName.value = ''
  accountSearchQuery.value = ''
  debouncedSearchQuery.value = ''
  newPermissionLevel.value = 'view'
  addDialogOpen.value = true
}

// Submit add permission
function submitAddPermission() {
  if (!selectedAccountName.value.trim()) {
    toast.error('Please select an account')
    return
  }
  grantMutation.mutate({
    accountName: selectedAccountName.value.trim(),
    level: newPermissionLevel.value,
  })
}

// Open delete confirmation
function confirmDelete(accountName: string) {
  accountToDelete.value = accountName
  deleteDialogOpen.value = true
}

// Execute delete
function executeDelete() {
  if (accountToDelete.value) {
    revokeMutation.mutate(accountToDelete.value)
  }
}
</script>

<template>
  <div class="p-6">
    <!-- Loading -->
    <div v-if="isLoading">
      <Skeleton class="h-6 w-32 mb-4" />
      <Skeleton class="h-12 w-full mb-2" />
      <Skeleton class="h-12 w-full mb-2" />
      <Skeleton class="h-12 w-full" />
    </div>

    <!-- Error -->
    <Alert v-else-if="error" variant="destructive">
      <AlertCircle class="h-4 w-4" />
      <AlertDescription>
        Failed to load zone permissions.
      </AlertDescription>
    </Alert>

    <!-- Content -->
    <div v-else>
      <!-- Header -->
      <div class="flex items-center justify-between mb-6">
        <div>
          <h3 class="text-lg font-semibold">Zone Permissions</h3>
          <p class="text-sm text-muted-foreground">
            Manage who can view, edit, or manage this zone.
          </p>
        </div>
        <Button @click="openAddDialog">
          <Plus class="h-4 w-4 mr-2" />
          Add Permission
        </Button>
      </div>

      <!-- Permission levels explanation -->
      <div class="mb-6 p-4 bg-muted/30 rounded-lg">
        <h4 class="text-sm font-medium mb-2">Permission Levels</h4>
        <div class="space-y-2 text-sm">
          <div class="flex items-center gap-2">
            <Badge variant="secondary"><Eye class="h-3 w-3 mr-1" />View</Badge>
            <span class="text-muted-foreground">Can view zone data and comments</span>
          </div>
          <div class="flex items-center gap-2">
            <Badge><Edit class="h-3 w-3 mr-1" />Edit</Badge>
            <span class="text-muted-foreground">Can edit rooms, mobs, and objects</span>
          </div>
          <div class="flex items-center gap-2">
            <Badge variant="destructive"><Shield class="h-3 w-3 mr-1" />Manage</Badge>
            <span class="text-muted-foreground">Can manage permissions and proc requests</span>
          </div>
        </div>
      </div>

      <!-- Permissions list -->
      <div class="space-y-2">
        <!-- Zone owner (implicit full access) -->
        <div v-if="isOwner" class="flex items-center justify-between p-3 bg-yellow-500/10 border border-yellow-500/30 rounded-lg">
          <div class="flex items-center gap-3">
            <Crown class="h-5 w-5 text-yellow-500" />
            <div>
              <span class="font-medium">{{ user?.accountName }}</span>
              <span class="text-muted-foreground ml-2">(You)</span>
            </div>
          </div>
          <Badge variant="outline" class="border-yellow-500 text-yellow-500">
            <Crown class="h-3 w-3 mr-1" />
            Owner
          </Badge>
        </div>

        <!-- Explicit permissions -->
        <div
          v-for="perm in permissions"
          :key="perm.id"
          class="flex items-center justify-between p-3 bg-muted/30 rounded-lg"
        >
          <div class="flex items-center gap-3">
            <UserCheck class="h-5 w-5 text-muted-foreground" />
            <div>
              <span class="font-medium">{{ perm.accountName }}</span>
              <span v-if="perm.accountName === user?.accountName" class="text-muted-foreground ml-2">(You)</span>
            </div>
          </div>
          <div class="flex items-center gap-3">
            <Badge :variant="getPermissionBadge(perm.permissionLevel).variant">
              <component :is="getPermissionBadge(perm.permissionLevel).icon" class="h-3 w-3 mr-1" />
              {{ getPermissionBadge(perm.permissionLevel).label }}
            </Badge>
            <Button
              variant="ghost"
              size="icon"
              class="h-8 w-8 text-destructive hover:text-destructive"
              @click="confirmDelete(perm.accountName)"
              :disabled="perm.accountName === user?.accountName"
            >
              <Trash2 class="h-4 w-4" />
            </Button>
          </div>
        </div>

        <!-- Empty state -->
        <div v-if="!permissions || permissions.length === 0" class="text-center py-8 text-muted-foreground">
          <UserCheck class="h-12 w-12 mx-auto mb-4 opacity-50" />
          <p>No explicit permissions have been granted.</p>
          <p class="text-sm">The zone owner has full access by default.</p>
        </div>
      </div>
    </div>

    <!-- Add Permission Dialog -->
    <Dialog v-model:open="addDialogOpen">
      <DialogContent class="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add Permission</DialogTitle>
          <DialogDescription>
            Grant access to this zone for another account.
          </DialogDescription>
        </DialogHeader>
        <div class="space-y-4 py-4">
          <div class="space-y-2">
            <label class="text-sm font-medium">Account Name</label>
            <Popover v-model:open="comboboxOpen">
              <PopoverTrigger as-child>
                <Button
                  variant="outline"
                  role="combobox"
                  :aria-expanded="comboboxOpen"
                  class="w-full justify-between"
                >
                  <span :class="selectedAccountName ? '' : 'text-muted-foreground'">
                    {{ selectedAccountName || 'Select account...' }}
                  </span>
                  <ChevronsUpDown class="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent class="w-[300px] p-0" align="start">
                <div class="p-2 border-b">
                  <Input
                    v-model="accountSearchQuery"
                    placeholder="Search accounts..."
                    class="h-8"
                  />
                </div>
                <ScrollArea class="h-[200px]">
                  <div v-if="isSearchingAccounts" class="flex items-center justify-center gap-2 py-4">
                    <Loader2 class="h-4 w-4 animate-spin" />
                    <span class="text-sm text-muted-foreground">Searching...</span>
                  </div>
                  <div v-else-if="filteredAccounts.length === 0" class="py-4 text-center text-sm text-muted-foreground">
                    No accounts found.
                  </div>
                  <div v-else class="p-1">
                    <button
                      v-for="account in filteredAccounts"
                      :key="account"
                      type="button"
                      class="w-full flex items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-accent hover:text-accent-foreground cursor-pointer"
                      :class="selectedAccountName === account ? 'bg-accent' : ''"
                      @click="selectAccount(account)"
                    >
                      <UserCheck class="h-4 w-4 text-muted-foreground" />
                      {{ account }}
                      <Check
                        v-if="selectedAccountName === account"
                        class="ml-auto h-4 w-4"
                      />
                    </button>
                  </div>
                </ScrollArea>
              </PopoverContent>
            </Popover>
          </div>
          <div class="space-y-2">
            <label class="text-sm font-medium">Permission Level</label>
            <Select v-model="newPermissionLevel">
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="view">
                  <div class="flex items-center gap-2">
                    <Eye class="h-4 w-4" />
                    View - Can view zone data
                  </div>
                </SelectItem>
                <SelectItem value="edit">
                  <div class="flex items-center gap-2">
                    <Edit class="h-4 w-4" />
                    Edit - Can edit zone content
                  </div>
                </SelectItem>
                <SelectItem value="manage">
                  <div class="flex items-center gap-2">
                    <Shield class="h-4 w-4" />
                    Manage - Full zone management
                  </div>
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" @click="addDialogOpen = false">
            Cancel
          </Button>
          <Button @click="submitAddPermission" :disabled="grantMutation.isPending.value">
            Grant Permission
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <!-- Delete Confirmation Dialog -->
    <AlertDialog v-model:open="deleteDialogOpen">
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Revoke Permission?</AlertDialogTitle>
          <AlertDialogDescription>
            This will remove access for <strong>{{ accountToDelete }}</strong> to this zone.
            They will no longer be able to view or edit this zone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            class="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            @click="executeDelete"
          >
            Revoke Access
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </div>
</template>
