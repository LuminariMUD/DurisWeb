<script setup lang="ts">
import { ref, onMounted, computed, watch } from 'vue'
import { useRouter } from 'vue-router'
import { profileApi, pvpApi } from '@/services/api'
import { useAuth } from '@/composables/useAuth'
import { ThumbsUp, MessageSquare, Star, Clock } from 'lucide-vue-next'
import type {
  UserProfileWithStats,
  UserPost,
  UserThread,
  CharacterWithStats,
  AccountCharactersResponse,
  PvPFavorite,
} from '@/types'
import { parseAnsiForVue } from '@/utils/ansiParser'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import BreadcrumbsNav from '@/components/layout/BreadcrumbsNav.vue'
import PaginationWithEllipsis from '@/components/forum/PaginationWithEllipsis.vue'
import ProfileHeroBanner from '@/components/profile/ProfileHeroBanner.vue'
import PushNotificationToggle from '@/components/profile/PushNotificationToggle.vue'
import CharacterCard from '@/components/profile/CharacterCard.vue'
import StatsSummaryBar from '@/components/profile/StatsSummaryBar.vue'

const props = defineProps<{
  accountName: string
}>()

const router = useRouter()
const { accountName: currentUserAccount, hasPermission } = useAuth()

const profile = ref<UserProfileWithStats | null>(null)
const characters = ref<CharacterWithStats[]>([])
const characterTotals = ref<AccountCharactersResponse['totals'] | null>(null)
const posts = ref<UserPost[]>([])
const threads = ref<UserThread[]>([])
const favorites = ref<PvPFavorite[]>([])
const isLoading = ref(true)
const isLoadingCharacters = ref(false)
const isLoadingFavorites = ref(false)
const error = ref<string | null>(null)

// Pagination
const postsPage = ref(1)
const postsTotalPages = ref(1)
const threadsPage = ref(1)
const threadsTotalPages = ref(1)
const favoritesPage = ref(1)
const favoritesTotalPages = ref(1)

// Edit mode
const isEditDialogOpen = ref(false)
const editBio = ref('')
const editWebsite = ref('')
const editLocation = ref('')
const isSaving = ref(false)

// Active tab
const activeTab = ref('characters')

// Expanded characters - all expanded or all collapsed
const areCharactersExpanded = ref(false)

const isOwnProfile = computed(() => currentUserAccount.value === props.accountName)
const canEditProfile = computed(() => {
  return isOwnProfile.value || hasPermission('manage_user_profiles')
})

// Toggle all character cards expansion
function toggleCharacters() {
  areCharactersExpanded.value = !areCharactersExpanded.value
}

async function loadProfile() {
  isLoading.value = true
  error.value = null

  try {
    profile.value = await profileApi.getUserProfile(props.accountName)
  } catch (err: any) {
    error.value = err.response?.data?.error || 'Failed to load profile'
  } finally {
    isLoading.value = false
  }
}

async function loadCharacters() {
  isLoadingCharacters.value = true
  try {
    const response = await profileApi.getAccountCharacters(props.accountName)
    characters.value = response.characters
    characterTotals.value = response.totals
    // Auto-expand if there's only one character
    if (characters.value.length === 1) {
      areCharactersExpanded.value = true
    }
  } catch {
    // Silently fail - characters tab will show empty state
    characters.value = []
    characterTotals.value = null
  } finally {
    isLoadingCharacters.value = false
  }
}

async function loadPosts(page: number = 1) {
  try {
    const response = await profileApi.getUserPosts(props.accountName, page, 20)
    posts.value = response.posts
    postsPage.value = response.pagination.page
    postsTotalPages.value = response.pagination.totalPages
  } catch {
    // Silently fail
  }
}

async function loadThreads(page: number = 1) {
  try {
    const response = await profileApi.getUserThreads(props.accountName, page, 20)
    threads.value = response.threads
    threadsPage.value = response.pagination.page
    threadsTotalPages.value = response.pagination.totalPages
  } catch {
    // Silently fail
  }
}

async function loadFavorites(page: number = 1) {
  isLoadingFavorites.value = true
  try {
    const response = await pvpApi.getUserFavorites(props.accountName, page, 20)
    favorites.value = response.data
    favoritesPage.value = response.pagination.page
    favoritesTotalPages.value = response.pagination.totalPages
  } catch {
    // Silently fail - favorites tab will show empty state
    favorites.value = []
  } finally {
    isLoadingFavorites.value = false
  }
}

function openEditDialog() {
  editBio.value = profile.value?.bio || ''
  editWebsite.value = profile.value?.website || ''
  editLocation.value = profile.value?.location || ''
  isEditDialogOpen.value = true
}

async function saveProfile() {
  isSaving.value = true
  try {
    await profileApi.updateProfile({
      bio: editBio.value,
      website: editWebsite.value,
      location: editLocation.value,
    })
    isEditDialogOpen.value = false
    await loadProfile()
  } catch (err: any) {
    error.value = err.response?.data?.error || 'Failed to update profile'
  } finally {
    isSaving.value = false
  }
}

function handleAvatarUpdated(url: string | null) {
  if (profile.value) {
    profile.value.avatarUrl = url
  }
}

function handleBannerUpdated(url: string | null) {
  if (profile.value) {
    profile.value.bannerUrl = url
  }
}

function formatRelativeDate(dateString: string): string {
  const date = new Date(dateString)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))

  if (diffDays === 0) return 'Today'
  if (diffDays === 1) return 'Yesterday'
  if (diffDays < 7) return `${diffDays} days ago`
  if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`
  if (diffDays < 365) return `${Math.floor(diffDays / 30)} months ago`
  return `${Math.floor(diffDays / 365)} years ago`
}

function truncateContent(content: string, maxLength: number = 150): string {
  // Strip HTML tags first
  const text = content.replace(/<[^>]*>/g, '')
  if (text.length <= maxLength) return text
  return text.substring(0, maxLength) + '...'
}

// Watch for tab changes to load data lazily
watch(activeTab, (newTab) => {
  if (newTab === 'threads' && threads.value.length === 0) {
    loadThreads()
  } else if (newTab === 'posts' && posts.value.length === 0) {
    loadPosts()
  } else if (newTab === 'favorites' && favorites.value.length === 0) {
    loadFavorites()
  }
})

onMounted(async () => {
  await loadProfile()
  await loadCharacters()
})
</script>

<template>
  <div class="container mx-auto px-4 py-6 space-y-6">
    <!-- Breadcrumbs -->
    <BreadcrumbsNav />

    <!-- Loading State -->
    <div v-if="isLoading" class="space-y-4">
      <Skeleton class="h-32 lg:h-48 w-full rounded-lg" />
      <div class="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-7 gap-2 lg:gap-3">
        <Skeleton v-for="i in 7" :key="i" class="h-14 lg:h-20" />
      </div>
      <Skeleton class="h-64 lg:h-96 w-full" />
    </div>

    <!-- Error State -->
    <Card v-else-if="error" class="border-destructive">
      <CardContent class="pt-6">
        <p class="text-destructive">{{ error }}</p>
      </CardContent>
    </Card>

    <!-- Profile Content -->
    <template v-else-if="profile">
      <!-- Hero Banner -->
      <ProfileHeroBanner
        :account-name="profile.accountName"
        :bio="profile.bio"
        :avatar-url="profile.avatarUrl"
        :banner-url="profile.bannerUrl"
        :location="profile.location"
        :website="profile.website"
        :created-at="profile.createdAt"
        :is-own-profile="isOwnProfile"
        :can-edit="canEditProfile"
        @avatar-updated="handleAvatarUpdated"
        @banner-updated="handleBannerUpdated"
        @edit-profile="openEditDialog"
      />

      <PushNotificationToggle v-if="isOwnProfile" />

      <!-- Stats Summary Bar -->
      <StatsSummaryBar
        :character-count="characterTotals?.characterCount || profile.stats.characterCount || 0"
        :total-frags="characterTotals?.totalFrags || profile.stats.totalFrags || 0"
        :total-deaths="characterTotals?.totalDeaths || profile.stats.totalDeaths || 0"
        :total-wealth="characterTotals?.totalWealth || profile.stats.totalWealth || 0"
        :total-threads="profile.stats.totalThreads"
        :total-posts="profile.stats.totalPosts"
        :is-own-profile="isOwnProfile"
      />

      <!-- Tabs -->
      <Tabs v-model="activeTab" default-value="characters">
        <TabsList class="grid w-full grid-cols-4">
          <TabsTrigger value="characters" class="text-xs lg:text-sm px-1 lg:px-3">
            <span class="hidden sm:inline">Characters</span>
            <span class="sm:hidden">Chars</span>
            <span v-if="characters.length" class="ml-1 text-[10px] lg:text-xs text-muted-foreground">({{ characters.length }})</span>
          </TabsTrigger>
          <TabsTrigger value="threads" class="text-xs lg:text-sm px-1 lg:px-3">
            Threads
            <span class="ml-1 text-[10px] lg:text-xs text-muted-foreground hidden sm:inline">({{ profile.stats.totalThreads }})</span>
          </TabsTrigger>
          <TabsTrigger value="posts" class="text-xs lg:text-sm px-1 lg:px-3">
            Posts
            <span class="ml-1 text-[10px] lg:text-xs text-muted-foreground hidden sm:inline">({{ profile.stats.totalPosts }})</span>
          </TabsTrigger>
          <TabsTrigger value="favorites" class="text-xs lg:text-sm px-1 lg:px-3">
            <Star class="h-3 w-3 lg:h-4 lg:w-4 sm:mr-1" />
            <span class="hidden sm:inline">Favorites</span>
          </TabsTrigger>
        </TabsList>

        <!-- Characters Tab -->
        <TabsContent value="characters" class="space-y-4 mt-4">
          <!-- Loading state -->
          <div v-if="isLoadingCharacters" class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <Skeleton v-for="i in 3" :key="i" class="h-32" />
          </div>

          <!-- Characters grid -->
          <div v-else-if="characters.length" class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <CharacterCard
              v-for="character in characters"
              :key="character.pid"
              :character="character"
              :is-expanded="areCharactersExpanded"
              :is-own-profile="isOwnProfile"
              @toggle="toggleCharacters"
            />
          </div>

          <!-- Empty state -->
          <Card v-else>
            <CardContent class="pt-6 text-center text-muted-foreground">
              <p>No characters found</p>
            </CardContent>
          </Card>
        </TabsContent>

        <!-- Threads Tab -->
        <TabsContent value="threads" class="space-y-3 lg:space-y-4 mt-4">
          <Card
            v-for="thread in threads"
            :key="thread.id"
            class="hover:bg-accent/50 transition-colors cursor-pointer"
            @click="router.push(`/forum/thread/${thread.id}`)"
          >
            <CardHeader class="p-3 lg:pb-3">
              <div class="space-y-2">
                <div class="flex items-start gap-2">
                  <Badge v-if="thread.isPinned" variant="default" class="text-[10px] lg:text-xs flex-shrink-0">Pinned</Badge>
                  <Badge v-if="thread.isLocked" variant="secondary" class="text-[10px] lg:text-xs flex-shrink-0">Locked</Badge>
                  <CardTitle class="text-sm lg:text-lg line-clamp-2 lg:truncate">{{ thread.title }}</CardTitle>
                </div>
                <div class="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs lg:text-sm text-muted-foreground">
                  <span>in <span class="font-medium">{{ thread.categoryName }}</span></span>
                  <span v-if="thread.characterName">as {{ thread.characterName }}</span>
                  <span>{{ formatRelativeDate(thread.createdAt) }}</span>
                  <span class="ml-auto flex gap-2 text-[10px] lg:text-xs">
                    <span>{{ (thread.viewCount || 0).toLocaleString() }} views</span>
                    <span>{{ (thread.replyCount || 0).toLocaleString() }} replies</span>
                  </span>
                </div>
              </div>
            </CardHeader>
          </Card>

          <!-- Empty State -->
          <Card v-if="threads.length === 0">
            <CardContent class="pt-6 text-center text-muted-foreground">
              <p>No threads yet</p>
            </CardContent>
          </Card>

          <!-- Pagination -->
          <div v-if="threadsTotalPages > 1" class="mt-4">
            <PaginationWithEllipsis
              :current-page="threadsPage"
              :total-pages="threadsTotalPages"
              @page-change="loadThreads"
            />
          </div>
        </TabsContent>

        <!-- Posts Tab -->
        <TabsContent value="posts" class="space-y-3 lg:space-y-4 mt-4">
          <Card
            v-for="post in posts"
            :key="post.id"
            class="hover:bg-accent/50 transition-colors cursor-pointer"
            @click="router.push(`/forum/thread/${post.threadId}`)"
          >
            <CardHeader class="p-3 lg:pb-3">
              <div>
                <div class="text-xs lg:text-sm text-muted-foreground mb-2">
                  Replied in <span class="font-medium text-foreground">{{ post.threadTitle }}</span>
                  <span class="hidden sm:inline">
                    <span class="mx-1">-</span>
                    {{ post.categoryName }}
                  </span>
                  <span v-if="post.characterName" class="hidden sm:inline ml-2">as {{ post.characterName }}</span>
                </div>
                <p class="text-xs lg:text-sm line-clamp-2">{{ truncateContent(post.content) }}</p>
                <div class="text-[10px] lg:text-xs text-muted-foreground mt-2">
                  {{ formatRelativeDate(post.createdAt) }}
                  <span v-if="post.editedAt"> (edited)</span>
                </div>
              </div>
            </CardHeader>
          </Card>

          <!-- Empty State -->
          <Card v-if="posts.length === 0">
            <CardContent class="pt-6 text-center text-muted-foreground">
              <p>No posts yet</p>
            </CardContent>
          </Card>

          <!-- Pagination -->
          <div v-if="postsTotalPages > 1" class="mt-4">
            <PaginationWithEllipsis
              :current-page="postsPage"
              :total-pages="postsTotalPages"
              @page-change="loadPosts"
            />
          </div>
        </TabsContent>

        <!-- Favorites Tab -->
        <TabsContent value="favorites" class="space-y-4 mt-4">
          <!-- Loading state -->
          <div v-if="isLoadingFavorites" class="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Skeleton v-for="i in 4" :key="i" class="h-36" />
          </div>

          <!-- Favorites grid -->
          <div v-else-if="favorites.length" class="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card
              v-for="favorite in favorites"
              :key="favorite.eventId"
              class="hover:bg-accent/50 transition-colors cursor-pointer"
              @click="router.push(`/pvp/${favorite.eventId}`)"
            >
              <CardHeader class="pb-2">
                <div class="flex items-start justify-between gap-2">
                  <div class="flex-1 min-w-0">
                    <CardTitle class="text-base truncate"><span v-html="parseAnsiForVue(favorite.roomName)"></span></CardTitle>
                    <div class="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                      <Clock class="h-3 w-3" />
                      {{ formatRelativeDate(favorite.stamp) }}
                    </div>
                  </div>
                  <div class="flex items-center gap-3 text-sm text-muted-foreground">
                    <span class="flex items-center gap-1">
                      <ThumbsUp class="h-4 w-4" />
                      {{ favorite.likeCount }}
                    </span>
                    <span class="flex items-center gap-1">
                      <MessageSquare class="h-4 w-4" />
                      {{ favorite.commentCount }}
                    </span>
                  </div>
                </div>
              </CardHeader>
              <CardContent class="pt-0">
                <div class="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <div class="text-xs text-muted-foreground mb-1">Killers</div>
                    <div class="space-y-0.5">
                      <div
                        v-for="(killer, idx) in favorite.killers.slice(0, 3)"
                        :key="idx"
                        class="text-green-500 truncate text-xs"
                        v-html="parseAnsiForVue(killer)"
                      ></div>
                      <div v-if="favorite.killers.length > 3" class="text-xs text-muted-foreground">
                        +{{ favorite.killers.length - 3 }} more
                      </div>
                    </div>
                  </div>
                  <div>
                    <div class="text-xs text-muted-foreground mb-1">Victims</div>
                    <div class="space-y-0.5">
                      <div
                        v-for="(victim, idx) in favorite.victims.slice(0, 3)"
                        :key="idx"
                        class="text-red-500 truncate text-xs"
                        v-html="parseAnsiForVue(victim)"
                      ></div>
                      <div v-if="favorite.victims.length > 3" class="text-xs text-muted-foreground">
                        +{{ favorite.victims.length - 3 }} more
                      </div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          <!-- Empty State -->
          <Card v-else>
            <CardContent class="pt-6 text-center text-muted-foreground">
              <Star class="h-12 w-12 mx-auto mb-3 opacity-50" />
              <p>No favorited battles yet</p>
              <p class="text-sm mt-1">Star your favorite PvP battles to see them here</p>
            </CardContent>
          </Card>

          <!-- Pagination -->
          <div v-if="favoritesTotalPages > 1" class="mt-4">
            <PaginationWithEllipsis
              :current-page="favoritesPage"
              :total-pages="favoritesTotalPages"
              @page-change="loadFavorites"
            />
          </div>
        </TabsContent>
      </Tabs>
    </template>

    <!-- Edit Profile Dialog -->
    <Dialog :open="isEditDialogOpen" @update:open="isEditDialogOpen = $event">
      <DialogContent class="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Edit Profile</DialogTitle>
          <DialogDescription>
            Update your profile information.
          </DialogDescription>
        </DialogHeader>

        <div class="space-y-4 py-4">
          <div class="space-y-2">
            <Label for="bio">Bio</Label>
            <Textarea
              id="bio"
              v-model="editBio"
              placeholder="Tell us about yourself..."
              rows="4"
              maxlength="5000"
            />
          </div>

          <div class="space-y-2">
            <Label for="website">Website</Label>
            <Input
              id="website"
              v-model="editWebsite"
              placeholder="https://example.com"
              type="url"
            />
          </div>

          <div class="space-y-2">
            <Label for="location">Location</Label>
            <Input
              id="location"
              v-model="editLocation"
              placeholder="Your location"
              maxlength="100"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" @click="isEditDialogOpen = false" :disabled="isSaving">
            Cancel
          </Button>
          <Button @click="saveProfile" :disabled="isSaving">
            {{ isSaving ? 'Saving...' : 'Save Changes' }}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </div>
</template>
