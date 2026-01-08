import { useQuery } from '@tanstack/vue-query'
import { forumApi, adminApi } from '@/services/api'
import type { ForumCategory } from '@/types'
import type { Ref } from 'vue'
import { computed, unref } from 'vue'

/**
 * Fetch forum categories with TanStack Query caching
 * @param isAdminMode - If true, fetch all categories including archived (for admins)
 * @param enabled - Whether the query should run (default: true)
 */
export function useCategories(isAdminMode?: Ref<boolean> | boolean, enabled: Ref<boolean> | boolean = true) {
  return useQuery<ForumCategory[]>({
    queryKey: computed(() => ['forum-categories', unref(isAdminMode) || false]),
    queryFn: () => unref(isAdminMode) ? adminApi.getAllCategories() : forumApi.getCategories(),
    staleTime: 1000 * 60 * 5, // 5 minutes
    enabled: () => unref(enabled),
  })
}
