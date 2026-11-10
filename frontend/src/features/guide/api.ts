import { apiClient as api } from '@/services/httpClient'
import type {
  PublicHelpFile,
  PublicHelpFilesResponse,
  GuideCategoryWithCount,
  HelpSuggestion,
  HelpSuggestionsResponse,
  CreateHelpSuggestion,
  UpdateHelpSuggestion,
  ReviewHelpSuggestion,
  SuggestionStatus,
} from '@/types'

// ========================================
// Public Guide (Help Files) API
// ========================================

export const guideApi = {
  /**
   * Get all categories with article counts
   */
  async getCategories(): Promise<{ categories: GuideCategoryWithCount[] }> {
    const { data } = await api.get<{ categories: GuideCategoryWithCount[] }>(
      '/api/guide/categories',
    )
    return data
  },

  /**
   * Get paginated help files with optional filtering
   */
  async getHelpFiles(
    params: { page?: number; limit?: number; category_id?: number; search?: string } = {},
  ): Promise<PublicHelpFilesResponse> {
    const { data } = await api.get<PublicHelpFilesResponse>('/api/guide/help', { params })
    return data
  },

  /**
   * Search help files (quick search for instant results)
   */
  async searchHelpFiles(query: string, limit: number = 20): Promise<{ results: PublicHelpFile[] }> {
    const { data } = await api.get<{ results: PublicHelpFile[] }>('/api/guide/help/search', {
      params: { q: query, limit },
    })
    return data
  },

  /**
   * Get single help file by ID with full content
   */
  async getHelpFile(id: number): Promise<PublicHelpFile> {
    const { data } = await api.get<PublicHelpFile>(`/api/guide/help/${id}`)
    return data
  },
}

// ========================================
// Help File Suggestions API
// ========================================

export const helpSuggestionApi = {
  // ========== User Endpoints ==========

  /**
   * Get user's own suggestions
   */
  async getMySuggestions(status?: SuggestionStatus): Promise<HelpSuggestionsResponse> {
    const { data } = await api.get<HelpSuggestionsResponse>('/api/guide/suggestions', {
      params: status ? { status } : undefined,
    })
    return data
  },

  /**
   * Submit a new suggestion
   */
  async createSuggestion(suggestion: CreateHelpSuggestion): Promise<HelpSuggestion> {
    const { data } = await api.post<HelpSuggestion>('/api/guide/suggestions', suggestion)
    return data
  },

  /**
   * Get a specific suggestion (own only)
   */
  async getSuggestion(id: number): Promise<HelpSuggestion> {
    const { data } = await api.get<HelpSuggestion>(`/api/guide/suggestions/${id}`)
    return data
  },

  /**
   * Update own pending suggestion
   */
  async updateSuggestion(id: number, updates: UpdateHelpSuggestion): Promise<HelpSuggestion> {
    const { data } = await api.patch<HelpSuggestion>(`/api/guide/suggestions/${id}`, updates)
    return data
  },

  /**
   * Cancel own pending suggestion
   */
  async cancelSuggestion(id: number): Promise<void> {
    await api.delete(`/api/guide/suggestions/${id}`)
  },

  // ========== Admin Endpoints ==========

  /**
   * Get all suggestions for review (admin)
   */
  async getAdminQueue(
    params: { page?: number; limit?: number; status?: SuggestionStatus } = {},
  ): Promise<
    HelpSuggestionsResponse & {
      pagination: { page: number; limit: number; total: number; totalPages: number }
    }
  > {
    const { data } = await api.get('/api/admin/help-suggestions', { params })
    return data
  },

  /**
   * Get pending suggestion count (admin badge)
   */
  async getPendingCount(): Promise<{ count: number }> {
    const { data } = await api.get<{ count: number }>('/api/admin/help-suggestions/pending-count')
    return data
  },

  /**
   * Get suggestion details for review (admin)
   */
  async getAdminSuggestion(id: number): Promise<HelpSuggestion> {
    const { data } = await api.get<HelpSuggestion>(`/api/admin/help-suggestions/${id}`)
    return data
  },

  /**
   * Review a suggestion (admin)
   */
  async reviewSuggestion(id: number, review: ReviewHelpSuggestion): Promise<HelpSuggestion> {
    const { data } = await api.patch<HelpSuggestion>(
      `/api/admin/help-suggestions/${id}/review`,
      review,
    )
    return data
  },
}

// ============================================================================
// Unified Notifications API
// ============================================================================
