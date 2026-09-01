<script setup lang="ts">
import { ref, computed } from 'vue'
import { useQuery } from '@tanstack/vue-query'
import { gitApi } from '@/services/api'
import { useAuth } from '@/composables/useAuth'
import type { GitCommit } from '@/types'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import Pagination from '@/components/forum/PaginationWithEllipsis.vue'
import DeploymentLogDialog from '@/components/admin/DeploymentLogDialog.vue'
import {
  GitBranch,
  RefreshCw,
  Check,
  AlertCircle,
  FileCode,
  ArrowUp,
  ArrowDown,
} from 'lucide-vue-next'

const { user } = useAuth()

const currentPage = ref(1)
const limit = 50
const forceRefresh = ref(false)

// Fetch status separately (doesn't change with pagination)
const { data: statusData, refetch: refetchStatus } = useQuery({
  queryKey: ['git-status'],
  queryFn: () => gitApi.getStatus(),
  staleTime: 1000 * 60 * 5, // 5 minutes
})

// Fetch commits with pagination
const { data, isLoading, error, refetch, isFetching } = useQuery({
  queryKey: ['git-commits', currentPage],
  queryFn: async () => {
    const refresh = forceRefresh.value
    forceRefresh.value = false // Reset after use
    const result = await gitApi.getCommits(currentPage.value, limit, refresh)
    return {
      commits: result.commits,
      pagination: result.pagination,
    }
  },
})

const commits = computed(() => data.value?.commits || [])
const pagination = computed(() => data.value?.pagination)
const status = computed(() => statusData.value)

// Format date for display
function formatDate(dateString: string): string {
  const date = new Date(dateString)
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

// Check if commit is the currently deployed one
function isDeployed(commit: GitCommit): boolean {
  return status.value?.currentHash === commit.hash
}

// Truncate message if too long
function truncateMessage(message: string, maxLength: number = 60): string {
  if (message.length <= maxLength) return message
  return message.substring(0, maxLength) + '...'
}

// Handle page change
function onPageChange(page: number) {
  currentPage.value = page
}

// Handle refresh - force cache refresh on backend
async function handleRefresh() {
  forceRefresh.value = true
  currentPage.value = 1 // Go back to first page
  await Promise.all([refetch(), refetchStatus()])
}

// Deployment state
const showDeployDialog = ref(false)
const targetCommit = ref<GitCommit | null>(null)
const deployAction = ref<'deploy' | 'rollback'>('deploy')

// Check if user is overlord (level 62+)
const isOverlord = computed(() => {
  return user.value?.permissions?.role === 'overlord'
})

// Determine if commit is newer than deployed (for Deploy vs Rollback button)
function isNewerThanDeployed(commit: GitCommit): boolean {
  if (!status.value?.currentHash) return false

  // Find index of current deployed commit in the list
  const deployedIndex = commits.value.findIndex((c) => c.hash === status.value?.currentHash)
  const commitIndex = commits.value.findIndex((c) => c.hash === commit.hash)

  // If deployed commit not found in current page, check by comparing with latest
  if (deployedIndex === -1) {
    // If we're on page 1 and deployed not found, all visible commits are newer
    if (currentPage.value === 1) return true
    // Otherwise we can't determine, default to deploy
    return true
  }

  // Lower index = newer commit (list is reverse chronological)
  return commitIndex < deployedIndex
}

// Handle deploy button click
function handleDeploy(commit: GitCommit) {
  targetCommit.value = commit
  deployAction.value = isNewerThanDeployed(commit) ? 'deploy' : 'rollback'
  showDeployDialog.value = true
}

// Handle deployment complete
async function onDeployComplete(success: boolean) {
  if (success) {
    // Refresh data after successful deployment
    forceRefresh.value = true
    await Promise.all([refetch(), refetchStatus()])
  }
}
</script>

<template>
  <div>
    <!-- Header -->
    <div class="flex items-center justify-between mb-6">
      <div>
        <div class="flex items-center gap-2">
          <GitBranch class="h-8 w-8" />
          <h1 class="text-3xl font-bold">Git History</h1>
        </div>
        <p class="text-muted-foreground mt-1">MUD codebase commit history and deployment status</p>
      </div>
      <Button
        variant="outline"
        @click="handleRefresh"
        :disabled="isFetching"
      >
        <RefreshCw class="h-4 w-4 mr-2" :class="{ 'animate-spin': isFetching }" />
        Refresh
      </Button>
    </div>

    <!-- Deployment Status Card -->
    <Card v-if="status" class="mb-6">
      <CardHeader class="pb-3">
        <CardTitle class="text-lg">Deployment Status</CardTitle>
        <CardDescription>Current deployed version vs latest remote</CardDescription>
      </CardHeader>
      <CardContent>
        <div class="flex flex-wrap gap-6">
          <!-- Current Deployed -->
          <div class="flex items-center gap-3">
            <div class="flex items-center justify-center w-10 h-10 rounded-full bg-green-500/10">
              <Check class="h-5 w-5 text-green-500" />
            </div>
            <div>
              <div class="text-sm text-muted-foreground">Currently Deployed</div>
              <div class="font-mono font-semibold">{{ status.currentShortHash }}</div>
            </div>
          </div>

          <!-- Latest Remote -->
          <div class="flex items-center gap-3">
            <div class="flex items-center justify-center w-10 h-10 rounded-full bg-blue-500/10">
              <GitBranch class="h-5 w-5 text-blue-500" />
            </div>
            <div>
              <div class="text-sm text-muted-foreground">Latest on {{ status.branch }}</div>
              <div class="font-mono font-semibold">{{ status.latestRemoteShortHash }}</div>
            </div>
          </div>

          <!-- Commits Ahead -->
          <div class="flex items-center gap-3">
            <div
              class="flex items-center justify-center w-10 h-10 rounded-full"
              :class="status.commitsAhead > 0 ? 'bg-yellow-500/10' : 'bg-green-500/10'"
            >
              <AlertCircle
                v-if="status.commitsAhead > 0"
                class="h-5 w-5 text-yellow-500"
              />
              <Check v-else class="h-5 w-5 text-green-500" />
            </div>
            <div>
              <div class="text-sm text-muted-foreground">Status</div>
              <div class="font-semibold">
                <span v-if="status.commitsAhead > 0" class="text-yellow-500">
                  {{ status.commitsAhead }} commit{{ status.commitsAhead > 1 ? 's' : '' }} behind
                </span>
                <span v-else class="text-green-500">
                  Up to date
                </span>
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>

    <!-- Loading State (only for initial load) -->
    <div v-if="isLoading && !data" class="space-y-4">
      <Skeleton class="h-12 w-full" />
      <Skeleton class="h-12 w-full" />
      <Skeleton class="h-12 w-full" />
      <Skeleton class="h-12 w-full" />
      <Skeleton class="h-12 w-full" />
    </div>

    <!-- Error State -->
    <Card v-else-if="error && !data" class="border-destructive">
      <CardContent class="pt-6">
        <p class="text-destructive">Failed to load git history: {{ (error as Error).message }}</p>
        <Button @click="() => refetch()" class="mt-4">Retry</Button>
      </CardContent>
    </Card>

    <!-- Commits Table -->
    <Card v-else-if="commits.length > 0" :class="{ 'opacity-50': isFetching }">
      <CardContent class="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead class="w-[140px]">Date</TableHead>
              <TableHead class="w-[80px]">Commit</TableHead>
              <TableHead class="w-[120px]">Author</TableHead>
              <TableHead>Message</TableHead>
              <TableHead class="w-[100px] text-right">Changes</TableHead>
              <TableHead class="w-[100px] text-center">Status</TableHead>
              <TableHead v-if="isOverlord" class="w-[110px] text-center">Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRow
              v-for="commit in commits"
              :key="commit.hash"
              :class="{ 'bg-green-500/5': isDeployed(commit) }"
            >
              <TableCell class="text-sm text-muted-foreground">
                {{ formatDate(commit.date) }}
              </TableCell>
              <TableCell>
                <a
                  :href="`https://github.com/Community-Duris/DurisMUD/commit/${commit.hash}`"
                  target="_blank"
                  rel="noopener noreferrer"
                  class="hover:underline"
                >
                  <code class="text-xs font-mono bg-muted px-1.5 py-0.5 rounded hover:bg-primary/20">
                    {{ commit.shortHash }}
                  </code>
                </a>
              </TableCell>
              <TableCell class="text-sm">
                {{ commit.author }}
              </TableCell>
              <TableCell class="text-sm" :title="commit.message">
                {{ truncateMessage(commit.message) }}
              </TableCell>
              <TableCell class="text-right">
                <div class="flex items-center justify-end gap-2 text-xs">
                  <FileCode class="h-3.5 w-3.5 text-muted-foreground" />
                  <span class="text-muted-foreground">{{ commit.filesChanged }}</span>
                  <span class="text-green-500">+{{ commit.insertions }}</span>
                  <span class="text-red-500">-{{ commit.deletions }}</span>
                </div>
              </TableCell>
              <TableCell class="text-center">
                <Badge
                  v-if="isDeployed(commit)"
                  variant="default"
                  class="bg-green-500 hover:bg-green-600"
                >
                  DEPLOYED
                </Badge>
              </TableCell>
              <TableCell v-if="isOverlord" class="text-center">
                <Button
                  v-if="!isDeployed(commit)"
                  :variant="isNewerThanDeployed(commit) ? 'default' : 'destructive'"
                  size="sm"
                  @click="handleDeploy(commit)"
                >
                  <ArrowUp v-if="isNewerThanDeployed(commit)" class="h-4 w-4 mr-1" />
                  <ArrowDown v-else class="h-4 w-4 mr-1" />
                  {{ isNewerThanDeployed(commit) ? 'Deploy' : 'Rollback' }}
                </Button>
                <Badge v-else variant="outline" class="text-green-500 border-green-500">
                  Current
                </Badge>
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </CardContent>
    </Card>

    <!-- Empty State -->
    <Card v-else>
      <CardContent class="pt-6 text-center py-12">
        <GitBranch class="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-50" />
        <p class="text-muted-foreground">No commits found</p>
      </CardContent>
    </Card>

    <!-- Pagination -->
    <div v-if="pagination && pagination.totalPages > 1" class="mt-6">
      <Pagination
        :current-page="currentPage"
        :total-pages="pagination.totalPages"
        @page-change="onPageChange"
      />
    </div>

    <!-- Deployment Dialog -->
    <DeploymentLogDialog
      v-model:open="showDeployDialog"
      :target-hash="targetCommit?.hash || ''"
      :target-message="targetCommit?.message || ''"
      :action="deployAction"
      @complete="onDeployComplete"
    />
  </div>
</template>
