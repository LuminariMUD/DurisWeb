import { defineComponent } from 'vue'
import { flushPromises, mount } from '@vue/test-utils'
import { QueryClient, VueQueryPlugin } from '@tanstack/vue-query'
import { describe, expect, it, vi } from 'vitest'
import { adminApi } from '@/services/api'
import { useBackups } from '../useBackups'

vi.mock('@/services/api', () => ({
  adminApi: {
    getBackupList: vi.fn(async () => ({ backups: [] })),
    deleteBackup: vi.fn(),
    getBackupDownloadUrl: vi.fn(),
  },
}))
vi.mock('../useWebSocket', () => ({
  useWebSocket: () => ({
    onBackupProgress: vi.fn(),
    offBackupProgress: vi.fn(),
    onRestoreProgress: vi.fn(),
    offRestoreProgress: vi.fn(),
  }),
}))

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
      let backups!: ReturnType<typeof useBackups>
      const client = new QueryClient({
        defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
      })
      const invalidate = vi.spyOn(client, 'invalidateQueries')
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
