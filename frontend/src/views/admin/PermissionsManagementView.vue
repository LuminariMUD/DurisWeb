<template>
  <div class="container mx-auto py-6 space-y-6">
    <div class="flex items-center justify-between">
      <div>
        <h1 class="text-3xl font-bold">Permission Management</h1>
        <p class="text-muted-foreground mt-1">Manage roles and assign permissions to accounts</p>
      </div>
    </div>

    <Tabs v-model="activeTab" class="w-full">
      <TabsList class="grid w-full grid-cols-3">
        <TabsTrigger value="roles">Roles</TabsTrigger>
        <TabsTrigger value="accounts">Accounts</TabsTrigger>
        <TabsTrigger value="audit">Audit Log</TabsTrigger>
      </TabsList>

      <!-- Roles Tab -->
      <TabsContent value="roles" class="space-y-4">
        <div class="flex justify-between items-center">
          <p class="text-sm text-muted-foreground">
            Manage permission roles and their associated permissions
          </p>
          <Button @click="openCreateRoleDialog">
            <Plus class="w-4 h-4 mr-2" />
            Create Role
          </Button>
        </div>

        <Card v-if="rolesLoading" class="p-8">
          <div class="flex justify-center">
            <Loader2 class="w-8 h-8 animate-spin text-muted-foreground" />
          </div>
        </Card>

        <Card v-else-if="rolesError" class="p-8">
          <p class="text-destructive text-center">Failed to load roles</p>
        </Card>

        <div v-else class="grid gap-4">
          <Card v-for="role in roles" :key="role.id" class="p-4">
            <div class="flex items-start justify-between">
              <div class="space-y-1 flex-1">
                <div class="flex items-center gap-2">
                  <h3 class="font-semibold text-lg">{{ role.name }}</h3>
                  <Badge v-if="role.is_system_role" variant="secondary">System</Badge>
                </div>
                <p v-if="role.description" class="text-sm text-muted-foreground">
                  {{ role.description }}
                </p>
                <p class="text-xs text-muted-foreground">
                  {{ role.permission_count || 0 }} permissions
                </p>
              </div>
              <div class="flex gap-2">
                <Button variant="outline" size="sm" @click="openEditRoleDialog(role)">
                  <Edit class="w-4 h-4 mr-1" />
                  Edit
                </Button>
                <Button
                  variant="destructive"
                  size="sm"
                  @click="confirmDeleteRole(role)"
                  :disabled="role.is_system_role"
                >
                  <Trash2 class="w-4 h-4 mr-1" />
                  Delete
                </Button>
              </div>
            </div>
          </Card>
        </div>
      </TabsContent>

      <!-- Accounts Tab -->
      <TabsContent value="accounts" class="space-y-4">
        <!-- Filter Card -->
        <Card class="p-4">
          <div class="flex justify-between items-center">
            <div class="flex gap-4 items-center flex-1">
              <Input
                v-model="accountSearchFilter"
                placeholder="Search accounts..."
                class="max-w-sm"
              />
              <select
                v-model="roleFilter"
                class="px-3 py-2 rounded-md border border-input bg-background"
              >
                <option value="">All Roles</option>
                <option v-for="role in roles" :key="role.id" :value="role.id">{{ role.name }}</option>
              </select>
            </div>
            <div class="flex items-center gap-2">
              <Label for="show-all" class="cursor-pointer">Show All Accounts</Label>
              <Switch
                id="show-all"
                :model-value="showAllAccounts"
                @update:model-value="showAllAccounts = $event"
              />
            </div>
          </div>
        </Card>

        <!-- Table Card -->
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead class="pl-6">Account</TableHead>
                <TableHead>Level</TableHead>
                <TableHead>Roles</TableHead>
                <TableHead>Individual Permissions</TableHead>
                <TableHead class="text-right pr-6">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow v-if="accountsLoading">
                <TableCell colspan="5" class="py-12 text-center">
                  <Loader2 class="w-8 h-8 animate-spin text-muted-foreground mx-auto" />
                </TableCell>
              </TableRow>
              <TableRow v-else-if="!paginatedAccounts || paginatedAccounts.length === 0">
                <TableCell colspan="5" class="py-12 text-center text-muted-foreground">
                  No accounts found
                </TableCell>
              </TableRow>
              <TableRow
                v-else
                v-for="account in paginatedAccounts"
                :key="account"
              >
                <TableCell class="font-medium pl-6">{{ account }}</TableCell>
                <TableCell>
                  <Badge
                    v-if="getAccountPermissionsForDisplay(account).godLevel"
                    :variant="getGodLevelVariant(getAccountPermissionsForDisplay(account).godLevel)"
                  >
                    {{ formatGodLevel(getAccountPermissionsForDisplay(account).godLevel, getAccountPermissionsForDisplay(account).immortalLevel) }}
                  </Badge>
                  <span v-else class="text-muted-foreground text-sm">Player</span>
                </TableCell>
                <TableCell>
                  <div class="flex flex-wrap gap-1">
                    <Badge
                      v-for="role in getAccountPermissionsForDisplay(account).roles"
                      :key="role.id"
                      variant="secondary"
                      class="group cursor-pointer hover:bg-secondary/80 pr-1"
                      @click="confirmRevokeRoleForAccount(account, role)"
                    >
                      {{ role.name }}
                      <X class="w-3 h-3 ml-1 opacity-0 group-hover:opacity-100 transition-opacity" />
                    </Badge>
                    <span v-if="getAccountPermissionsForDisplay(account).roles.length === 0" class="text-muted-foreground text-sm">-</span>
                  </div>
                </TableCell>
                <TableCell>
                  <div class="flex flex-wrap gap-1">
                    <Badge
                      v-for="perm in getAccountPermissionsForDisplay(account).individualPermissions"
                      :key="perm.id"
                      variant="outline"
                      class="group cursor-pointer hover:bg-accent pr-1"
                      @click="confirmRevokePermissionForAccount(account, perm)"
                    >
                      {{ perm.name }}
                      <X class="w-3 h-3 ml-1 opacity-0 group-hover:opacity-100 transition-opacity" />
                    </Badge>
                    <span v-if="getAccountPermissionsForDisplay(account).individualPermissions.length === 0" class="text-muted-foreground text-sm">-</span>
                  </div>
                </TableCell>
                <TableCell class="text-right pr-6">
                  <div class="flex gap-2 justify-end">
                    <Button variant="outline" size="sm" @click="openAssignRoleForAccount(account)">
                      <Plus class="w-4 h-4 mr-1" />
                      Assign Role
                    </Button>
                    <Button variant="outline" size="sm" @click="openGrantPermissionForAccount(account)">
                      <Plus class="w-4 h-4 mr-1" />
                      Grant Permission
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>

          <!-- Pagination -->
          <div class="flex justify-center items-center gap-1 p-4 border-t" v-if="totalPages > 1">
            <Button
              variant="outline"
              size="sm"
              @click="currentPage = 1"
              :disabled="currentPage === 1"
            >
              First
            </Button>
            <Button
              variant="outline"
              size="sm"
              @click="currentPage--"
              :disabled="currentPage === 1"
            >
              Prev
            </Button>

            <template v-for="page in visiblePages" :key="page">
              <span v-if="page === '...'" class="px-2">...</span>
              <Button
                v-else
                variant="outline"
                size="sm"
                :class="currentPage === page && 'bg-primary text-primary-foreground'"
                @click="currentPage = typeof page === 'number' ? page : currentPage"
              >
                {{ page }}
              </Button>
            </template>

            <Button
              variant="outline"
              size="sm"
              @click="currentPage++"
              :disabled="currentPage === totalPages"
            >
              Next
            </Button>
            <Button
              variant="outline"
              size="sm"
              @click="currentPage = totalPages"
              :disabled="currentPage === totalPages"
            >
              Last
            </Button>
          </div>
        </Card>
      </TabsContent>

      <!-- Audit Log Tab -->
      <TabsContent value="audit" class="space-y-4">
        <Card class="p-4">
          <div class="space-y-4">
            <div>
              <h3 class="font-semibold text-lg mb-2">Permission Changes Audit Log</h3>
              <p class="text-sm text-muted-foreground">
                View all permission-related changes (role assignments, permission grants, etc.)
              </p>
              <p class="text-xs text-muted-foreground mt-1">
                For a complete log of all admin actions, visit the <a href="/admin/audit-log" class="text-primary hover:underline">full audit log</a>
              </p>
            </div>

            <!-- Filters -->
            <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <Label>Account</Label>
                <Input
                  v-model="auditFilters.account"
                  placeholder="Filter by account..."
                  @input="debouncedFetchAudit"
                />
              </div>
              <div>
                <Label>Action Type</Label>
                <select
                  v-model="auditFilters.actionType"
                  class="w-full px-3 py-2 rounded-md border border-input bg-background"
                  @change="fetchAuditLog(1)"
                >
                  <option value="all">All Actions</option>
                  <option value="assign_role">Assign Role</option>
                  <option value="revoke_role">Revoke Role</option>
                  <option value="grant_permission">Grant Permission</option>
                  <option value="revoke_permission">Revoke Permission</option>
                </select>
              </div>
            </div>

            <!-- Loading State -->
            <div v-if="auditLoading" class="flex justify-center py-8">
              <Loader2 class="w-8 h-8 animate-spin text-muted-foreground" />
            </div>

            <!-- Error State -->
            <div v-else-if="auditError" class="text-center py-8 text-destructive">
              <p>Failed to load audit log</p>
            </div>

            <!-- Empty State -->
            <div v-else-if="!auditEntries || auditEntries.length === 0" class="text-center py-8 text-muted-foreground">
              <p>No permission changes found</p>
            </div>

            <!-- Audit Table -->
            <div v-else class="border rounded-lg overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Timestamp</TableHead>
                    <TableHead>Account</TableHead>
                    <TableHead>Action</TableHead>
                    <TableHead>Target Account</TableHead>
                    <TableHead>Details</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  <TableRow v-for="entry in auditEntries" :key="entry.id">
                    <TableCell class="font-mono text-xs">
                      {{ formatAuditTimestamp(entry.changed_at) }}
                    </TableCell>
                    <TableCell class="font-medium">
                      {{ entry.changed_by }}
                    </TableCell>
                    <TableCell>
                      <Badge :variant="getAuditActionVariant(entry.change_type)">
                        {{ formatAuditAction(entry.change_type) }}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {{ entry.target_key || '-' }}
                    </TableCell>
                    <TableCell class="text-sm text-muted-foreground">
                      {{ entry.notes || entry.new_value || '-' }}
                    </TableCell>
                  </TableRow>
                </TableBody>
              </Table>

              <!-- Pagination -->
              <div v-if="auditPagination && auditPagination.pages > 1" class="flex justify-center items-center gap-1 p-4 border-t">
                <Button
                  variant="outline"
                  size="sm"
                  @click="fetchAuditLog(1)"
                  :disabled="auditPagination.page === 1"
                >
                  First
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  @click="fetchAuditLog(auditPagination.page - 1)"
                  :disabled="auditPagination.page === 1"
                >
                  Prev
                </Button>

                <span class="px-3 text-sm text-muted-foreground">
                  Page {{ auditPagination.page }} of {{ auditPagination.pages }}
                </span>

                <Button
                  variant="outline"
                  size="sm"
                  @click="fetchAuditLog(auditPagination.page + 1)"
                  :disabled="auditPagination.page === auditPagination.pages"
                >
                  Next
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  @click="fetchAuditLog(auditPagination.pages)"
                  :disabled="auditPagination.page === auditPagination.pages"
                >
                  Last
                </Button>
              </div>
            </div>
          </div>
        </Card>
      </TabsContent>
    </Tabs>

    <!-- Role Edit Dialog -->
    <RoleEditDialog
      v-model:open="roleDialogOpen"
      :role="editingRole"
      :permissions="permissions || []"
      @saved="handleRoleSaved"
    />

    <!-- Assign Role Dialog -->
    <AccountPermissionsDialog
      v-model:open="assignDialogOpen"
      :account-name="selectedAccount"
      :type="'role'"
      :available-items="availableRoles"
      @assigned="handleRoleAssigned"
    />

    <!-- Grant Permission Dialog -->
    <AccountPermissionsDialog
      v-model:open="grantDialogOpen"
      :account-name="selectedAccount"
      :type="'permission'"
      :available-items="availablePermissions"
      @assigned="handlePermissionGranted"
    />

    <!-- Delete Role Confirmation -->
    <AlertDialog v-model:open="deleteRoleDialogOpen">
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete Role</AlertDialogTitle>
          <AlertDialogDescription>
            Are you sure you want to delete the role "{{ roleToDelete?.name }}"? This action cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction @click="handleDeleteRole" class="bg-destructive hover:bg-destructive/90">
            Delete
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>

    <!-- Revoke Role Confirmation -->
    <AlertDialog v-model:open="revokeRoleDialogOpen">
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Revoke Role</AlertDialogTitle>
          <AlertDialogDescription>
            Are you sure you want to revoke the role "{{ roleToRevoke?.name }}" from account "{{ selectedAccount }}"?
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction @click="handleRevokeRole" class="bg-destructive hover:bg-destructive/90 text-white">
            Revoke Role
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>

    <!-- Revoke Permission Confirmation -->
    <AlertDialog v-model:open="revokePermissionDialogOpen">
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Revoke Permission</AlertDialogTitle>
          <AlertDialogDescription>
            Are you sure you want to revoke the permission "{{ permissionToRevoke?.name }}" from account "{{ selectedAccount }}"?
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction @click="handleRevokePermission" class="bg-destructive hover:bg-destructive/90 text-white">
            Revoke Permission
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, nextTick } from 'vue'
import { useQuery } from '@tanstack/vue-query'
import { useToast } from '@/composables/useToast'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
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
import { Plus, Edit, Trash2, Loader2, X } from 'lucide-vue-next'
import RoleEditDialog from '@/components/admin/RoleEditDialog.vue'
import AccountPermissionsDialog from '@/components/admin/AccountPermissionsDialog.vue'
import {
  usePermissions,
  useRoles,
  useAccountPermissions,
  useDeleteRole,
  useRevokeRole,
  useRevokePermission,
  type Role,
} from '@/composables/useAdminPermissions'
import axios from 'axios'
import { frontendConfiguration } from '@/config/environment'

const API_URL = frontendConfiguration.apiUrl
const { success, error } = useToast()

// Tab state
const activeTab = ref('roles')

// Roles tab
const { data: roles, isLoading: rolesLoading, isError: rolesError } = useRoles()
const { data: permissions } = usePermissions()
const roleDialogOpen = ref(false)
const editingRole = ref<Role | null>(null)
const deleteRoleDialogOpen = ref(false)
const roleToDelete = ref<Role | null>(null)
const deleteRoleMutation = useDeleteRole()

function openCreateRoleDialog() {
  editingRole.value = null
  roleDialogOpen.value = true
}

function openEditRoleDialog(role: Role) {
  editingRole.value = role
  roleDialogOpen.value = true
}

function handleRoleSaved() {
  roleDialogOpen.value = false
  editingRole.value = null
}

function confirmDeleteRole(role: Role) {
  roleToDelete.value = role
  deleteRoleDialogOpen.value = true
}

async function handleDeleteRole() {
  if (!roleToDelete.value) return

  try {
    await deleteRoleMutation.mutateAsync(roleToDelete.value.id)
    success('Role deleted successfully', 'Success')
    deleteRoleDialogOpen.value = false
    roleToDelete.value = null
  } catch (err: any) {
    error(err.response?.data?.error || 'Failed to delete role', 'Error')
  }
}

// Accounts tab
const accountSearchFilter = ref('')
const roleFilter = ref('')
const currentPage = ref(1)
const pageSize = 20
const selectedAccount = ref('')
const showAllAccounts = ref(false)
const assignDialogOpen = ref(false)
const grantDialogOpen = ref(false)
const revokeRoleDialogOpen = ref(false)
const revokePermissionDialogOpen = ref(false)
const roleToRevoke = ref<any>(null)
const permissionToRevoke = ref<any>(null)

// Account permissions cache - populated from batch query
const accountPermissionsCache = ref<Record<string, any>>({})

// Fetch accounts with permissions (returns full data, not just names)
const { data: accountsWithPermissions, isLoading: accountsWithPermissionsLoading } = useQuery({
  queryKey: ['admin', 'accounts', 'with-permissions'],
  queryFn: async () => {
    const response = await axios.get(`${API_URL}/api/admin/accounts`, {
      withCredentials: true,
    })
    // Populate cache from batch response
    const accounts: any[] = response.data
    accounts.forEach((acc) => {
      accountPermissionsCache.value[acc.accountName] = acc
    })
    // Return just account names for compatibility with existing code
    return accounts.map((acc) => acc.accountName) as string[]
  },
  staleTime: 1000 * 60 * 5, // 5 minutes
})

// Fetch ALL accounts when showAllAccounts is enabled
const { data: allAccounts, isLoading: allAccountsLoading } = useQuery({
  queryKey: ['admin', 'accounts', 'all'],
  queryFn: async () => {
    const response = await axios.get(`${API_URL}/api/admin/accounts/search`, {
      params: { query: '', limit: 9999 },
      withCredentials: true,
    })
    return response.data as string[]
  },
  enabled: showAllAccounts,
  staleTime: 1000 * 60 * 5,
})

const accountsLoading = computed(() =>
  showAllAccounts.value ? allAccountsLoading.value : accountsWithPermissionsLoading.value,
)
const displayAccounts = computed(() =>
  showAllAccounts.value ? allAccounts.value : accountsWithPermissions.value,
)

const { data: accountPermissions, refetch: refetchAccountPermissions } =
  useAccountPermissions(selectedAccount)

const revokeRoleMutation = useRevokeRole()
const revokePermissionMutation = useRevokePermission()

// Audit tab
const auditFilters = ref({
  account: '',
  actionType: 'all',
})
const auditEntries = ref<any[]>([])
const auditPagination = ref<any>(null)
const auditLoading = ref(false)
const auditError = ref(false)

// Filter and pagination
const filteredAccounts = computed(() => {
  if (!displayAccounts.value) return []

  let filtered = displayAccounts.value

  // Backend already returns accounts with god level (57+), roles, or permissions
  // No need to filter again when "Show All Accounts" is OFF

  // Search filter
  if (accountSearchFilter.value) {
    const search = accountSearchFilter.value.toLowerCase()
    filtered = filtered.filter((acc) => acc.toLowerCase().includes(search))
  }

  // Role filter - filter accounts that have the selected role
  if (roleFilter.value) {
    const selectedRoleId = Number(roleFilter.value)
    filtered = filtered.filter((acc) => {
      const perms = getAccountPermissionsForDisplay(acc)
      return perms.roles.some((r: { id: number }) => r.id === selectedRoleId)
    })
  }

  // Sort by immortal level (desc) then account name (asc)
  return [...filtered].sort((a, b) => {
    const aPerms = getAccountPermissionsForDisplay(a)
    const bPerms = getAccountPermissionsForDisplay(b)

    const aLevel = aPerms.immortalLevel || 0
    const bLevel = bPerms.immortalLevel || 0

    // Sort by level descending
    if (aLevel !== bLevel) {
      return bLevel - aLevel
    }

    // Sort by account name ascending
    return a.toLowerCase().localeCompare(b.toLowerCase())
  })
})

const totalPages = computed(() => Math.ceil(filteredAccounts.value.length / pageSize))

const paginatedAccounts = computed(() => {
  const start = (currentPage.value - 1) * pageSize
  const end = start + pageSize
  return filteredAccounts.value.slice(start, end)
})

const visiblePages = computed(() => {
  const pages: (number | string)[] = []
  const total = totalPages.value
  const current = currentPage.value

  if (total <= 7) {
    for (let i = 1; i <= total; i++) pages.push(i)
    return pages
  }

  pages.push(1)
  if (current > 3) pages.push('...')

  const start = Math.max(2, current - 1)
  const end = Math.min(total - 1, current + 1)

  for (let i = start; i <= end; i++) pages.push(i)

  if (current < total - 2) pages.push('...')
  pages.push(total)

  return pages
})

// Fetch individual account permissions (used for refresh after changes)
async function fetchAccountPermissions(accountName: string) {
  try {
    const response = await axios.get(`${API_URL}/api/admin/accounts/${accountName}/permissions`, {
      withCredentials: true,
    })
    const data = response.data

    // Transform snake_case to camelCase for consistency
    const transformed = {
      accountName: data.accountName,
      godLevel: data.godLevel,
      immortalLevel: data.immortalLevel,
      effectivePermissions: data.effectivePermissions || [],
      roles: (data.roles || []).map((role: any) => ({
        id: role.id,
        name: role.role_name || role.name,
        description: role.description,
        grantedAt: role.granted_at,
        grantedBy: role.granted_by,
      })),
      individualPermissions: (data.individualPermissions || []).map((perm: any) => ({
        id: perm.id,
        name: perm.permission_name || perm.name,
        key: perm.permission_key || perm.key,
        grantedAt: perm.granted_at,
        grantedBy: perm.granted_by,
      })),
    }

    accountPermissionsCache.value[accountName] = transformed
    return transformed
  } catch (error) {
    console.error(`Failed to fetch permissions for ${accountName}:`, error)
    return {
      roles: [],
      individualPermissions: [],
      effectivePermissions: [],
      godLevel: null,
      immortalLevel: null,
    }
  }
}

// Helper to get cached permissions for display
function getAccountPermissionsForDisplay(accountName: string) {
  return (
    accountPermissionsCache.value[accountName] || {
      roles: [],
      individualPermissions: [],
      effectivePermissions: [],
      godLevel: null,
      immortalLevel: null,
    }
  )
}

// Format god level for display
function formatGodLevel(godLevel: string, immortalLevel: number | null): string {
  const levelMap: Record<string, string> = {
    overlord: 'Overlord',
    forger: 'Forger',
    greater_god: 'Greater God',
    lesser_god: 'Lesser God',
    immortal: 'Immortal',
    avatar: 'Avatar',
    player: 'Player',
  }

  const baseName = levelMap[godLevel] || godLevel
  if (immortalLevel && immortalLevel > 0) {
    return `${baseName} (${immortalLevel})`
  }
  return baseName
}

// Get badge variant based on god level
function getGodLevelVariant(godLevel: string): 'default' | 'secondary' | 'destructive' | 'outline' {
  switch (godLevel) {
    case 'overlord':
      return 'destructive'
    case 'forger':
    case 'greater_god':
      return 'default'
    case 'lesser_god':
    case 'immortal':
      return 'secondary'
    default:
      return 'outline'
  }
}

// When "Show All Accounts" is ON, don't fetch individual permissions
// Most accounts have no permissions - just show names and allow assigning roles

function openAssignRoleForAccount(account: string) {
  selectedAccount.value = account
  loadAccountPermissions()
  assignDialogOpen.value = true
}

function openGrantPermissionForAccount(account: string) {
  selectedAccount.value = account
  loadAccountPermissions()
  grantDialogOpen.value = true
}

function loadAccountPermissions() {
  if (selectedAccount.value) {
    refetchAccountPermissions()
  }
}

const availableRoles = computed(() => {
  if (!roles.value || !accountPermissions.value) return []
  const assignedRoleIds = new Set(accountPermissions.value.roles.map((r) => r.id))
  return roles.value.filter((r) => !assignedRoleIds.has(r.id))
})

const availablePermissions = computed(() => {
  if (!permissions.value || !accountPermissions.value) return []
  const grantedPermissionIds = new Set(
    accountPermissions.value.individualPermissions.map((p) => p.id),
  )
  return permissions.value.filter((p) => !grantedPermissionIds.has(p.id))
})

// Unused but keep for template reference
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const openAssignRoleDialog = () => {
  assignDialogOpen.value = true
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const openGrantPermissionDialog = () => {
  grantDialogOpen.value = true
}

async function handleRoleAssigned() {
  assignDialogOpen.value = false
  // Invalidate cache and force immediate refresh
  if (selectedAccount.value) {
    const account = selectedAccount.value
    delete accountPermissionsCache.value[account]
    // Force immediate refetch to update the UI
    await fetchAccountPermissions(account)
    // Force Vue to re-render by triggering reactivity
    await nextTick()
  }
}

async function handlePermissionGranted() {
  grantDialogOpen.value = false
  // Invalidate cache and force immediate refresh
  if (selectedAccount.value) {
    const account = selectedAccount.value
    delete accountPermissionsCache.value[account]
    // Force immediate refetch to update the UI
    await fetchAccountPermissions(account)
    // Force Vue to re-render by triggering reactivity
    await nextTick()
  }
}

function confirmRevokeRoleForAccount(accountName: string, role: any) {
  selectedAccount.value = accountName
  roleToRevoke.value = role
  revokeRoleDialogOpen.value = true
}

async function handleRevokeRole() {
  if (!roleToRevoke.value || !selectedAccount.value) return

  const accountToUpdate = selectedAccount.value

  try {
    await revokeRoleMutation.mutateAsync({
      accountName: accountToUpdate,
      roleId: roleToRevoke.value.id,
    })
    success('Role revoked successfully', 'Success')
    revokeRoleDialogOpen.value = false
    roleToRevoke.value = null

    // Invalidate cache and force immediate refresh
    delete accountPermissionsCache.value[accountToUpdate]
    await fetchAccountPermissions(accountToUpdate)
    await nextTick()
  } catch (err: any) {
    error(err.response?.data?.error || 'Failed to revoke role', 'Error')
  }
}

function confirmRevokePermissionForAccount(accountName: string, permission: any) {
  selectedAccount.value = accountName
  permissionToRevoke.value = permission
  revokePermissionDialogOpen.value = true
}

async function handleRevokePermission() {
  if (!permissionToRevoke.value || !selectedAccount.value) return

  const accountToUpdate = selectedAccount.value

  try {
    await revokePermissionMutation.mutateAsync({
      accountName: accountToUpdate,
      permissionId: permissionToRevoke.value.id,
    })
    success('Permission revoked successfully', 'Success')
    revokePermissionDialogOpen.value = false
    permissionToRevoke.value = null

    // Invalidate cache and force immediate refresh
    delete accountPermissionsCache.value[accountToUpdate]
    await fetchAccountPermissions(accountToUpdate)
    await nextTick()
  } catch (err: any) {
    error(err.response?.data?.error || 'Failed to revoke permission', 'Error')
  }
}

// Audit tab functions
async function fetchAuditLog(page = 1) {
  auditLoading.value = true
  auditError.value = false

  try {
    const params = new URLSearchParams()
    params.append('page', page.toString())
    params.append('limit', '20')

    // Filter for permission-related actions only
    const permissionActions = [
      'assign_role',
      'revoke_role',
      'grant_permission',
      'revoke_permission',
    ]

    if (auditFilters.value.actionType === 'all') {
      // When "all" is selected, we need to fetch logs for all permission action types
      // The backend supports filtering by changeType, but only one at a time
      // We'll need to send the filter differently or make multiple requests
      // For simplicity, we'll just send a filter that matches permission-related entries
      // by checking if changeType is in our list
      // Actually, let's just fetch all and filter client-side for now
      // Or better - use the backend's changeType filter with just one type when specific
    } else {
      params.append('changeType', auditFilters.value.actionType)
    }

    if (auditFilters.value.account) {
      params.append('changedBy', auditFilters.value.account)
    }

    const response = await axios.get(`${API_URL}/api/admin/forum/audit-log?${params}`, {
      withCredentials: true,
    })

    // Filter for permission-related entries if showing "all"
    let entries = response.data.data
    if (auditFilters.value.actionType === 'all') {
      entries = entries.filter((entry: any) => permissionActions.includes(entry.change_type))
    }

    auditEntries.value = entries
    auditPagination.value = response.data.pagination
  } catch (err: any) {
    console.error('Failed to fetch audit log:', err)
    auditError.value = true
  } finally {
    auditLoading.value = false
  }
}

let auditDebounceTimer: any = null
function debouncedFetchAudit() {
  clearTimeout(auditDebounceTimer)
  auditDebounceTimer = setTimeout(() => {
    fetchAuditLog(1)
  }, 500)
}

function formatAuditTimestamp(timestamp: string) {
  return new Date(timestamp).toLocaleString()
}

function formatAuditAction(actionType: string) {
  const actionMap: Record<string, string> = {
    assign_role: 'Assign Role',
    revoke_role: 'Revoke Role',
    grant_permission: 'Grant Permission',
    revoke_permission: 'Revoke Permission',
  }
  return actionMap[actionType] || actionType
}

function getAuditActionVariant(
  actionType: string,
): 'default' | 'secondary' | 'destructive' | 'outline' {
  switch (actionType) {
    case 'assign_role':
    case 'grant_permission':
      return 'default'
    case 'revoke_role':
    case 'revoke_permission':
      return 'destructive'
    default:
      return 'secondary'
  }
}

// Watch activeTab to fetch audit log when tab is opened
watch(activeTab, (newTab) => {
  if (newTab === 'audit' && auditEntries.value.length === 0) {
    fetchAuditLog()
  }
})
</script>
