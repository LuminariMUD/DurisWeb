<script setup lang="ts">
import { ref, computed, watch, nextTick } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useBattleDetail } from '@/composables/usePvPEvents'
import { format } from 'date-fns'
import { parseAnsiForVue, stripAnsiCodes } from '@/utils/ansiParser'
import { profileApi, pvpApi, adminApi } from '@/services/api'
import { useToast } from '@/composables/useToast'
import { useAuth } from '@/composables/useAuth'
import Select from '@/components/ui/Select.vue'
import Dialog from '@/components/ui/Dialog.vue'
import BattleLikeButton from '@/components/pvp/BattleLikeButton.vue'
import BattleFavoriteButton from '@/components/pvp/BattleFavoriteButton.vue'
import BattleCommentSection from '@/components/pvp/BattleCommentSection.vue'
import {
  Link,
  ChevronUp,
  ChevronDown,
  Maximize2,
  Share2,
  Crown,
  Droplet,
  MessageSquare,
} from 'lucide-vue-next'
import type { PvPBattleStats, PvPBattleComment } from '@/types'

// Mobile tab state
type MobileTab = 'log' | 'equipment' | 'comments'
const mobileTab = ref<MobileTab>('log')

// Extract player name from description like "[26 Cleric] Ubak (Orc)" or "[56 Crusader] Juts -Guild- (Race)"
const extractPlayerName = (description: string): string | null => {
  const stripped = stripAnsiCodes(description)
  // Match pattern: [level Class] Name - capture first word after ]
  const match = stripped.match(/\]\s*(\w+)/)
  return match && match[1] ? match[1] : null
}

const route = useRoute()
const router = useRouter()
const toast = useToast()
const { permissions } = useAuth()

// check if user can post to discord (level 57+)
const canPostToDiscord = computed(() => {
  return permissions.value?.immortalLevel != null && permissions.value.immortalLevel >= 57
})

// discord posting state
const isPostingToDiscord = ref(false)

async function postToDiscord() {
  if (isPostingToDiscord.value) return

  isPostingToDiscord.value = true
  try {
    await adminApi.postBattleToDiscord(eventId.value)
    toast.success('Battle posted to Discord!')
  } catch (err: any) {
    toast.error(err.response?.data?.error || 'Failed to post to Discord', 'Error')
  } finally {
    isPostingToDiscord.value = false
  }
}

// Track which characters exist (have accounts)
const characterExists = ref<Map<string, boolean>>(new Map())

// Check if a character exists
const isCharacterDeleted = (description: string): boolean => {
  const charName = extractPlayerName(description)
  if (!charName) return false
  const exists = characterExists.value.get(charName.toLowerCase())
  return exists === false // Only return true if explicitly false (checked and not found)
}

// Check if character has been verified as existing
const isCharacterVerified = (description: string): boolean => {
  const charName = extractPlayerName(description)
  if (!charName) return false
  return characterExists.value.get(charName.toLowerCase()) === true
}

// Navigate to user profile by looking up account from character name
const navigateToPlayer = async (characterName: string) => {
  try {
    const { accountName } = await profileApi.getCharacterAccount(characterName)
    router.push({ name: 'user-profile', params: { accountName } })
  } catch {
    // Character not found - do nothing
  }
}

// Check all characters when data loads (batch lookup)
const checkCharacterAccounts = async () => {
  if (!data.value?.participants) return

  const charNames = new Set<string>()
  for (const p of data.value.participants) {
    const name = extractPlayerName(p.player_description)
    if (name) charNames.add(name)
  }

  if (charNames.size === 0) return

  try {
    const accounts = await profileApi.getCharacterAccountsBatch(Array.from(charNames))
    for (const charName of charNames) {
      const exists = charName in accounts
      characterExists.value.set(charName.toLowerCase(), exists)
    }
  } catch {
    // on error, mark all as unknown (won't show deleted styling)
  }
}

const eventId = computed(() => Number(route.params.id))
const { data, isLoading, isError, error } = useBattleDetail(eventId)

// Battle interaction stats
const battleStats = ref<PvPBattleStats | null>(null)

// Load battle stats
async function loadBattleStats() {
  try {
    battleStats.value = await pvpApi.getBattleStats(eventId.value)
  } catch (err) {
    console.error('Failed to load battle stats:', err)
  }
}

// Handle likes updated
function onLikesUpdated(count: number) {
  if (battleStats.value) {
    battleStats.value.likeCount = count
  }
}

// Handle comments updated
function onCommentsUpdated(count: number) {
  if (battleStats.value) {
    battleStats.value.commentCount = count
  }
}

// POV selection
const selectedPovId = ref<number | null>(null)

// Fullscreen dialog state
const isFullscreenOpen = ref(false)

// Equipment dialog state
const isEquipmentOpen = ref(false)

// Teams card minimized state
const isTeamsMinimized = ref(false)

// Copy link to clipboard
const copyLink = async () => {
  const url = window.location.href
  try {
    await navigator.clipboard.writeText(url)
    toast.success('link copied to clipboard')
  } catch {
    // Fallback for older browsers
    const textArea = document.createElement('textarea')
    textArea.value = url
    document.body.appendChild(textArea)
    textArea.select()
    document.execCommand('copy')
    document.body.removeChild(textArea)
    toast.success('link copied to clipboard')
  }
}

// Line limiting for performance
const showFullLog = ref(false)
const MAX_PREVIEW_LINES = 1000

// Get selected participant
const selectedParticipant = computed(() => {
  if (!data.value || !data.value.participants || !selectedPovId.value) return null
  return data.value.participants.find((p) => p.id === selectedPovId.value)
})

// Get limited combat log for preview
const getLimitedLog = (log: string | null): string => {
  if (!log) return ''
  if (showFullLog.value) return log

  const lines = log.split('\n')
  if (lines.length <= MAX_PREVIEW_LINES) return log

  return lines.slice(0, MAX_PREVIEW_LINES).join('\n')
}

// Count total lines in log
const getLineCount = (log: string | null) => {
  if (!log) return 0
  return log.split('\n').length
}

// Check if log is truncated
const isLogTruncated = computed(() => {
  if (!selectedParticipant.value?.log) return false
  return getLineCount(selectedParticipant.value.log) > MAX_PREVIEW_LINES && !showFullLog.value
})

// Auto-select first participant with log when data loads
const participantsWithLogs = computed(() => {
  if (!data.value || !data.value.participants) return []
  return data.value.participants.filter((p) => p.log)
})

// Auto-select POV based on query param or first killer with a log
const autoSelectPov = () => {
  if (data.value && participantsWithLogs.value.length > 0) {
    // Check for POV query parameter first
    const povParam = route.query.pov as string | undefined
    if (povParam) {
      const matchingParticipant = participantsWithLogs.value.find((p) => {
        const name = extractPlayerName(p.player_description)
        return name?.toLowerCase() === povParam.toLowerCase()
      })
      if (matchingParticipant) {
        selectedPovId.value = matchingParticipant.id
        return
      }
    }

    // Fallback to first killer with a log if no POV selected yet
    if (!selectedPovId.value) {
      const firstKiller = participantsWithLogs.value.find((p) => p.pk_type.includes('KILLER'))
      selectedPovId.value = firstKiller?.id || participantsWithLogs.value[0]?.id || null
    }
  }
}

// Watch for data changes
watch(
  data,
  (newData) => {
    if (newData) {
      autoSelectPov()
      checkCharacterAccounts()
      loadBattleStats()
    }
  },
  { immediate: true },
)

// Reset showFullLog and update URL when POV changes
watch(selectedPovId, (newId) => {
  showFullLog.value = false

  // update url with pov param
  if (newId && data.value?.participants) {
    const participant = data.value.participants.find((p) => p.id === newId)
    if (participant) {
      const playerName = extractPlayerName(participant.player_description)
      if (playerName) {
        router.replace({ query: { ...route.query, pov: playerName } })
      }
    }
  }
})

// Group participants by team
const killers = computed(() => {
  if (!data.value || !data.value.participants) return []
  return data.value.participants.filter((p) => p.pk_type.includes('KILLER'))
})

const victims = computed(() => {
  if (!data.value || !data.value.participants) return []
  return data.value.participants.filter((p) => p.pk_type.includes('VICTIM'))
})

// SVG icons for POV selector
const crownIcon = `<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="inline-block text-yellow-500 ml-1"><path d="M11.562 3.266a.5.5 0 0 1 .876 0L15.39 8.87a1 1 0 0 0 1.516.294L21.183 5.5a.5.5 0 0 1 .798.519l-2.834 10.246a1 1 0 0 1-.956.734H5.81a1 1 0 0 1-.957-.734L2.02 6.02a.5.5 0 0 1 .798-.519l4.276 3.664a1 1 0 0 0 1.516-.294z"/><path d="M5 21h14"/></svg>`
const dropletIcon = `<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="inline-block text-red-500 ml-1"><path d="M12 22a7 7 0 0 0 7-7c0-2-1-3.9-3-5.5s-3.5-4-4-6.5c-.5 2.5-2 4.9-4 6.5C6 11.1 5 13 5 15a7 7 0 0 0 7 7z"/></svg>`

// Create select options with MUD colors
const povOptions = computed(() => {
  const options: Array<{ value: number; label: string; html: string }> = []

  // Add killers
  killers.value
    .filter((k) => k.log)
    .forEach((killer) => {
      const leaderBadge = killer.leader ? crownIcon : ''
      options.push({
        value: killer.id,
        label: stripAnsiCodes(killer.player_description),
        html: `<span class="text-green-400">KILLER:</span> ${parseAnsiForVue(killer.player_description)}${leaderBadge}`,
      })
    })

  // Add victims
  victims.value
    .filter((v) => v.log)
    .forEach((victim) => {
      const leaderBadge = victim.leader ? crownIcon : ''
      const diedBadge = victim.pk_type === 'VICTIM' ? dropletIcon : ''
      options.push({
        value: victim.id,
        label: stripAnsiCodes(victim.player_description),
        html: `<span class="text-red-400">VICTIM:</span> ${parseAnsiForVue(victim.player_description)}${diedBadge}${leaderBadge}`,
      })
    })

  return options
})

// Format date
const formatDate = (dateString: string) => {
  return format(new Date(dateString), 'PPpp')
}

// Go back to list
const goBack = () => {
  router.push({ name: 'pvp-list' })
}

// ==================== LINE-BASED QUOTING ====================

// Ref for comment section component
const commentSectionRef = ref<InstanceType<typeof BattleCommentSection> | null>(null)

// Ref for log container (for scrolling)
const logContainerRef = ref<HTMLElement | null>(null)

// Currently highlighted line (for quote navigation)
const highlightedLine = ref<number | null>(null)

// All comments for badge counts
const allComments = ref<PvPBattleComment[]>([])

// Compute comment counts per participant + line (including replies to line comments)
const lineCommentCounts = computed(() => {
  const counts = new Map<string, number>()
  for (const comment of allComments.value) {
    // Count top-level comment if it quotes a line
    if (comment.participantId != null && comment.lineNumber != null) {
      const key = `${comment.participantId}-${comment.lineNumber}`
      counts.set(key, (counts.get(key) || 0) + 1)
    }
    // Count replies
    if (comment.replies) {
      for (const reply of comment.replies) {
        // If reply quotes its own line, count toward that line
        if (reply.participantId != null && reply.lineNumber != null) {
          const replyKey = `${reply.participantId}-${reply.lineNumber}`
          counts.set(replyKey, (counts.get(replyKey) || 0) + 1)
        }
        // If reply doesn't quote a line but parent does, count toward parent's line
        else if (comment.participantId != null && comment.lineNumber != null) {
          const parentKey = `${comment.participantId}-${comment.lineNumber}`
          counts.set(parentKey, (counts.get(parentKey) || 0) + 1)
        }
      }
    }
  }
  return counts
})

// Get comment count for a specific line
function getLineCommentCount(lineNumber: number): number {
  if (!selectedParticipant.value) return 0
  const key = `${selectedParticipant.value.id}-${lineNumber}`
  return lineCommentCounts.value.get(key) || 0
}

// Handle comments loaded from comment section
function onCommentsLoaded(comments: PvPBattleComment[]) {
  allComments.value = comments
}

// Split log into lines for rendering
const logLines = computed(() => {
  if (!selectedParticipant.value?.log) return []
  const log = showFullLog.value
    ? selectedParticipant.value.log
    : getLimitedLog(selectedParticipant.value.log)
  return log.replace(/\r/g, '').split('\n')
})

// Handle clicking a line to quote it
const handleLineClick = (lineNumber: number, lineContent: string) => {
  const strippedContent = stripAnsiCodes(lineContent)
  if (!selectedParticipant.value) return

  // Switch to comments tab on mobile
  if (mobileTab.value !== 'comments') {
    mobileTab.value = 'comments'
  }

  // Set the quoted line in the comment section
  nextTick(() => {
    commentSectionRef.value?.setQuotedLine(
      lineNumber,
      strippedContent,
      selectedParticipant.value!.id,
    )
  })
}

// Navigate to a quoted line (called from comment section)
const navigateToQuote = async (comment: PvPBattleComment) => {
  if (comment.participantId == null || comment.lineNumber == null) return

  // Switch POV if needed
  if (selectedPovId.value !== comment.participantId) {
    selectedPovId.value = comment.participantId
    await nextTick()
  }

  // On mobile, switch to log tab
  if (mobileTab.value !== 'log') {
    mobileTab.value = 'log'
    await nextTick()
  }

  // Highlight and scroll to the line
  highlightedLine.value = comment.lineNumber
  await nextTick()

  const lineElement = document.getElementById(`log-line-${comment.lineNumber}`)
  if (lineElement) {
    lineElement.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }

  // Remove highlight after animation
  setTimeout(() => {
    highlightedLine.value = null
  }, 2000)
}
</script>

<template>
  <div class="space-y-6">
    <!-- Back Button -->
    <button
      @click="goBack"
      class="inline-flex items-center text-sm text-muted-foreground hover:text-foreground"
    >
      ← Back to PvP List
    </button>

    <!-- Loading State -->
    <div v-if="isLoading" class="flex items-center justify-center py-12">
      <div class="text-center">
        <div class="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-current border-r-transparent align-[-0.125em]"></div>
        <p class="mt-4 text-muted-foreground">Loading battle details...</p>
      </div>
    </div>

    <!-- Error State -->
    <div v-else-if="isError" class="rounded-lg border border-destructive bg-destructive/10 p-4">
      <h3 class="font-semibold text-destructive">Error loading battle</h3>
      <p class="text-sm text-destructive/80">{{ error?.message || 'Unknown error occurred' }}</p>
    </div>

    <!-- Battle Details -->
    <div v-else-if="data && data.event" class="space-y-4 lg:space-y-6">
      <!-- Battle Overview Card -->
      <div class="rounded-lg border border-gray-800 bg-gray-950">
        <!-- Mobile Header -->
        <div class="lg:hidden p-4">
          <div class="text-center mb-3">
            <h2 class="text-lg font-bold text-gray-100" v-html="parseAnsiForVue(data.event.room_name)"></h2>
            <p class="text-xs text-gray-500 mt-1">{{ formatDate(data.event.stamp) }}</p>
          </div>

          <!-- Mobile Action Icons -->
          <div class="flex justify-center gap-4" v-if="battleStats">
            <div class="flex flex-col items-center gap-1">
              <BattleLikeButton
                :event-id="eventId"
                :initial-like-count="battleStats.likeCount"
                :initial-user-liked="battleStats.userLiked"
                @likes-updated="onLikesUpdated"
              />
            </div>
            <div class="flex flex-col items-center gap-1">
              <BattleFavoriteButton
                :event-id="eventId"
                :initial-favorited="battleStats.userFavorited"
              />
            </div>
            <div class="flex flex-col items-center gap-1">
              <button
                @click="copyLink"
                class="inline-flex items-center justify-center rounded-full text-sm font-medium bg-gray-800 text-gray-400 hover:bg-gray-700 h-10 w-10"
              >
                <Share2 class="h-4 w-4" />
              </button>
            </div>
            <div v-if="canPostToDiscord" class="flex flex-col items-center gap-1">
              <button
                @click="postToDiscord"
                :disabled="isPostingToDiscord"
                class="inline-flex items-center justify-center rounded-full text-sm font-medium bg-indigo-600 text-white hover:bg-indigo-500 disabled:opacity-50 h-10 w-10"
                title="Post to Discord"
              >
                <MessageSquare class="h-4 w-4" />
              </button>
            </div>
          </div>

          <!-- Mobile Teams Mini -->
          <div class="grid grid-cols-2 gap-3 mt-4 p-3 bg-gray-900 rounded-lg">
            <div>
              <div class="flex items-center gap-1.5 mb-2">
                <div class="w-1.5 h-1.5 rounded-full bg-green-500"></div>
                <span class="text-xs text-green-400 font-medium">Killers ({{ killers.length }})</span>
              </div>
              <div class="space-y-1">
                <div v-for="killer in killers" :key="killer.id" class="text-xs text-gray-300 truncate flex items-center gap-1">
                  <span v-html="parseAnsiForVue(killer.player_description)"></span>
                  <Crown v-if="killer.leader" class="h-3 w-3 text-yellow-500 flex-shrink-0" />
                </div>
              </div>
            </div>
            <div>
              <div class="flex items-center gap-1.5 mb-2">
                <div class="w-1.5 h-1.5 rounded-full bg-red-500"></div>
                <span class="text-xs text-red-400 font-medium">Victims ({{ victims.length }})</span>
              </div>
              <div class="space-y-1">
                <div v-for="victim in victims" :key="victim.id" class="text-xs text-gray-300 truncate flex items-center gap-1">
                  <span v-html="parseAnsiForVue(victim.player_description)"></span>
                  <Droplet v-if="victim.pk_type === 'VICTIM'" class="h-3 w-3 text-red-500 fill-red-500 flex-shrink-0" />
                  <Crown v-if="victim.leader" class="h-3 w-3 text-yellow-500 flex-shrink-0" />
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Desktop Header -->
        <div class="hidden lg:block p-6">
          <div class="space-y-4">
            <div class="flex items-start justify-between gap-4">
              <div>
                <h2 class="text-2xl font-bold text-gray-100">Battle #{{ data.event.id }}</h2>
                <p class="text-sm text-gray-400">{{ formatDate(data.event.stamp) }}</p>
                <p class="text-sm text-gray-400 mt-1"><span v-html="parseAnsiForVue(data.event.room_name)"></span></p>
              </div>
              <!-- Action Buttons -->
              <div class="flex items-center gap-2">
                <button
                  @click="copyLink"
                  class="inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500 bg-gray-800 text-gray-300 hover:bg-gray-700 h-9 w-9"
                  title="Copy link"
                >
                  <Link class="h-4 w-4" />
                </button>
                <button
                  @click="isTeamsMinimized = !isTeamsMinimized"
                  class="inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500 bg-gray-800 text-gray-300 hover:bg-gray-700 h-9 w-9"
                  :title="isTeamsMinimized ? 'Expand teams' : 'Minimize teams'"
                >
                  <ChevronUp v-if="!isTeamsMinimized" class="h-4 w-4" />
                  <ChevronDown v-else class="h-4 w-4" />
                </button>
                <template v-if="battleStats">
                  <BattleLikeButton
                    :event-id="eventId"
                    :initial-like-count="battleStats.likeCount"
                    :initial-user-liked="battleStats.userLiked"
                    @likes-updated="onLikesUpdated"
                  />
                  <BattleFavoriteButton
                    :event-id="eventId"
                    :initial-favorited="battleStats.userFavorited"
                  />
                </template>
                <button
                  v-if="canPostToDiscord"
                  @click="postToDiscord"
                  :disabled="isPostingToDiscord"
                  class="inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 bg-indigo-600 text-white hover:bg-indigo-500 disabled:opacity-50 h-9 px-3"
                  title="Post to Discord"
                >
                  <MessageSquare class="h-4 w-4 mr-1.5" />
                  {{ isPostingToDiscord ? 'Posting...' : 'Discord' }}
                </button>
              </div>
            </div>

            <!-- Teams (Desktop) -->
            <div v-if="!isTeamsMinimized" class="grid grid-cols-1 md:grid-cols-2 gap-4 pt-4 border-t border-gray-800">
            <!-- Killers (Goods) -->
            <div>
              <h3 class="text-sm font-semibold text-green-600 dark:text-green-400 mb-2">
                Killers ({{ killers.length }})
              </h3>
              <div class="space-y-1">
                <div
                  v-for="killer in killers"
                  :key="killer.id"
                  class="text-sm"
                  :class="killer.leader ? 'font-semibold' : ''"
                >
                  <span
                    v-if="isCharacterDeleted(killer.player_description)"
                    class="line-through decoration-red-500"
                    v-html="parseAnsiForVue(killer.player_description)"
                  ></span>
                  <span
                    v-else-if="isCharacterVerified(killer.player_description)"
                    class="hover:underline cursor-pointer"
                    @click="navigateToPlayer(extractPlayerName(killer.player_description)!)"
                    v-html="parseAnsiForVue(killer.player_description)"
                  ></span>
                  <span v-else v-html="parseAnsiForVue(killer.player_description)"></span>
                  <span v-if="killer.leader" class="text-xs text-muted-foreground">(Leader)</span>
                </div>
              </div>
            </div>

            <!-- Victims (Evils) -->
            <div>
              <h3 class="text-sm font-semibold text-red-600 dark:text-red-400 mb-2">
                Victims ({{ victims.length }})
              </h3>
              <div class="space-y-1">
                <div
                  v-for="victim in victims"
                  :key="victim.id"
                  class="text-sm"
                  :class="victim.leader ? 'font-semibold' : ''"
                >
                  <span
                    v-if="isCharacterDeleted(victim.player_description)"
                    class="line-through decoration-red-500"
                    v-html="parseAnsiForVue(victim.player_description)"
                  ></span>
                  <span
                    v-else-if="isCharacterVerified(victim.player_description)"
                    class="hover:underline cursor-pointer"
                    @click="navigateToPlayer(extractPlayerName(victim.player_description)!)"
                    v-html="parseAnsiForVue(victim.player_description)"
                  ></span>
                  <span v-else v-html="parseAnsiForVue(victim.player_description)"></span>
                  <span v-if="victim.leader" class="text-xs text-muted-foreground">(Leader)</span>
                </div>
              </div>
            </div>
          </div>
          </div>
        </div>
      </div>

      <!-- Mobile: Segmented Tabs -->
      <div class="lg:hidden">
        <div class="flex bg-gray-800 rounded-lg p-1 mx-0">
          <button
            @click="mobileTab = 'log'"
            :class="[
              'flex-1 py-2.5 text-sm font-medium rounded-md transition-colors',
              mobileTab === 'log' ? 'bg-cyan-600 text-white' : 'text-gray-400'
            ]"
          >
            Combat Log
          </button>
          <button
            @click="mobileTab = 'equipment'"
            :class="[
              'flex-1 py-2.5 text-sm font-medium rounded-md transition-colors',
              mobileTab === 'equipment' ? 'bg-cyan-600 text-white' : 'text-gray-400'
            ]"
          >
            Equipment
          </button>
          <button
            @click="mobileTab = 'comments'"
            :class="[
              'flex-1 py-2.5 text-sm font-medium rounded-md transition-colors',
              mobileTab === 'comments' ? 'bg-cyan-600 text-white' : 'text-gray-400'
            ]"
          >
            Comments {{ battleStats?.commentCount ? `(${battleStats.commentCount})` : '' }}
          </button>
        </div>

        <!-- Mobile Tab Content -->
        <div class="mt-4">
          <!-- Combat Log Tab -->
          <div v-if="mobileTab === 'log'" class="rounded-lg border border-gray-800 bg-gray-950">
            <!-- POV Selector -->
            <div class="p-3 border-b border-gray-800">
              <Select
                v-model="selectedPovId"
                :options="povOptions"
                placeholder="Select POV"
              />
            </div>

            <!-- Combat Log with Fullscreen Button -->
            <div v-if="selectedParticipant" class="relative">
              <!-- Fullscreen Button -->
              <button
                @click="isFullscreenOpen = true"
                class="absolute top-3 right-3 z-10 inline-flex items-center justify-center rounded-lg bg-cyan-600 text-white h-9 w-9 shadow-lg"
                title="View fullscreen"
              >
                <Maximize2 class="h-4 w-4" />
              </button>

              <div class="p-3">
                <div class="rounded-md bg-black font-mono text-xs text-gray-100 overflow-x-auto max-h-[400px] overflow-y-auto">
                  <div v-if="selectedParticipant.log" class="relative">
                    <div
                      v-for="(line, index) in logLines"
                      :id="`mobile-log-line-${index + 1}`"
                      :key="index"
                      class="group flex hover:bg-gray-800/50"
                      :class="{ 'animate-highlight-fade': highlightedLine === index + 1 }"
                    >
                      <div
                        class="sticky left-0 w-12 flex-shrink-0 select-none text-right pr-1 text-gray-600 bg-gray-900/80 border-r border-gray-800 text-[10px] leading-4 cursor-pointer active:bg-cyan-900 flex items-center justify-end gap-0.5"
                        @click="handleLineClick(index + 1, line)"
                      >
                        <span
                          v-if="getLineCommentCount(index + 1) > 0"
                          class="inline-flex items-center justify-center min-w-[14px] h-3.5 px-0.5 text-[8px] font-medium bg-cyan-600 text-white rounded-full"
                        >
                          {{ getLineCommentCount(index + 1) }}
                        </span>
                        <span>{{ index + 1 }}</span>
                      </div>
                      <div class="flex-1 whitespace-pre-wrap px-2 leading-4" v-html="parseAnsiForVue(line, true)"></div>
                    </div>
                  </div>
                  <p v-else class="text-gray-400 p-3">No combat log available</p>
                </div>
              </div>
            </div>
            <div v-else class="p-8 text-center text-gray-500 text-sm">
              Select a participant to view their combat log
            </div>
          </div>

          <!-- Equipment Tab -->
          <div v-if="mobileTab === 'equipment'" class="rounded-lg border border-gray-800 bg-gray-950">
            <div v-if="selectedParticipant?.equip" class="p-3">
              <div class="mb-3">
                <Select
                  v-model="selectedPovId"
                  :options="povOptions"
                  placeholder="Select POV"
                />
              </div>
              <div class="rounded-md bg-black p-3 font-mono text-xs text-gray-100 overflow-x-auto max-h-[500px] overflow-y-auto">
                <pre class="whitespace-pre-wrap leading-relaxed" v-html="parseAnsiForVue(selectedParticipant.equip)"></pre>
              </div>
            </div>
            <div v-else class="p-8 text-center text-gray-500 text-sm">
              <p v-if="selectedParticipant">No equipment data for this participant</p>
              <p v-else>Select a participant to view equipment</p>
            </div>
          </div>

          <!-- Comments Tab -->
          <div v-if="mobileTab === 'comments'">
            <BattleCommentSection
              ref="commentSectionRef"
              :event-id="eventId"
              :initial-comment-count="battleStats?.commentCount || 0"
              @comments-updated="onCommentsUpdated"
              @navigate-to-quote="navigateToQuote"
              @comments-loaded="onCommentsLoaded"
            />
          </div>
        </div>
      </div>

      <!-- Desktop: POV Selector & Combat Log with Comments (70/30 layout) -->
      <div class="hidden lg:grid grid-cols-1 lg:grid-cols-[7fr_3fr] gap-4">
        <!-- Left side: POV selector + Combat Log (70%) -->
        <div class="rounded-lg border border-gray-800 bg-gray-950">
          <div class="border-b border-gray-800 p-4">
            <div class="flex items-center gap-4">
              <label class="text-sm font-medium text-gray-300 whitespace-nowrap">Point of View:</label>
              <div class="flex-1">
                <Select
                  v-model="selectedPovId"
                  :options="povOptions"
                  placeholder="Select a participant"
                />
              </div>
              <div class="flex gap-2">
                <button
                  v-if="selectedParticipant?.equip"
                  @click="isEquipmentOpen = true"
                  class="inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500 disabled:pointer-events-none disabled:opacity-50 bg-gray-800 text-gray-300 hover:bg-gray-700 h-9 px-4 whitespace-nowrap"
                  title="View equipment"
                >
                  <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                  </svg>
                  <span class="ml-2">Equipment</span>
                </button>
                <button
                  v-if="selectedParticipant"
                  @click="isFullscreenOpen = true"
                  class="inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500 disabled:pointer-events-none disabled:opacity-50 bg-gray-800 text-gray-300 hover:bg-gray-700 h-9 px-4 whitespace-nowrap"
                  title="Maximize combat log"
                >
                  <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
                  </svg>
                  <span class="ml-2">Maximize</span>
                </button>
              </div>
            </div>
          </div>

          <!-- Combat Log Viewer -->
          <div v-if="selectedParticipant" class="p-4">
            <!-- Log Line Count Info -->
            <div v-if="selectedParticipant.log && getLineCount(selectedParticipant.log) > 100" class="mb-2 flex items-center justify-between">
              <p class="text-xs text-gray-400">
                <span v-if="isLogTruncated">
                  Showing {{ MAX_PREVIEW_LINES }} of {{ getLineCount(selectedParticipant.log).toLocaleString() }} lines
                </span>
                <span v-else>
                  {{ getLineCount(selectedParticipant.log).toLocaleString() }} lines
                </span>
              </p>
              <button
                v-if="getLineCount(selectedParticipant.log) > MAX_PREVIEW_LINES"
                @click="showFullLog = !showFullLog"
                class="text-xs text-cyan-400 hover:text-cyan-300 transition-colors"
              >
                {{ showFullLog ? 'Show Less' : 'Show All' }}
              </button>
            </div>

            <div ref="logContainerRef" class="rounded-md bg-black font-mono text-sm text-gray-100 overflow-x-auto max-h-[800px] overflow-y-auto">
              <div v-if="selectedParticipant.log" class="relative">
                <div
                  v-for="(line, index) in logLines"
                  :id="`log-line-${index + 1}`"
                  :key="index"
                  class="group flex hover:bg-gray-800/50 transition-colors duration-150"
                  :class="{ 'animate-highlight-fade': highlightedLine === index + 1 }"
                >
                  <!-- Line number -->
                  <div
                    class="sticky left-0 w-14 flex-shrink-0 select-none text-right pr-2 text-gray-600 bg-gray-900/80 border-r border-gray-800 text-xs leading-5 cursor-pointer hover:text-cyan-400 hover:bg-gray-800 group-hover:text-gray-400 flex items-center justify-end gap-1"
                    @click="handleLineClick(index + 1, line)"
                    :title="`Comment on line ${index + 1}`"
                  >
                    <span
                      v-if="getLineCommentCount(index + 1) > 0"
                      class="inline-flex items-center justify-center min-w-[16px] h-4 px-1 text-[10px] font-medium bg-cyan-600 text-white rounded-full"
                    >
                      {{ getLineCommentCount(index + 1) }}
                    </span>
                    <span class="group-hover:hidden">{{ index + 1 }}</span>
                    <MessageSquare class="h-3 w-3 hidden group-hover:inline-block" />
                  </div>
                  <!-- Line content -->
                  <div class="flex-1 whitespace-pre-wrap px-2 leading-5" v-html="parseAnsiForVue(line, true)"></div>
                </div>
              </div>
              <p v-else class="text-gray-400 p-4">No combat log available for this participant</p>
            </div>

            <!-- Truncation Notice -->
            <div v-if="isLogTruncated" class="mt-2 rounded-md bg-gray-900 border border-gray-800 p-3 text-center">
              <p class="text-sm text-gray-400">
                Log truncated for performance.
                <button @click="showFullLog = true" class="text-cyan-400 hover:text-cyan-300 underline ml-1">
                  Click here to show all {{ getLineCount(selectedParticipant.log).toLocaleString() }} lines
                </button>
              </p>
            </div>
          </div>

          <div v-else class="p-8 text-center text-muted-foreground">
            Select a participant to view their combat log
          </div>
        </div>

        <!-- Right side: Comments Section (30%) -->
        <div class="lg:h-auto">
          <BattleCommentSection
            ref="commentSectionRef"
            :event-id="eventId"
            :initial-comment-count="battleStats?.commentCount || 0"
            @comments-updated="onCommentsUpdated"
            @navigate-to-quote="navigateToQuote"
            @comments-loaded="onCommentsLoaded"
          />
        </div>
      </div>
    </div>

    <!-- Fullscreen Combat Log Dialog -->
    <Dialog v-model:open="isFullscreenOpen" :title-html="`Combat Log - ${selectedParticipant ? parseAnsiForVue(selectedParticipant.player_description) : ''}`" noPadding>
      <div v-if="selectedParticipant" class="h-full">
        <!-- Combat Log Only -->
        <div class="bg-black font-mono text-xs lg:text-sm text-gray-100 overflow-x-auto h-full overflow-y-auto">
          <pre v-if="selectedParticipant.log" class="whitespace-pre-wrap px-2 py-1" v-html="parseAnsiForVue(selectedParticipant.log, true)"></pre>
          <p v-else class="text-gray-400 p-4">No combat log available for this participant</p>
        </div>
      </div>
    </Dialog>

    <!-- Equipment Dialog -->
    <Dialog v-model:open="isEquipmentOpen" size="compact" :title-html="`Equipment - ${selectedParticipant ? parseAnsiForVue(selectedParticipant.player_description) : ''}`">
      <div v-if="selectedParticipant?.equip">
        <div class="rounded-md bg-black p-3 font-mono text-xs text-gray-100 overflow-x-auto max-h-[70vh] overflow-y-auto">
          <pre class="whitespace-pre-wrap leading-tight" v-html="parseAnsiForVue(selectedParticipant.equip)"></pre>
        </div>
      </div>
      <div v-else class="text-center text-gray-400 py-4">
        No equipment information available for this participant
      </div>
    </Dialog>
  </div>
</template>

<style scoped>
@keyframes highlight-pulse {
  0%, 100% {
    background-color: rgb(234 179 8 / 0.5);
    box-shadow: inset 0 0 0 2px rgb(234 179 8 / 0.8);
  }
  50% {
    background-color: rgb(234 179 8 / 0.2);
    box-shadow: inset 0 0 0 2px rgb(234 179 8 / 0.4);
  }
}

.animate-highlight-fade {
  animation: highlight-pulse 0.5s ease-in-out 4;
  border-radius: 4px;
}
</style>
