<script setup lang="ts">
import { ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import BreadcrumbsNav from '@/components/layout/BreadcrumbsNav.vue'
import PaginationWithEllipsis from '@/components/forum/PaginationWithEllipsis.vue'
import { characterApi } from '@/features/profile/api'
import { fragApi } from '@/features/frag/api'
import { pvpApi } from '@/features/pvp/api'
import type { PlayerStats } from '@/types'
import { parseAnsiToHtml } from '@/utils/ansiParser'
import { formatDistanceToNow } from 'date-fns'

/**
 * Public character page. It reads only public per-character sources and never
 * shows or requests the account that owns the character (issue #181).
 */
interface CharacterSummary {
  rank: number
  char_name: string
  total_frags: number
  racewar: number
  race: string
  class: string
  level: number
}

const route = useRoute()
const router = useRouter()

const summary = ref<CharacterSummary | null>(null)
const pvpStats = ref<PlayerStats | null>(null)
const isLoading = ref(false)
const error = ref<string | null>(null)

const posts = ref<any[]>([])
const postsPage = ref(1)
const postsPagination = ref<any>(null)
const loadingPosts = ref(false)

const pvpEvents = ref<any[]>([])
const pvpPage = ref(1)
const pvpPagination = ref<any>(null)
const loadingPvP = ref(false)

const activeTab = ref('pvp')

function characterName(): string {
  return route.params.characterName as string
}

async function loadProfile() {
  const name = characterName()
  isLoading.value = true
  error.value = null
  summary.value = null
  pvpStats.value = null
  posts.value = []
  pvpEvents.value = []
  activeTab.value = 'pvp'

  try {
    summary.value = await fragApi.getCharacterStats(name)
  } catch (err: any) {
    error.value = err.response?.status === 404 ? 'Character not found' : 'Failed to load character'
    isLoading.value = false
    return
  }
  // A character without published battles has no PvP summary.
  pvpStats.value = await pvpApi.getPlayerStats(name).catch(() => null)
  isLoading.value = false
  loadPvPEvents(1)
}

async function loadPosts(page: number = 1) {
  loadingPosts.value = true
  try {
    const result = await characterApi.getCharacterPosts(characterName(), page, 20)
    posts.value = result.posts
    postsPagination.value = result.pagination
    postsPage.value = page
  } catch {
  } finally {
    loadingPosts.value = false
  }
}

async function loadPvPEvents(page: number = 1) {
  loadingPvP.value = true
  try {
    const result = await characterApi.getCharacterPvPEvents(characterName(), page, 20)
    pvpEvents.value = result.events
    pvpPagination.value = result.pagination
    pvpPage.value = page
  } catch {
  } finally {
    loadingPvP.value = false
  }
}

function alignmentLabel(racewar: number): string {
  if (racewar === 1) return 'Good'
  if (racewar === 2) return 'Evil'
  return 'Neutral'
}

watch(activeTab, (tab) => {
  if (tab === 'posts' && posts.value.length === 0) loadPosts(1)
})

watch(() => route.params.characterName, loadProfile, { immediate: true })
</script>

<template>
  <div class="container mx-auto px-4 py-8">
    <BreadcrumbsNav />

    <Card v-if="error" class="border-destructive">
      <CardHeader>
        <CardTitle class="text-destructive">{{ error }}</CardTitle>
      </CardHeader>
      <CardContent>
        <p class="text-sm text-muted-foreground">
          Retired characters and names that were never played have no page.
        </p>
      </CardContent>
    </Card>

    <div v-else-if="isLoading || !summary" class="space-y-4 lg:space-y-6">
      <Skeleton class="h-24 lg:h-32 w-full" />
      <div class="grid grid-cols-3 gap-2 lg:gap-4">
        <Skeleton class="h-16 lg:h-24" />
        <Skeleton class="h-16 lg:h-24" />
        <Skeleton class="h-16 lg:h-24" />
      </div>
    </div>

    <div v-else class="space-y-4 lg:space-y-6">
      <Card>
        <CardHeader class="p-4 lg:p-6">
          <div class="space-y-2">
            <div class="flex items-center gap-2 flex-wrap">
              <CardTitle class="text-xl lg:text-3xl">{{ summary.char_name }}</CardTitle>
              <Badge variant="outline" class="text-xs">{{ alignmentLabel(summary.racewar) }}</Badge>
            </div>
            <div class="flex items-center gap-2 text-xs lg:text-sm text-muted-foreground flex-wrap">
              <span>Level {{ summary.level }}</span>
              <span>•</span>
              <span v-html="parseAnsiToHtml(summary.race)"></span>
              <span v-html="parseAnsiToHtml(summary.class)"></span>
            </div>
          </div>
        </CardHeader>
      </Card>

      <div class="grid grid-cols-3 gap-2 lg:gap-4">
        <Card>
          <CardHeader class="p-3 lg:pb-3">
            <CardTitle class="text-xs lg:text-sm font-medium text-muted-foreground">Frags</CardTitle>
          </CardHeader>
          <CardContent class="p-3 pt-0 lg:p-6 lg:pt-0">
            <div class="text-lg lg:text-2xl font-bold">{{ summary.total_frags.toFixed(2) }}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader class="p-3 lg:pb-3">
            <CardTitle class="text-xs lg:text-sm font-medium text-muted-foreground">Frag rank</CardTitle>
          </CardHeader>
          <CardContent class="p-3 pt-0 lg:p-6 lg:pt-0">
            <div class="text-lg lg:text-2xl font-bold">#{{ summary.rank }}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader class="p-3 lg:pb-3">
            <CardTitle class="text-xs lg:text-sm font-medium text-muted-foreground">K/D</CardTitle>
          </CardHeader>
          <CardContent class="p-3 pt-0 lg:p-6 lg:pt-0">
            <template v-if="pvpStats">
              <div class="text-lg lg:text-2xl font-bold">{{ pvpStats.kdRatio.toFixed(2) }}</div>
              <p class="text-[10px] lg:text-xs text-muted-foreground mt-1">
                {{ pvpStats.kills }}k / {{ pvpStats.deaths }}d
              </p>
            </template>
            <div v-else class="text-lg lg:text-2xl font-bold">—</div>
          </CardContent>
        </Card>
      </div>

      <Tabs v-model="activeTab" class="w-full">
        <TabsList class="grid w-full grid-cols-2">
          <TabsTrigger value="pvp" class="text-xs lg:text-sm">PvP History</TabsTrigger>
          <TabsTrigger value="posts" class="text-xs lg:text-sm">Forum Activity</TabsTrigger>
        </TabsList>

        <TabsContent value="pvp" class="space-y-4 mt-6">
          <div v-if="loadingPvP" class="space-y-4">
            <Skeleton class="h-24" />
            <Skeleton class="h-24" />
          </div>
          <Card v-else-if="pvpEvents.length === 0">
            <CardContent class="py-8 text-center text-muted-foreground">
              No PvP events recorded
            </CardContent>
          </Card>
          <div v-else class="space-y-4">
            <Card
              v-for="event in pvpEvents"
              :key="event.eventId"
              class="hover:border-primary/50 cursor-pointer transition-colors"
              @click="router.push({ name: 'battle-detail', params: { id: String(event.eventId) } })"
            >
              <CardHeader>
                <div class="flex items-start justify-between gap-2">
                  <div class="space-y-1">
                    <div class="flex items-center gap-2 flex-wrap">
                      <Badge :variant="event.role.includes('KILLER') ? 'default' : 'destructive'">
                        {{ event.role }}
                      </Badge>
                      <Badge v-if="event.isLeader" variant="secondary">Leader</Badge>
                    </div>
                    <p class="text-sm font-medium" v-html="parseAnsiToHtml(event.location)"></p>
                  </div>
                  <Badge variant="outline" class="text-xs shrink-0">
                    {{ formatDistanceToNow(new Date(event.date), { addSuffix: true }) }}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent>
                <p class="text-sm" v-html="parseAnsiToHtml(event.description)"></p>
              </CardContent>
            </Card>
            <PaginationWithEllipsis
              v-if="pvpPagination"
              :current-page="pvpPage"
              :total-pages="pvpPagination.totalPages"
              @page-change="loadPvPEvents"
            />
          </div>
        </TabsContent>

        <TabsContent value="posts" class="space-y-4 mt-6">
          <div v-if="loadingPosts" class="space-y-4">
            <Skeleton class="h-24" />
            <Skeleton class="h-24" />
          </div>
          <Card v-else-if="posts.length === 0">
            <CardContent class="py-8 text-center text-muted-foreground">
              No forum posts yet
            </CardContent>
          </Card>
          <div v-else class="space-y-4">
            <Card
              v-for="post in posts"
              :key="post.id"
              class="hover:border-primary/50 cursor-pointer transition-colors"
              @click="router.push({ name: 'forum-thread', params: { threadId: String(post.threadId) } })"
            >
              <CardHeader>
                <div class="flex items-start justify-between gap-2">
                  <div class="space-y-1">
                    <CardTitle class="text-base">{{ post.threadTitle }}</CardTitle>
                    <p class="text-sm text-muted-foreground">in {{ post.categoryName }}</p>
                  </div>
                  <Badge variant="outline" class="text-xs shrink-0">
                    {{ formatDistanceToNow(new Date(post.createdAt), { addSuffix: true }) }}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent>
                <p class="text-sm text-muted-foreground">{{ post.content }}</p>
              </CardContent>
            </Card>
            <PaginationWithEllipsis
              v-if="postsPagination"
              :current-page="postsPage"
              :total-pages="postsPagination.totalPages"
              @page-change="loadPosts"
            />
          </div>
        </TabsContent>
      </Tabs>
    </div>
  </div>
</template>
