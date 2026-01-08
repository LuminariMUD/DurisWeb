<script setup lang="ts">
import { computed } from 'vue'
import { useForumStats } from '@/composables/useAdminAnalytics'
import StatCard from './StatCard.vue'
import { MessageSquare, Users, TrendingUp, Calendar } from 'lucide-vue-next'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { AlertCircle } from 'lucide-vue-next'

const { data: stats, isLoading, error } = useForumStats()

const topPosters = computed(() => stats.value?.topPosters || [])
const postsByCategory = computed(() => stats.value?.postsByCategory || [])
</script>

<template>
  <div class="space-y-6">
    <!-- Error Alert -->
    <Alert v-if="error" variant="destructive">
      <AlertCircle class="h-4 w-4" />
      <AlertDescription>
        Failed to load forum statistics. Please try refreshing the page.
      </AlertDescription>
    </Alert>

    <!-- Overview Stats Grid -->
    <div class="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      <StatCard
        title="Total Threads"
        :value="stats?.totalThreads ?? 0"
        :icon="MessageSquare"
        :is-loading="isLoading"
        subtitle="All-time threads"
      />

      <StatCard
        title="Total Posts"
        :value="stats?.totalPosts ?? 0"
        :icon="MessageSquare"
        :is-loading="isLoading"
        subtitle="All-time posts"
      />

      <StatCard
        title="Active Users (7d)"
        :value="stats?.activeUsers7Days ?? 0"
        :icon="Users"
        :is-loading="isLoading"
        subtitle="Posted this week"
      />

      <StatCard
        title="Posts Today"
        :value="stats?.postsToday ?? 0"
        :icon="TrendingUp"
        :is-loading="isLoading"
        subtitle="Last 24 hours"
      />

      <StatCard
        title="Posts This Week"
        :value="stats?.postsThisWeek ?? 0"
        :icon="Calendar"
        :is-loading="isLoading"
        subtitle="Last 7 days"
      />

      <StatCard
        title="Avg Posts/Thread"
        :value="Math.round(stats?.avgPostsPerThread ?? 0)"
        :icon="MessageSquare"
        :is-loading="isLoading"
        subtitle="Engagement metric"
      />
    </div>

    <!-- Top Posters & Categories -->
    <div class="grid gap-4 md:grid-cols-2">
      <!-- Top Posters -->
      <div class="rounded-lg border p-6">
        <h3 class="text-lg font-semibold mb-4">Top Posters</h3>
        <div v-if="isLoading" class="space-y-2">
          <div class="h-10 bg-muted animate-pulse rounded"></div>
          <div class="h-10 bg-muted animate-pulse rounded"></div>
          <div class="h-10 bg-muted animate-pulse rounded"></div>
        </div>
        <div v-else-if="topPosters.length === 0" class="text-center py-8 text-muted-foreground">
          No forum activity yet
        </div>
        <div v-else class="space-y-3">
          <div
            v-for="(poster, index) in topPosters.slice(0, 10)"
            :key="poster.account"
            class="flex items-center justify-between p-3 rounded-lg bg-muted/50"
          >
            <div class="flex items-center gap-3">
              <span class="text-sm font-medium text-muted-foreground w-6">
                #{{ index + 1 }}
              </span>
              <span class="font-medium">{{ poster.account }}</span>
            </div>
            <span class="text-sm text-muted-foreground">
              {{ poster.postCount }} posts
            </span>
          </div>
        </div>
      </div>

      <!-- Posts by Category -->
      <div class="rounded-lg border p-6">
        <h3 class="text-lg font-semibold mb-4">Posts by Category</h3>
        <div v-if="isLoading" class="space-y-2">
          <div class="h-10 bg-muted animate-pulse rounded"></div>
          <div class="h-10 bg-muted animate-pulse rounded"></div>
          <div class="h-10 bg-muted animate-pulse rounded"></div>
        </div>
        <div v-else-if="postsByCategory.length === 0" class="text-center py-8 text-muted-foreground">
          No categories found
        </div>
        <div v-else class="space-y-3">
          <div
            v-for="category in postsByCategory.filter(c => c.postCount > 0)"
            :key="category.categoryName"
            class="flex items-center justify-between p-3 rounded-lg bg-muted/50"
          >
            <span class="font-medium truncate" v-html="category.categoryName"></span>
            <span class="text-sm text-muted-foreground whitespace-nowrap ml-3">
              {{ category.postCount }} posts
            </span>
          </div>
          <div v-if="postsByCategory.filter(c => c.postCount > 0).length === 0" class="text-center py-8 text-muted-foreground">
            No posts yet
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
