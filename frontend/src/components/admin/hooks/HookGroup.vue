<script setup lang="ts">
import { computed } from 'vue'
import type { HookChannel, HookStatus } from '@/types/hooks'
import HookRow from './HookRow.vue'

const props = defineProps<{
  channel: HookChannel
  hooks: HookStatus[]
  pending: Set<string>
  errors: Record<string, string>
}>()
const emit = defineEmits<{
  open: [id: string, trigger: HTMLElement | null]
  reconcile: [id: string, enabled: boolean]
}>()

const labels: Record<HookChannel, { title: string; detail: string }> = {
  bridge: { title: 'Authenticated bridge', detail: 'WebSocket / bidirectional control plane' },
  pubsub: { title: 'Pub/Sub', detail: 'Scoped Redis delivery' },
  flatfile: { title: 'Ingestion', detail: 'Bounded files and compatibility reads' },
  process: { title: 'Process control', detail: 'Website-owned host operations' },
  terminal: { title: 'Terminal', detail: 'Always-on operator recovery path' },
}
const copy = computed(() => labels[props.channel])
</script>

<template>
  <section :aria-labelledby="`hook-group-${channel}`" class="space-y-2">
    <header class="flex items-end justify-between border-b border-border pb-2">
      <div>
        <h2 :id="`hook-group-${channel}`" class="text-sm font-semibold uppercase tracking-[0.12em]">{{ copy.title }}</h2>
        <p class="mt-0.5 text-xs text-muted-foreground">{{ copy.detail }}</p>
      </div>
      <span class="font-mono text-xs text-muted-foreground">{{ hooks.length }} hook{{ hooks.length === 1 ? '' : 's' }}</span>
    </header>
    <div class="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:block lg:rounded-sm lg:border lg:border-border">
      <HookRow
        v-for="hook in hooks"
        :key="hook.id"
        :hook="hook"
        :pending="pending.has(hook.id)"
        :error="errors[hook.id]"
        @open="emit('open', hook.id, $event)"
        @reconcile="emit('reconcile', hook.id, $event)"
      />
    </div>
  </section>
</template>
