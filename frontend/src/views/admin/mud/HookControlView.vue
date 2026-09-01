<script setup lang="ts">
import { computed, nextTick, ref } from 'vue'
import { Filter, RefreshCw, Search, ShieldCheck } from 'lucide-vue-next'
import type { HookChannel } from '@/types/hooks'
import { useHookControl } from '@/composables/useHookControl'
import { hookApiError } from '@/services/hooksApi'
import { useToast } from '@/composables/useToast'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet'
import { Skeleton } from '@/components/ui/skeleton'
import HookDetailSheet from '@/components/admin/hooks/HookDetailSheet.vue'
import HookGroup from '@/components/admin/hooks/HookGroup.vue'
import TransportPanel from '@/components/admin/hooks/TransportPanel.vue'

const channels: HookChannel[] = ['bridge', 'pubsub', 'flatfile', 'process', 'terminal']
const filterSheetOpen = ref(false)
const liveMessage = ref('')
let detailTrigger: HTMLElement | null = null
const { success, warning, error: toastError } = useToast()
const {
  data,
  filteredHooks,
  selectedHook,
  loading,
  loadError,
  filter,
  pending,
  rowErrors,
  summary,
  refresh,
  reconcile,
  selectHook,
} = useHookControl()

const grouped = computed(() =>
  channels
    .map((channel) => ({
      channel,
      hooks: filteredHooks.value.filter((hook) => hook.channel === channel),
    }))
    .filter((group) => group.hooks.length > 0),
)

function formatRefresh(value: string | undefined) {
  if (!value) return 'Not yet refreshed'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? 'Unknown refresh time' : date.toLocaleTimeString()
}

async function changeHook(id: string, enabled: boolean) {
  try {
    const result = await reconcile(id, enabled)
    liveMessage.value = `${id} ${result.complete ? 'confirmed' : 'partially updated'} ${enabled ? 'on' : 'off'}`
    if (result.warning) warning(result.warning, `${id}: action incomplete`)
    else
      success(
        `${id} is confirmed ${enabled ? 'ON' : 'OFF'} on all applicable ends.`,
        'Hook updated',
      )
  } catch (requestError) {
    const message = hookApiError(requestError)
    liveMessage.value = `${id} update failed: ${message}`
    toastError(message, `${id}: update failed`)
  }
}

function openHook(id: string, trigger: HTMLElement | null) {
  detailTrigger = trigger
  void selectHook(id)
}

async function closeHook() {
  await selectHook(null)
  await nextTick()
  detailTrigger?.focus()
  detailTrigger = null
}
</script>

<template>
  <div class="mx-auto w-full max-w-[92rem] space-y-6 px-4 py-6 sm:px-6 lg:px-8">
    <header class="flex flex-col gap-4 border-b border-border pb-5 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <div class="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
          <ShieldCheck class="size-4" /> MUD settings
        </div>
        <h1 class="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">Hook Control</h1>
        <p class="mt-1 max-w-2xl text-sm text-muted-foreground">Website gates, MUD reports, and effective delivery state in one operator surface.</p>
      </div>
      <div class="flex items-center gap-3 text-xs text-muted-foreground">
        <span>Updated {{ formatRefresh(data?.refreshedAt) }}</span>
        <Button variant="outline" size="icon-sm" aria-label="Refresh hook state" @click="refresh(false)"><RefreshCw class="size-4" /></Button>
      </div>
    </header>

    <section class="grid grid-cols-2 border border-border sm:grid-cols-5" aria-label="Hook summary">
      <div class="col-span-2 border-b border-border p-4 sm:col-span-1 sm:border-b-0 sm:border-r">
        <p class="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Active</p>
        <p class="mt-1 text-2xl font-semibold">{{ summary.active }}<span class="text-sm text-muted-foreground"> / {{ summary.total }}</span></p>
      </div>
      <div class="border-r border-border p-4"><p class="text-[10px] uppercase tracking-wider text-muted-foreground">Off</p><p class="mt-1 text-xl font-semibold">{{ summary.off }}</p></div>
      <div class="p-4 sm:border-r"><p class="text-[10px] uppercase tracking-wider text-muted-foreground">Mismatch</p><p class="mt-1 text-xl font-semibold text-warning">{{ summary.mismatch }}</p></div>
      <div class="border-r border-t border-border p-4 sm:border-t-0"><p class="text-[10px] uppercase tracking-wider text-muted-foreground">Unknown</p><p class="mt-1 text-xl font-semibold">{{ summary.unknown }}</p></div>
      <div class="border-t border-border p-4 sm:border-t-0"><p class="text-[10px] uppercase tracking-wider text-muted-foreground">Transport</p><p class="mt-1 font-mono text-xs font-semibold">{{ data?.transport.authenticated ? 'READY' : data?.transport.blocked ? 'BLOCKED' : 'OFFLINE' }}</p></div>
    </section>

    <div class="grid gap-4 lg:grid-cols-[minmax(18rem,0.65fr)_minmax(0,1.6fr)] lg:items-start">
      <div>
        <div class="hidden sm:block">
          <label for="hook-filter" class="sr-only">Filter hooks</label>
          <div class="relative">
            <Search class="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input id="hook-filter" v-model="filter" class="pl-9" placeholder="Filter by id, channel, direction, or state" />
          </div>
        </div>
        <Sheet v-model:open="filterSheetOpen">
          <SheetTrigger as-child><Button variant="outline" class="min-h-11 w-full sm:hidden"><Filter /> Filter hooks</Button></SheetTrigger>
          <SheetContent side="bottom" class="p-5">
            <SheetHeader class="text-left"><SheetTitle>Filter hooks</SheetTitle><SheetDescription>Search the registry by id, channel, direction, or effective state.</SheetDescription></SheetHeader>
            <Input v-model="filter" class="mt-5 min-h-11" autofocus placeholder="Start typing..." />
            <Button class="mt-4 min-h-11 w-full" @click="filterSheetOpen = false">Show results</Button>
          </SheetContent>
        </Sheet>
      </div>
      <TransportPanel v-if="data" :transport="data.transport" />
    </div>

    <Alert v-if="loadError" variant="destructive">
      <AlertTitle>Hook state unavailable</AlertTitle>
      <AlertDescription>{{ loadError }}</AlertDescription>
    </Alert>

    <div v-if="loading" class="space-y-8" aria-label="Loading hooks">
      <div v-for="group in 3" :key="group" class="space-y-3"><Skeleton class="h-8 w-56" /><Skeleton v-for="row in 3" :key="row" class="h-20 w-full" /></div>
    </div>
    <div v-else-if="grouped.length" class="space-y-8">
      <HookGroup
        v-for="group in grouped"
        :key="group.channel"
        :channel="group.channel"
        :hooks="group.hooks"
        :pending="pending"
        :errors="rowErrors"
        @open="openHook"
        @reconcile="changeHook"
      />
    </div>
    <div v-else-if="!loadError" class="border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
      No hooks match "{{ filter }}".
    </div>

    <p class="sr-only" aria-live="polite">{{ liveMessage }}</p>
    <HookDetailSheet
      :hook="selectedHook"
      :pending="selectedHook ? pending.has(selectedHook.id) : false"
      @close="closeHook"
      @reconcile="selectedHook && changeHook(selectedHook.id, $event)"
    />
  </div>
</template>
