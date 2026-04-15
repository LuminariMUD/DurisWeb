<script setup lang="ts">
import { useRouter } from 'vue-router'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Trophy, Medal } from 'lucide-vue-next'
import { parseAnsiToHtml } from '@/utils/ansiParser'
import { formatDistanceToNow } from 'date-fns'
import type { FragLeaderboardEntry } from '@/types'

interface Props {
  entries: FragLeaderboardEntry[]
  isLoading?: boolean
}

withDefaults(defineProps<Props>(), {
  isLoading: false,
})

const router = useRouter()

function goToUserProfile(accountName: string) {
  if (!accountName) return
  router.push(`/user/${encodeURIComponent(accountName)}`)
}

function getRankBadge(rank: number) {
  if (rank === 1) return { icon: Trophy, class: 'bg-yellow-500 text-white' }
  if (rank === 2) return { icon: Medal, class: 'bg-gray-300 text-gray-800' }
  if (rank === 3) return { icon: Medal, class: 'bg-amber-600 text-white' }
  return null
}

function getAlignmentLabel(racewar: number) {
  switch (racewar) {
    case 1:
      return 'Good'
    case 2:
      return 'Evil'
    default:
      return 'Unknown'
  }
}

function getAlignmentColor(racewar: number) {
  switch (racewar) {
    case 1:
      return 'bg-blue-500/20 text-blue-400 border-blue-500/30'
    case 2:
      return 'bg-red-500/20 text-red-400 border-red-500/30'
    default:
      return 'bg-gray-500/20 text-gray-400 border-gray-500/30'
  }
}
</script>

<template>
  <div>
    <!-- Mobile Cards -->
    <div class="lg:hidden space-y-2">
      <template v-if="isLoading">
        <div v-for="i in 5" :key="i" class="rounded-md border p-3">
          <Skeleton class="h-4 w-32 mb-2" />
          <Skeleton class="h-4 w-24" />
        </div>
      </template>

      <template v-else-if="entries.length > 0">
        <div
          v-for="entry in entries"
          :key="entry.char_name"
          :class="['rounded-md border p-3 transition-colors', entry.account_name ? 'cursor-pointer hover:bg-accent' : '']"
          @click="goToUserProfile(entry.account_name)"
        >
          <div class="flex items-start justify-between gap-3">
            <div class="flex items-center gap-2 min-w-0">
              <div class="flex items-center gap-1 flex-shrink-0 w-8">
                <component
                  v-if="getRankBadge(entry.rank)"
                  :is="getRankBadge(entry.rank)!.icon"
                  :class="['w-5 h-5 p-0.5 rounded', getRankBadge(entry.rank)!.class]"
                />
                <span v-else class="text-sm text-muted-foreground font-semibold">#{{ entry.rank }}</span>
              </div>
              <div class="min-w-0">
                <div class="font-medium truncate" v-html="parseAnsiToHtml(entry.char_name)"></div>
                <div class="text-xs text-muted-foreground truncate">{{ entry.account_name }}</div>
              </div>
            </div>
            <Badge variant="secondary" class="font-mono text-sm flex-shrink-0">
              {{ entry.total_frags.toFixed(2) }}
            </Badge>
          </div>
          <div class="flex items-center gap-2 mt-2 text-xs">
            <Badge variant="outline" :class="getAlignmentColor(entry.racewar)" class="text-xs">
              {{ getAlignmentLabel(entry.racewar) }}
            </Badge>
            <span class="text-muted-foreground">Lv{{ entry.level }}</span>
            <span v-html="parseAnsiToHtml(entry.class || '')"></span>
          </div>
        </div>
      </template>

      <div v-else class="text-center py-8 text-muted-foreground">
        No entries found
      </div>
    </div>

    <!-- Desktop Table -->
    <div class="hidden lg:block rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead class="w-16">Rank</TableHead>
            <TableHead>Character</TableHead>
            <TableHead>Frags</TableHead>
            <TableHead>Alignment</TableHead>
            <TableHead>Race</TableHead>
            <TableHead>Class</TableHead>
            <TableHead>Level</TableHead>
            <TableHead class="text-right">Last Updated</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          <template v-if="isLoading">
            <TableRow v-for="i in 10" :key="i">
              <TableCell><Skeleton class="h-4 w-8" /></TableCell>
              <TableCell><Skeleton class="h-4 w-32" /></TableCell>
              <TableCell><Skeleton class="h-4 w-16" /></TableCell>
              <TableCell><Skeleton class="h-4 w-16" /></TableCell>
              <TableCell><Skeleton class="h-4 w-24" /></TableCell>
              <TableCell><Skeleton class="h-4 w-24" /></TableCell>
              <TableCell><Skeleton class="h-4 w-12" /></TableCell>
              <TableCell class="text-right"><Skeleton class="h-4 w-20 ml-auto" /></TableCell>
            </TableRow>
          </template>

          <template v-else-if="entries.length > 0">
            <TableRow
              v-for="entry in entries"
              :key="entry.char_name"
              :class="['transition-colors', entry.account_name ? 'cursor-pointer hover:bg-accent' : '']"
              @click="goToUserProfile(entry.account_name)"
            >
              <!-- Rank -->
              <TableCell>
                <div class="flex items-center gap-2">
                  <component
                    v-if="getRankBadge(entry.rank)"
                    :is="getRankBadge(entry.rank)!.icon"
                    :class="[
                      'w-5 h-5 p-0.5 rounded',
                      getRankBadge(entry.rank)!.class,
                    ]"
                  />
                  <span class="font-semibold">{{ entry.rank }}</span>
                </div>
              </TableCell>

              <!-- Character Name -->
              <TableCell>
                <div>
                  <div
                    class="font-medium"
                    v-html="parseAnsiToHtml(entry.char_name)"
                  ></div>
                  <div class="text-xs text-muted-foreground">
                    {{ entry.account_name }}
                  </div>
                </div>
              </TableCell>

              <!-- Frags -->
              <TableCell>
                <Badge variant="secondary" class="font-mono text-base">
                  {{ entry.total_frags.toFixed(2) }}
                </Badge>
              </TableCell>

              <!-- Alignment -->
              <TableCell>
                <Badge
                  variant="outline"
                  :class="getAlignmentColor(entry.racewar)"
                >
                  {{ getAlignmentLabel(entry.racewar) }}
                </Badge>
              </TableCell>

              <!-- Race -->
              <TableCell>
                <span v-html="parseAnsiToHtml(entry.race || 'Unknown')"></span>
              </TableCell>

              <!-- Class -->
              <TableCell>
                <span v-html="parseAnsiToHtml(entry.class || 'Unknown')"></span>
              </TableCell>

              <!-- Level -->
              <TableCell>
                <Badge variant="outline">{{ entry.level }}</Badge>
              </TableCell>

              <!-- Last Updated -->
              <TableCell class="text-right text-sm text-muted-foreground">
                {{ formatDistanceToNow(new Date(entry.last_updated), { addSuffix: true }) }}
              </TableCell>
            </TableRow>
          </template>

          <TableRow v-else>
            <TableCell colspan="8" class="text-center py-8 text-muted-foreground">
              No entries found
            </TableCell>
          </TableRow>
        </TableBody>
      </Table>
    </div>
  </div>
</template>
