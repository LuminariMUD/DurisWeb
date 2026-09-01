<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useQuery, useQueryClient } from '@tanstack/vue-query'
import { changelogApi } from '@/services/api'
import { useAuth } from '@/composables/useAuth'
import { Button } from '@/components/ui/button'
import { X, History } from 'lucide-vue-next'

const router = useRouter()
const queryClient = useQueryClient()
const { isAuthenticated, accountName } = useAuth()

// local storage key for dismissed state
const DISMISSED_KEY_PREFIX = 'changelog_banner_dismissed_'

// state
const isDismissed = ref(false)

const dismissedStorageKey = computed(() => {
  const account = accountName.value?.trim().toLowerCase() || 'anonymous'
  return `${DISMISSED_KEY_PREFIX}${account}`
})

// Load dismissed state for the current website account. Auth restoration can
// finish after this component mounts, so reload whenever account identity changes.
function loadDismissedState() {
  isDismissed.value = false
  const dismissed = localStorage.getItem(dismissedStorageKey.value)
  if (dismissed) {
    // check if dismissed timestamp is less than 24 hours old
    const dismissedTime = parseInt(dismissed)
    const now = Date.now()
    const hours24 = 24 * 60 * 60 * 1000
    if (now - dismissedTime < hours24) {
      isDismissed.value = true
    } else {
      localStorage.removeItem(dismissedStorageKey.value)
    }
  }
}

watch(accountName, loadDismissedState, { immediate: true })

// fetch unread count (only for authenticated users)
const unreadQueryKey = computed(
  () => ['changelog-unread-count', accountName.value?.trim().toLowerCase() || 'anonymous'] as const,
)
const { data: unreadData } = useQuery({
  queryKey: unreadQueryKey,
  queryFn: () => changelogApi.getUnreadCount(),
  enabled: () => isAuthenticated.value,
  staleTime: 1000 * 60 * 5, // 5 minutes
  refetchOnWindowFocus: true,
})

// reset dismissed state when unread count changes (new entries)
watch(
  () => unreadData.value?.count,
  (newCount, oldCount) => {
    if (newCount && oldCount !== undefined && newCount > oldCount) {
      isDismissed.value = false
      localStorage.removeItem(dismissedStorageKey.value)
    }
  },
)

// computed
const unreadCount = computed(() => unreadData.value?.count ?? 0)
const showBanner = computed(() => {
  return isAuthenticated.value && unreadCount.value > 0 && !isDismissed.value
})

// actions
function dismiss() {
  isDismissed.value = true
  localStorage.setItem(dismissedStorageKey.value, Date.now().toString())
}

function goToChangelog() {
  router.push('/news?tab=changelog')
  dismiss()
}

async function markAllAsRead() {
  try {
    await changelogApi.markAllAsRead()
    await queryClient.invalidateQueries({ queryKey: ['changelog-unread-count'] })
    await queryClient.invalidateQueries({ queryKey: ['changelog'] })
    dismiss()
  } catch {
    // ignore errors
  }
}
</script>

<template>
  <Transition
    enter-active-class="transition-all duration-300 ease-out"
    enter-from-class="opacity-0 -translate-y-full"
    enter-to-class="opacity-100 translate-y-0"
    leave-active-class="transition-all duration-200 ease-in"
    leave-from-class="opacity-100 translate-y-0"
    leave-to-class="opacity-0 -translate-y-full"
  >
    <div
      v-if="showBanner"
      class="bg-cyan-500/10 border-b border-cyan-500/30 px-4 py-2"
    >
      <div class="container mx-auto flex items-center justify-between gap-4">
        <div class="flex items-center gap-3">
          <History class="h-4 w-4 text-cyan-500 flex-shrink-0" />
          <span class="text-sm text-cyan-200">
            {{ unreadCount }} new update{{ unreadCount > 1 ? 's' : '' }} available
          </span>
        </div>

        <div class="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            class="text-cyan-400 hover:text-cyan-300 hover:bg-cyan-500/20"
            @click="goToChangelog"
          >
            View Changelog
          </Button>
          <Button
            variant="ghost"
            size="sm"
            class="text-gray-400 hover:text-gray-300"
            @click="markAllAsRead"
          >
            Mark as Read
          </Button>
          <Button
            variant="ghost"
            size="icon"
            class="h-6 w-6 text-gray-500 hover:text-gray-400"
            @click="dismiss"
          >
            <X class="h-4 w-4" />
            <span class="sr-only">Dismiss</span>
          </Button>
        </div>
      </div>
    </div>
  </Transition>
</template>
