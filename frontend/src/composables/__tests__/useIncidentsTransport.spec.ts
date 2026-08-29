import { ref } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const apiClient = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  patch: vi.fn(),
  delete: vi.fn(),
}))

vi.mock('@/services/api', () => ({ apiClient }))
vi.mock('@tanstack/vue-query', () => ({
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
  useQuery: () => ({
    data: ref({ incidents: [], pagination: undefined }),
    isLoading: ref(false),
    error: ref(null),
    refetch: vi.fn(),
  }),
  useMutation: (options: { mutationFn: (value: any) => Promise<unknown> }) => ({
    mutateAsync: options.mutationFn,
    isPending: ref(false),
  }),
}))

const { useAdminIncidents } = await import('../useIncidents')

describe('admin incident transport', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    apiClient.post.mockResolvedValue({ data: { id: 1 } })
    apiClient.patch.mockResolvedValue({ data: { success: true } })
    apiClient.delete.mockResolvedValue({ data: { success: true } })
  })

  it('uses the shared CSRF-aware api client for every incident mutation', async () => {
    const incidents = useAdminIncidents()

    await incidents.createIncident({
      incident_type: 'maintenance',
      severity: 'minor',
      title: 'Maintenance',
      started_at: '2026-08-28T22:00:00.000Z',
    })
    await incidents.updateIncident({ id: 1, resolved: true })
    await incidents.deleteIncident(1)

    expect(apiClient.post).toHaveBeenCalledWith('/api/admin/incidents', expect.any(Object))
    expect(apiClient.patch).toHaveBeenCalledWith('/api/admin/incidents/1', { resolved: true })
    expect(apiClient.delete).toHaveBeenCalledWith('/api/admin/incidents/1')
  })
})
