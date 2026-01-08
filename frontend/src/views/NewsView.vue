<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useHead } from '@unhead/vue'
import { useQuery } from '@tanstack/vue-query'
import { useNews } from '@/composables/useNews'
import { useAuth } from '@/composables/useAuth'
import { parseAnsiForVue } from '@/utils/ansiParser'
import { changelogApi } from '@/services/api'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Badge } from '@/components/ui/badge'
import ChangelogList from '@/components/changelog/ChangelogList.vue'

useHead({
  title: 'DurisMUD | News'
})

const route = useRoute()
const router = useRouter()
const { isAuthenticated } = useAuth()

// Tab state from URL query param
const activeTab = ref((route.query.tab as string) || 'mud')

// Fetch unread count for badge
const { data: unreadData } = useQuery({
  queryKey: ['changelog-unread-count'],
  queryFn: () => changelogApi.getUnreadCount(),
  enabled: () => isAuthenticated.value,
  staleTime: 1000 * 60 * 5,
})

const unreadCount = computed(() => unreadData.value?.count ?? 0)

// Watch for URL changes
watch(() => route.query.tab, (newTab) => {
  activeTab.value = (newTab as string) || 'mud'
})

// Update URL when tab changes
function onTabChange(value: string | number) {
  const tab = String(value)
  activeTab.value = tab
  router.replace({ query: { ...route.query, tab } })
}

// Fetch MUD news content
const { data, isLoading, isError, error } = useNews()

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
      <h1 class="text-3xl font-bold text-gray-100">News</h1>
    </div>

    <!-- Tabs -->
    <Tabs :model-value="activeTab" @update:model-value="onTabChange" class="w-full">
      <TabsList class="grid w-full grid-cols-2">
        <TabsTrigger value="mud">MUD News</TabsTrigger>
        <TabsTrigger value="changelog" class="relative">
          Website Changelog
          <Badge
            v-if="unreadCount > 0"
            variant="destructive"
            class="ml-2 h-5 min-w-5 px-1.5 text-xs"
          >
            {{ unreadCount }}
          </Badge>
        </TabsTrigger>
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
        </div>

        <!-- News Content -->
        <div v-else-if="data && data.news" class="rounded-lg border border-gray-800 bg-gray-950 p-6">
          <div class="rounded-md bg-black p-6 font-mono text-sm text-gray-100 overflow-x-auto">
            <pre class="whitespace-pre-wrap" v-html="parsedContent"></pre>
          </div>
        </div>

        <!-- Empty State -->
        <div v-else class="text-center py-12">
          <p class="text-gray-400">No news available</p>
        </div>
      </TabsContent>

      <!-- Website Changelog Tab -->
      <TabsContent value="changelog" class="mt-6">
        <ChangelogList />
      </TabsContent>
    </Tabs>
  </div>
</template>
