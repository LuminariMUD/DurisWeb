<script setup lang="ts">
import { Bell, BellOff, Loader2 } from 'lucide-vue-next'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { usePushNotification } from '@/composables/usePushNotification'
import { useToast } from '@/composables/useToast'

const { isSupported, isSubscribed, isInitialized, isLoading, isEnabled, error, toggle } =
  usePushNotification()
const { success, error: showError } = useToast()

async function togglePushNotifications(): Promise<void> {
  const wasSubscribed = isSubscribed.value
  const didUpdate = await toggle()

  if (!didUpdate) {
    showError(error.value ?? 'Push notifications could not be updated', 'Push notifications')
    return
  }

  success(
    wasSubscribed
      ? 'This browser will no longer receive background notifications.'
      : 'This browser is now subscribed to background notifications.',
    wasSubscribed ? 'Push notifications disabled' : 'Push notifications enabled',
  )
}
</script>

<template>
  <Card>
    <CardContent class="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
      <div class="flex items-start gap-3">
        <Bell v-if="isSubscribed" class="mt-0.5 h-5 w-5 shrink-0 text-primary" />
        <BellOff v-else class="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" />
        <div>
          <p class="font-medium">Background notifications</p>
          <p class="text-sm text-muted-foreground">
            <template v-if="!isInitialized">Checking browser support...</template>
            <template v-else-if="!isSupported">This browser does not support push notifications.</template>
            <template v-else-if="!isEnabled">Push notifications are not configured on the server.</template>
            <template v-else-if="isSubscribed">This browser can receive updates while DurisWeb is closed.</template>
            <template v-else>Receive PvP, auction, forum, and news updates in this browser.</template>
          </p>
        </div>
      </div>

      <Button
        type="button"
        variant="outline"
        :disabled="!isInitialized || !isSupported || !isEnabled || isLoading"
        @click="togglePushNotifications"
      >
        <Loader2 v-if="isLoading" class="animate-spin" />
        <BellOff v-else-if="isSubscribed" />
        <Bell v-else />
        {{ isSubscribed ? 'Disable' : 'Enable' }}
      </Button>
    </CardContent>
  </Card>
</template>
