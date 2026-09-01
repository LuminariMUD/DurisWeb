<script setup lang="ts">
import { ref } from 'vue'
import type { HookStatus } from '@/types/hooks'
import { Switch } from '@/components/ui/switch'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'

const props = defineProps<{ hook: HookStatus; pending?: boolean }>()
const emit = defineEmits<{ reconcile: [enabled: boolean] }>()
const confirmOpen = ref(false)

function requestChange(enabled: boolean) {
  if (enabled && props.hook.mudState === 'disabled') {
    confirmOpen.value = true
    return
  }
  emit('reconcile', enabled)
}
</script>

<template>
  <div v-if="hook.alwaysOn" class="flex min-h-11 w-full items-center justify-end rounded-sm border border-border px-3 sm:border-0 sm:px-0">
    <span class="rounded-sm border border-primary px-2 py-1 font-mono text-xs font-semibold">ALWAYS ON</span>
  </div>
  <div v-else class="flex min-h-11 w-full items-center justify-end gap-3 rounded-sm border border-border px-3 sm:border-0 sm:px-0" @click.stop @keydown.stop>
    <span class="w-16 text-right font-mono text-xs font-semibold" :class="pending ? 'text-warning' : 'text-muted-foreground'">
      {{ pending ? 'PENDING' : hook.webEnabled ? 'ON' : 'OFF' }}
    </span>
    <Switch
      :model-value="hook.webEnabled"
      :disabled="pending"
      class="h-6 w-11 [&_[data-slot=switch-thumb]]:size-5"
      :aria-label="`${hook.id}: website ${hook.webEnabled ? 'on' : 'off'}, MUD ${hook.mudState}, effective ${hook.effective}`"
      @update:model-value="requestChange"
    />
  </div>

  <AlertDialog v-model:open="confirmOpen">
    <AlertDialogContent>
      <AlertDialogHeader>
        <AlertDialogTitle>Enable both ends?</AlertDialogTitle>
        <AlertDialogDescription>
          The MUD currently reports {{ hook.id }} as OFF. This will enable the MUD first and the website only after the MUD confirms.
        </AlertDialogDescription>
      </AlertDialogHeader>
      <AlertDialogFooter>
        <AlertDialogCancel>Cancel</AlertDialogCancel>
        <AlertDialogAction @click="emit('reconcile', true)">Enable both ends</AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
</template>
