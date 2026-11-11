<script setup lang="ts">
import { computed, ref } from 'vue'
import { DisplayHeading, IndexLabel } from '@/components/brand'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import AnsiText from '@/components/ui/AnsiText.vue'
import { useNamedSets } from '@/composables/useNamedSets'
import type { NamedSetCooldown, NamedSetSpell, NamedSetZone } from '@/features/namedSets/api'

const { data, isLoading, isError, isFetching, refetch } = useNamedSets()

const search = ref('')
const spell = ref('')

const zones = computed<NamedSetZone[]>(() => data.value?.zones ?? [])

const spellOptions = computed(() => {
  const counts = new Map<string, number>()
  for (const zone of zones.value)
    for (const name of new Set(zone.spells.map((entry) => entry.name)))
      counts.set(name, (counts.get(name) ?? 0) + 1)
  return [...counts.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([name, count]) => ({ name, count }))
})

function matchesSearch(zone: NamedSetZone, term: string): boolean {
  if (!term) return true
  const number = term.replace(/^#/, '')
  if (/^\d+$/.test(number)) return String(zone.zone) === number
  return (
    zone.name.toLowerCase().includes(term) ||
    zone.spells.some((entry) => entry.name.toLowerCase().includes(term))
  )
}

const visibleZones = computed(() => {
  const term = search.value.trim().toLowerCase()
  return zones.value.filter(
    (zone) =>
      matchesSearch(zone, term) &&
      (!spell.value || zone.spells.some((entry) => entry.name === spell.value)),
  )
})

const isFiltered = computed(() => search.value.trim() !== '' || spell.value !== '')

function toggleSpell(name: string) {
  spell.value = spell.value === name ? '' : name
}

function clearFilters() {
  search.value = ''
  spell.value = ''
}

function cooldownLabel(cooldown: NamedSetCooldown): string {
  if (cooldown === 'one_minute') return '1 min cooldown'
  if (cooldown === 'five_minutes') return '5 min cooldown'
  return ''
}

function spellLabel(entry: NamedSetSpell): string {
  const pieces = `${entry.pieces} ${entry.pieces === 1 ? 'piece' : 'pieces'}`
  const cooldown = cooldownLabel(entry.cooldown)
  return [entry.name, pieces, cooldown].filter(Boolean).join(', ')
}

function cooldownClass(cooldown: NamedSetCooldown): string {
  if (cooldown === 'one_minute') return 'text-success'
  if (cooldown === 'five_minutes') return 'text-warning'
  return 'text-muted-foreground'
}

const fetchedAt = computed(() => {
  const value = data.value?.fetchedAt
  return value ? new Date(value).toLocaleString() : ''
})
</script>

<template>
  <div class="mx-auto max-w-6xl space-y-8">
    <header class="space-y-4">
      <IndexLabel as="p">In-game namedreport</IndexLabel>
      <DisplayHeading>Named <em>sets</em></DisplayHeading>
      <p class="max-w-prose text-muted-foreground">
        Wearing several pieces of random gear from the same zone forms a named set. Sets grant extra
        hit points, and in the zones below they also grant spells once you wear enough pieces. Use
        this list to decide where to hunt for gear.
      </p>
    </header>

    <div
      v-if="isLoading"
      role="status"
      class="flex h-64 items-center justify-center rounded-lg border border-border bg-ink-high/50 text-muted-foreground"
    >
      Loading named sets...
    </div>

    <div
      v-else-if="isError"
      role="alert"
      class="space-y-4 rounded-lg border border-border bg-ink-high/50 px-6 py-12 text-center"
    >
      <p>The named set report isn't available right now.</p>
      <p class="mx-auto max-w-prose text-sm text-muted-foreground">
        The game publishes it when it starts and whenever someone types
        <code class="font-mono text-foreground">namedreport</code> in game.
      </p>
      <Button variant="outline" :disabled="isFetching" @click="refetch()">
        {{ isFetching ? 'Checking...' : 'Try again' }}
      </Button>
    </div>

    <template v-else-if="data">
      <section aria-label="Filters" class="grid gap-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,16rem)_auto] sm:items-end">
        <div class="space-y-2">
          <Label for="named-sets-search">Search zones or spells</Label>
          <Input
            id="named-sets-search"
            v-model="search"
            type="search"
            autocomplete="off"
            placeholder="e.g. haste, stone skin, #87"
          />
        </div>
        <div class="space-y-2">
          <Label for="named-sets-spell">Spell</Label>
          <select
            id="named-sets-spell"
            v-model="spell"
            class="flex h-9 w-full rounded-md border border-input bg-ink-sunken px-3 py-1 text-base text-foreground shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 md:text-sm"
          >
            <option value="">All spells</option>
            <option v-for="option in spellOptions" :key="option.name" :value="option.name">
              {{ option.name }} ({{ option.count }})
            </option>
          </select>
        </div>
        <Button variant="ghost" :disabled="!isFiltered" @click="clearFilters">Clear</Button>
      </section>

      <div class="flex flex-wrap items-center justify-between gap-3 text-sm text-muted-foreground">
        <p role="status">
          Showing {{ visibleZones.length }} of {{ zones.length }} zones
        </p>
        <p class="flex flex-wrap gap-x-4 gap-y-1">
          <span>Spell <span class="text-foreground">(pieces required)</span></span>
          <span class="text-success">1 min cooldown</span>
          <span class="text-warning">5 min cooldown</span>
        </p>
      </div>

      <div v-if="visibleZones.length === 0" role="status" class="rounded-lg border border-border bg-ink-high/50 px-6 py-12 text-center space-y-4">
        <p>No zones match these filters.</p>
        <Button variant="outline" @click="clearFilters">Clear filters</Button>
      </div>

      <div v-else class="overflow-x-auto rounded-lg border border-border">
        <table class="w-full text-left text-sm">
          <caption class="sr-only">Spells granted by named sets, by zone</caption>
          <thead class="bg-ink-high text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th scope="col" class="px-4 py-3 font-medium">Zone</th>
              <th scope="col" class="px-4 py-3 font-medium">Spells granted (pieces required)</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-border bg-ink">
            <tr v-for="zone in visibleZones" :key="zone.zone" class="align-top">
              <th scope="row" class="px-4 py-3 font-normal sm:w-2/5">
                <span class="font-label text-xs text-label">#{{ zone.zone }}</span> <AnsiText :text="zone.coloredName" />
              </th>
              <td class="px-4 py-3">
                <ul v-if="zone.spells.length" class="flex flex-wrap gap-2">
                  <li v-for="entry in zone.spells" :key="`${entry.name}-${entry.pieces}`">
                    <button
                      type="button"
                      :aria-pressed="spell === entry.name"
                      :aria-label="spellLabel(entry)"
                      :title="`Show zones that grant ${entry.name}`"
                      :class="[
                        'rounded-sm border px-2 py-1 text-left transition-colors min-h-8',
                        spell === entry.name
                          ? 'border-vermilion bg-vermilion-deep/30'
                          : 'border-border bg-ink-raised hover:bg-ink-high',
                      ]"
                      @click="toggleSpell(entry.name)"
                    >
                      <span :class="entry.cooldown ? cooldownClass(entry.cooldown) : 'text-info'">{{ entry.name }}</span> <span class="text-foreground">({{ entry.pieces }})</span><span v-if="entry.cooldown" :class="['text-xs', cooldownClass(entry.cooldown)]"> · {{ cooldownLabel(entry.cooldown) }}</span>
                    </button>
                  </li>
                </ul>
                <span v-else class="text-muted-foreground">Hit points only</span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <details v-if="data.notes" class="rounded-lg border border-border bg-ink-sunken">
        <summary class="cursor-pointer px-4 py-3 text-sm font-medium">Notes from the game</summary>
        <AnsiText
          tag="pre"
          :text="data.notes"
          class="overflow-x-auto px-4 pb-4 font-mono text-xs leading-relaxed whitespace-pre"
        />
      </details>

      <p class="text-xs text-muted-foreground">
        Same list as typing <code class="font-mono">namedreport</code> in game. Checked
        {{ fetchedAt }}.
      </p>
    </template>
  </div>
</template>
