<script setup lang="ts">
import { computed } from 'vue'
import { Check, Circle, CircleDotDashed, Minus, ShieldAlert } from 'lucide-vue-next'
import type { HookStatus, MudHookState } from '@/types/hooks'

const props = defineProps<{ hook: HookStatus }>()

const mudLabel = computed(() => ({
  enabled: 'ON', disabled: 'OFF', not_gated: 'N/A', unknown: 'UNKNOWN', unavailable: 'UNAVAILABLE',
}[props.hook.mudState]))

function stateIcon(state: boolean | MudHookState) {
  if (state === true || state === 'enabled') return Check
  if (state === false || state === 'disabled') return Circle
  if (state === 'not_gated') return Minus
  return CircleDotDashed
}
</script>

<template>
  <div
    class="dual-state grid grid-cols-[1fr_2.75rem_1fr] items-center gap-2"
    :aria-label="`Website ${hook.webEnabled ? 'on' : 'off'}, MUD ${mudLabel}, effective ${hook.effective}`"
  >
    <div class="min-w-0 text-center">
      <span class="block text-[10px] font-semibold tracking-[0.16em] text-muted-foreground">WEB</span>
      <span
        class="mt-1 inline-flex min-h-7 items-center gap-1 rounded-sm border px-2 font-mono text-xs font-semibold"
        :class="hook.webEnabled ? 'border-primary bg-primary text-primary-foreground' : 'border-dashed border-muted-foreground text-muted-foreground'"
      >
        <component :is="stateIcon(hook.webEnabled)" class="size-3" aria-hidden="true" />
        {{ hook.webEnabled ? 'ON' : 'OFF' }}
      </span>
    </div>

    <div
      class="hook-connector relative"
      :class="hook.effective === 'mismatch' ? 'hook-hazard hook-connector-mismatch' : hook.effective === 'on' ? 'hook-connector-on' : 'hook-connector-idle'"
      :title="`Effective: ${hook.effective}`"
    >
      <ShieldAlert v-if="hook.effective === 'mismatch'" class="absolute left-1/2 top-1/2 size-4 -translate-x-1/2 -translate-y-1/2 bg-background text-warning" aria-hidden="true" />
      <span class="sr-only">{{ hook.effective.toUpperCase() }}</span>
    </div>

    <div class="min-w-0 text-center">
      <span class="block text-[10px] font-semibold tracking-[0.16em] text-muted-foreground">MUD</span>
      <span
        class="mt-1 inline-flex min-h-7 items-center gap-1 rounded-sm border px-2 font-mono text-xs font-semibold"
        :class="{
          'border-primary bg-primary text-primary-foreground': hook.mudState === 'enabled',
          'border-dashed border-muted-foreground text-muted-foreground': hook.mudState === 'disabled',
          'border-dotted border-muted-foreground text-muted-foreground': ['unknown', 'unavailable'].includes(hook.mudState),
          'border-border bg-muted text-muted-foreground': hook.mudState === 'not_gated',
        }"
      >
        <component :is="stateIcon(hook.mudState)" class="size-3" aria-hidden="true" />
        {{ mudLabel }}
      </span>
    </div>
  </div>
</template>

<style scoped>
.hook-hazard {
  background: repeating-linear-gradient(135deg, transparent 0 5px, color-mix(in oklch, var(--warning) 48%, transparent) 5px 7px);
}
.hook-connector-on { height: 1px; background: var(--primary); }
.hook-connector-idle { height: 1px; border-top: 1px dotted var(--muted-foreground); }
.hook-connector-mismatch { height: .75rem; border-block: 1px solid var(--warning); }
@media (max-width: 639px) {
  .hook-connector-on { width: 1px; height: 2.5rem; justify-self: center; }
  .hook-connector-idle { width: 1px; height: 2.5rem; justify-self: center; border-top: 0; border-left: 1px dotted var(--muted-foreground); }
  .hook-connector-mismatch { width: .75rem; height: 2.5rem; justify-self: center; border-block: 0; border-inline: 1px solid var(--warning); }
}
@media (prefers-reduced-motion: reduce) {
  .dual-state * { transition: none !important; }
}
</style>
