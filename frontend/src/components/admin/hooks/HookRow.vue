<script setup lang="ts">
import { ArrowDownLeft, ArrowUpRight, ChevronRight } from 'lucide-vue-next'
import type { HookStatus } from '@/types/hooks'
import { Badge } from '@/components/ui/badge'
import DualStateLamp from './DualStateLamp.vue'
import HookToggle from './HookToggle.vue'

defineProps<{ hook: HookStatus; pending?: boolean; error?: string | null }>()
const emit = defineEmits<{ open: [trigger: HTMLElement | null]; reconcile: [enabled: boolean] }>()

function openDetail(event: Event) {
  if (!(event.currentTarget instanceof HTMLElement)) {
    emit('open', null)
    return
  }
  const trigger = event.currentTarget.matches('[data-hook-detail-trigger]')
    ? event.currentTarget
    : event.currentTarget.querySelector<HTMLElement>('[data-hook-detail-trigger]')
  emit('open', trigger)
}

function formatActivity(value: string | null) {
  if (!value) return 'No activity observed'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? 'Unknown' : date.toLocaleString()
}
</script>

<template>
  <div
    data-hook-row
    :data-hook-id="hook.id"
    class="group grid min-h-20 cursor-pointer grid-cols-1 gap-4 border-b border-border px-4 py-4 outline-none transition-colors hover:bg-muted/40 focus-visible:ring-2 focus-visible:ring-ring md:rounded-sm md:border lg:grid-cols-[minmax(15rem,1.4fr)_minmax(17rem,1fr)_10rem_1.5rem] lg:items-center lg:rounded-none lg:border-x-0 lg:border-t-0"
    :class="hook.effective === 'mismatch' ? 'border-warning bg-warning/5 lg:border-l-2 lg:border-l-warning' : ''"
    @click="openDetail"
  >
    <div class="min-w-0">
      <div class="flex flex-wrap items-center gap-2">
        <span class="font-mono text-sm font-semibold">{{ hook.id }}</span>
        <Badge v-if="hook.effective === 'mismatch'" variant="outline" class="border-warning text-warning">MISMATCH</Badge>
        <Badge v-else-if="hook.effective === 'unavailable'" variant="destructive">UNAVAILABLE</Badge>
        <Badge v-else-if="hook.effective === 'unknown'" variant="outline">UNKNOWN</Badge>
        <Badge v-else-if="hook.alwaysOn" variant="outline">RECOVERY PATH</Badge>
      </div>
      <p class="mt-1 line-clamp-2 text-xs text-muted-foreground">{{ hook.description }}</p>
      <div class="mt-2 flex items-center gap-1 text-[11px] text-muted-foreground">
        <ArrowDownLeft v-if="hook.direction === 'mud_to_web'" class="size-3" />
        <ArrowUpRight v-else class="size-3" />
        {{ hook.direction === 'mud_to_web' ? 'MUD to web' : 'Web to MUD' }}
        <span aria-hidden="true">/</span>
        {{ formatActivity(hook.lastActivityAt) }}
      </div>
    </div>

    <DualStateLamp :hook="hook" />
    <HookToggle :hook="hook" :pending="pending" @reconcile="emit('reconcile', $event)" />
    <button
      type="button"
      data-hook-detail-trigger
      class="flex min-h-11 min-w-11 items-center justify-center rounded-sm text-muted-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring lg:min-h-9 lg:min-w-6"
      :aria-label="`Open details for ${hook.id}`"
      @click.stop="openDetail"
    >
      <ChevronRight class="size-4" aria-hidden="true" />
    </button>

    <p v-if="error" class="text-xs text-destructive lg:col-span-4" role="alert">{{ error }}</p>
  </div>
</template>
