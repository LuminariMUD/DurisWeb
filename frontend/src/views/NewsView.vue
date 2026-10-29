<script setup lang="ts">
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useHead } from '@unhead/vue'
import { useQuery } from '@tanstack/vue-query'
import { useNews } from '@/composables/useNews'
import { useAuth } from '@/composables/useAuth'
import { parseAnsiForVue } from '@/utils/ansiParser'
import { changelogApi } from '@/services/api'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import ChangelogList from '@/components/changelog/ChangelogList.vue'
import ClientChangelog from '@/components/changelog/ClientChangelog.vue'

useHead({
  title: 'DurisMUD | News',
})

const route = useRoute()
const router = useRouter()
const { isAuthenticated, accountName } = useAuth()

// Tab state from URL query param
const activeTab = computed(() => {
  const tab = route.query.tab
  return tab === 'changelog' || tab === 'client' ? tab : 'mud'
})

// Fetch unread count for badge
const unreadQueryKey = computed(
  () => ['changelog-unread-count', accountName.value?.trim().toLowerCase() || 'anonymous'] as const,
)
const { data: unreadData } = useQuery({
  queryKey: unreadQueryKey,
  queryFn: () => changelogApi.getUnreadCount(),
  enabled: () => isAuthenticated.value,
  staleTime: 1000 * 60 * 5,
})

const unreadCount = computed(() => unreadData.value?.count ?? 0)

// Update URL when tab changes
function onTabChange(value: string | number) {
  const tab = String(value)
  router.replace({ query: { ...route.query, tab } })
}

// Fetch MUD news content
const { data, isLoading, isError, error, refetch } = useNews()

// Parse ANSI codes to HTML
const parsedContent = computed(() => {
  if (!data.value?.news) return ''
  return parseAnsiForVue(data.value.news)
})
</script>

<template>
  <div class="space-y-6">
    <!-- Header -->
    <div>
      <h1 class="text-4xl md:text-5xl text-foreground">News</h1>
    </div>

    <!-- Tabs -->
    <Tabs :model-value="activeTab" @update:model-value="onTabChange" class="w-full">
      <TabsList aria-label="News categories" class="grid h-auto w-full grid-cols-3">
        <TabsTrigger value="mud" class="h-auto min-w-0 whitespace-normal text-xs sm:text-sm">MUD News</TabsTrigger>
        <TabsTrigger value="changelog" class="relative h-auto min-w-0 whitespace-normal text-xs sm:text-sm">
          Website Changelog
          <Badge
            v-if="unreadCount > 0"
            variant="destructive"
            class="ml-2 h-5 min-w-5 px-1.5 text-xs"
          >
            {{ unreadCount }}
          </Badge>
        </TabsTrigger>
        <TabsTrigger value="client" class="h-auto min-w-0 whitespace-normal text-xs sm:text-sm">Mudlet Client</TabsTrigger>
      </TabsList>

      <!-- MUD News Tab -->
      <TabsContent value="mud" class="mt-6">
        <!-- Loading State -->
        <div v-if="isLoading" class="flex items-center justify-center py-12">
          <div class="text-center">
            <div class="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-current border-r-transparent align-[-0.125em]"></div>
            <p class="mt-4 text-muted-foreground">Loading news...</p>
          </div>
        </div>

        <!-- Error State -->
        <div v-else-if="isError" class="rounded-lg border border-destructive bg-destructive/10 p-4">
          <h3 class="font-semibold text-destructive">Error loading news</h3>
          <p class="text-sm text-destructive/80">{{ error?.message || 'Unknown error occurred' }}</p>
          <Button variant="outline" size="sm" class="mt-3" @click="refetch()">
            Try again
          </Button>
        </div>

        <!-- News Content -->
        <div v-else-if="data && data.news" class="rounded-lg border border-border bg-background p-6">
          <div class="rounded-md bg-black p-6 font-mono text-sm text-foreground overflow-x-auto">
            <pre class="whitespace-pre-wrap" v-html="parsedContent"></pre>
          </div>
        </div>

        <!-- Empty State -->
        <div v-else class="text-center py-12">
          <p class="text-muted-foreground">No news available</p>
        </div>
      </TabsContent>

      <!-- Website Changelog Tab -->
      <TabsContent value="changelog" class="mt-6">
        <ChangelogList />
      </TabsContent>

      <TabsContent value="client" class="mt-6">
        <ClientChangelog />
      </TabsContent>
    </Tabs>
  </div>
</template>
