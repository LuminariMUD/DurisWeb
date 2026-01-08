import { useQuery } from '@tanstack/vue-query';
import { computed, type Ref } from 'vue';
import { apiClient } from '../services/api';

export interface LogFile {
  name: string;
  category: 'runtime' | 'player';
  size: number;
  lastModified: string;
}

export interface LogLine {
  lineNumber: number;
  timestamp: string | null;
  content: string;
  level: 'ERROR' | 'WARNING' | 'DEBUG' | 'INFO';
}

export interface PaginatedLogResult {
  lines: LogLine[];
  totalLines: number;
  totalPages: number;
  currentPage: number;
}

export interface LogFilters {
  search?: string;
  startDate?: string;
  endDate?: string;
}

/**
 * Fetch list of all available log files
 */
export function useLogFiles() {
  return useQuery<LogFile[]>({
    queryKey: ['admin', 'logs', 'files'],
    queryFn: async () => {
      try {
        console.log('Fetching log files from /api/admin/logs...');
        const response = await apiClient.get('/api/admin/logs');
        console.log('Log files response:', response.data);
        return response.data.logs;
      } catch (error: any) {
        console.error('Failed to fetch log files:', error.response?.data || error.message);
        throw error;
      }
    },
    staleTime: 1000 * 60, // 1 minute
    retry: false,
  });
}

/**
 * Fetch paginated log content
 */
export function useLogContent(
  category: Ref<'runtime' | 'player'>,
  logName: Ref<string>,
  page: Ref<number>,
  pageSize: Ref<number>,
  filters: Ref<LogFilters>
) {
  return useQuery<PaginatedLogResult>({
    queryKey: ['admin', 'logs', 'content', category, logName, page, pageSize, filters],
    queryFn: async () => {
      const params = new URLSearchParams({
        page: page.value.toString(),
        pageSize: pageSize.value.toString(),
      });

      if (filters.value.search) {
        params.append('search', filters.value.search);
      }
      if (filters.value.startDate) {
        params.append('startDate', filters.value.startDate);
      }
      if (filters.value.endDate) {
        params.append('endDate', filters.value.endDate);
      }

      const response = await apiClient.get(
        `/api/admin/logs/${category.value}/${logName.value}?${params.toString()}`
      );
      return response.data;
    },
    enabled: computed(() => !!category.value && !!logName.value),
    staleTime: 1000 * 30, // 30 seconds
  });
}

/**
 * Fetch tail of log file (last N lines)
 */
export function useLogTail(
  category: Ref<'runtime' | 'player'>,
  logName: Ref<string>,
  lines: Ref<number> = computed(() => 100)
) {
  return useQuery<LogLine[]>({
    queryKey: ['admin', 'logs', 'tail', category, logName, lines],
    queryFn: async () => {
      const response = await apiClient.get(
        `/api/admin/logs/${category.value}/${logName.value}/tail?lines=${lines.value}`
      );
      return response.data.lines;
    },
    enabled: computed(() => !!category.value && !!logName.value),
    staleTime: 1000 * 10, // 10 seconds
  });
}

/**
 * Get download URL for a log file
 */
export function getLogDownloadUrl(category: 'runtime' | 'player', logName: string): string {
  return `/api/admin/logs/${category}/${logName}/download`;
}
