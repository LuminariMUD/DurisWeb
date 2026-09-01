<script setup lang="ts">
import { computed, ref } from 'vue'
import { Activity, Database, Radio, UserRound } from 'lucide-vue-next'
import type { HookStatus } from '@/types/hooks'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
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
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import DualStateLamp from './DualStateLamp.vue'

const props = defineProps<{ hook: HookStatus | null; pending?: boolean }>()
const emit = defineEmits<{ close: []; reconcile: [enabled: boolean] }>()

const open = computed(() => props.hook !== null)
const confirmEnableOpen = ref(false)

function requestEnable() {
  if (props.hook?.mudState === 'disabled') confirmEnableOpen.value = true
  else emit('reconcile', true)
}

function formatDate(value: string | null) {
  if (!value) return 'Unknown'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? 'Unknown' : date.toLocaleString()
}
</script>

<template>
  <Sheet :open="open" @update:open="!$event && emit('close')">
    <SheetContent class="w-full overflow-y-auto p-0 sm:max-w-lg">
      <template v-if="hook">
        <SheetHeader class="border-b border-border p-5 text-left">
          <div class="flex items-center gap-2 pr-8">
            <SheetTitle class="font-mono text-lg">{{ hook.id }}</SheetTitle>
            <Badge variant="outline">{{ hook.channel }}</Badge>
          </div>
          <SheetDescription>{{ hook.description }}</SheetDescription>
        </SheetHeader>

        <div class="space-y-6 p-5">
          <section aria-labelledby="detail-state" class="space-y-4">
            <div>
              <h3 id="detail-state" class="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">Current state</h3>
              <p class="mt-1 text-sm">{{ hook.reason }}</p>
            </div>
            <DualStateLamp :hook="hook" />
          </section>

          <section class="border-t border-border pt-5" aria-labelledby="detail-provenance">
            <h3 id="detail-provenance" class="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">Provenance</h3>
            <dl class="mt-3 grid gap-4 text-sm">
              <div class="grid grid-cols-[1.25rem_1fr] gap-2">
                <UserRound class="mt-0.5 size-4 text-muted-foreground" />
                <div><dt class="font-medium">Website setting</dt><dd class="mt-1 text-muted-foreground">{{ hook.provenance.web.actor ?? 'Unknown actor' }} / {{ formatDate(hook.provenance.web.changedAt) }}</dd></div>
              </div>
              <div class="grid grid-cols-[1.25rem_1fr] gap-2">
                <Radio class="mt-0.5 size-4 text-muted-foreground" />
                <div><dt class="font-medium">MUD report</dt><dd class="mt-1 text-muted-foreground">{{ hook.provenance.mud.source ?? 'Not reported' }} / received {{ formatDate(hook.provenance.mud.reportedAt) }}</dd></div>
              </div>
              <div class="grid grid-cols-[1.25rem_1fr] gap-2">
                <Activity class="mt-0.5 size-4 text-muted-foreground" />
                <div><dt class="font-medium">Last activity</dt><dd class="mt-1 text-muted-foreground">{{ formatDate(hook.lastActivityAt) }}</dd></div>
              </div>
              <div class="grid grid-cols-[1.25rem_1fr] gap-2">
                <Database class="mt-0.5 size-4 text-muted-foreground" />
                <div>
                  <dt class="font-medium">Resource health</dt>
                  <dd class="mt-1 text-muted-foreground">
                    {{ hook.resource ? `${hook.resource.availability}${hook.resource.reason ? `: ${hook.resource.reason}` : ''}` : 'Not applicable' }}
                    <span v-if="hook.resource?.droppedInputs"> / {{ hook.resource.droppedInputs }} dropped inputs</span>
                    <span v-if="hook.resource?.retryAt"> / retry {{ formatDate(hook.resource.retryAt) }}</span>
                  </dd>
                </div>
              </div>
            </dl>
          </section>

          <section v-if="hook.alwaysOn" class="rounded-sm border border-border bg-muted/40 p-4 text-sm">
            Terminal is the operator recovery path. It is controlled only by the terminal_access permission and cannot be disabled here.
          </section>
        </div>

        <SheetFooter v-if="!hook.alwaysOn" class="sticky bottom-0 border-t border-border bg-background">
          <p class="text-xs text-muted-foreground">Set both owned ends using fail-closed ordering.</p>
          <div class="grid grid-cols-2 gap-2">
            <Button variant="outline" :disabled="pending" @click="emit('reconcile', false)">Set both OFF</Button>
            <Button :disabled="pending" @click="requestEnable">{{ pending ? 'Pending...' : 'Set both ON' }}</Button>
          </div>
        </SheetFooter>
      </template>
    </SheetContent>
  </Sheet>

  <AlertDialog v-model:open="confirmEnableOpen">
    <AlertDialogContent>
      <AlertDialogHeader>
        <AlertDialogTitle>Enable both ends?</AlertDialogTitle>
        <AlertDialogDescription>
          The MUD currently reports {{ hook?.id }} as OFF. The website will remain off until the MUD confirms the enabled state.
        </AlertDialogDescription>
      </AlertDialogHeader>
      <AlertDialogFooter>
        <AlertDialogCancel>Cancel</AlertDialogCancel>
        <AlertDialogAction @click="emit('reconcile', true)">Enable both ends</AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
</template>
