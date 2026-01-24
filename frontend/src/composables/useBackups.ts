import { useQuery, useMutation, useQueryClient } from '@tanstack/vue-query'
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { adminApi } from '@/services/api'
import { useWebSocket } from './useWebSocket'
import type { BackupInfo, RestoreRequest, RestoreCategories } from '@/types'

export function useBackups() {
  const queryClient = useQueryClient()
  const { onBackupProgress, offBackupProgress, onRestoreProgress, offRestoreProgress } = useWebSocket()

  // Restore progress state (for UI updates)
  const currentRestore = ref<{ id: number; progress: number; currentStep: string; status: string } | null>(null)

  // Store timeout IDs for cleanup
  let backupCompleteTimeoutId: ReturnType<typeof setTimeout> | null = null
  let restoreCompleteTimeoutId: ReturnType<typeof setTimeout> | null = null

  // Query for backup list
  const {
    data: backupData,
    isLoading,
    error,
    refetch
  } = useQuery({
    queryKey: ['backups'],
    queryFn: async () => {
      const result = await adminApi.getBackupList()
      return result.backups
    },
    staleTime: 30000, // 30 seconds
  })

  // Mutation for creating backup
  const createBackupMutation = useMutation({
    mutationFn: async () => {
      return await adminApi.createBackup()
    },
    onSuccess: () => {
      // Invalidate and refetch backup list
      queryClient.invalidateQueries({ queryKey: ['backups'] })
    },
  })

  // Mutation for deleting backup
  const deleteBackupMutation = useMutation({
    mutationFn: async (id: number) => {
      await adminApi.deleteBackup(id)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['backups'] })
    },
  })

  // Mutation for deleting all failed backups
  const deleteFailedBackupsMutation = useMutation({
    mutationFn: async () => {
      return await adminApi.deleteFailedBackups()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['backups'] })
    },
  })

  // Mutation for creating restore
  const createRestoreMutation = useMutation({
    mutationFn: async (request: RestoreRequest) => {
      return await adminApi.createRestore(request)
    },
    onSuccess: (data) => {
      // Set initial restore state
      currentRestore.value = {
        id: data.id,
        progress: 0,
        currentStep: 'Starting...',
        status: 'pending',
      }
    },
  })

  // Mutation for uploading backup
  const uploadBackupMutation = useMutation({
    mutationFn: async (file: File) => {
      return await adminApi.uploadBackup(file)
    },
  })

  // Mutation for restoring from upload
  const restoreFromUploadMutation = useMutation({
    mutationFn: async ({
      tempPath,
      ...request
    }: {
      tempPath: string
    } & Omit<RestoreRequest, 'backupId'>) => {
      return await adminApi.createRestoreFromUpload(tempPath, request)
    },
    onSuccess: (data) => {
      // Set initial restore state
      currentRestore.value = {
        id: data.id,
        progress: 0,
        currentStep: 'Starting...',
        status: 'pending',
      }
    },
  })

  // Handle WebSocket backup progress updates
  const handleBackupProgress = (data: {
    id: number
    progress: number
    currentStep: string
    status: string
    filename: string
  }) => {
    // Update the backup in the cache
    queryClient.setQueryData<BackupInfo[]>(['backups'], (oldData) => {
      if (!oldData) return oldData
      return oldData.map((backup) => {
        if (backup.id === data.id) {
          return {
            ...backup,
            progress: data.progress,
            currentStep: data.currentStep,
            status: data.status as BackupInfo['status'],
          }
        }
        return backup
      })
    })

    // If backup completed or failed, refetch to get final data
    if (data.status === 'completed' || data.status === 'failed') {
      // Clear previous timeout if any
      if (backupCompleteTimeoutId) {
        clearTimeout(backupCompleteTimeoutId)
      }
      backupCompleteTimeoutId = setTimeout(() => {
        backupCompleteTimeoutId = null
        queryClient.invalidateQueries({ queryKey: ['backups'] })
      }, 500)
    }
  }

  // Handle WebSocket restore progress updates
  const handleRestoreProgress = (data: {
    id: number
    progress: number
    currentStep: string
    status: string
  }) => {
    // Update the current restore state, or create it if we receive progress for a new restore
    // (this handles race condition where WebSocket message arrives before mutation completes)
    if (currentRestore.value?.id === data.id || !currentRestore.value) {
      currentRestore.value = {
        id: data.id,
        progress: data.progress,
        currentStep: data.currentStep,
        status: data.status,
      }
    }

    // If restore completed or failed, clear after a short delay
    if (data.status === 'completed' || data.status === 'failed') {
      // Clear previous timeout if any
      if (restoreCompleteTimeoutId) {
        clearTimeout(restoreCompleteTimeoutId)
      }
      restoreCompleteTimeoutId = setTimeout(() => {
        restoreCompleteTimeoutId = null
        currentRestore.value = null
      }, 3000)
    }
  }

  onMounted(() => {
    onBackupProgress(handleBackupProgress)
    onRestoreProgress(handleRestoreProgress)
  })

  onUnmounted(() => {
    offBackupProgress(handleBackupProgress)
    offRestoreProgress(handleRestoreProgress)
    // Clear any pending timeouts
    if (backupCompleteTimeoutId) {
      clearTimeout(backupCompleteTimeoutId)
      backupCompleteTimeoutId = null
    }
    if (restoreCompleteTimeoutId) {
      clearTimeout(restoreCompleteTimeoutId)
      restoreCompleteTimeoutId = null
    }
  })

  // Computed properties
  const backups = computed(() => backupData.value || [])
  const hasInProgressBackup = computed(() =>
    backups.value.some((b) => b.status === 'in_progress' || b.status === 'pending')
  )
  const inProgressBackup = computed(() =>
    backups.value.find((b) => b.status === 'in_progress' || b.status === 'pending')
  )

  return {
    backups,
    isLoading,
    error,
    refetch,
    hasInProgressBackup,
    inProgressBackup,
    createBackup: createBackupMutation.mutate,
    isCreating: computed(() => createBackupMutation.isPending.value),
    deleteBackup: deleteBackupMutation.mutate,
    isDeleting: computed(() => deleteBackupMutation.isPending.value),
    deleteFailedBackups: deleteFailedBackupsMutation.mutateAsync,
    isDeletingFailed: computed(() => deleteFailedBackupsMutation.isPending.value),
    getDownloadUrl: adminApi.getBackupDownloadUrl,
    // Restore functionality
    createRestore: createRestoreMutation.mutate,
    isRestoring: computed(() => createRestoreMutation.isPending.value),
    currentRestore,
    getBackupContents: adminApi.getBackupContents,
    getMudRunningStatus: adminApi.getMudRunningStatus,
    // Upload functionality
    uploadBackup: uploadBackupMutation.mutateAsync,
    isUploading: computed(() => uploadBackupMutation.isPending.value),
    uploadError: computed(() => uploadBackupMutation.error.value),
    restoreFromUpload: restoreFromUploadMutation.mutate,
    cancelBackupUpload: adminApi.cancelBackupUpload,
  }
}

// Utility function to format bytes
export function formatBytes(bytes: number | null): string {
  if (bytes === null || bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
}

// Parse MySQL datetime as UTC
function parseMySqlDate(dateStr: string): Date {
  // MySQL returns datetime without timezone, treat as UTC
  return new Date(dateStr.replace(' ', 'T') + 'Z')
}

// Utility function to format date
export function formatBackupDate(dateStr: string): string {
  const date = parseMySqlDate(dateStr)
  return date.toLocaleString()
}

// Utility function for relative time
export function formatRelativeTime(dateStr: string): string {
  const date = parseMySqlDate(dateStr)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffSecs = Math.floor(diffMs / 1000)
  const diffMins = Math.floor(diffSecs / 60)
  const diffHours = Math.floor(diffMins / 60)
  const diffDays = Math.floor(diffHours / 24)

  if (diffDays > 0) return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`
  if (diffHours > 0) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`
  if (diffMins > 0) return `${diffMins} minute${diffMins > 1 ? 's' : ''} ago`
  return 'Just now'
}
