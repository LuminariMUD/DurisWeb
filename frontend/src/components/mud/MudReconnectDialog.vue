<script setup lang="ts">
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { useMudStore } from '@/stores/mudStore'
import { useMudConnection } from '@/composables/useMudConnection'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { WifiOff, RefreshCw, Home } from 'lucide-vue-next'

const emit = defineEmits<{
  (e: 'reconnect'): void
  (e: 'close'): void
}>()

const router = useRouter()
const store = useMudStore()
const { connect } = useMudConnection()

const isOpen = computed(() => store.showReconnectDialog)

const handleReconnect = () => {
  store.closeReconnectDialog()
  connect()
  emit('reconnect')
}

const handleGoHome = () => {
  store.closeReconnectDialog()
  store.reset()
  router.push('/')
  emit('close')
}

const handleClose = () => {
  store.closeReconnectDialog()
  emit('close')
}
</script>

<template>
  <AlertDialog :open="isOpen" @update:open="handleClose">
    <AlertDialogContent class="max-w-md">
      <AlertDialogHeader>
        <AlertDialogTitle class="flex items-center gap-2">
          <WifiOff class="h-5 w-5 text-yellow-500" />
          Disconnected
        </AlertDialogTitle>
        <AlertDialogDescription>
          <div class="mt-4 text-center">
            <WifiOff class="h-16 w-16 mx-auto mb-4 text-muted-foreground/50" />
            <p class="text-lg mb-2">You have been disconnected from the server.</p>
            <p class="text-muted-foreground">
              Would you like to reconnect or return to the home page?
            </p>
          </div>
        </AlertDialogDescription>
      </AlertDialogHeader>
      <AlertDialogFooter class="flex-col sm:flex-row gap-2">
        <AlertDialogCancel @click="handleGoHome" class="w-full sm:w-auto">
          <Home class="h-4 w-4 mr-2" />
          Return Home
        </AlertDialogCancel>
        <AlertDialogAction @click="handleReconnect" class="w-full sm:w-auto">
          <RefreshCw class="h-4 w-4 mr-2" />
          Reconnect
        </AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
</template>
