import { ref } from 'vue'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { InternalAxiosRequestConfig } from 'axios'
import { apiClient } from '@/services/httpClient'

vi.mock('@tanstack/vue-query', () => ({
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
  useQuery: () => ({ data: ref(undefined), isLoading: ref(false), error: ref(null) }),
  useMutation: (options: { mutationFn: (value: any) => Promise<unknown> }) => ({
    mutateAsync: options.mutationFn,
  }),
}))

const permissions = await import('../useAdminPermissions')

const seen: InternalAxiosRequestConfig[] = []

afterEach(() => {
  seen.length = 0
  apiClient.defaults.adapter = undefined
  document.cookie = 'csrf_token=; expires=Thu, 01 Jan 1970 00:00:00 GMT'
})

describe('admin permission writes', () => {
  it('send the CSRF header the backend requires on every state change', async () => {
    document.cookie = 'csrf_token=synthetic'
    apiClient.defaults.adapter = async (config: InternalAxiosRequestConfig) => {
      seen.push(config)
      return { data: { success: true }, status: 200, statusText: 'OK', headers: {}, config }
    }

    const role = { name: 'r', permissionIds: [] as number[] }
    await permissions.useCreateRole().mutateAsync(role)
    await permissions.useUpdateRole().mutateAsync({ roleId: 1, data: role })
    await permissions.useDeleteRole().mutateAsync(1)
    await permissions.useAssignRole().mutateAsync({ accountName: 'mortal', roleId: 1 })
    await permissions.useRevokeRole().mutateAsync({ accountName: 'mortal', roleId: 1 })
    await permissions.useGrantPermission().mutateAsync({ accountName: 'mortal', permissionId: 2 })
    await permissions.useRevokePermission().mutateAsync({ accountName: 'mortal', permissionId: 2 })

    expect(seen.map((config) => config.method)).toEqual([
      'post',
      'put',
      'delete',
      'post',
      'delete',
      'post',
      'delete',
    ])
    for (const config of seen) {
      expect(config.headers['X-CSRF-Token']).toBe('synthetic')
    }
  })
})
