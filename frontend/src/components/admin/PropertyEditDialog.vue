<template>
  <AlertDialog :open="open" @update:open="handleOpenChange">
    <AlertDialogContent class="bg-ink-high border border-border max-w-md">
      <AlertDialogHeader>
        <AlertDialogTitle class="text-white text-xl">Confirm Property Change</AlertDialogTitle>
        <AlertDialogDescription class="text-muted-foreground">
          You are about to modify a game property. This change will be saved immediately.
        </AlertDialogDescription>
      </AlertDialogHeader>

      <div class="space-y-4 py-4">
        <!-- Property Key -->
        <div class="bg-card/50 rounded-lg p-3">
          <p class="text-sm text-muted-foreground mb-1">Property</p>
          <p class="text-sm font-mono text-white">{{ propertyKey }}</p>
        </div>

        <!-- Value Change -->
        <div class="bg-card/50 rounded-lg p-3">
          <p class="text-sm text-muted-foreground mb-2">Value Change</p>
          <div class="flex items-center gap-3">
            <div class="flex-1">
              <p class="text-xs text-faint">Current</p>
              <p class="text-lg font-mono text-info">{{ oldValue }}</p>
            </div>
            <ArrowRight class="w-5 h-5 text-faint" />
            <div class="flex-1">
              <p class="text-xs text-faint">New</p>
              <p class="text-lg font-mono text-success">{{ newValue }}</p>
            </div>
          </div>
        </div>

        <!-- Warning -->
        <div class="bg-warning-deep/20 border border-warning/30 rounded-lg p-3 flex items-start gap-2">
          <AlertTriangle class="w-5 h-5 text-warning flex-shrink-0 mt-0.5" />
          <div>
            <p class="text-sm text-warning font-medium">MUD Restart Required</p>
            <p class="text-xs text-muted-foreground mt-1">
              You must restart the MUD server for this change to take effect.
            </p>
          </div>
        </div>
      </div>

      <AlertDialogFooter>
        <AlertDialogCancel
          class="bg-ink-top text-white hover:bg-rule border-faint"
          @click="handleCancel"
        >
          Cancel
        </AlertDialogCancel>
        <AlertDialogAction
          class="bg-info-deep text-white hover:bg-info-deep/80"
          :disabled="saving"
          @click="handleConfirm"
        >
          <span v-if="saving" class="flex items-center gap-2">
            <div class="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
            Saving...
          </span>
          <span v-else>Confirm Change</span>
        </AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
</template>

<script setup lang="ts">
import { ArrowRight, AlertTriangle } from '@lucide/vue'
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from '@/components/ui/alert-dialog'

interface Props {
  open: boolean
  propertyKey: string
  oldValue: number
  newValue: number
  saving?: boolean
}

interface Emits {
  (e: 'update:open', value: boolean): void
  (e: 'confirm'): void
  (e: 'cancel'): void
}

defineProps<Props>()
const emit = defineEmits<Emits>()

const handleOpenChange = (value: boolean) => {
  emit('update:open', value)
}

const handleConfirm = () => {
  emit('confirm')
}

const handleCancel = () => {
  emit('cancel')
}
</script>
