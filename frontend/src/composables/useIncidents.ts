import { useQuery, useMutation, useQueryClient } from '@tanstack/vue-query'
import { computed, type Ref } from 'vue'
import { apiClient } from '@/services/api'

export interface AdminIncident {
  id: number
  started_at: string
  ended_at: string | null
  duration_seconds: number | null
  incident_type: 'crash' | 'maintenance' | 'degraded' | 'outage'
  severity: 'critical' | 'major' | 'minor' | 'info'
  title: string
  description: string | null
  resolved: boolean
  resolution_notes: string | null
  crash_log_id: number | null
  public_visible: boolean
  created_at: string
  updated_at: string
  // Crash forensic fields
  detected_by?: 'exit_log' | 'process_monitor' | 'manual'
  exit_code?: number
  crash_signal?: string
  shutdown_reason?: string
  pid?: number
  uptime_seconds?: number
  memory_mb?: number
  cpu_percent?: number
  core_dump_path?: string
  core_dump_size_bytes?: number
  has_backtrace?: boolean
  backtrace?: string
  crash_function?: string
  crash_file?: string
  crash_line?: number
  exit_log_excerpt?: string
  debug_log_excerpt?: string
  online_players?: number
  last_command?: string
  analyzed?: boolean
  notes?: string
  // New context fields
  wholist_snapshot?: string
  cmd_debug_last3?: string
  status_log_last3?: string
  wizcmds_last3?: string
}

export interface CreateIncidentData {
  incident_type: 'crash' | 'maintenance' | 'degraded' | 'outage'
  severity: 'critical' | 'major' | 'minor' | 'info'
  title: string
  description?: string
  started_at: string
  ended_at?: string
  resolved?: boolean
  public_visible?: boolean
}

export interface UpdateIncidentData {
  id: number
  incident_type?: 'crash' | 'maintenance' | 'degraded' | 'outage'
  severity?: 'critical' | 'major' | 'minor' | 'info'
  title?: string
  description?: string
  started_at?: string
  ended_at?: string
  resolved?: boolean
  resolution_notes?: string
  public_visible?: boolean
  // Crash forensic fields
  analyzed?: boolean
  notes?: string
  exit_code?: number
  crash_signal?: string
  pid?: number
  uptime_seconds?: number
  memory_mb?: number
  cpu_percent?: number
  online_players?: number
  crash_function?: string
  crash_file?: string
  crash_line?: number
  backtrace?: string
  wholist_snapshot?: string
  cmd_debug_last3?: string
  status_log_last3?: string
  wizcmds_last3?: string
  debug_log_excerpt?: string
}

export function useAdminIncidents(
  page: Ref<number> | number = 1,
  limit: Ref<number> | number = 50,
  dateFilter?: Ref<{ from?: string; to?: string }>
) {
  const queryClient = useQueryClient()

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['admin-incidents', page, limit, dateFilter],
    queryFn: async () => {
      const pageValue = typeof page === 'number' ? page : page.value
      const limitValue = typeof limit === 'number' ? limit : limit.value
      let url = `/api/admin/incidents?page=${pageValue}&limit=${limitValue}`

      if (dateFilter?.value?.from && dateFilter?.value?.to) {
        url += `&dateFrom=${dateFilter.value.from}&dateTo=${dateFilter.value.to}`
      }

      const response = await apiClient.get(url)
      return response.data
    },
  })

  const createMutation = useMutation({
    mutationFn: async (incidentData: CreateIncidentData) => {
      const response = await apiClient.post('/api/admin/incidents', incidentData)
      return response.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-incidents'] })
      queryClient.invalidateQueries({ queryKey: ['public-incidents'] })
    },
  })

  const updateMutation = useMutation({
    mutationFn: async ({ id, ...data }: UpdateIncidentData) => {
      const response = await apiClient.patch(`/api/admin/incidents/${id}`, data)
      return response.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-incidents'] })
      queryClient.invalidateQueries({ queryKey: ['public-incidents'] })
    },
  })

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      const response = await apiClient.delete(`/api/admin/incidents/${id}`)
      return response.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-incidents'] })
      queryClient.invalidateQueries({ queryKey: ['public-incidents'] })
    },
  })

  return {
    incidents: computed(() => data.value?.incidents || []),
    pagination: computed(() => data.value?.pagination),
    isLoading,
    error,
    refetch,
    createIncident: createMutation.mutateAsync,
    updateIncident: updateMutation.mutateAsync,
    deleteIncident: deleteMutation.mutateAsync,
    isCreating: createMutation.isPending,
    isUpdating: updateMutation.isPending,
    isDeleting: deleteMutation.isPending,
  }
}
