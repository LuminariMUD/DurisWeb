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
import { ScrollArea } from '@/components/ui/scroll-area'
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
import type { BackupInfo, BackupContents, RestoreTarget } from '@/types'

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
const restoreTab = ref('selective')
const backupContents = ref<BackupContents | null>(null)
const loadingContents = ref(false)
const mudRunning = ref(false)
const selectedAccounts = ref<string[]>([])
const selectedCharacters = ref<string[]>([])

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
  selectedAccounts.value = []
  selectedCharacters.value = []
  restoreTab.value = 'selective'

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

// Toggle account selection
function toggleAccount(account: string) {
  const index = selectedAccounts.value.indexOf(account)
  if (index > -1) {
    selectedAccounts.value.splice(index, 1)
  } else {
    selectedAccounts.value.push(account)
  }
}

// Toggle character selection
function toggleCharacter(character: string) {
  const index = selectedCharacters.value.indexOf(character)
  if (index > -1) {
    selectedCharacters.value.splice(index, 1)
  } else {
    selectedCharacters.value.push(character)
  }
}

// Select all accounts (works for both regular restore and upload restore)
function selectAllAccounts() {
  const contents = backupContents.value || uploadedContents.value
  if (!contents) return
  if (selectedAccounts.value.length === contents.accounts.length) {
    selectedAccounts.value = []
  } else {
    selectedAccounts.value = [...contents.accounts]
  }
}

// Select all characters (works for both regular restore and upload restore)
function selectAllCharacters() {
  const contents = backupContents.value || uploadedContents.value
  if (!contents) return
  if (selectedCharacters.value.length === contents.characters.length) {
    selectedCharacters.value = []
  } else {
    selectedCharacters.value = [...contents.characters]
  }
}

// Execute restore
function executeRestore(type: 'full' | 'selective') {
  if (!restoreBackup.value) return

  if (type === 'full') {
    createRestore({
      backupId: restoreBackup.value.id,
      restoreType: 'full',
    })
  } else {
    const targets: RestoreTarget[] = []
    selectedAccounts.value.forEach((name) => {
      targets.push({ type: 'account', name })
    })
    selectedCharacters.value.forEach((name) => {
      targets.push({ type: 'character', name })
    })

    if (targets.length === 0) return

    createRestore({
      backupId: restoreBackup.value.id,
      restoreType: 'selective',
      targets,
    })
  }

  closeRestoreDialog()
}

// Computed: has selection
const hasSelection = () => selectedAccounts.value.length > 0 || selectedCharacters.value.length > 0

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
    restoreTab.value = 'selective'
    selectedAccounts.value = []
    selectedCharacters.value = []
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

function executeUploadRestore(type: 'full' | 'selective') {
  if (!uploadedTempPath.value) return

  if (type === 'full') {
    restoreFromUpload({
      tempPath: uploadedTempPath.value,
      restoreType: 'full',
    })
  } else {
    const targets: RestoreTarget[] = []
    selectedAccounts.value.forEach((name) => {
      targets.push({ type: 'account', name })
    })
    selectedCharacters.value.forEach((name) => {
      targets.push({ type: 'character', name })
    })

    if (targets.length === 0) return

    restoreFromUpload({
      tempPath: uploadedTempPath.value,
      restoreType: 'selective',
      targets,
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
          <li>MySQL database dump (all tables)</li>
          <li>Player files (/Players directory)</li>
          <li>Account files (/Accounts directory)</li>
        </ul>
        <p class="text-xs text-muted-foreground mt-4">
          Backups are automatically cleaned up - manual backups keep last 5, hourly backups keep last
          {{ maxHourlyBackupsOriginal }}.
        </p>

        <div class="border-t mt-6 pt-6">
          <h4 class="font-semibold mb-2">For Developers (Beta MUD Backup)</h4>
          <p class="text-sm text-muted-foreground mb-3">
            To create a compatible backup from your beta MUD for restoration here:
          </p>
          <ol class="text-sm text-muted-foreground space-y-2 list-decimal list-inside">
            <li>
              Create a ZIP file with this structure:
              <pre class="mt-1 ml-4 text-xs bg-background/50 p-2 rounded font-mono">backup.zip/
  database.sql      # MySQL dump
  Accounts/         # Account files
    {letter}/
      {account_name}
  Players/          # Player files
    {letter}/
      {character_name}</pre>
            </li>
            <li>
              Database dump command:
              <code class="ml-1 text-xs bg-background/50 px-1 rounded font-mono"
                >mysqldump -u [user] -p [database] > database.sql</code
              >
            </li>
            <li>Copy the Accounts/ and Players/ directories from your MUD</li>
            <li>
              Create ZIP:
              <code class="ml-1 text-xs bg-background/50 px-1 rounded font-mono"
                >zip -r backup.zip database.sql Accounts/ Players/</code
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
            <TabsList class="grid w-full grid-cols-2">
              <TabsTrigger value="selective">Selective Restore</TabsTrigger>
              <TabsTrigger value="full">Full Restore</TabsTrigger>
            </TabsList>

            <TabsContent value="selective" class="mt-4">
              <div class="grid grid-cols-2 gap-4">
                <!-- Accounts Column -->
                <div class="border rounded-lg p-4">
                  <div class="flex items-center justify-between mb-3">
                    <div class="flex items-center gap-2 font-semibold">
                      <User class="h-4 w-4" />
                      Accounts ({{ backupContents.accounts.length }})
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      @click="selectAllAccounts"
                      v-if="backupContents.accounts.length > 0"
                    >
                      {{
                        selectedAccounts.length === backupContents.accounts.length
                          ? 'Deselect All'
                          : 'Select All'
                      }}
                    </Button>
                  </div>
                  <ScrollArea class="h-[200px]">
                    <div
                      v-if="backupContents.accounts.length === 0"
                      class="text-sm text-muted-foreground text-center py-4"
                    >
                      No accounts in backup
                    </div>
                    <div v-else class="space-y-2">
                      <div
                        v-for="account in backupContents.accounts"
                        :key="account"
                        class="flex items-center space-x-2"
                      >
                        <Checkbox
                          :id="`account-${account}`"
                          :model-value="selectedAccounts.includes(account)"
                          @update:model-value="() => toggleAccount(account)"
                        />
                        <Label :for="`account-${account}`" class="text-sm cursor-pointer">
                          {{ account }}
                        </Label>
                      </div>
                    </div>
                  </ScrollArea>
                </div>

                <!-- Characters Column -->
                <div class="border rounded-lg p-4">
                  <div class="flex items-center justify-between mb-3">
                    <div class="flex items-center gap-2 font-semibold">
                      <Users class="h-4 w-4" />
                      Characters ({{ backupContents.characters.length }})
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      @click="selectAllCharacters"
                      v-if="backupContents.characters.length > 0"
                    >
                      {{
                        selectedCharacters.length === backupContents.characters.length
                          ? 'Deselect All'
                          : 'Select All'
                      }}
                    </Button>
                  </div>
                  <ScrollArea class="h-[200px]">
                    <div
                      v-if="backupContents.characters.length === 0"
                      class="text-sm text-muted-foreground text-center py-4"
                    >
                      No characters in backup
                    </div>
                    <div v-else class="space-y-2">
                      <div
                        v-for="character in backupContents.characters"
                        :key="character"
                        class="flex items-center space-x-2"
                      >
                        <Checkbox
                          :id="`char-${character}`"
                          :model-value="selectedCharacters.includes(character)"
                          @update:model-value="() => toggleCharacter(character)"
                        />
                        <Label :for="`char-${character}`" class="text-sm cursor-pointer">
                          {{ character }}
                        </Label>
                      </div>
                    </div>
                  </ScrollArea>
                </div>
              </div>

              <div class="mt-4 text-sm text-muted-foreground">
                Selected: {{ selectedAccounts.length }} account(s), {{ selectedCharacters.length }}
                character(s)
              </div>
            </TabsContent>

            <TabsContent value="full" class="mt-4">
              <Alert variant="destructive">
                <AlertTriangle class="h-4 w-4" />
                <AlertTitle>Warning: Full Restore</AlertTitle>
                <AlertDescription>
                  This will restore ALL accounts and player files from this backup, overwriting any
                  current data. This action is potentially destructive.
                </AlertDescription>
              </Alert>
              <div class="mt-4 text-sm text-muted-foreground">
                This backup contains {{ backupContents.accounts.length }} accounts and
                {{ backupContents.characters.length }} characters.
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
            v-if="restoreTab === 'selective'"
            @click="executeRestore('selective')"
            :disabled="!hasSelection() || isRestoring"
          >
            <RotateCcw class="h-4 w-4 mr-2" />
            Restore Selected
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
                  Are you absolutely sure? This will overwrite all current account and player files
                  with data from this backup. This action cannot be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  class="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  @click="executeRestore('full')"
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
            <TabsList class="grid w-full grid-cols-2">
              <TabsTrigger value="selective">Selective Restore</TabsTrigger>
              <TabsTrigger value="full">Full Restore</TabsTrigger>
            </TabsList>

            <TabsContent value="selective" class="mt-4">
              <div class="grid grid-cols-2 gap-4">
                <!-- Accounts Column -->
                <div class="border rounded-lg p-4">
                  <div class="flex items-center justify-between mb-3">
                    <div class="flex items-center gap-2 font-semibold">
                      <User class="h-4 w-4" />
                      Accounts ({{ uploadedContents.accounts.length }})
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      @click="selectAllAccounts"
                      v-if="uploadedContents.accounts.length > 0"
                    >
                      {{
                        selectedAccounts.length === uploadedContents.accounts.length
                          ? 'Deselect All'
                          : 'Select All'
                      }}
                    </Button>
                  </div>
                  <ScrollArea class="h-[200px]">
                    <div
                      v-if="uploadedContents.accounts.length === 0"
                      class="text-sm text-muted-foreground text-center py-4"
                    >
                      No accounts in backup
                    </div>
                    <div v-else class="space-y-2">
                      <div
                        v-for="account in uploadedContents.accounts"
                        :key="account"
                        class="flex items-center space-x-2"
                      >
                        <Checkbox
                          :id="`upload-account-${account}`"
                          :model-value="selectedAccounts.includes(account)"
                          @update:model-value="() => toggleAccount(account)"
                        />
                        <Label :for="`upload-account-${account}`" class="text-sm cursor-pointer">
                          {{ account }}
                        </Label>
                      </div>
                    </div>
                  </ScrollArea>
                </div>

                <!-- Characters Column -->
                <div class="border rounded-lg p-4">
                  <div class="flex items-center justify-between mb-3">
                    <div class="flex items-center gap-2 font-semibold">
                      <Users class="h-4 w-4" />
                      Characters ({{ uploadedContents.characters.length }})
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      @click="selectAllCharacters"
                      v-if="uploadedContents.characters.length > 0"
                    >
                      {{
                        selectedCharacters.length === uploadedContents.characters.length
                          ? 'Deselect All'
                          : 'Select All'
                      }}
                    </Button>
                  </div>
                  <ScrollArea class="h-[200px]">
                    <div
                      v-if="uploadedContents.characters.length === 0"
                      class="text-sm text-muted-foreground text-center py-4"
                    >
                      No characters in backup
                    </div>
                    <div v-else class="space-y-2">
                      <div
                        v-for="character in uploadedContents.characters"
                        :key="character"
                        class="flex items-center space-x-2"
                      >
                        <Checkbox
                          :id="`upload-char-${character}`"
                          :model-value="selectedCharacters.includes(character)"
                          @update:model-value="() => toggleCharacter(character)"
                        />
                        <Label :for="`upload-char-${character}`" class="text-sm cursor-pointer">
                          {{ character }}
                        </Label>
                      </div>
                    </div>
                  </ScrollArea>
                </div>
              </div>

              <div class="mt-4 text-sm text-muted-foreground">
                Selected: {{ selectedAccounts.length }} account(s), {{ selectedCharacters.length }}
                character(s)
              </div>
            </TabsContent>

            <TabsContent value="full" class="mt-4">
              <Alert variant="destructive">
                <AlertTriangle class="h-4 w-4" />
                <AlertTitle>Warning: Full Restore</AlertTitle>
                <AlertDescription>
                  This will restore ALL accounts and player files from this backup, overwriting any
                  current data. This action is potentially destructive.
                </AlertDescription>
              </Alert>
              <div class="mt-4 text-sm text-muted-foreground">
                This backup contains {{ uploadedContents.accounts.length }} accounts and
                {{ uploadedContents.characters.length }} characters.
              </div>
            </TabsContent>
          </Tabs>
        </template>

        <DialogFooter>
          <Button variant="outline" @click="closeUploadDialog">Cancel</Button>
          <Button
            v-if="restoreTab === 'selective'"
            @click="executeUploadRestore('selective')"
            :disabled="!hasSelection() || isRestoring"
          >
            <RotateCcw class="h-4 w-4 mr-2" />
            Restore Selected
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
                  Are you absolutely sure? This will overwrite all current account and player files
                  with data from this uploaded backup. This action cannot be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  class="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  @click="executeUploadRestore('full')"
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
