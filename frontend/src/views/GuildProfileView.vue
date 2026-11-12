<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { isAxiosError } from 'axios'
import { useRoute, useRouter } from 'vue-router'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import BreadcrumbsNav from '@/components/layout/BreadcrumbsNav.vue'
import PaginationWithEllipsis from '@/components/forum/PaginationWithEllipsis.vue'
import { guildApi } from '@/features/profile/api'
import { parseAnsiToHtml } from '@/utils/ansiParser'
import { formatDistanceToNow } from 'date-fns'

const route = useRoute()
const router = useRouter()

// Get the slug from URL params (e.g., "the-netheril-mages")
const guildSlug = computed(() => route.params.guildName as string)

const profile = ref<any>(null)
const isLoading = ref(false)
const error = ref<string | null>(null)

// Forum activity tab
const forumActivity = ref<any[]>([])
const activityPage = ref(1)
const activityPagination = ref<any>(null)
const loadingActivity = ref(false)
const activityError = ref<string | null>(null)
let profileGeneration = 0
let activityGeneration = 0

const activeTab = ref('overview')

function publicErrorMessage(error: unknown, fallback: string): string {
  const data: unknown = isAxiosError(error) ? error.response?.data : undefined
  if (!data || typeof data !== 'object' || !('error' in data)) return fallback
  const detail = data.error
  if (typeof detail === 'string') return detail
  if (
    detail &&
    typeof detail === 'object' &&
    'message' in detail &&
    typeof detail.message === 'string'
  )
    return detail.message
  return fallback
}

// Computed stats
const kdRatio = computed(() => {
  if (!profile.value?.stats) return '0.00'
  const { pvpKills, pvpDeaths } = profile.value.stats
  if (pvpDeaths === 0) return pvpKills > 0 ? '∞' : '0.00'
  return (pvpKills / pvpDeaths).toFixed(2)
})

// Sort members by rank (descending) then level (descending)
const sortedMembers = computed(() => {
  if (!profile.value?.members) return []
  return [...profile.value.members].sort((a, b) => {
    if (a.rankNumber !== b.rankNumber) {
      return b.rankNumber - a.rankNumber // Higher ranks first
    }
    return b.level - a.level // Higher levels first
  })
})

async function loadProfile() {
  const request = ++profileGeneration
  const slug = guildSlug.value
  activityGeneration++
  profile.value = null
  forumActivity.value = []
  activityPagination.value = null
  activityPage.value = 1
  loadingActivity.value = false
  activityError.value = null
  isLoading.value = true
  error.value = null

  try {
    // Send the slug to the API (backend will match it)
    const result = await guildApi.getGuildProfile(slug)
    if (request === profileGeneration && slug === guildSlug.value) profile.value = result
  } catch (err: unknown) {
    if (request === profileGeneration && slug === guildSlug.value)
      error.value = publicErrorMessage(err, 'Failed to load guild profile')
  } finally {
    if (request === profileGeneration) isLoading.value = false
  }
}

async function loadForumActivity(page: number = 1) {
  const name = profile.value?.name
  if (!name) return
  const request = ++activityGeneration
  const slug = guildSlug.value
  activityPage.value = page
  activityError.value = null
  loadingActivity.value = true

  try {
    // Use the guild name from the loaded profile (with ANSI codes)
    const result = await guildApi.getGuildForumActivity(name, page, 20)
    if (request !== activityGeneration || slug !== guildSlug.value) return
    forumActivity.value = result.posts
    activityPagination.value = result.pagination
    activityPage.value = page
  } catch (err: unknown) {
    if (request === activityGeneration && slug === guildSlug.value) {
      forumActivity.value = []
      activityPagination.value = null
      activityError.value = publicErrorMessage(err, 'Failed to load guild activity')
    }
  } finally {
    if (request === activityGeneration) loadingActivity.value = false
  }
}

function navigateToThread(threadId: number) {
  router.push({ name: 'forum-thread', params: { threadId: threadId.toString() } })
}

// The guild payload flags members whose character is still live (issue #181).
const isCharacterDeleted = (member: { characterExists: boolean }): boolean =>
  !member.characterExists

function navigateToCharacter(member: { name: string; characterExists: boolean }) {
  if (!member.characterExists) return
  router.push({ name: 'character-profile', params: { characterName: member.name } })
}

// Watch for tab changes
watch(activeTab, (newTab) => {
  if (newTab === 'activity' && forumActivity.value.length === 0) {
    void loadForumActivity(1)
  }
})

// Watch for guild slug changes
watch(guildSlug, () => {
  activeTab.value = 'overview'
  void loadProfile()
})

onMounted(() => {
  void loadProfile()
})
onUnmounted(() => {
  profileGeneration++
  activityGeneration++
})
</script>

<template>
  <div class="container mx-auto px-4 py-8">
    <!-- Breadcrumbs -->
    <BreadcrumbsNav />

    <!-- Error State -->
    <Card v-if="error" class="border-destructive">
      <CardHeader>
        <CardTitle class="text-destructive">Error</CardTitle>
      </CardHeader>
      <CardContent>
        <p>{{ error }}</p>
      </CardContent>
    </Card>

    <!-- Loading State -->
    <div v-else-if="isLoading" class="space-y-4 lg:space-y-6">
      <Skeleton class="h-24 lg:h-32 w-full" />
      <div class="grid grid-cols-2 lg:grid-cols-4 gap-2 lg:gap-4">
        <Skeleton class="h-16 lg:h-24" />
        <Skeleton class="h-16 lg:h-24" />
        <Skeleton class="h-16 lg:h-24" />
        <Skeleton class="h-16 lg:h-24" />
      </div>
    </div>

    <!-- Guild Profile -->
    <div v-else-if="profile" class="space-y-4 lg:space-y-6">
      <!-- Header Card -->
      <Card>
        <CardHeader class="p-4 lg:p-6">
          <div class="space-y-2">
            <div class="flex items-center gap-2 flex-wrap">
              <CardTitle class="text-xl lg:text-3xl"><span v-html="parseAnsiToHtml(profile.name)"></span></CardTitle>
              <Badge v-if="profile.racewar" variant="destructive" class="text-xs">Racewar</Badge>
            </div>
            <div class="flex items-center gap-2 text-xs lg:text-sm text-muted-foreground flex-wrap">
              <span class="hidden sm:inline">Guild ID: {{ profile.id }}</span>
              <span class="hidden sm:inline">•</span>
              <span>{{ profile.stats.totalMembers }} Members</span>
              <span>•</span>
              <span>{{ profile.frags }} Frags</span>
            </div>
          </div>
        </CardHeader>
      </Card>

      <!-- Stats Grid -->
      <div class="grid grid-cols-2 lg:grid-cols-4 gap-2 lg:gap-4">
        <Card>
          <CardHeader class="p-3 lg:pb-3">
            <CardTitle class="text-xs lg:text-sm font-medium text-muted-foreground">Members</CardTitle>
          </CardHeader>
          <CardContent class="p-3 pt-0 lg:p-6 lg:pt-0">
            <div class="text-lg lg:text-2xl font-bold">{{ profile.stats.totalMembers }}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader class="p-3 lg:pb-3">
            <CardTitle class="text-xs lg:text-sm font-medium text-muted-foreground">K/D</CardTitle>
          </CardHeader>
          <CardContent class="p-3 pt-0 lg:p-6 lg:pt-0">
            <div class="text-lg lg:text-2xl font-bold">{{ kdRatio }}</div>
            <p class="text-[10px] lg:text-xs text-muted-foreground mt-1">
              {{ profile.stats.pvpKills }}k / {{ profile.stats.pvpDeaths }}d
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader class="p-3 lg:pb-3">
            <CardTitle class="text-xs lg:text-sm font-medium text-muted-foreground">Posts</CardTitle>
          </CardHeader>
          <CardContent class="p-3 pt-0 lg:p-6 lg:pt-0">
            <div class="text-lg lg:text-2xl font-bold">{{ profile.stats.forumPosts }}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader class="p-3 lg:pb-3">
            <CardTitle class="text-xs lg:text-sm font-medium text-muted-foreground">Frags</CardTitle>
          </CardHeader>
          <CardContent class="p-3 pt-0 lg:p-6 lg:pt-0">
            <div class="text-lg lg:text-2xl font-bold">{{ profile.frags }}</div>
          </CardContent>
        </Card>
      </div>

      <!-- Tabs -->
      <Tabs v-model="activeTab" class="w-full">
        <TabsList class="grid w-full grid-cols-2">
          <TabsTrigger value="overview">Members</TabsTrigger>
          <TabsTrigger value="activity">Forum Activity</TabsTrigger>
        </TabsList>

        <!-- Members Tab -->
        <TabsContent value="overview" class="space-y-4 mt-4 lg:mt-6">
          <Card>
            <CardHeader class="p-3 lg:p-6">
              <CardTitle class="text-base lg:text-lg">Guild Roster ({{ profile.members.length }})</CardTitle>
            </CardHeader>
            <CardContent class="p-3 pt-0 lg:p-6 lg:pt-0">
              <div class="space-y-1 lg:space-y-2">
                <div
                  v-for="member in sortedMembers"
                  :key="member.pid"
                  class="flex items-center justify-between p-2 lg:p-3 rounded-lg transition-colors"
                  :class="isCharacterDeleted(member) ? '' : 'hover:bg-accent/50 cursor-pointer'"
                  @click="navigateToCharacter(member)"
                >
                  <div class="min-w-0 flex-1">
                    <div class="flex items-center gap-2 flex-wrap">
                      <p
                        v-if="isCharacterDeleted(member)"
                        class="text-sm lg:text-base font-medium line-through decoration-danger text-muted-foreground truncate"
                      >{{ member.name }}</p>
                      <p
                        v-else
                        class="text-sm lg:text-base font-medium hover:underline truncate"
                      >{{ member.name }}</p>
                      <Badge v-if="!member.active" variant="outline" class="text-[10px] lg:text-xs">Inactive</Badge>
                    </div>
                    <p class="text-xs lg:text-sm text-muted-foreground">
                      Lv{{ member.level }} <span v-html="parseAnsiToHtml(member.class)"></span>
                    </p>
                  </div>
                  <div class="text-right flex-shrink-0 ml-2">
                    <Badge variant="secondary" class="text-[10px] lg:text-xs">
                      <span v-html="parseAnsiToHtml(member.rankTitle)"></span>
                    </Badge>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <!-- Forum Activity Tab -->
        <TabsContent value="activity" class="space-y-4 mt-6">
          <div v-if="loadingActivity" class="space-y-4">
            <Skeleton class="h-24" />
            <Skeleton class="h-24" />
            <Skeleton class="h-24" />
          </div>

          <Alert v-else-if="activityError" variant="destructive">
            <AlertTitle>Activity unavailable</AlertTitle>
            <AlertDescription class="flex flex-col gap-2">
              <p>{{ activityError }}</p>
              <Button variant="outline" size="sm" class="self-start" @click="loadForumActivity(activityPage)">Retry</Button>
            </AlertDescription>
          </Alert>

          <div v-else-if="forumActivity.length === 0">
            <Card>
              <CardContent class="py-8 text-center text-muted-foreground">
                No recent forum activity
              </CardContent>
            </Card>
          </div>

          <div v-else class="space-y-4">
            <Card
              v-for="post in forumActivity"
              :key="post.id"
              class="hover:border-primary/50 cursor-pointer transition-colors"
              @click="navigateToThread(post.threadId)"
            >
              <CardHeader>
                <div class="flex items-start justify-between">
                  <div class="space-y-1">
                    <CardTitle class="text-base">{{ post.threadTitle }}</CardTitle>
                    <p class="text-sm text-muted-foreground">
                      by {{ post.characterName }} in {{ post.categoryName }}
                    </p>
                  </div>
                  <Badge variant="outline" class="text-xs">
                    {{ formatDistanceToNow(new Date(post.createdAt), { addSuffix: true }) }}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent>
                <p class="text-sm text-muted-foreground">{{ post.content }}</p>
              </CardContent>
            </Card>

            <!-- Pagination -->
            <PaginationWithEllipsis
              v-if="activityPagination"
              :current-page="activityPage"
              :total-pages="activityPagination.totalPages"
              @page-change="loadForumActivity"
            />
          </div>
        </TabsContent>
      </Tabs>
    </div>
  </div>
</template>
