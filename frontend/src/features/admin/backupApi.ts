import { apiClient as api } from '@/services/httpClient'

export const adminBackupApi = {
  // MUD Backup API methods
  /**
   * Get list of all backups
   */
  async getBackupList(signal?: AbortSignal): Promise<{ backups: import('@/types').BackupInfo[] }> {
    const { data } = await api.get('/api/admin/backup/list', { signal })
    return data
  },

  /**
   * Start a new backup
   */
  async createBackup(): Promise<{ success: boolean; id: number; filename: string }> {
    const { data } = await api.post('/api/admin/backup/create')
    return data
  },

  /**
   * Get backup status (fallback polling)
   */
  async getBackupStatus(id: number): Promise<{ backup: import('@/types').BackupInfo }> {
    const { data } = await api.get(`/api/admin/backup/status/${id}`)
    return data
  },

  /**
   * Delete a backup (overlord only)
   */
  async deleteBackup(id: number): Promise<void> {
    await api.delete(`/api/admin/backup/${id}`)
  },

  /**
   * Delete all failed backups (overlord only)
   */
  async deleteFailedBackups(): Promise<{ deletedCount: number }> {
    const { data } = await api.delete('/api/admin/backup/failed')
    return data
  },

  /**
   * Get backup download URL
   */
  getBackupDownloadUrl(id: number): string {
    return `/api/admin/backup/download/${id}`
  },

  /**
   * Get contents of a backup (accounts and characters)
   */
  async getBackupContents(id: number): Promise<import('@/types').BackupContents> {
    const { data } = await api.get(`/api/admin/backup/${id}/contents`)
    return data
  },

  /**
   * Check if MUD is currently running (for restore warning)
   */
  async getMudRunningStatus(): Promise<{ running: boolean }> {
    const { data } = await api.get('/api/admin/backup/mud-status')
    return data
  },

  /**
   * Create a restore operation
   */
  async createRestore(
    request: import('@/types').RestoreRequest,
  ): Promise<{ success: boolean; id: number; message: string }> {
    const { data } = await api.post('/api/admin/backup/restore', request)
    return data
  },

  /**
   * Get restore status
   */
  async getRestoreStatus(id: number): Promise<import('@/types').RestoreInfo> {
    const { data } = await api.get(`/api/admin/restore/status/${id}`)
    return data
  },

  /**
   * Get list of all restore operations
   */
  async getRestoreList(): Promise<import('@/types').RestoreInfo[]> {
    const { data } = await api.get('/api/admin/restore/list')
    return data
  },

  /**
   * Upload a backup file for restoration
   */
  async uploadBackup(file: File): Promise<{
    success: boolean
    tempPath: string
    contents: import('@/types').BackupContents
  }> {
    const formData = new FormData()
    formData.append('backup', file)
    const { data } = await api.post('/api/admin/backup/upload', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    })
    return data
  },

  /**
   * Create a restore from an uploaded backup file
   */
  async createRestoreFromUpload(
    tempPath: string,
    request: Omit<import('@/types').RestoreRequest, 'backupId'>,
  ): Promise<{ success: boolean; id: number; message: string }> {
    const { data } = await api.post('/api/admin/backup/upload/restore', {
      tempPath,
      ...request,
    })
    return data
  },

  /**
   * Cancel a registered upload using its opaque reference
   */
  async cancelBackupUpload(tempPath: string): Promise<{ success: boolean; message: string }> {
    const { data } = await api.delete('/api/admin/backup/upload/cancel', {
      data: { tempPath },
    })
    return data
  },

  async recoverBackupUpload(tempPath: string): Promise<{ success: boolean }> {
    const { data } = await api.post('/api/admin/backup/upload/recover', { tempPath })
    return data
  },
}
