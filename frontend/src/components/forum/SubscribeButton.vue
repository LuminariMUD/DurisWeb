<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { forumApi } from '@/services/api'
import { Bell, BellOff } from 'lucide-vue-next'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'

interface Props {
  threadId?: number
  categoryId?: number
  isAuthenticated: boolean
}

const props = defineProps<Props>()

const isSubscribed = ref(false)
const isLoading = ref(false)
const notificationPreference = ref<'all' | 'mentions' | 'none'>('all')
const errorMessage = ref<string | null>(null)

async function loadSubscriptionStatus() {
  if (!props.isAuthenticated) return

  try {
    if (props.threadId) {
      isSubscribed.value = await forumApi.isSubscribedToThread(props.threadId)
    } else if (props.categoryId) {
      isSubscribed.value = await forumApi.isSubscribedToCategory(props.categoryId)
    }
  } catch {}
}

async function handleSubscribe(preference: 'all' | 'mentions' | 'none' = 'all') {
  if (!props.isAuthenticated || isLoading.value) return

  isLoading.value = true
  try {
    if (props.threadId) {
      await forumApi.subscribeToThread(props.threadId, preference)
    } else if (props.categoryId) {
      await forumApi.subscribeToCategory(props.categoryId, preference)
    }
    isSubscribed.value = true
    notificationPreference.value = preference
  } catch (err: any) {
    errorMessage.value = err.response?.data?.error || 'Failed to subscribe'
  } finally {
    isLoading.value = false
  }
}

async function handleUnsubscribe() {
  if (!props.isAuthenticated || isLoading.value) return

  isLoading.value = true
  try {
    if (props.threadId) {
      await forumApi.unsubscribeFromThread(props.threadId)
    } else if (props.categoryId) {
      await forumApi.unsubscribeFromCategory(props.categoryId)
    }
    isSubscribed.value = false
  } catch (err: any) {
    errorMessage.value = err.response?.data?.error || 'Failed to unsubscribe'
  } finally {
    isLoading.value = false
  }
}

onMounted(() => {
  loadSubscriptionStatus()
})
</script>

<template>
  <div v-if="isAuthenticated">
    <!-- Subscribed: Show unsubscribe button -->
    <Button
      v-if="isSubscribed"
      variant="outline"
      size="sm"
      @click="handleUnsubscribe"
      :disabled="isLoading"
    >
      <Bell class="h-4 w-4 mr-2" />
      {{ isLoading ? 'Unsubscribing...' : 'Subscribed' }}
    </Button>

    <!-- Not subscribed: Show dropdown with options -->
    <DropdownMenu v-else>
      <DropdownMenuTrigger as-child>
        <Button
          variant="outline"
          size="sm"
          :disabled="isLoading"
        >
          <BellOff class="h-4 w-4 mr-2" />
          Subscribe
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem @click="handleSubscribe('all')">
          <div>
            <div class="font-medium">All notifications</div>
            <div class="text-xs text-muted-foreground">Get notified for every new post</div>
          </div>
        </DropdownMenuItem>
        <DropdownMenuItem @click="handleSubscribe('mentions')">
          <div>
            <div class="font-medium">Mentions only</div>
            <div class="text-xs text-muted-foreground">Only notify when mentioned</div>
          </div>
        </DropdownMenuItem>
        <DropdownMenuItem @click="handleSubscribe('none')">
          <div>
            <div class="font-medium">No notifications</div>
            <div class="text-xs text-muted-foreground">Subscribe without notifications</div>
          </div>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>

    <!-- Error Dialog -->
    <AlertDialog :open="errorMessage !== null">
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Subscription Error</AlertDialogTitle>
          <AlertDialogDescription>
            {{ errorMessage }}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogAction @click="errorMessage = null">
            OK
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </div>
</template>
