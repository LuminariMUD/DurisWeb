import { defineComponent } from 'vue'
import { flushPromises, mount } from '@vue/test-utils'
import { QueryClient, VueQueryPlugin } from '@tanstack/vue-query'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { adminApi } from '@/services/api'
import { useBackups } from '../useBackups'

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
        return {}
      },
      template: '<div />',
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
