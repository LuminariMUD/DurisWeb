<script setup lang="ts">
import { computed, ref, watch } from 'vue'
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
import { WifiOff, RefreshCw, Home } from '@lucide/vue'
import { explainMudClose, formatMudCloseDiagnostic } from '@/utils/mudCloseDiagnostics'

const emit = defineEmits<{
  (e: 'reconnect'): void
  (e: 'close'): void
}>()

const router = useRouter()
const store = useMudStore()
const { connect } = useMudConnection()

const isOpen = computed(() => store.showReconnectDialog)

// A server refusal keeps priority over the generic close explanation.
const message = computed(
  () =>
    store.connectionError ??
    (store.closeDiagnostic
      ? explainMudClose(store.closeDiagnostic)
      : 'You have been disconnected from the server.'),
)
const diagnosticText = computed(() =>
  store.closeDiagnostic ? formatMudCloseDiagnostic(store.closeDiagnostic) : null,
)
const copyStatus = ref<'idle' | 'copied' | 'failed'>('idle')
watch(diagnosticText, () => (copyStatus.value = 'idle'))

const copyDiagnostic = async () => {
  if (!diagnosticText.value) return
  try {
    await navigator.clipboard.writeText(diagnosticText.value)
    copyStatus.value = 'copied'
  } catch {
    copyStatus.value = 'failed'
  }
}

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
            <p class="text-lg mb-2">{{ message }}</p>
            <p class="text-muted-foreground">
              Would you like to reconnect or return to the home page?
            </p>
          </div>
          <div v-if="diagnosticText" class="mt-4 text-left">
            <p class="text-xs text-muted-foreground mb-1">
              Connection details for bug reports (no account or message data):
            </p>
            <code
              data-testid="close-diagnostic"
              class="block select-all break-all rounded bg-muted p-2 text-xs text-foreground"
              >{{ diagnosticText }}</code
            >
            <button
              type="button"
              class="mt-1 text-xs underline text-muted-foreground hover:text-foreground"
              @click="copyDiagnostic"
            >
              {{
                copyStatus === 'copied'
                  ? 'Copied'
                  : copyStatus === 'failed'
                    ? 'Copy failed — select the text above'
                    : 'Copy details'
              }}
            </button>
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
