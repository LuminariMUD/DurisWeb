<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import BreadcrumbsNav from '@/components/layout/BreadcrumbsNav.vue'
import PaginationWithEllipsis from '@/components/forum/PaginationWithEllipsis.vue'
import { characterApi } from '@/services/api'
import { parseAnsiToHtml, slugify } from '@/utils/ansiParser'
import { formatDistanceToNow } from 'date-fns'

const route = useRoute()
const router = useRouter()

const characterName = computed(() => route.params.characterName as string)

const profile = ref<any>(null)
const isLoading = ref(false)
const error = ref<string | null>(null)

// Forum posts tab
const posts = ref<any[]>([])
const postsPage = ref(1)
const postsPagination = ref<any>(null)
const loadingPosts = ref(false)

// PvP events tab
const pvpEvents = ref<any[]>([])
const pvpPage = ref(1)
const pvpPagination = ref<any>(null)
const loadingPvP = ref(false)

const activeTab = ref('stats')

// Computed stats
const kdRatio = computed(() => {
  if (!profile.value?.stats) return '0.00'
  const { pvpKills, pvpDeaths } = profile.value.stats
  if (pvpDeaths === 0) return pvpKills > 0 ? '∞' : '0.00'
  return (pvpKills / pvpDeaths).toFixed(2)
})

const playtimeHours = computed(() => {
  if (!profile.value?.playtime) return 0
  return Math.floor(profile.value.playtime / 3600)
})

async function loadProfile() {
  isLoading.value = true
  error.value = null

  try {
    profile.value = await characterApi.getCharacterProfile(characterName.value)
  } catch (err: any) {
    error.value = err.response?.data?.error || 'Failed to load character profile'
  } finally {
    isLoading.value = false
  }
}

async function loadPosts(page: number = 1) {
  loadingPosts.value = true

  try {
    const result = await characterApi.getCharacterPosts(characterName.value, page, 20)
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
    const result = await characterApi.getCharacterPvPEvents(characterName.value, page, 20)
    pvpEvents.value = result.events
    pvpPagination.value = result.pagination
    pvpPage.value = page
  } catch {
  } finally {
    loadingPvP.value = false
  }
}

function navigateToThread(threadId: number) {
  router.push({ name: 'thread', params: { threadId: threadId.toString() } })
}

function navigateToPvPEvent(eventId: number) {
  router.push({ name: 'pvp-battle', params: { eventId: eventId.toString() } })
}

// Watch for tab changes to lazy load data
watch(activeTab, (newTab) => {
  if (newTab === 'posts' && posts.value.length === 0) {
    loadPosts(1)
  } else if (newTab === 'pvp' && pvpEvents.value.length === 0) {
    loadPvPEvents(1)
  }
})

// Watch for character name changes (route param)
watch(characterName, () => {
  loadProfile()
  posts.value = []
  pvpEvents.value = []
  activeTab.value = 'stats'
})

onMounted(() => {
  loadProfile()
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

    <!-- Character Profile -->
    <div v-else-if="profile" class="space-y-4 lg:space-y-6">
      <!-- Header Card -->
      <Card>
        <CardHeader class="p-4 lg:p-6">
          <div class="space-y-2">
            <div class="flex items-center gap-2 flex-wrap">
              <CardTitle class="text-xl lg:text-3xl">{{ profile.name }}</CardTitle>
              <Badge v-if="!profile.active" variant="outline" class="text-xs">Inactive</Badge>
              <Badge v-if="profile.racewar" variant="destructive" class="text-xs">Racewar</Badge>
            </div>
            <div class="flex items-center gap-2 text-xs lg:text-sm text-muted-foreground flex-wrap">
              <span>Level {{ profile.level }}</span>
              <span>•</span>
              <span>{{ profile.race }}</span>
              <span>{{ profile.class }}</span>
              <span v-if="profile.spec">(<span v-html="parseAnsiToHtml(profile.spec)"></span>)</span>
            </div>
            <div v-if="profile.guild" class="flex items-center gap-2 flex-wrap">
              <span class="text-xs lg:text-sm text-muted-foreground">Guild:</span>
              <RouterLink
                v-if="profile.guildInfo"
                :to="`/guild/${slugify(profile.guildInfo.guildName)}`"
                class="text-xs lg:text-sm font-medium hover:underline"
              >
                <span v-html="parseAnsiToHtml(profile.guild)"></span>
              </RouterLink>
              <span
                v-else
                class="text-xs lg:text-sm font-medium"
                v-html="parseAnsiToHtml(profile.guild)"
              ></span>
              <Badge v-if="profile.guildInfo" variant="secondary" class="text-[10px] lg:text-xs">
                {{ profile.guildInfo.rankTitle }}
              </Badge>
            </div>
          </div>
        </CardHeader>
      </Card>

      <!-- Web Info Disabled Notice -->
      <Card v-if="profile.webInfoEnabled === false" class="border-muted">
        <CardContent class="p-4">
          <p class="text-sm text-muted-foreground text-center">
            extended info is hidden by player preference (tog web info)
          </p>
        </CardContent>
      </Card>

      <!-- Stats Grid (only shown when webInfoEnabled) -->
      <div v-if="profile.stats" class="grid grid-cols-2 lg:flex lg:flex-wrap gap-2 lg:gap-4">
        <Card class="lg:flex-1 lg:min-w-[150px]">
          <CardHeader class="p-3 lg:pb-3">
            <CardTitle class="text-xs lg:text-sm font-medium text-muted-foreground">Posts</CardTitle>
          </CardHeader>
          <CardContent class="p-3 pt-0 lg:p-6 lg:pt-0">
            <div class="text-lg lg:text-2xl font-bold">{{ profile.stats.forumPosts }}</div>
          </CardContent>
        </Card>

        <Card class="lg:flex-1 lg:min-w-[150px]">
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

        <Card v-if="profile.isOwner" class="lg:flex-1 lg:min-w-[150px]">
          <CardHeader class="p-3 lg:pb-3">
            <CardTitle class="text-xs lg:text-sm font-medium text-muted-foreground">Playtime</CardTitle>
          </CardHeader>
          <CardContent class="p-3 pt-0 lg:p-6 lg:pt-0">
            <div class="text-lg lg:text-2xl font-bold">{{ playtimeHours }}h</div>
          </CardContent>
        </Card>

        <Card class="lg:flex-1 lg:min-w-[150px]">
          <CardHeader class="p-3 lg:pb-3">
            <CardTitle class="text-xs lg:text-sm font-medium text-muted-foreground">Epics</CardTitle>
          </CardHeader>
          <CardContent class="p-3 pt-0 lg:p-6 lg:pt-0">
            <div class="text-lg lg:text-2xl font-bold">{{ profile.epics }}</div>
          </CardContent>
        </Card>
      </div>

      <!-- Tabs (only shown when webInfoEnabled) -->
      <Tabs v-if="profile.stats" v-model="activeTab" class="w-full">
        <TabsList class="grid w-full grid-cols-3">
          <TabsTrigger value="stats" class="text-xs lg:text-sm">Overview</TabsTrigger>
          <TabsTrigger value="posts" class="text-xs lg:text-sm">
            <span class="hidden sm:inline">Forum Activity</span>
            <span class="sm:hidden">Posts</span>
          </TabsTrigger>
          <TabsTrigger value="pvp" class="text-xs lg:text-sm">
            <span class="hidden sm:inline">PvP History</span>
            <span class="sm:hidden">PvP</span>
          </TabsTrigger>
        </TabsList>

        <!-- Stats Tab -->
        <TabsContent value="stats" class="space-y-4 mt-6">
          <Card>
            <CardHeader>
              <CardTitle>Character Information</CardTitle>
            </CardHeader>
            <CardContent class="space-y-2">
              <div class="grid grid-cols-2 gap-4">
                <div>
                  <p class="text-sm text-muted-foreground">PID</p>
                  <p class="font-medium">{{ profile.pid }}</p>
                </div>
                <template v-if="profile.isOwner">
                  <div>
                    <p class="text-sm text-muted-foreground">Money</p>
                    <p class="font-medium">{{ profile.money?.toLocaleString() ?? 0 }} gold</p>
                  </div>
                  <div>
                    <p class="text-sm text-muted-foreground">Bank Balance</p>
                    <p class="font-medium">{{ profile.balance?.toLocaleString() ?? 0 }} gold</p>
                  </div>
                </template>
                <div>
                  <p class="text-sm text-muted-foreground">Status</p>
                  <Badge :variant="profile.active ? 'default' : 'outline'">
                    {{ profile.active ? 'Active' : 'Inactive' }}
                  </Badge>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <!-- Forum Posts Tab -->
        <TabsContent value="posts" class="space-y-4 mt-6">
          <div v-if="loadingPosts" class="space-y-4">
            <Skeleton class="h-24" />
            <Skeleton class="h-24" />
            <Skeleton class="h-24" />
          </div>

          <div v-else-if="posts.length === 0">
            <Card>
              <CardContent class="py-8 text-center text-muted-foreground">
                No forum posts yet
              </CardContent>
            </Card>
          </div>

          <div v-else class="space-y-4">
            <Card
              v-for="post in posts"
              :key="post.id"
              class="hover:border-primary/50 cursor-pointer transition-colors"
              @click="navigateToThread(post.threadId)"
            >
              <CardHeader>
                <div class="flex items-start justify-between">
                  <div class="space-y-1">
                    <CardTitle class="text-base">{{ post.threadTitle }}</CardTitle>
                    <p class="text-sm text-muted-foreground">
                      in {{ post.categoryName }}
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
              v-if="postsPagination"
              :current-page="postsPage"
              :total-pages="postsPagination.totalPages"
              @page-change="loadPosts"
            />
          </div>
        </TabsContent>

        <!-- PvP Events Tab -->
        <TabsContent value="pvp" class="space-y-4 mt-6">
          <div v-if="loadingPvP" class="space-y-4">
            <Skeleton class="h-24" />
            <Skeleton class="h-24" />
            <Skeleton class="h-24" />
          </div>

          <div v-else-if="pvpEvents.length === 0">
            <Card>
              <CardContent class="py-8 text-center text-muted-foreground">
                No PvP events recorded
              </CardContent>
            </Card>
          </div>

          <div v-else class="space-y-4">
            <Card
              v-for="event in pvpEvents"
              :key="event.eventId"
              class="hover:border-primary/50 cursor-pointer transition-colors"
              @click="navigateToPvPEvent(event.eventId)"
            >
              <CardHeader>
                <div class="flex items-start justify-between">
                  <div class="space-y-1">
                    <div class="flex items-center gap-2">
                      <Badge
                        :variant="event.role.includes('KILLER') ? 'default' : 'destructive'"
                      >
                        {{ event.role }}
                      </Badge>
                      <Badge v-if="event.isLeader" variant="secondary">Leader</Badge>
                      <Badge v-if="!event.inRoom" variant="outline">Not in room</Badge>
                    </div>
                    <p class="text-sm font-medium" v-html="parseAnsiToHtml(event.location)"></p>
                  </div>
                  <Badge variant="outline" class="text-xs">
                    {{ formatDistanceToNow(new Date(event.date), { addSuffix: true }) }}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent>
                <p class="text-sm" v-html="parseAnsiToHtml(event.description)"></p>
              </CardContent>
            </Card>

            <!-- Pagination -->
            <PaginationWithEllipsis
              v-if="pvpPagination"
              :current-page="pvpPage"
              :total-pages="pvpPagination.totalPages"
              @page-change="loadPvPEvents"
            />
          </div>
        </TabsContent>
      </Tabs>
    </div>
  </div>
</template>
