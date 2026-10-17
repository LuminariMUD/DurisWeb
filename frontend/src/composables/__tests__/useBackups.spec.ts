import { defineComponent, nextTick, ref } from 'vue'
import { flushPromises, mount } from '@vue/test-utils'
import { QueryClient, VueQueryPlugin } from '@tanstack/vue-query'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { adminApi } from '@/services/api'
import { useBackups } from '../useBackups'
import type { BackupInfo } from '@/types'

const accountName = ref<string | null>('UploaderAlpha')
vi.mock('../useAuth', () => ({ useAuth: () => ({ accountName }) }))

vi.mock('@/services/api', () => ({
  adminApi: {
    getBackupList: vi.fn(async () => ({ backups: [] })),
    deleteBackup: vi.fn(),
    createBackup: vi.fn(),
    createRestore: vi.fn(),
    createRestoreFromUpload: vi.fn(),
    getBackupDownloadUrl: vi.fn(),
    uploadBackup: vi.fn(),
  },
}))

beforeEach(() => {
  vi.clearAllMocks()
  accountName.value = 'UploaderAlpha'
  vi.mocked(adminApi.getBackupList).mockResolvedValue({ backups: [] })
})

function mountBackups() {
  let backups!: ReturnType<typeof useBackups>
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  const wrapper = mount(
    defineComponent({
      setup() {
        backups = useBackups()
        return { items: backups.backups }
      },
      template: '<div><span v-for="item in items" :key="item.id">{{ item.filename }}</span></div>',
    }),
    { global: { plugins: [[VueQueryPlugin, { queryClient: client }]] } },
  )
  return { backups, client, wrapper }
}
vi.mock('../useWebSocket', () => ({
  useWebSocket: () => ({
    onBackupProgress: vi.fn(),
    offBackupProgress: vi.fn(),
    onRestoreProgress: vi.fn(),
    offRestoreProgress: vi.fn(),
  }),
}))

function retainedUpload(owner: string, id: number): BackupInfo {
  return {
    id,
    filename: owner + '-private-upload.zip',
    createdBy: owner,
    backupType: 'manual',
    status: 'failed',
    progress: 100,
    currentStep: 'Upload needs review',
    fileSize: 10,
    errorMessage: null,
    startedAt: '2026-10-17T12:00:00Z',
    completedAt: null,
  }
}

describe('account-scoped backup lists', () => {
  it('keeps interrupted uploads out of generated-backup busy state', async () => {
    const upload = {
      ...retainedUpload('UploaderAlpha', 1),
      status: 'in_progress' as const,
      uploadReference: '82b972d4-285c-4664-b7e0-c46dfe015c92',
    }
    vi.mocked(adminApi.getBackupList).mockResolvedValueOnce({ backups: [upload] })
    const { backups, client, wrapper } = mountBackups()
    try {
      await flushPromises()
      expect(backups.backups.value).toHaveLength(1)
      expect(backups.hasInProgressBackup.value).toBe(false)
      expect(backups.inProgressBackup.value).toBeUndefined()
      const generated = { ...retainedUpload('UploaderAlpha', 2), status: 'pending' as const }
      vi.mocked(adminApi.getBackupList).mockResolvedValueOnce({ backups: [upload, generated] })
      await backups.refetch()
      expect(backups.hasInProgressBackup.value).toBe(true)
      expect(backups.inProgressBackup.value?.id).toBe(2)
    } finally {
      wrapper.unmount()
      client.clear()
    }
  })
  it('does not show a fresh previous-owner cache entry during logout/login', async () => {
    const alpha = retainedUpload('UploaderAlpha', 1)
    const beta = retainedUpload('UploaderBeta', 2)
    vi.mocked(adminApi.getBackupList).mockResolvedValueOnce({ backups: [alpha] })
    const { backups, client, wrapper } = mountBackups()
    let finish!: (value: { backups: BackupInfo[] }) => void
    try {
      await flushPromises()
      expect(wrapper.text()).toContain(alpha.filename)
      vi.mocked(adminApi.getBackupList).mockReturnValueOnce(
        new Promise((resolve) => {
          finish = resolve
        }),
      )
      accountName.value = null
      await nextTick()
      expect(wrapper.text()).not.toContain(alpha.filename)
      accountName.value = 'UploaderBeta'
      await nextTick()
      expect(backups.backups.value).toEqual([])
      expect(wrapper.text()).not.toContain(alpha.filename)
      finish({ backups: [beta] })
      await flushPromises()
      expect(wrapper.text()).toContain(beta.filename)
      expect(wrapper.text()).not.toContain(alpha.filename)
    } finally {
      finish?.({ backups: [] })
      wrapper.unmount()
      client.clear()
    }
  })
  it('cancels a previous-account response before it can populate a later session', async () => {
    let finish!: (value: { backups: BackupInfo[] }) => void
    let signal: AbortSignal | undefined
    vi.mocked(adminApi.getBackupList).mockImplementationOnce((requestSignal?: AbortSignal) => {
      signal = requestSignal
      return new Promise((resolve) => {
        finish = resolve
      })
    })
    const { backups, client, wrapper } = mountBackups()
    try {
      await flushPromises()
      const beta = retainedUpload('UploaderBeta', 2)
      vi.mocked(adminApi.getBackupList).mockResolvedValueOnce({ backups: [beta] })
      accountName.value = 'UploaderBeta'
      await flushPromises()
      expect(signal?.aborted).toBe(true)
      finish({ backups: [retainedUpload('LateAlpha', 1)] })
      await flushPromises()
      expect(backups.backups.value).toEqual([beta])
      expect(wrapper.text()).not.toContain('LateAlpha')
    } finally {
      finish?.({ backups: [] })
      wrapper.unmount()
      client.clear()
    }
  })
})

describe('durable upload acknowledgement', () => {
  it.each([false, true])('refreshes retained work after upload failure=%s', async (fail) => {
    const { backups, client, wrapper } = mountBackups()
    const invalidate = vi.spyOn(client, 'invalidateQueries')
    const result = {
      success: true,
      tempPath: '82b972d4-285c-4664-b7e0-c46dfe015c92',
      contents: { accounts: [], characters: [] },
    }
    try {
      if (fail) vi.mocked(adminApi.uploadBackup).mockRejectedValueOnce(new Error('Retained upload'))
      else vi.mocked(adminApi.uploadBackup).mockResolvedValueOnce(result)
      const outcome = backups.uploadBackup(new File(['fixture'], 'fixture.zip'))
      const settled = await outcome.catch((error: unknown) => error)
      expect(settled).toEqual(fail ? new Error('Retained upload') : result)
      expect(invalidate).toHaveBeenCalledWith({ queryKey: ['backups'] })
    } finally {
      wrapper.unmount()
      client.clear()
    }
  })
  it('refuses a filesystem path returned as an upload acknowledgement', async () => {
    const { backups, client, wrapper } = mountBackups()
    try {
      vi.mocked(adminApi.uploadBackup).mockResolvedValueOnce({
        success: true,
        tempPath: '/tmp/obsolete-upload.zip',
        contents: { accounts: [], characters: [] },
      })
      await expect(backups.uploadBackup(new File(['fixture'], 'fixture.zip'))).rejects.toThrow(
        'Upload was not confirmed',
      )
    } finally {
      wrapper.unmount()
      client.clear()
    }
  })
})

describe('backup deletion acknowledgement', () => {
  it.each([false, true])(
    'settles the caller only with the actual deletion outcome (failure=%s)',
    async (fail) => {
      let resolve!: () => void
      let reject!: (error: Error) => void
      const pending = new Promise<void>((yes, no) => {
        resolve = yes
        reject = no
      })
      vi.mocked(adminApi.deleteBackup).mockReturnValueOnce(pending)
      const { backups, client, wrapper } = mountBackups()
      const invalidate = vi.spyOn(client, 'invalidateQueries')
      try {
        let settled = false
        const run = backups.deleteBackup(1)
        expect(run).toBeInstanceOf(Promise)
        const outcome = run.then(
          () => {
            settled = true
            return null
          },
          (error: unknown) => {
            settled = true
            return error
          },
        )
        await flushPromises()
        expect(settled).toBe(false)
        expect(backups.isDeleting.value).toBe(true)
        const failure = new Error('Archive removal could not be confirmed')
        if (fail) reject(failure)
        else resolve()
        expect(await outcome).toBe(fail ? failure : null)
        await flushPromises()
        expect(settled).toBe(true)
        expect(backups.isDeleting.value).toBe(false)
        expect(adminApi.deleteBackup).toHaveBeenCalledWith(1)
        expect(invalidate).toHaveBeenCalledWith({ queryKey: ['backups'] })
      } finally {
        wrapper.unmount()
        client.clear()
      }
    },
  )
})

describe('backup and restore start acknowledgement', () => {
  it.each(['lost', 'invalid'])(
    'keeps an uncertain %s backup start pending until list reconciliation finishes',
    async (reply) => {
      const { backups, client, wrapper } = mountBackups()
      let release!: (value: { backups: BackupInfo[] }) => void
      try {
        await flushPromises()
        vi.mocked(adminApi.getBackupList).mockReturnValueOnce(
          new Promise((resolve) => {
            release = resolve
          }),
        )
        if (reply === 'lost')
          vi.mocked(adminApi.createBackup).mockRejectedValueOnce(
            new Error('Synthetic lost response'),
          )
        else
          vi.mocked(adminApi.createBackup).mockResolvedValueOnce({
            success: false,
            id: 0,
            filename: '',
          })
        let settled = false
        const pending = backups
          .createBackup()
          .catch((error: unknown) => error)
          .finally(() => {
            settled = true
          })
        await flushPromises()
        expect(backups.isCreating.value).toBe(true)
        expect(settled).toBe(false)
        release({
          backups: [
            {
              id: 7,
              filename: 'duris-mud-running.zip',
              backupType: 'manual',
              status: 'in_progress',
              progress: 1,
              currentStep: 'Starting',
              fileSize: null,
              errorMessage: null,
              createdBy: 'SyntheticOperator',
              startedAt: '2026-10-17T12:00:00Z',
              completedAt: null,
            },
          ],
        })
        expect(await pending).toBeInstanceOf(Error)
        await flushPromises()
        expect(backups.isCreating.value).toBe(false)
        expect(backups.hasInProgressBackup.value).toBe(true)
      } finally {
        release?.({ backups: [] })
        wrapper.unmount()
        client.clear()
      }
    },
  )
  it('keeps a failed reconciliation visible until a successful explicit refresh', async () => {
    const { backups, client, wrapper } = mountBackups()
    try {
      await flushPromises()
      vi.mocked(adminApi.getBackupList).mockRejectedValueOnce(
        new Error('Synthetic list unavailable'),
      )
      vi.mocked(adminApi.createBackup).mockRejectedValueOnce(new Error('Synthetic lost response'))
      await backups.createBackup().catch(() => {})
      await flushPromises()
      expect(backups.error.value).toBeInstanceOf(Error)
      await backups.refetch()
      await flushPromises()
      expect(backups.error.value).toBeNull()
    } finally {
      wrapper.unmount()
      client.clear()
    }
  })
  const accepted = {
    success: true,
    id: 7,
    filename: 'duris-mud-synthetic.zip',
    message: 'Accepted',
  }
  const actions = ['backup', 'stored', 'uploaded'] as const
  type Action = (typeof actions)[number]
  function api(action: Action) {
    return vi.mocked(
      action === 'backup'
        ? adminApi.createBackup
        : action === 'stored'
          ? adminApi.createRestore
          : adminApi.createRestoreFromUpload,
    )
  }
  function start(action: Action, backups: ReturnType<typeof useBackups>) {
    if (action === 'backup') return backups.createBackup()
    if (action === 'stored') return backups.createRestore({ backupId: 1, restoreType: 'full' })
    return backups.restoreFromUpload({ tempPath: '/private-synthetic-upload', restoreType: 'full' })
  }
  for (const action of actions) {
    it.each([false, true])(
      `waits for the ${action} outcome and propagates failure=%s`,
      async (fail) => {
        let resolve!: (value: typeof accepted) => void
        let reject!: (error: Error) => void
        api(action).mockReturnValueOnce(
          new Promise<typeof accepted>((yes, no) => {
            resolve = yes
            reject = no
          }),
        )
        const { backups, client, wrapper } = mountBackups()
        const invalidate = vi.spyOn(client, 'invalidateQueries')
        try {
          let settled = false
          const run = start(action, backups)
          expect(run).toBeInstanceOf(Promise)
          const outcome = run.then(
            (value) => {
              settled = true
              return value
            },
            (error: unknown) => {
              settled = true
              return error
            },
          )
          await flushPromises()
          expect(settled).toBe(false)
          expect(action === 'backup' ? backups.isCreating.value : backups.isRestoring.value).toBe(
            true,
          )
          expect(backups.currentRestore.value).toBeNull()
          const failure = new Error('Operation start not confirmed')
          if (fail) reject(failure)
          else resolve(accepted)
          expect(await outcome).toBe(fail ? failure : accepted)
          await flushPromises()
          expect(action === 'backup' ? backups.isCreating.value : backups.isRestoring.value).toBe(
            false,
          )
          expect(invalidate).toHaveBeenCalledTimes(action === 'backup' ? 1 : 0)
          expect(backups.currentRestore.value).toEqual(
            action === 'backup' || fail
              ? null
              : { id: 7, progress: 0, currentStep: 'Starting...', status: 'pending' },
          )
        } finally {
          wrapper.unmount()
          client.clear()
        }
      },
    )
    it(`refuses invalid ${action} acknowledgements without creating a pending restore`, async () => {
      const { backups, client, wrapper } = mountBackups()
      try {
        for (const invalid of [
          { ...accepted, success: false },
          { ...accepted, id: 0 },
          { ...accepted, id: Number.NaN },
        ]) {
          api(action).mockResolvedValueOnce(invalid)
          await expect(start(action, backups)).rejects.toThrow('Operation start was not confirmed')
          expect(backups.currentRestore.value).toBeNull()
        }
      } finally {
        wrapper.unmount()
        client.clear()
      }
    })
  }
})
