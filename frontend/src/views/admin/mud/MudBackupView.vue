<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { useBackups, formatBytes, formatRelativeTime } from '@/composables/useBackups'
import { useToast } from '@/composables/useToast'
import { useAuth } from '@/composables/useAuth'
import { adminApi } from '@/services/api'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Progress } from '@/components/ui/progress'
import { Input } from '@/components/ui/input'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  HardDrive,
  Download,
  Trash2,
  Plus,
  RefreshCw,
  AlertCircle,
  CheckCircle,
  Clock,
  Loader2,
  RotateCcw,
  AlertTriangle,
  User,
  Users,
  Upload,
  Settings,
  Save,
} from 'lucide-vue-next'
import type { BackupInfo, BackupContents, RestoreCategories } from '@/types'
import { DEFAULT_RESTORE_CATEGORIES } from '@/types'
import { MultiSelect } from '@/components/ui/multi-select'

const {
  backups,
  isLoading,
  error,
  refetch,
  hasInProgressBackup,
  inProgressBackup,
  createBackup,
  isCreating,
  deleteBackup,
  deleteFailedBackups,
  isDeletingFailed,
  getDownloadUrl,
  createRestore,
  isRestoring,
  currentRestore,
  getBackupContents,
  getMudRunningStatus,
  uploadBackup,
  isUploading,
  restoreFromUpload,
  cancelBackupUpload,
} = useBackups()

const { isOverlord } = useAuth()
const { success, error: showError, info } = useToast()

// Restore dialog state
const restoreDialogOpen = ref(false)
const restoreBackup = ref<BackupInfo | null>(null)
const restoreTab = ref<'full' | 'account' | 'character'>('character')
const backupContents = ref<BackupContents | null>(null)
const loadingContents = ref(false)
const mudRunning = ref(false)
const selectedAccountNames = ref<string[]>([])
const selectedCharacterPids = ref<number[]>([])
const restoreCategories = ref<RestoreCategories>({ ...DEFAULT_RESTORE_CATEGORIES })

// Computed options for MultiSelect
const accountOptions = computed(() => {
  const contents = backupContents.value || uploadedContents.value
  if (!contents) return []
  return contents.accounts.map(name => ({ value: name, label: name }))
})

const characterOptions = computed(() => {
  const contents = backupContents.value || uploadedContents.value
  if (!contents) return []
  return contents.characters.map(c => ({ value: c.pid, label: c.name }))
})

// Convert selected pids back to character objects for API
const selectedCharacters = computed(() => {
  const contents = backupContents.value || uploadedContents.value
  if (!contents) return []
  return contents.characters.filter(c => selectedCharacterPids.value.includes(c.pid))
})

// Upload state
const uploadDialogOpen = ref(false)
const uploadedTempPath = ref<string | null>(null)
const uploadedContents = ref<BackupContents | null>(null)
const fileInputRef = ref<HTMLInputElement | null>(null)
const uploadError = ref<string | null>(null)

// Settings state
const maxHourlyBackups = ref(24)
const maxHourlyBackupsOriginal = ref(24)
const savingSettings = ref(false)
const settingsError = ref<string | null>(null)

// Load settings on mount
onMounted(async () => {
  try {
    const settings = await adminApi.getWebSettings()
    const setting = settings.find((s) => s.setting_key === 'max_hourly_backups')
    if (setting) {
      maxHourlyBackups.value = parseInt(setting.setting_value, 10) || 24
      maxHourlyBackupsOriginal.value = maxHourlyBackups.value
    }
  } catch (err) {
    console.error('Failed to load backup settings:', err)
  }
})

// Save settings
async function saveSettings() {
  savingSettings.value = true
  settingsError.value = null
  try {
    await adminApi.updateWebSetting('max_hourly_backups', String(maxHourlyBackups.value))
    maxHourlyBackupsOriginal.value = maxHourlyBackups.value
    success('Backup settings saved')
  } catch (err: any) {
    const errorMsg = err.response?.data?.error || err.message || 'Failed to save settings'
    settingsError.value = errorMsg
    showError(errorMsg)
  } finally {
    savingSettings.value = false
  }
}

// Refresh handler
async function handleRefresh() {
  try {
    await refetch()
    success('Backup list updated')
  } catch (err: any) {
    showError(err.message || 'Failed to refresh backup list')
  }
}

// Create backup handler
async function handleCreateBackup() {
  try {
    await createBackup()
    info('Backup started')
  } catch (err: any) {
    showError(err.message || 'Failed to start backup')
  }
}

// Delete backup handler
async function handleDeleteBackup(id: number) {
  try {
    await deleteBackup(id)
    success('Backup deleted')
  } catch (err: any) {
    showError(err.message || 'Failed to delete backup')
  }
}

// Count of failed backups
const failedBackupsCount = computed(() =>
  backups.value.filter((b) => b.status === 'failed').length
)

// Delete all failed backups handler
async function handleDeleteFailedBackups() {
  try {
    const result = await deleteFailedBackups()
    success(`Deleted ${result.deletedCount} failed backup(s)`)
  } catch (err: any) {
    showError(err.message || 'Failed to delete failed backups')
  }
}

// Status badge variant
function getStatusVariant(status: string): 'default' | 'secondary' | 'destructive' | 'outline' {
  switch (status) {
    case 'completed':
      return 'default'
    case 'in_progress':
    case 'pending':
      return 'secondary'
    case 'failed':
      return 'destructive'
    default:
      return 'outline'
  }
}

// Status badge color class
function getStatusClass(status: string): string {
  switch (status) {
    case 'completed':
      return 'bg-green-500 hover:bg-green-600'
    case 'in_progress':
      return 'bg-blue-500 hover:bg-blue-600'
    case 'pending':
      return 'bg-yellow-500 hover:bg-yellow-600'
    case 'failed':
      return 'bg-red-500 hover:bg-red-600'
    default:
      return ''
  }
}

// Backup type badge
function getBackupTypeBadge(backupType: string): { class: string; label: string } {
  if (backupType === 'hourly') {
    return { class: 'bg-purple-500/20 text-purple-600 border-purple-500/50', label: 'Auto' }
  }
  return { class: 'bg-blue-500/20 text-blue-600 border-blue-500/50', label: 'Manual' }
}

// Handle download
function handleDownload(id: number) {
  const url = getDownloadUrl(id)
  window.open(url, '_blank')
}

// Open restore dialog
async function openRestoreDialog(backup: BackupInfo) {
  restoreBackup.value = backup
  restoreDialogOpen.value = true
  loadingContents.value = true
  selectedAccountNames.value = []
  selectedCharacterPids.value = []
  restoreTab.value = 'character'
  restoreCategories.value = { ...DEFAULT_RESTORE_CATEGORIES }

  try {
    // Load backup contents and MUD status in parallel
    const [contents, mudStatus] = await Promise.all([
      getBackupContents(backup.id),
      getMudRunningStatus(),
    ])
    backupContents.value = contents
    mudRunning.value = mudStatus.running
  } catch (err) {
    console.error('Failed to load backup contents:', err)
    backupContents.value = null
  } finally {
    loadingContents.value = false
  }
}

// Close restore dialog
function closeRestoreDialog() {
  restoreDialogOpen.value = false
  restoreBackup.value = null
  backupContents.value = null
}

// Execute restore
function executeRestore() {
  if (!restoreBackup.value) return

  if (restoreTab.value === 'full') {
    createRestore({
      backupId: restoreBackup.value.id,
      restoreType: 'full',
    })
  } else if (restoreTab.value === 'account') {
    if (selectedAccountNames.value.length === 0) return
    createRestore({
      backupId: restoreBackup.value.id,
      restoreType: 'account',
      accounts: selectedAccountNames.value,
    })
  } else {
    if (selectedCharacters.value.length === 0) return
    createRestore({
      backupId: restoreBackup.value.id,
      restoreType: 'character',
      characters: selectedCharacters.value,
      categories: restoreCategories.value,
    })
  }

  closeRestoreDialog()
}

// Upload handlers
function triggerFileInput() {
  fileInputRef.value?.click()
}

async function handleFileSelect(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return

  // Reset state
  uploadError.value = null
  uploadedTempPath.value = null
  uploadedContents.value = null

  try {
    const result = await uploadBackup(file)
    uploadedTempPath.value = result.tempPath
    uploadedContents.value = result.contents

    // Check MUD status
    const mudStatus = await getMudRunningStatus()
    mudRunning.value = mudStatus.running

    // Open dialog with restore options
    uploadDialogOpen.value = true
    restoreTab.value = 'character'
    selectedAccountNames.value = []
    selectedCharacterPids.value = []
    restoreCategories.value = { ...DEFAULT_RESTORE_CATEGORIES }
    success('Backup uploaded successfully')
  } catch (err: any) {
    const errorMsg = err.response?.data?.error || err.message || 'Failed to upload backup'
    uploadError.value = errorMsg
    showError(errorMsg)
  }

  // Reset file input
  input.value = ''
}

function closeUploadDialog() {
  // Cleanup temp file if user cancels
  if (uploadedTempPath.value) {
    cancelBackupUpload(uploadedTempPath.value).catch(() => {})
  }
  uploadDialogOpen.value = false
  uploadedTempPath.value = null
  uploadedContents.value = null
  uploadError.value = null
}

function executeUploadRestore() {
  if (!uploadedTempPath.value) return

  if (restoreTab.value === 'full') {
    restoreFromUpload({
      tempPath: uploadedTempPath.value,
      restoreType: 'full',
    })
  } else if (restoreTab.value === 'account') {
    if (selectedAccountNames.value.length === 0) return
    restoreFromUpload({
      tempPath: uploadedTempPath.value,
      restoreType: 'account',
      accounts: selectedAccountNames.value,
    })
  } else {
    if (selectedCharacters.value.length === 0) return
    restoreFromUpload({
      tempPath: uploadedTempPath.value,
      restoreType: 'character',
      characters: selectedCharacters.value,
      categories: restoreCategories.value,
    })
  }

  // Don't cleanup temp file here - the backend will do it after restore
  uploadDialogOpen.value = false
  uploadedTempPath.value = null
  uploadedContents.value = null
}
</script>

<template>
  <div>
    <!-- Header -->
    <div class="flex items-center justify-between mb-6">
      <div>
        <div class="flex items-center gap-2">
          <HardDrive class="h-8 w-8" />
          <h1 class="text-3xl font-bold">MUD Backups</h1>
        </div>
        <p class="text-muted-foreground mt-1">Backup database, player files, and accounts</p>
      </div>
      <div class="flex gap-2">
        <Button variant="outline" @click="handleRefresh" :disabled="isLoading">
          <RefreshCw class="h-4 w-4 mr-2" :class="{ 'animate-spin': isLoading }" />
          Refresh
        </Button>
        <Button
          v-if="isOverlord && failedBackupsCount > 0"
          variant="outline"
          class="text-destructive hover:text-destructive"
          @click="handleDeleteFailedBackups"
          :disabled="isDeletingFailed"
        >
          <Trash2 class="h-4 w-4 mr-2" />
          {{ isDeletingFailed ? 'Clearing...' : `Clear Failed (${failedBackupsCount})` }}
        </Button>
        <Button variant="outline" @click="triggerFileInput" :disabled="isUploading || !!currentRestore">
          <Upload class="h-4 w-4 mr-2" :class="{ 'animate-pulse': isUploading }" />
          {{ isUploading ? 'Uploading...' : 'Upload Backup' }}
        </Button>
        <input
          ref="fileInputRef"
          type="file"
          accept=".zip"
          class="hidden"
          @change="handleFileSelect"
        />
        <Button @click="handleCreateBackup" :disabled="hasInProgressBackup || isCreating">
          <Plus class="h-4 w-4 mr-2" />
          Create Backup
        </Button>
      </div>
    </div>

    <!-- Upload Error Alert -->
    <Alert v-if="uploadError" variant="destructive" class="mb-6">
      <AlertCircle class="h-4 w-4" />
      <AlertTitle>Upload Failed</AlertTitle>
      <AlertDescription>{{ uploadError }}</AlertDescription>
    </Alert>

    <!-- In Progress Alert (Backup) -->
    <Card v-if="inProgressBackup" class="mb-6 border-blue-500/50 bg-blue-500/5">
      <CardContent class="pt-6">
        <div class="flex items-center gap-4">
          <div class="flex items-center justify-center w-12 h-12 rounded-full bg-blue-500/10">
            <Loader2 class="h-6 w-6 text-blue-500 animate-spin" />
          </div>
          <div class="flex-1">
            <div class="font-semibold text-blue-600 dark:text-blue-400">Backup in progress</div>
            <div class="text-sm text-muted-foreground">
              {{ inProgressBackup.currentStep || 'Starting...' }}
            </div>
            <div class="mt-2">
              <Progress :model-value="inProgressBackup.progress" class="h-2" />
              <div class="text-xs text-muted-foreground mt-1">
                {{ inProgressBackup.progress }}% complete
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>

    <!-- In Progress Alert (Restore) -->
    <Card v-if="currentRestore" class="mb-6 border-purple-500/50 bg-purple-500/5">
      <CardContent class="pt-6">
        <div class="flex items-center gap-4">
          <div class="flex items-center justify-center w-12 h-12 rounded-full bg-purple-500/10">
            <RotateCcw class="h-6 w-6 text-purple-500 animate-spin" />
          </div>
          <div class="flex-1">
            <div class="font-semibold text-purple-600 dark:text-purple-400">Restore in progress</div>
            <div class="text-sm text-muted-foreground">
              {{ currentRestore.currentStep || 'Starting...' }}
            </div>
            <div class="mt-2">
              <Progress :model-value="currentRestore.progress" class="h-2" />
              <div class="text-xs text-muted-foreground mt-1">
                {{ currentRestore.progress }}% complete
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>

    <!-- Loading State -->
    <div v-if="isLoading && backups.length === 0" class="space-y-4">
      <Skeleton class="h-12 w-full" />
      <Skeleton class="h-12 w-full" />
      <Skeleton class="h-12 w-full" />
    </div>

    <!-- Error State -->
    <Card v-else-if="error && backups.length === 0" class="border-destructive">
      <CardContent class="pt-6">
        <div class="flex items-center gap-3 text-destructive">
          <AlertCircle class="h-5 w-5" />
          <p>Failed to load backups: {{ (error as Error).message }}</p>
        </div>
        <Button @click="handleRefresh" class="mt-4">Retry</Button>
      </CardContent>
    </Card>

    <!-- Backups Table -->
    <Card v-else-if="backups.length > 0" :class="{ 'opacity-50': isLoading }">
      <CardHeader>
        <CardTitle>Backup History</CardTitle>
        <CardDescription>
          Last {{ backups.length }} backup{{ backups.length > 1 ? 's' : '' }} (manual: max 5, hourly:
          max {{ maxHourlyBackupsOriginal }})
        </CardDescription>
      </CardHeader>
      <CardContent class="px-6 py-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Filename</TableHead>
              <TableHead class="w-[80px]">Type</TableHead>
              <TableHead class="w-[120px]">Status</TableHead>
              <TableHead class="w-[100px]">Size</TableHead>
              <TableHead class="w-[120px]">Created By</TableHead>
              <TableHead class="w-[150px]">Date</TableHead>
              <TableHead class="w-[150px] text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRow
              v-for="backup in backups"
              :key="backup.id"
              class="hover:bg-transparent"
              :class="{
                'bg-blue-500/5': backup.status === 'in_progress' || backup.status === 'pending',
                'bg-red-500/5': backup.status === 'failed',
              }"
            >
              <TableCell>
                <code class="text-xs font-mono">{{ backup.filename }}</code>
              </TableCell>
              <TableCell>
                <Badge
                  variant="outline"
                  :class="getBackupTypeBadge(backup.backupType || 'manual').class"
                >
                  {{ getBackupTypeBadge(backup.backupType || 'manual').label }}
                </Badge>
              </TableCell>
              <TableCell>
                <div class="flex items-center gap-2">
                  <Badge :variant="getStatusVariant(backup.status)" :class="getStatusClass(backup.status)">
                    <template v-if="backup.status === 'in_progress'">
                      <Loader2 class="h-3 w-3 mr-1 animate-spin" />
                    </template>
                    <template v-else-if="backup.status === 'completed'">
                      <CheckCircle class="h-3 w-3 mr-1" />
                    </template>
                    <template v-else-if="backup.status === 'pending'">
                      <Clock class="h-3 w-3 mr-1" />
                    </template>
                    <template v-else-if="backup.status === 'failed'">
                      <AlertCircle class="h-3 w-3 mr-1" />
                    </template>
                    {{ backup.status }}
                  </Badge>
                  <span v-if="backup.status === 'in_progress'" class="text-xs text-muted-foreground">
                    {{ backup.progress }}%
                  </span>
                </div>
                <div
                  v-if="backup.errorMessage"
                  class="text-xs text-destructive mt-1 max-w-[200px] truncate"
                  :title="backup.errorMessage"
                >
                  {{ backup.errorMessage }}
                </div>
              </TableCell>
              <TableCell class="text-sm">
                {{ backup.fileSize ? formatBytes(backup.fileSize) : '-' }}
              </TableCell>
              <TableCell class="text-sm">
                {{ backup.createdBy }}
              </TableCell>
              <TableCell class="text-sm text-muted-foreground">
                {{ formatRelativeTime(backup.startedAt) }}
              </TableCell>
              <TableCell class="text-right">
                <div class="flex justify-end gap-2">
                  <!-- Restore Button -->
                  <Button
                    v-if="backup.status === 'completed'"
                    variant="outline"
                    size="icon"
                    title="Restore from this backup"
                    @click="openRestoreDialog(backup)"
                    :disabled="!!currentRestore"
                  >
                    <RotateCcw class="h-4 w-4" />
                  </Button>
                  <!-- Download Button -->
                  <Button
                    v-if="backup.status === 'completed'"
                    variant="outline"
                    size="icon"
                    title="Download backup"
                    @click="handleDownload(backup.id)"
                  >
                    <Download class="h-4 w-4" />
                  </Button>
                  <!-- Delete Button -->
                  <AlertDialog v-if="isOverlord">
                    <AlertDialogTrigger as-child>
                      <Button
                        variant="outline"
                        size="icon"
                        title="Delete backup"
                        class="text-destructive hover:text-destructive"
                        :disabled="backup.status === 'in_progress' || backup.status === 'pending'"
                      >
                        <Trash2 class="h-4 w-4" />
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Delete Backup?</AlertDialogTitle>
                        <AlertDialogDescription>
                          Are you sure you want to delete this backup?
                          <br />
                          <code class="text-xs">{{ backup.filename }}</code>
                          <br />
                          This action cannot be undone.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                          class="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                          @click="handleDeleteBackup(backup.id)"
                        >
                          Delete
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </CardContent>
    </Card>

    <!-- Empty State -->
    <Card v-else>
      <CardContent class="pt-6 text-center py-12">
        <HardDrive class="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-50" />
        <p class="text-muted-foreground mb-4">No backups found</p>
        <Button @click="handleCreateBackup" :disabled="isCreating">
          <Plus class="h-4 w-4 mr-2" />
          Create First Backup
        </Button>
      </CardContent>
    </Card>

    <!-- Settings Card -->
    <Card v-if="isOverlord" class="mt-6">
      <CardHeader>
        <CardTitle class="flex items-center gap-2">
          <Settings class="h-5 w-5" />
          Backup Settings
        </CardTitle>
        <CardDescription>Configure automatic backup retention</CardDescription>
      </CardHeader>
      <CardContent>
        <Alert v-if="settingsError" variant="destructive" class="mb-4">
          <AlertCircle class="h-4 w-4" />
          <AlertDescription>{{ settingsError }}</AlertDescription>
        </Alert>
        <div class="flex items-end gap-4">
          <div class="flex-1 max-w-xs">
            <Label for="max-hourly-backups" class="mb-2 block">Max Hourly Backups</Label>
            <Input
              id="max-hourly-backups"
              v-model.number="maxHourlyBackups"
              type="number"
              min="1"
              max="168"
              class="w-full"
            />
            <p class="text-xs text-muted-foreground mt-1">
              Number of hourly backups to keep (1-168, max 1 week)
            </p>
          </div>
          <Button
            @click="saveSettings"
            :disabled="savingSettings || maxHourlyBackups === maxHourlyBackupsOriginal"
          >
            <Save v-if="!savingSettings" class="h-4 w-4 mr-2" />
            <Loader2 v-else class="h-4 w-4 mr-2 animate-spin" />
            {{ savingSettings ? 'Saving...' : 'Save' }}
          </Button>
        </div>
      </CardContent>
    </Card>

    <!-- Info Card -->
    <Card class="mt-6 bg-muted/50">
      <CardContent class="pt-6">
        <h4 class="font-semibold mb-2">Backup Contents</h4>
        <ul class="text-sm text-muted-foreground space-y-1 list-disc list-inside">
          <li>MySQL database dump (player data, accounts, game state)</li>
        </ul>
        <p class="text-xs text-muted-foreground mt-4">
          Backups are automatically cleaned up - manual backups keep last 5, hourly backups keep last
          {{ maxHourlyBackupsOriginal }}.
        </p>

        <div class="border-t mt-6 pt-6">
          <h4 class="font-semibold mb-2">Restore Options</h4>
          <ul class="text-sm text-muted-foreground space-y-1 list-disc list-inside">
            <li><strong>Full Restore:</strong> Restore all game data tables</li>
            <li><strong>Account Restore:</strong> Restore an account and all its characters (for hacked/deleted accounts)</li>
            <li><strong>Character Restore:</strong> Restore specific character data with selectable categories (for player reimbursement)</li>
          </ul>
        </div>

        <div class="border-t mt-6 pt-6">
          <h4 class="font-semibold mb-2">For Developers (Beta MUD Backup)</h4>
          <p class="text-sm text-muted-foreground mb-3">
            To create a compatible backup from your beta MUD for restoration here:
          </p>
          <ol class="text-sm text-muted-foreground space-y-2 list-decimal list-inside">
            <li>
              Create a ZIP file with this structure:
              <pre class="mt-1 ml-4 text-xs bg-background/50 p-2 rounded font-mono">backup.zip/
  database/
    duris.sql       # MySQL dump</pre>
            </li>
            <li>
              Database dump command:
              <code class="ml-1 text-xs bg-background/50 px-1 rounded font-mono"
                >mysqldump -u [user] -p [database] > database/duris.sql</code
              >
            </li>
            <li>
              Create ZIP:
              <code class="ml-1 text-xs bg-background/50 px-1 rounded font-mono"
                >zip -r backup.zip database/</code
              >
            </li>
            <li>Upload using the "Upload Backup" button above</li>
          </ol>
        </div>
      </CardContent>
    </Card>

    <!-- Restore Dialog -->
    <Dialog :open="restoreDialogOpen" @update:open="(val) => !val && closeRestoreDialog()">
      <DialogContent class="max-w-2xl">
        <DialogHeader>
          <DialogTitle class="flex items-center gap-2">
            <RotateCcw class="h-5 w-5" />
            Restore from Backup
          </DialogTitle>
          <DialogDescription>
            <code class="text-xs">{{ restoreBackup?.filename }}</code>
          </DialogDescription>
        </DialogHeader>

        <!-- MUD Running Warning -->
        <Alert v-if="mudRunning" variant="destructive" class="mb-4">
          <AlertTriangle class="h-4 w-4" />
          <AlertTitle>MUD is Running</AlertTitle>
          <AlertDescription>
            The MUD server is currently running. Restoring files while the MUD is active may cause
            data corruption. Consider stopping the MUD first.
          </AlertDescription>
        </Alert>

        <!-- Loading Contents -->
        <div v-if="loadingContents" class="flex items-center justify-center py-8">
          <Loader2 class="h-8 w-8 animate-spin text-muted-foreground" />
        </div>

        <!-- Contents Loaded -->
        <template v-else-if="backupContents">
          <Tabs v-model="restoreTab" class="w-full">
            <TabsList class="grid w-full grid-cols-3">
              <TabsTrigger value="character">Character</TabsTrigger>
              <TabsTrigger value="account">Account</TabsTrigger>
              <TabsTrigger value="full">Full</TabsTrigger>
            </TabsList>

            <!-- Character Restore Tab (with categories) -->
            <TabsContent value="character" class="mt-4">
              <p class="text-sm text-muted-foreground mb-4">
                Restore specific characters with selectable data categories. Use this for player reimbursement.
              </p>

              <div class="space-y-4">
                <!-- Characters Selection -->
                <div>
                  <Label class="text-sm font-semibold mb-2 flex items-center gap-2">
                    <Users class="h-4 w-4" />
                    Characters ({{ backupContents.characters.length }})
                  </Label>
                  <MultiSelect
                    v-model="selectedCharacterPids"
                    :options="characterOptions"
                    placeholder="Search and select characters..."
                    search-placeholder="Type to search characters..."
                    empty-message="No characters found."
                  />
                </div>

                <!-- Categories -->
                <div class="border rounded-lg p-4">
                  <div class="flex items-center gap-2 font-semibold mb-3">
                    <Settings class="h-4 w-4" />
                    Restore Categories
                  </div>
                  <div class="grid grid-cols-2 gap-3">
                    <div class="flex items-center space-x-2">
                      <Checkbox id="cat-inventory" v-model:checked="restoreCategories.inventory" />
                      <Label for="cat-inventory" class="text-sm cursor-pointer">
                        Inventory & Equipment
                      </Label>
                    </div>
                    <div class="flex items-center space-x-2">
                      <Checkbox id="cat-coreData" v-model:checked="restoreCategories.coreData" />
                      <Label for="cat-coreData" class="text-sm cursor-pointer">
                        Core Data (level, stats)
                      </Label>
                    </div>
                    <div class="flex items-center space-x-2">
                      <Checkbox id="cat-skills" v-model:checked="restoreCategories.skills" />
                      <Label for="cat-skills" class="text-sm cursor-pointer">
                        Skills & Spells
                      </Label>
                    </div>
                    <div class="flex items-center space-x-2">
                      <Checkbox id="cat-progression" v-model:checked="restoreCategories.progression" />
                      <Label for="cat-progression" class="text-sm cursor-pointer">
                        Progression (quests, epics)
                      </Label>
                    </div>
                    <div class="flex items-center space-x-2">
                      <Checkbox id="cat-auction" v-model:checked="restoreCategories.auction" />
                      <Label for="cat-auction" class="text-sm cursor-pointer">
                        Auction Pickups
                      </Label>
                    </div>
                    <div class="flex items-center space-x-2">
                      <Checkbox id="cat-guild" v-model:checked="restoreCategories.guild" />
                      <Label for="cat-guild" class="text-sm cursor-pointer">
                        Guild Membership
                      </Label>
                    </div>
                    <div class="flex items-center space-x-2">
                      <Checkbox id="cat-pvpHistory" v-model:checked="restoreCategories.pvpHistory" />
                      <Label for="cat-pvpHistory" class="text-sm cursor-pointer">
                        PvP History
                      </Label>
                    </div>
                    <div class="flex items-center space-x-2">
                      <Checkbox id="cat-misc" v-model:checked="restoreCategories.misc" />
                      <Label for="cat-misc" class="text-sm cursor-pointer">
                        Misc (aliases, mail, pets)
                      </Label>
                    </div>
                  </div>
                </div>
              </div>
            </TabsContent>

            <!-- Account Restore Tab -->
            <TabsContent value="account" class="mt-4">
              <p class="text-sm text-muted-foreground mb-4">
                Restore entire account(s) and all their characters. Use this for hacked/deleted accounts.
              </p>

              <div>
                <Label class="text-sm font-semibold mb-2 flex items-center gap-2">
                  <User class="h-4 w-4" />
                  Accounts ({{ backupContents.accounts.length }})
                </Label>
                <MultiSelect
                  v-model="selectedAccountNames"
                  :options="accountOptions"
                  placeholder="Search and select accounts..."
                  search-placeholder="Type to search accounts..."
                  empty-message="No accounts found."
                />
              </div>
            </TabsContent>

            <!-- Full Restore Tab -->
            <TabsContent value="full" class="mt-4">
              <Alert variant="destructive">
                <AlertTriangle class="h-4 w-4" />
                <AlertTitle>Warning: Full Restore</AlertTitle>
                <AlertDescription>
                  This will restore ALL game data tables from this backup, overwriting any
                  current data. This action is potentially destructive.
                </AlertDescription>
              </Alert>
              <div class="mt-4 p-4 bg-muted rounded-lg">
                <div class="text-sm font-medium mb-2">Backup contains:</div>
                <div class="text-sm text-muted-foreground">
                  • {{ backupContents.accounts.length }} accounts<br>
                  • {{ backupContents.characters.length }} characters
                </div>
              </div>
            </TabsContent>
          </Tabs>
        </template>

        <!-- Error Loading Contents -->
        <div v-else class="text-center py-8 text-muted-foreground">
          Failed to load backup contents
        </div>

        <DialogFooter>
          <Button variant="outline" @click="closeRestoreDialog">Cancel</Button>
          <Button
            v-if="restoreTab === 'character'"
            @click="executeRestore"
            :disabled="selectedCharacterPids.length === 0 || isRestoring"
          >
            <RotateCcw class="h-4 w-4 mr-2" />
            Restore {{ selectedCharacterPids.length }} Character(s)
          </Button>
          <Button
            v-else-if="restoreTab === 'account'"
            @click="executeRestore"
            :disabled="selectedAccountNames.length === 0 || isRestoring"
          >
            <RotateCcw class="h-4 w-4 mr-2" />
            Restore {{ selectedAccountNames.length }} Account(s)
          </Button>
          <AlertDialog v-else>
            <AlertDialogTrigger as-child>
              <Button variant="destructive" :disabled="isRestoring">
                <RotateCcw class="h-4 w-4 mr-2" />
                Full Restore
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Confirm Full Restore</AlertDialogTitle>
                <AlertDialogDescription>
                  Are you absolutely sure? This will overwrite all current game data
                  with data from this backup. This action cannot be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  class="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  @click="executeRestore"
                >
                  Yes, Restore Everything
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <!-- Upload Restore Dialog -->
    <Dialog :open="uploadDialogOpen" @update:open="(val) => !val && closeUploadDialog()">
      <DialogContent class="max-w-2xl">
        <DialogHeader>
          <DialogTitle class="flex items-center gap-2">
            <Upload class="h-5 w-5" />
            Restore from Uploaded Backup
          </DialogTitle>
          <DialogDescription> Uploaded backup file ready for restoration </DialogDescription>
        </DialogHeader>

        <!-- MUD Running Warning -->
        <Alert v-if="mudRunning" variant="destructive" class="mb-4">
          <AlertTriangle class="h-4 w-4" />
          <AlertTitle>MUD is Running</AlertTitle>
          <AlertDescription>
            The MUD server is currently running. Restoring files while the MUD is active may cause
            data corruption. Consider stopping the MUD first.
          </AlertDescription>
        </Alert>

        <!-- Contents -->
        <template v-if="uploadedContents">
          <Tabs v-model="restoreTab" class="w-full">
            <TabsList class="grid w-full grid-cols-3">
              <TabsTrigger value="character">Character</TabsTrigger>
              <TabsTrigger value="account">Account</TabsTrigger>
              <TabsTrigger value="full">Full</TabsTrigger>
            </TabsList>

            <!-- Character Restore Tab (with categories) -->
            <TabsContent value="character" class="mt-4">
              <p class="text-sm text-muted-foreground mb-4">
                Restore specific characters with selectable data categories.
              </p>

              <div class="space-y-4">
                <!-- Characters Selection -->
                <div>
                  <Label class="text-sm font-semibold mb-2 flex items-center gap-2">
                    <Users class="h-4 w-4" />
                    Characters ({{ uploadedContents.characters.length }})
                  </Label>
                  <MultiSelect
                    v-model="selectedCharacterPids"
                    :options="characterOptions"
                    placeholder="Search and select characters..."
                    search-placeholder="Type to search characters..."
                    empty-message="No characters found."
                  />
                </div>

                <!-- Categories -->
                <div class="border rounded-lg p-4">
                  <div class="flex items-center gap-2 font-semibold mb-3">
                    <Settings class="h-4 w-4" />
                    Restore Categories
                  </div>
                  <div class="grid grid-cols-2 gap-3">
                    <div class="flex items-center space-x-2">
                      <Checkbox id="upload-cat-inventory" v-model:checked="restoreCategories.inventory" />
                      <Label for="upload-cat-inventory" class="text-sm cursor-pointer">
                        Inventory & Equipment
                      </Label>
                    </div>
                    <div class="flex items-center space-x-2">
                      <Checkbox id="upload-cat-coreData" v-model:checked="restoreCategories.coreData" />
                      <Label for="upload-cat-coreData" class="text-sm cursor-pointer">
                        Core Data (level, stats)
                      </Label>
                    </div>
                    <div class="flex items-center space-x-2">
                      <Checkbox id="upload-cat-skills" v-model:checked="restoreCategories.skills" />
                      <Label for="upload-cat-skills" class="text-sm cursor-pointer">
                        Skills & Spells
                      </Label>
                    </div>
                    <div class="flex items-center space-x-2">
                      <Checkbox id="upload-cat-progression" v-model:checked="restoreCategories.progression" />
                      <Label for="upload-cat-progression" class="text-sm cursor-pointer">
                        Progression (quests, epics)
                      </Label>
                    </div>
                    <div class="flex items-center space-x-2">
                      <Checkbox id="upload-cat-auction" v-model:checked="restoreCategories.auction" />
                      <Label for="upload-cat-auction" class="text-sm cursor-pointer">
                        Auction Pickups
                      </Label>
                    </div>
                    <div class="flex items-center space-x-2">
                      <Checkbox id="upload-cat-guild" v-model:checked="restoreCategories.guild" />
                      <Label for="upload-cat-guild" class="text-sm cursor-pointer">
                        Guild Membership
                      </Label>
                    </div>
                    <div class="flex items-center space-x-2">
                      <Checkbox id="upload-cat-pvpHistory" v-model:checked="restoreCategories.pvpHistory" />
                      <Label for="upload-cat-pvpHistory" class="text-sm cursor-pointer">
                        PvP History
                      </Label>
                    </div>
                    <div class="flex items-center space-x-2">
                      <Checkbox id="upload-cat-misc" v-model:checked="restoreCategories.misc" />
                      <Label for="upload-cat-misc" class="text-sm cursor-pointer">
                        Misc (aliases, mail, pets)
                      </Label>
                    </div>
                  </div>
                </div>
              </div>
            </TabsContent>

            <!-- Account Restore Tab -->
            <TabsContent value="account" class="mt-4">
              <p class="text-sm text-muted-foreground mb-4">
                Restore entire account(s) and all their characters.
              </p>

              <div>
                <Label class="text-sm font-semibold mb-2 flex items-center gap-2">
                  <User class="h-4 w-4" />
                  Accounts ({{ uploadedContents.accounts.length }})
                </Label>
                <MultiSelect
                  v-model="selectedAccountNames"
                  :options="accountOptions"
                  placeholder="Search and select accounts..."
                  search-placeholder="Type to search accounts..."
                  empty-message="No accounts found."
                />
              </div>
            </TabsContent>

            <!-- Full Restore Tab -->
            <TabsContent value="full" class="mt-4">
              <Alert variant="destructive">
                <AlertTriangle class="h-4 w-4" />
                <AlertTitle>Warning: Full Restore</AlertTitle>
                <AlertDescription>
                  This will restore ALL game data tables from this backup, overwriting any
                  current data. This action is potentially destructive.
                </AlertDescription>
              </Alert>
              <div class="mt-4 p-4 bg-muted rounded-lg">
                <div class="text-sm font-medium mb-2">Backup contains:</div>
                <div class="text-sm text-muted-foreground">
                  • {{ uploadedContents.accounts.length }} accounts<br>
                  • {{ uploadedContents.characters.length }} characters
                </div>
              </div>
            </TabsContent>
          </Tabs>
        </template>

        <DialogFooter>
          <Button variant="outline" @click="closeUploadDialog">Cancel</Button>
          <Button
            v-if="restoreTab === 'character'"
            @click="executeUploadRestore"
            :disabled="selectedCharacterPids.length === 0 || isRestoring"
          >
            <RotateCcw class="h-4 w-4 mr-2" />
            Restore {{ selectedCharacterPids.length }} Character(s)
          </Button>
          <Button
            v-else-if="restoreTab === 'account'"
            @click="executeUploadRestore"
            :disabled="selectedAccountNames.length === 0 || isRestoring"
          >
            <RotateCcw class="h-4 w-4 mr-2" />
            Restore {{ selectedAccountNames.length }} Account(s)
          </Button>
          <AlertDialog v-else>
            <AlertDialogTrigger as-child>
              <Button variant="destructive" :disabled="isRestoring">
                <RotateCcw class="h-4 w-4 mr-2" />
                Full Restore
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Confirm Full Restore</AlertDialogTitle>
                <AlertDialogDescription>
                  Are you absolutely sure? This will overwrite all current game data
                  with data from this uploaded backup. This action cannot be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  class="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  @click="executeUploadRestore"
                >
                  Yes, Restore Everything
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </div>
</template>
