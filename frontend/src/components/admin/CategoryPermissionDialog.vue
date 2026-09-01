<script setup lang="ts">
import { ref, watch } from 'vue'
import { adminApi, forumApi } from '@/services/api'
import type { ForumCategory, CategoryPermissionRule, AddPermissionRequest } from '@/types'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Checkbox } from '@/components/ui/checkbox'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Trash2, Plus, X } from 'lucide-vue-next'
import { ROLE_OPTIONS, getRoleLabel } from '@/utils/roleMapping'
import { parseAnsiToHtml } from '@/utils/ansiParser'

interface Props {
  open: boolean
  category: ForumCategory | null
}

const props = defineProps<Props>()

const emit = defineEmits<{
  'update:open': [value: boolean]
  success: []
}>()

const permissions = ref<CategoryPermissionRule[]>([])
const isLoading = ref(false)
const isLoadingPermissions = ref(false)
const error = ref<string | null>(null)

// Add permission form
const showAddForm = ref(false)
const permissionType = ref<'allow' | 'deny'>('allow')
const targetType = ref<'role' | 'guild' | 'account' | 'character'>('role')
const targetValue = ref('')
const selectedTargets = ref<string[]>([]) // For multiple account/guild selection
const canView = ref(true)
const canPost = ref(true)
const canModerate = ref(false)

// Account search
const accountSearchQuery = ref('')
const accountSearchResults = ref<string[]>([])
const isSearchingAccounts = ref(false)
const showAccountDropdown = ref(false)
let accountSearchTimeout: ReturnType<typeof setTimeout> | null = null

// Guild search
const guildSearchQuery = ref('')
const guildSearchResults = ref<string[]>([])
const isSearchingGuilds = ref(false)
const showGuildDropdown = ref(false)
let guildSearchTimeout: ReturnType<typeof setTimeout> | null = null

// Debounced account search
async function searchAccounts(query: string) {
  if (accountSearchTimeout) {
    clearTimeout(accountSearchTimeout)
  }

  if (!query || query.length < 2) {
    accountSearchResults.value = []
    showAccountDropdown.value = false
    return
  }

  accountSearchTimeout = setTimeout(async () => {
    isSearchingAccounts.value = true
    showAccountDropdown.value = true
    try {
      accountSearchResults.value = await forumApi.searchAccounts(query)
    } catch {
      accountSearchResults.value = []
    } finally {
      isSearchingAccounts.value = false
    }
  }, 300)
}

// Debounced guild search
async function searchGuilds(query: string) {
  if (guildSearchTimeout) {
    clearTimeout(guildSearchTimeout)
  }

  if (!query || query.length < 1) {
    guildSearchResults.value = []
    showGuildDropdown.value = false
    return
  }

  guildSearchTimeout = setTimeout(async () => {
    isSearchingGuilds.value = true
    showGuildDropdown.value = true
    try {
      guildSearchResults.value = await forumApi.searchGuilds(query)
    } catch {
      guildSearchResults.value = []
    } finally {
      isSearchingGuilds.value = false
    }
  }, 300)
}

// Watch search queries
watch(accountSearchQuery, (query) => {
  searchAccounts(query)
})

watch(guildSearchQuery, (query) => {
  searchGuilds(query)
})

// Load permissions
async function loadPermissions() {
  if (!props.category) return

  isLoadingPermissions.value = true
  error.value = null

  try {
    permissions.value = await adminApi.getCategoryACL(props.category.id)
  } catch (err: any) {
    error.value = err.response?.data?.error || 'Failed to load permissions'
  } finally {
    isLoadingPermissions.value = false
  }
}

// Add permission
async function handleAddPermission() {
  if (!props.category) return

  // Check validation
  if (targetType.value === 'role' || targetType.value === 'character') {
    if (!targetValue.value.trim()) {
      error.value = 'Target value is required'
      return
    }
  } else if (targetType.value === 'guild' || targetType.value === 'account') {
    if (selectedTargets.value.length === 0) {
      error.value = 'Please select at least one ' + targetType.value
      return
    }
  }

  isLoading.value = true
  error.value = null

  try {
    // For multiple selections (guild/account), add each one
    if (
      (targetType.value === 'guild' || targetType.value === 'account') &&
      selectedTargets.value.length > 0
    ) {
      for (const target of selectedTargets.value) {
        const request: AddPermissionRequest = {
          permissionType: permissionType.value,
          target: {},
          permissions: {
            canView: canView.value,
            canPost: canPost.value,
            canModerate: canModerate.value,
          },
        }

        if (targetType.value === 'guild') {
          request.target.guildName = target.trim()
        } else if (targetType.value === 'account') {
          request.target.accountName = target.trim()
        }

        await adminApi.addCategoryPermission(props.category.id, request)
      }
    } else {
      // Single target (role/character)
      const request: AddPermissionRequest = {
        permissionType: permissionType.value,
        target: {},
        permissions: {
          canView: canView.value,
          canPost: canPost.value,
          canModerate: canModerate.value,
        },
      }

      if (targetType.value === 'role') {
        request.target.minImmortalLevel = parseInt(targetValue.value)
      } else if (targetType.value === 'character') {
        request.target.characterPid = targetValue.value.trim()
      }

      await adminApi.addCategoryPermission(props.category.id, request)
    }

    // Reload permissions and reset form
    await loadPermissions()
    resetAddForm()
    emit('success')
  } catch (err: any) {
    error.value = err.response?.data?.error || 'Failed to add permission'
  } finally {
    isLoading.value = false
  }
}

// Remove permission
async function handleRemovePermission(permissionId: number) {
  if (!props.category) return
  if (!confirm('Remove this permission rule?')) return

  try {
    await adminApi.removeCategoryPermission(props.category.id, permissionId)
    await loadPermissions()
    emit('success')
  } catch (err: any) {
    error.value = err.response?.data?.error || 'Failed to remove permission'
  }
}

// Reset add form
function resetAddForm() {
  showAddForm.value = false
  permissionType.value = 'allow'
  targetType.value = 'role'
  targetValue.value = ''
  selectedTargets.value = []
  accountSearchQuery.value = ''
  accountSearchResults.value = []
  showAccountDropdown.value = false
  guildSearchQuery.value = ''
  guildSearchResults.value = []
  showGuildDropdown.value = false
  canView.value = true
  canPost.value = true
  canModerate.value = false
  error.value = null
}

// Get target display
function getTargetDisplay(permission: CategoryPermissionRule): string {
  if (permission.min_immortal_level !== null) {
    return `Role: ${getRoleLabel(permission.min_immortal_level)}`
  }
  if (permission.guild_name) {
    return `Guild: ${permission.guild_name}`
  }
  if (permission.account_name) {
    return `Account: ${permission.account_name}`
  }
  if (permission.character_pid) {
    return `Character PID: ${permission.character_pid}`
  }
  return 'Unknown'
}

// Get permissions display
function getPermissionsDisplay(permission: CategoryPermissionRule): string {
  const perms = []
  if (permission.can_view) perms.push('View')
  if (permission.can_post) perms.push('Post')
  if (permission.can_moderate) perms.push('Moderate')
  return perms.length > 0 ? perms.join(', ') : 'None'
}

// Handle cancel
function handleCancel() {
  emit('update:open', false)
  resetAddForm()
}

// Watch for dialog open/close
watch(
  () => props.open,
  (isOpen) => {
    if (isOpen && props.category) {
      loadPermissions()
    } else {
      resetAddForm()
    }
  },
)
</script>

<template>
  <Dialog :open="open" @update:open="(val) => emit('update:open', val)">
    <DialogContent class="sm:max-w-[700px] max-h-[90vh] overflow-y-auto">
      <DialogHeader>
        <DialogTitle>
          Manage Category Permissions
        </DialogTitle>
        <DialogDescription v-if="category">
          Configure ACL (Access Control List) rules for "{{ category.name }}"
        </DialogDescription>
      </DialogHeader>

      <div class="space-y-4 py-4">
        <!-- Existing Permissions List -->
        <div class="space-y-2">
          <div class="flex items-center justify-between">
            <Label class="text-base font-semibold">Current ACL Rules</Label>
            <Button
              v-if="!showAddForm"
              variant="outline"
              size="sm"
              @click="showAddForm = true"
            >
              <Plus class="w-4 h-4 mr-2" />
              Add Rule
            </Button>
          </div>

          <div v-if="isLoadingPermissions" class="space-y-2">
            <Skeleton v-for="i in 3" :key="i" class="h-16 w-full" />
          </div>

          <div v-else-if="permissions.length === 0" class="text-center py-6 text-muted-foreground border rounded-lg">
            No ACL rules configured. Category uses default access type.
          </div>

          <div v-else class="space-y-2">
            <div
              v-for="permission in permissions"
              :key="permission.id"
              class="flex items-center justify-between p-3 border rounded-lg"
            >
              <div class="flex-1 space-y-1">
                <div class="flex items-center gap-2">
                  <Badge :variant="permission.permission_type === 'allow' ? 'default' : 'destructive'">
                    {{ permission.permission_type.toUpperCase() }}
                  </Badge>
                  <span class="font-medium">{{ getTargetDisplay(permission) }}</span>
                </div>
                <div class="text-sm text-muted-foreground">
                  Permissions: {{ getPermissionsDisplay(permission) }}
                </div>
                <div class="text-xs text-muted-foreground">
                  Created by {{ permission.created_by }} on {{ new Date(permission.created_at).toLocaleString() }}
                </div>
              </div>
              <Button
                variant="ghost"
                size="sm"
                @click="handleRemovePermission(permission.id)"
                class="text-destructive hover:text-destructive"
              >
                <Trash2 class="w-4 h-4" />
              </Button>
            </div>
          </div>
        </div>

        <!-- Add Permission Form -->
        <div v-if="showAddForm" class="space-y-4 p-4 border rounded-lg bg-muted/30">
          <div class="flex items-center justify-between">
            <Label class="text-base font-semibold">Add New ACL Rule</Label>
            <Button variant="ghost" size="sm" @click="resetAddForm">
              Cancel
            </Button>
          </div>

          <!-- Permission Type -->
          <div class="space-y-2">
            <Label for="permissionType">Rule Type</Label>
            <Select v-model="permissionType">
              <SelectTrigger id="permissionType">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="allow">Allow</SelectItem>
                <SelectItem value="deny">Deny</SelectItem>
              </SelectContent>
            </Select>
            <p class="text-xs text-muted-foreground">
              DENY rules block access. ALLOW rules grant access. DENY rules are evaluated first.
            </p>
          </div>

          <!-- Target Type -->
          <div class="space-y-2">
            <Label for="targetType">Target Type</Label>
            <Select v-model="targetType">
              <SelectTrigger id="targetType">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="role">Role (Immortal Level)</SelectItem>
                <SelectItem value="guild">Guild</SelectItem>
                <SelectItem value="account">Account Name</SelectItem>
                <SelectItem value="character">Character PID</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <!-- Target Value -->
          <div class="space-y-2">
            <Label for="targetValue">
              {{ targetType === 'role' ? 'Immortal Level' : targetType === 'guild' ? 'Guild Name' : targetType === 'account' ? 'Account Name' : 'Character PID' }}
            </Label>

            <!-- Role select -->
            <Select v-if="targetType === 'role'" v-model="targetValue">
              <SelectTrigger id="targetValue">
                <SelectValue placeholder="Select level" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem
                  v-for="option in ROLE_OPTIONS"
                  :key="option.value"
                  :value="option.value.toString()"
                >
                  {{ option.label }}
                </SelectItem>
              </SelectContent>
            </Select>

            <!-- Account search with dropdown (multiple selection) -->
            <div v-else-if="targetType === 'account'" class="space-y-2">
              <!-- Selected accounts list -->
              <div v-if="selectedTargets.length > 0" class="flex flex-wrap gap-2">
                <Badge
                  v-for="(account, idx) in selectedTargets"
                  :key="idx"
                  variant="secondary"
                  class="flex items-center gap-1"
                >
                  {{ account }}
                  <button
                    type="button"
                    @click="selectedTargets.splice(idx, 1)"
                    class="hover:text-destructive"
                  >
                    <X class="w-3 h-3" />
                  </button>
                </Badge>
              </div>

              <!-- Search input -->
              <div class="relative">
                <Input
                  id="targetValue"
                  v-model="accountSearchQuery"
                  placeholder="Type to search and add accounts..."
                  autocomplete="off"
                  @focus="accountSearchQuery.length >= 2 && (showAccountDropdown = true)"
                />
                <div
                  v-if="showAccountDropdown && accountSearchQuery.length >= 2"
                  class="absolute z-50 mt-1 w-full rounded-md border bg-popover shadow-lg"
                >
                  <div class="max-h-[200px] overflow-y-auto p-1">
                    <div v-if="isSearchingAccounts" class="py-2 px-3 text-sm text-muted-foreground">
                      Searching...
                    </div>
                    <div
                      v-else-if="accountSearchResults.length === 0"
                      class="py-2 px-3 text-sm text-muted-foreground"
                    >
                      No accounts found
                    </div>
                    <button
                      v-for="account in accountSearchResults"
                      :key="account"
                      type="button"
                      class="w-full text-left px-3 py-2 text-sm rounded-sm hover:bg-accent hover:text-accent-foreground cursor-pointer"
                      :class="{ 'opacity-50': selectedTargets.includes(account) }"
                      :disabled="selectedTargets.includes(account)"
                      @click="() => {
                        if (!selectedTargets.includes(account)) {
                          selectedTargets.push(account);
                          accountSearchQuery = '';
                          showAccountDropdown = false;
                        }
                      }"
                    >
                      {{ account }}
                      <span v-if="selectedTargets.includes(account)" class="text-muted-foreground ml-2">(added)</span>
                    </button>
                  </div>
                </div>
              </div>
            </div>

            <!-- Guild search with dropdown (multiple selection) -->
            <div v-else-if="targetType === 'guild'" class="space-y-2">
              <!-- Selected guilds list -->
              <div v-if="selectedTargets.length > 0" class="flex flex-wrap gap-2">
                <Badge
                  v-for="(guild, idx) in selectedTargets"
                  :key="idx"
                  variant="secondary"
                  class="flex items-center gap-1"
                >
                  <span v-html="parseAnsiToHtml(guild)"></span>
                  <button
                    type="button"
                    @click="selectedTargets.splice(idx, 1)"
                    class="hover:text-destructive ml-1"
                  >
                    <X class="w-3 h-3" />
                  </button>
                </Badge>
              </div>

              <!-- Search input -->
              <div class="relative">
                <Input
                  id="targetValue"
                  v-model="guildSearchQuery"
                  placeholder="Type to search and add guilds..."
                  autocomplete="off"
                  @focus="showGuildDropdown = true"
                />
                <div
                  v-if="showGuildDropdown && guildSearchQuery.length >= 1"
                  class="absolute z-50 mt-1 w-full rounded-md border bg-popover shadow-lg"
                >
                  <div class="max-h-[200px] overflow-y-auto p-1">
                    <div v-if="isSearchingGuilds" class="py-2 px-3 text-sm text-muted-foreground">
                      Searching...
                    </div>
                    <div
                      v-else-if="guildSearchResults.length === 0"
                      class="py-2 px-3 text-sm text-muted-foreground"
                    >
                      No guilds found
                    </div>
                    <button
                      v-for="guild in guildSearchResults"
                      :key="guild"
                      type="button"
                      class="w-full text-left px-3 py-2 text-sm rounded-sm hover:bg-accent hover:text-accent-foreground cursor-pointer"
                      :class="{ 'opacity-50': selectedTargets.includes(guild) }"
                      :disabled="selectedTargets.includes(guild)"
                      @click="() => {
                        if (!selectedTargets.includes(guild)) {
                          selectedTargets.push(guild);
                          guildSearchQuery = '';
                          showGuildDropdown = false;
                        }
                      }"
                    >
                      <span v-html="parseAnsiToHtml(guild)"></span>
                      <span v-if="selectedTargets.includes(guild)" class="text-muted-foreground ml-2">(added)</span>
                    </button>
                  </div>
                </div>
              </div>
            </div>

            <!-- Character PID input -->
            <Input
              v-else-if="targetType === 'character'"
              id="targetValue"
              v-model="targetValue"
              placeholder="e.g., 12345"
            />
          </div>

          <!-- Permissions Checkboxes -->
          <div class="space-y-3">
            <Label>Permissions</Label>
            <div class="flex items-center space-x-2">
              <Checkbox id="canView" v-model:checked="canView" />
              <label for="canView" class="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                Can View
              </label>
            </div>
            <div class="flex items-center space-x-2">
              <Checkbox id="canPost" v-model:checked="canPost" />
              <label for="canPost" class="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                Can Post
              </label>
            </div>
            <div class="flex items-center space-x-2">
              <Checkbox id="canModerate" v-model:checked="canModerate" />
              <label for="canModerate" class="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                Can Moderate
              </label>
            </div>
          </div>

          <Button @click="handleAddPermission" :disabled="isLoading" class="w-full">
            {{ isLoading ? 'Adding...' : 'Add Rule' }}
          </Button>
        </div>

        <!-- Error Display -->
        <Alert v-if="error" variant="destructive">
          <AlertDescription>{{ error }}</AlertDescription>
        </Alert>

        <!-- Info Alert -->
        <Alert v-if="category?.access_type !== 'custom_acl'">
          <AlertDescription>
            This category uses "{{ category?.access_type }}" access type. ACL rules will only take effect if the access type is set to "custom_acl".
          </AlertDescription>
        </Alert>
      </div>

      <DialogFooter>
        <Button variant="outline" @click="handleCancel">
          Close
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
