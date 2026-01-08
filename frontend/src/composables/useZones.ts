import { useQuery, useMutation, useQueryClient } from '@tanstack/vue-query';
import { computed, type Ref } from 'vue';
import { apiClient } from '@/services/api';

export interface Zone {
  id: number;
  number: number;
  name: string;
  epicType: number;
  frequencyMod: number;
  zoneFreqMod: number;
  epicLevel: number;
  taskZone: boolean;
  questZone: boolean;
  trophyZone: boolean;
  suggestedGroupSize: number;
  epicPayout: number;
  difficulty: number;
  randomsZone: boolean;
  alignment: number;
  lastTouch: number;
  resetPerc: number;
}

export interface ZoneFilters {
  epicTypes?: number[];
  search?: string;
  alignmentMin?: number;
  alignmentMax?: number;
  difficultyMin?: number;
  difficultyMax?: number;
  onlyEpicZones?: boolean;
}

export interface PaginationParams {
  page: number;
  limit: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

export interface ZoneUpdateData {
  epicType?: number;
  alignment?: number;
  suggestedGroupSize?: number;
  difficulty?: number;
  epicPayout?: number;
  taskZone?: boolean;
  questZone?: boolean;
  trophyZone?: boolean;
  randomsZone?: boolean;
}

export interface ZonesResponse {
  zones: Zone[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface ZoneStats {
  totalZones: number;
  epicZones: number;
  avgDifficulty: number;
  epicTypeDistribution: { type: number; count: number }[];
  alignmentDistribution: { alignment: number; count: number }[];
}

// Epic type labels and icons
export const EPIC_TYPE_LABELS = {
  0: { name: 'None', icon: 'X', description: 'No epic stone' },
  1: { name: 'Small', icon: 'Gem', description: 'Small epic stone' },
  2: { name: 'Large', icon: 'GemIcon', description: 'Large epic stone' },
  3: { name: 'Monolith', icon: 'Landmark', description: 'Epic monolith' },
};

// Get zones query
export function useZonesQuery(
  filters: Ref<ZoneFilters>,
  pagination: Ref<PaginationParams>
) {
  return useQuery({
    queryKey: ['zones', filters, pagination],
    queryFn: async () => {
      const params = new URLSearchParams();
      params.append('page', String(pagination.value.page));
      params.append('limit', String(pagination.value.limit));

      if (pagination.value.sortBy) {
        params.append('sortBy', pagination.value.sortBy);
      }
      if (pagination.value.sortOrder) {
        params.append('sortOrder', pagination.value.sortOrder);
      }

      if (filters.value.epicTypes && filters.value.epicTypes.length > 0) {
        params.append('epicTypes', filters.value.epicTypes.join(','));
      }
      if (filters.value.search) {
        params.append('search', filters.value.search);
      }
      if (filters.value.alignmentMin !== undefined) {
        params.append('alignmentMin', String(filters.value.alignmentMin));
      }
      if (filters.value.alignmentMax !== undefined) {
        params.append('alignmentMax', String(filters.value.alignmentMax));
      }
      if (filters.value.difficultyMin !== undefined) {
        params.append('difficultyMin', String(filters.value.difficultyMin));
      }
      if (filters.value.difficultyMax !== undefined) {
        params.append('difficultyMax', String(filters.value.difficultyMax));
      }
      if (filters.value.onlyEpicZones) {
        params.append('onlyEpicZones', 'true');
      }

      const response = await apiClient.get<ZonesResponse>(`/api/zones?${params.toString()}`);
      return response.data;
    },
    placeholderData: (previousData) => previousData,
    staleTime: 1000 * 60 * 5, // 5 minutes
  });
}

// Get single zone query
export function useZoneQuery(zoneNumber: Ref<number | null>) {
  return useQuery({
    queryKey: ['zone', zoneNumber],
    queryFn: async () => {
      if (!zoneNumber.value) {
        throw new Error('Zone number is required');
      }
      const response = await apiClient.get<Zone>(`/api/zones/${zoneNumber.value}`);
      return response.data;
    },
    enabled: computed(() => zoneNumber.value !== null),
    staleTime: 1000 * 60 * 5, // 5 minutes
  });
}

// Get zone statistics query
export function useZoneStatsQuery() {
  return useQuery({
    queryKey: ['zone-stats'],
    queryFn: async () => {
      const response = await apiClient.get<ZoneStats>('/api/zones/stats');
      return response.data;
    },
    staleTime: 1000 * 60 * 10, // 10 minutes
  });
}

// Update zone mutation
export function useUpdateZoneMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      zoneNumber,
      data,
    }: {
      zoneNumber: number;
      data: ZoneUpdateData;
    }) => {
      const response = await apiClient.put<Zone>(`/api/zones/${zoneNumber}`, data);
      return response.data;
    },
    onSuccess: (updatedZone) => {
      // Invalidate zones list query
      queryClient.invalidateQueries({ queryKey: ['zones'] });

      // Update individual zone query cache
      queryClient.setQueryData(['zone', updatedZone.number], updatedZone);

      // Invalidate stats
      queryClient.invalidateQueries({ queryKey: ['zone-stats'] });
    },
  });
}

// Bulk update zones mutation
export function useBulkUpdateZonesMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      zoneNumbers,
      data,
    }: {
      zoneNumbers: number[];
      data: ZoneUpdateData;
    }) => {
      const response = await apiClient.patch<{
        success: boolean;
        affectedRows: number;
        zoneCount: number;
      }>('/api/zones/bulk', { zoneNumbers, data });
      return response.data;
    },
    onSuccess: () => {
      // Invalidate all zone queries
      queryClient.invalidateQueries({ queryKey: ['zones'] });
      queryClient.invalidateQueries({ queryKey: ['zone'] });
      queryClient.invalidateQueries({ queryKey: ['zone-stats'] });
    },
  });
}

// Helper function to get alignment label
export function getAlignmentLabel(alignment: number): string {
  if (alignment < -3) return 'Very Evil';
  if (alignment < -1) return 'Evil';
  if (alignment < 0) return 'Slightly Evil';
  if (alignment === 0) return 'Neutral';
  if (alignment <= 1) return 'Slightly Good';
  if (alignment <= 3) return 'Good';
  return 'Very Good';
}

// Helper function to get alignment color
export function getAlignmentColor(alignment: number): string {
  if (alignment < -2) return 'text-red-600 dark:text-red-400';
  if (alignment < 0) return 'text-orange-600 dark:text-orange-400';
  if (alignment === 0) return 'text-gray-600 dark:text-gray-400';
  if (alignment <= 2) return 'text-blue-600 dark:text-blue-400';
  return 'text-cyan-600 dark:text-cyan-400';
}

// Helper function to format difficulty as stars
export function getDifficultyStars(difficulty: number): string {
  const maxStars = 10;
  const filled = '★'.repeat(Math.min(difficulty, maxStars));
  const empty = '☆'.repeat(Math.max(0, maxStars - difficulty));
  return filled + empty;
}

// Helper function to get last touch human-readable time
export function getLastTouchLabel(lastTouch: number): string {
  if (lastTouch === 0) {
    return 'Never';
  }

  const now = Math.floor(Date.now() / 1000); // Current time in seconds
  const diff = now - lastTouch;

  if (diff < 60) return 'Just now';
  if (diff < 3600) return `${Math.floor(diff / 60)} minutes ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} hours ago`;
  if (diff < 604800) return `${Math.floor(diff / 86400)} days ago`;
  if (diff < 2592000) return `${Math.floor(diff / 604800)} weeks ago`;
  if (diff < 31536000) return `${Math.floor(diff / 2592000)} months ago`;
  return `${Math.floor(diff / 31536000)} years ago`;
}
