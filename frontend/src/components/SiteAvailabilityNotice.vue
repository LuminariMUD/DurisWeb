<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useSiteConfig } from '@/composables/useSiteConfig'
import { useOfflineStatus } from '@/composables/useOfflineStatus'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

type Reason = 'unavailable' | 'offline' | 'maintenance' | 'mud_burnin'

const messages: Record<Reason, { title: string; message: string }> = {
  unavailable: {
    title: 'Temporarily unavailable',
    message: 'Some website services are temporarily unavailable. Please try again shortly.',
  },
  offline: {
    title: 'You’re offline',
    message: 'Your browser appears to be offline. Check your connection, then try again.',
  },
  maintenance: {
    title: 'Scheduled maintenance',
    message: 'The website is temporarily offline for maintenance. Please check back shortly.',
  },
  mud_burnin: {
    title: 'Server testing in progress',
    message:
      'Duris is temporarily offline for MUD server testing (burn-in). Please check back shortly.',
  },
}

const { error: siteConfigError, isAvailable, reloadConfig } = useSiteConfig()
const { isOffline } = useOfflineStatus()
const reason = ref<Reason | null>(null)
const notice = computed(() => (reason.value ? messages[reason.value] : null))
const isOpen = ref(false)
const isRetrying = ref(false)
let lookup: AbortController | null = null

async function readReason(): Promise<void> {
  lookup?.abort()
  if (isOffline.value) {
    reason.value = 'offline'
    return
  }

  reason.value = 'unavailable'
  const controller = new AbortController()
  lookup = controller
  const timeout = window.setTimeout(() => controller.abort(), 3000)
  try {
    // Same-origin edge endpoint: independent of the API, cookies, and database.
    const response = await fetch('/api/site-availability', {
      cache: 'no-store',
      credentials: 'omit',
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    })
    if (!response.ok) return
    const value: unknown = await response.json()
    if (
      !controller.signal.aborted &&
      value !== null &&
      typeof value === 'object' &&
      'service' in value &&
      value.service === 'durisweb-availability' &&
      'reason' in value &&
      (value.reason === 'maintenance' || value.reason === 'mud_burnin')
    ) {
      reason.value = value.reason
    }
  } catch {
    // Missing edge deployment, timeout, or invalid JSON keeps the safe generic notice.
  } finally {
    window.clearTimeout(timeout)
    if (lookup === controller) lookup = null
  }
}

function showUnavailable(): void {
  // One popup/lookup per incident, even when several requests fail together.
  if (reason.value) return
  isOpen.value = true
  void readReason()
}

async function retry(): Promise<void> {
  if (isRetrying.value) return
  isRetrying.value = true
  try {
    await readReason()
    if (
      reason.value === 'offline' ||
      reason.value === 'maintenance' ||
      reason.value === 'mud_burnin'
    )
      return
    // Never replay the failed request: it might have been a state-changing action.
    await reloadConfig()
    if (isAvailable.value) {
      reason.value = null
      isOpen.value = false
    }
  } finally {
    isRetrying.value = false
  }
}

watch(
  siteConfigError,
  (error) => {
    if (error) showUnavailable()
  },
  { immediate: true },
)
watch(
  isOffline,
  (offline) => {
    if (offline) {
      lookup?.abort()
      reason.value = 'offline'
      isOpen.value = true
    } else if (reason.value === 'offline') {
      void readReason()
    }
  },
  { immediate: true },
)

onMounted(() => window.addEventListener('site-unavailable', showUnavailable))
onUnmounted(() => {
  lookup?.abort()
  window.removeEventListener('site-unavailable', showUnavailable)
})
</script>

<template>
  <div v-if="notice" role="status" class="flex shrink-0 flex-wrap items-center justify-center gap-2 border-b bg-muted px-4 py-2 text-sm text-foreground">
    <span>{{ notice.message }}</span>
    <Button variant="outline" size="sm" @click="isOpen = true">Details</Button>
  </div>
  <Dialog v-if="notice" v-model:open="isOpen">
    <DialogContent class="sm:max-w-md">
      <DialogHeader>
        <DialogTitle>{{ notice.title }}</DialogTitle>
        <DialogDescription>{{ notice.message }}</DialogDescription>
      </DialogHeader>
      <p class="text-sm text-muted-foreground">Retry checks the website connection. It won’t resubmit your last action.</p>
      <DialogFooter class="gap-2">
        <Button variant="outline" @click="isOpen = false">Dismiss</Button>
        <Button :disabled="isRetrying" @click="retry">{{ isRetrying ? 'Checking…' : 'Retry' }}</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
