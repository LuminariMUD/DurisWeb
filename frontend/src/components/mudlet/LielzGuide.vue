<script setup lang="ts">
import { computed, ref } from 'vue'
import { Search } from '@lucide/vue'
import { DisplayHeading, IndexLabel } from '@/components/brand'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  alwaysOnNotes,
  autoVariables,
  automationToggles,
  commandGroups,
  displayHelpers,
  keypadLayout,
  shipKeyBindings,
  type AutomationToggle,
} from '@/content/lielzGuide'

const chapters = [
  { id: 'lielz-start', label: 'Quick start' },
  { id: 'lielz-display', label: 'Always on' },
  { id: 'lielz-automation', label: 'Automation' },
  { id: 'lielz-variables', label: 'Variables' },
  { id: 'lielz-commands', label: 'Commands' },
  { id: 'lielz-keys', label: 'Keys' },
  { id: 'lielz-split', label: 'Loot split' },
]

type ToggleFilter = 'All' | AutomationToggle['group']
const toggleFilters: ToggleFilter[] = [
  'All',
  'Combat',
  'Group',
  'Class',
  'Reporting',
  'Ship',
  'Creation',
]
const toggleFilter = ref<ToggleFilter>('All')
const visibleToggles = computed(() =>
  toggleFilter.value === 'All'
    ? automationToggles
    : automationToggles.filter((toggle) => toggle.group === toggleFilter.value),
)

const search = ref('')
const filteredGroups = computed(() => {
  const query = search.value.trim().toLowerCase()
  if (!query) return commandGroups
  return commandGroups
    .map((group) => ({
      ...group,
      commands: group.commands.filter((entry) =>
        `${entry.command} ${entry.purpose} ${group.title}`.toLowerCase().includes(query),
      ),
    }))
    .filter((group) => group.commands.length > 0)
})
const commandCount = computed(() =>
  filteredGroups.value.reduce((total, group) => total + group.commands.length, 0),
)

function jumpTo(id: string) {
  const target = document.getElementById(id)
  if (!target) return
  target.focus({ preventScroll: true })
  target.scrollIntoView({
    block: 'start',
    behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
  })
}

function clearSearch() {
  search.value = ''
  document.getElementById('lielz-command-search')?.focus()
}
</script>

<template>
  <section
    id="lielz-guide"
    tabindex="-1"
    aria-labelledby="lielz-heading"
    class="lielz-guide space-y-10"
  >
    <div class="grid gap-6 md:grid-cols-2 md:gap-12">
      <div class="space-y-3">
        <IndexLabel as="p">03 / Lielz helpers</IndexLabel>
        <DisplayHeading id="lielz-heading" :level="2">The Lielz toolkit, <em>built in.</em></DisplayHeading>
      </div>
      <div class="space-y-4 leading-relaxed text-bone-muted">
        <p>
          The community <strong class="font-medium text-foreground">Lielz scripts</strong>, a
          collection built by players between 2015 and 2024, are part of the GUI package.
          There is nothing extra to install.
        </p>
        <p>
          Display helpers start on. Every automation starts <strong class="font-medium text-foreground">off</strong>
          and stays off until you switch it on yourself. Your choices, variables, and lists are saved
          with your Mudlet profile.
        </p>
      </div>
    </div>

    <nav aria-label="Lielz guide sections" class="lielz-nav">
      <a
        v-for="(chapter, index) in chapters"
        :key="chapter.id"
        :href="`#${chapter.id}`"
        @click.prevent="jumpTo(chapter.id)"
      >
        <span class="font-label text-xs text-label">{{ String(index + 1).padStart(2, '0') }}</span>{{ chapter.label }}
      </a>
    </nav>

    <!-- Quick start -->
    <section id="lielz-start" tabindex="-1" aria-labelledby="lielz-start-heading" class="lielz-part">
      <DisplayHeading id="lielz-start-heading" :level="3">Quick start</DisplayHeading>
      <ol class="grid gap-4 md:grid-cols-3">
        <li class="step-card">
          <span class="step-number" aria-hidden="true">1</span>
          <h4 class="font-medium">See what is available</h4>
          <p>
            Type <code>auto</code> for the command summary, or <code>auto set</code> to list every
            automation and whether it is on.
          </p>
        </li>
        <li class="step-card">
          <span class="step-number" aria-hidden="true">2</span>
          <h4 class="font-medium">Tell it about your gear</h4>
          <p>
            Some helpers need a keyword. For example: <code>container backpack</code>,
            <code>wep longsword</code>, <code>tt orc</code>. Type <code>vars</code> to check them.
          </p>
        </li>
        <li class="step-card">
          <span class="step-number" aria-hidden="true">3</span>
          <h4 class="font-medium">Switch on what you want</h4>
          <p>
            Turn on one helper at a time: <code>auto autoStand on</code>. Use <code>off</code> to stop
            it. Names are case-sensitive.
          </p>
        </li>
      </ol>
      <p class="tip">
        <strong class="font-medium text-foreground">Reports stay private by default.</strong>
        Reporting helpers echo to your own screen until you choose a channel, for example
        <code>report channel gsay</code>. Use <code>report channel echo</code> to make them private again.
      </p>
    </section>

    <!-- Display helpers -->
    <section id="lielz-display" tabindex="-1" aria-labelledby="lielz-display-heading" class="lielz-part">
      <div class="part-heading">
        <DisplayHeading id="lielz-display-heading" :level="3">Always on: display helpers</DisplayHeading>
        <p>
          These only change what you see. They never send commands for you. Turn one off with
          <code>ui set &lt;name&gt; off</code>.
        </p>
      </div>
      <ul class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <li v-for="helper in displayHelpers" :key="helper.setting" class="info-card">
          <div class="flex flex-wrap items-baseline justify-between gap-2">
            <h4 class="font-medium">{{ helper.name }}</h4>
            <code class="setting-chip">{{ helper.setting }}</code>
          </div>
          <p class="text-foreground">{{ helper.summary }}</p>
          <p>{{ helper.detail }}</p>
        </li>
      </ul>
      <div class="space-y-3">
        <h4 class="font-medium">Also built into the panels</h4>
        <ul class="bullet-list">
          <li v-for="note in alwaysOnNotes" :key="note">{{ note }}</li>
        </ul>
      </div>
    </section>

    <!-- Automation -->
    <section id="lielz-automation" tabindex="-1" aria-labelledby="lielz-automation-heading" class="lielz-part">
      <div class="part-heading">
        <DisplayHeading id="lielz-automation-heading" :level="3">Automation you switch on</DisplayHeading>
        <p>
          Each card shows the command to turn it on, what it does, and the game text that sets it off.
          Turn it off again with <code>off</code> in place of <code>on</code>.
        </p>
      </div>
      <div role="group" aria-label="Filter automation by kind" class="filter-row">
        <Button
          v-for="filter in toggleFilters"
          :key="filter"
          type="button"
          size="sm"
          :variant="toggleFilter === filter ? 'default' : 'outline'"
          :aria-pressed="toggleFilter === filter"
          @click="toggleFilter = filter"
        >
          {{ filter }}
        </Button>
      </div>
      <p class="sr-only" role="status">{{ visibleToggles.length }} automation helpers shown</p>
      <ul class="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <li v-for="toggle in visibleToggles" :key="toggle.name" class="info-card">
          <div class="flex flex-wrap items-baseline justify-between gap-2">
            <h4 class="font-medium">{{ toggle.title }}</h4>
            <span class="index-label">{{ toggle.group }}</span>
          </div>
          <code class="command-chip">auto {{ toggle.name }} on</code>
          <p class="text-foreground">{{ toggle.summary }}</p>
          <dl class="card-facts">
            <div>
              <dt>Reacts to</dt>
              <dd>{{ toggle.trigger }}</dd>
            </div>
            <div v-if="toggle.needs">
              <dt>Needs</dt>
              <dd>{{ toggle.needs }}</dd>
            </div>
          </dl>
        </li>
      </ul>
    </section>

    <!-- Variables -->
    <section id="lielz-variables" tabindex="-1" aria-labelledby="lielz-variables-heading" class="lielz-part">
      <div class="part-heading">
        <DisplayHeading id="lielz-variables-heading" :level="3">Variables</DisplayHeading>
        <p>
          Short commands remember your keywords so the helpers know what to use. Type
          <code>vars</code> to see your current values.
        </p>
      </div>
      <div class="table-scroll" tabindex="0" role="region" aria-label="Variables table">
        <table class="lielz-table">
          <thead>
            <tr>
              <th scope="col">Variable</th>
              <th scope="col">Set it with</th>
              <th scope="col">Default</th>
              <th scope="col">Used by</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="variable in autoVariables" :key="variable.name">
              <th scope="row">{{ variable.name }}</th>
              <td><code>{{ variable.setWith }}</code></td>
              <td>{{ variable.defaultValue }}</td>
              <td>{{ variable.usedBy }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>

    <!-- Commands -->
    <section id="lielz-commands" tabindex="-1" aria-labelledby="lielz-commands-heading" class="lielz-part">
      <div class="part-heading">
        <DisplayHeading id="lielz-commands-heading" :level="3">Command reference</DisplayHeading>
        <p>
          Type these in Mudlet’s command line. Replace <code>&lt;placeholders&gt;</code> with real
          names; <code>[brackets]</code> are optional and a dot separates alternatives.
        </p>
      </div>
      <div class="search-row">
        <div class="flex flex-1 flex-col gap-2">
          <Label for="lielz-command-search">Find a command</Label>
          <div class="relative">
            <Search class="pointer-events-none absolute left-3 top-2.5 size-4 text-muted-foreground" aria-hidden="true" />
            <Input
              id="lielz-command-search"
              v-model="search"
              type="search"
              placeholder="Try “corpse”, “rescue”, or “ship”…"
              class="pl-9"
              aria-describedby="lielz-command-count"
            />
          </div>
        </div>
        <Button v-if="search" type="button" variant="outline" @click="clearSearch">Clear search</Button>
        <p id="lielz-command-count" role="status" class="font-label text-xs text-muted-foreground">
          {{ commandCount }} {{ commandCount === 1 ? 'entry' : 'entries' }}
        </p>
      </div>
      <nav v-if="!search" aria-label="Command categories" class="category-links">
        <a
          v-for="group in commandGroups"
          :key="group.id"
          :href="`#lielz-cmd-${group.id}`"
          @click.prevent="jumpTo(`lielz-cmd-${group.id}`)"
          >{{ group.title }}</a
        >
      </nav>
      <div v-if="filteredGroups.length" class="command-columns">
        <section
          v-for="group in filteredGroups"
          :id="`lielz-cmd-${group.id}`"
          :key="group.id"
          tabindex="-1"
          :aria-labelledby="`lielz-cmd-${group.id}-heading`"
          class="command-group"
        >
          <h4 :id="`lielz-cmd-${group.id}-heading`" class="font-display text-2xl">{{ group.title }}</h4>
          <p v-if="group.note" class="text-sm text-muted-foreground">{{ group.note }}</p>
          <dl class="command-list">
            <div v-for="entry in group.commands" :key="entry.command">
              <dt><code>{{ entry.command }}</code></dt>
              <dd>{{ entry.purpose }}</dd>
            </div>
          </dl>
        </section>
      </div>
      <p v-else class="tip">
        No commands match “{{ search }}”. Try a shorter word, or clear the search to see them all.
      </p>
    </section>

    <!-- Keys -->
    <section id="lielz-keys" tabindex="-1" aria-labelledby="lielz-keys-heading" class="lielz-part">
      <DisplayHeading id="lielz-keys-heading" :level="3">Keys</DisplayHeading>
      <div class="grid grid-cols-[minmax(0,1fr)] gap-10 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)] lg:gap-14">
        <div class="space-y-4">
          <h4 class="font-medium">Numpad movement</h4>
          <p class="text-sm leading-relaxed text-bone-muted">
            On by default. Turn off with <code>ui set keypad off</code>.
          </p>
          <div class="keypad" role="list" aria-label="Numpad keys">
            <template v-for="(row, rowIndex) in keypadLayout" :key="rowIndex">
              <div
                v-for="key in row"
                :key="key.keys"
                role="listitem"
                class="keypad-key"
                :class="`key-${key.keys === '+' ? 'plus' : key.keys === '-' ? 'minus' : key.keys === '/' ? 'slash' : key.keys}`"
              >
                <kbd>{{ key.keys }}</kbd><span>{{ key.action }}</span>
              </div>
            </template>
          </div>
        </div>
        <div class="space-y-4">
          <h4 class="font-medium">Ship hotkeys</h4>
          <p class="text-sm leading-relaxed text-bone-muted">
            Off by default. Turn them on with <code>auto shipKeys on</code>. Steering keys use the
            contact locked in the SHIP tab.
          </p>
          <div class="table-scroll" tabindex="0" role="region" aria-label="Ship hotkeys table">
            <table class="lielz-table">
              <thead>
                <tr>
                  <th scope="col">Keys</th>
                  <th scope="col">Action</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="binding in shipKeyBindings" :key="binding.keys">
                  <th scope="row"><kbd>{{ binding.keys }}</kbd></th>
                  <td>{{ binding.action }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </section>

    <section id="lielz-split" tabindex="-1" aria-labelledby="lielz-split-heading" class="lielz-part">
      <DisplayHeading id="lielz-split-heading" :level="3">How the loot split works</DisplayHeading>
      <ol class="grid gap-4 md:grid-cols-4">
        <li class="step-card">
          <span class="step-number" aria-hidden="true">1</span>
          <p><code>split start</code> opens bidding in group chat.</p>
        </li>
        <li class="step-card">
          <span class="step-number" aria-hidden="true">2</span>
          <p>Anyone who wants the item types <code>gsay bid</code>. Each name counts once.</p>
        </li>
        <li class="step-card">
          <span class="step-number" aria-hidden="true">3</span>
          <p>
            <code>split roll</code> gives each bidder tickets equal to their bidscore (1–20) and rolls
            the game’s dice.
          </p>
        </li>
        <li class="step-card">
          <span class="step-number" aria-hidden="true">4</span>
          <p>
            The winner spends points, the other bidders gain one, and the new scores are announced.
            Scores are saved between sessions.
          </p>
        </li>
      </ol>
      <p class="tip">
        Use <code>split free</code> for an equal-odds roll that leaves scores unchanged.
      </p>
    </section>
  </section>
</template>

<style scoped>
.lielz-guide [tabindex='-1']:focus,
.lielz-guide:focus {
  outline: none;
}
.lielz-guide section[id],
.lielz-guide {
  scroll-margin-block: 1.5rem 6rem;
}
.lielz-nav {
  display: flex;
  flex-wrap: wrap;
  gap: 0.25rem 1.6rem;
  padding: 0.5rem 1rem;
  border-block: 1px solid var(--color-rule);
  background: var(--color-ink-raised);
}
.lielz-nav a {
  display: inline-flex;
  align-items: center;
  gap: 0.6rem;
  padding-block: 0.65rem;
  font-size: 0.85rem;
  text-decoration: underline;
  text-underline-offset: 0.25rem;
  text-decoration-color: transparent;
}
.lielz-nav a:hover {
  color: var(--color-vermilion-light);
  text-decoration-color: currentColor;
}
.lielz-part {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
  padding-top: 2rem;
  border-top: 1px solid var(--color-rule);
}
.part-heading {
  display: grid;
  gap: 0.75rem 3rem;
}
.part-heading p {
  max-width: 65ch;
  line-height: 1.65;
  color: var(--color-bone-muted);
}
@media (min-width: 768px) {
  .part-heading {
    grid-template-columns: 1fr 1fr;
    align-items: end;
  }
}
.step-card,
.info-card,
.command-group {
  display: flex;
  flex-direction: column;
  gap: 0.65rem;
  padding: 1.25rem;
  border: 1px solid var(--color-rule);
  background: var(--color-ink-raised);
  line-height: 1.6;
  color: var(--color-bone-muted);
}
.step-number {
  font-family: var(--font-display, serif);
  font-size: 2.25rem;
  line-height: 1;
  color: var(--color-vermilion);
}
.setting-chip,
.command-chip {
  align-self: flex-start;
  padding: 0.2rem 0.5rem;
  border: 1px solid var(--color-rule);
  background: var(--color-ink-sunken);
  font-size: 0.8rem;
  color: var(--color-bone);
}
.command-chip {
  border-color: var(--color-vermilion-deep);
}
.card-facts {
  display: grid;
  gap: 0.5rem;
  margin-top: auto;
  padding-top: 0.65rem;
  border-top: 1px solid var(--color-rule);
  font-size: 0.875rem;
}
.card-facts dt {
  font-family: var(--font-label, monospace);
  font-size: 0.7rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--color-label);
}
.bullet-list {
  display: grid;
  gap: 0.5rem;
  max-width: 75ch;
  padding-left: 1.25rem;
  list-style: disc;
  line-height: 1.6;
  color: var(--color-bone-muted);
}
.bullet-list li::marker {
  color: var(--color-vermilion);
}
.tip {
  max-width: 75ch;
  padding: 0.9rem 1.1rem;
  border-left: 2px solid var(--color-vermilion);
  background: var(--color-ink-raised);
  line-height: 1.6;
  color: var(--color-bone-muted);
}
.filter-row {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}
.table-scroll {
  overflow-x: auto;
  border: 1px solid var(--color-rule);
}
.lielz-table {
  width: 100%;
  min-width: 36rem;
  border-collapse: collapse;
  font-size: 0.9rem;
}
.lielz-table th,
.lielz-table td {
  padding: 0.65rem 0.9rem;
  border-bottom: 1px solid var(--color-rule);
  text-align: left;
  vertical-align: top;
  line-height: 1.5;
}
.lielz-table thead th {
  background: var(--color-ink-raised);
  font-family: var(--font-label, monospace);
  font-size: 0.7rem;
  font-weight: 400;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--color-label);
}
.lielz-table tbody th {
  font-weight: 500;
  color: var(--color-foreground);
  white-space: nowrap;
}
.lielz-table td {
  color: var(--color-bone-muted);
}
.lielz-table tbody tr:last-child > * {
  border-bottom: 0;
}
.search-row {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  gap: 1rem;
}
.category-links {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}
.category-links a {
  padding: 0.35rem 0.75rem;
  border: 1px solid var(--color-rule);
  font-size: 0.85rem;
  color: var(--color-bone-muted);
}
.category-links a:hover {
  border-color: var(--color-vermilion);
  color: var(--color-bone);
}
.command-columns {
  column-gap: 1.5rem;
}
@media (min-width: 1024px) {
  .command-columns {
    columns: 2;
  }
}
.command-columns > .command-group {
  break-inside: avoid;
  margin-bottom: 1.5rem;
}
.command-list {
  display: grid;
}
.command-list > div {
  display: grid;
  gap: 0.25rem;
  padding-block: 0.65rem;
  border-top: 1px solid var(--color-rule);
}
.command-list > div:first-child {
  border-top: 0;
}
.command-list dt code {
  color: var(--color-bone);
}
.command-list dd {
  font-size: 0.9rem;
}
@media (min-width: 640px) {
  .command-list > div {
    grid-template-columns: minmax(9rem, 2fr) 3fr;
    gap: 1rem;
  }
}
.keypad {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  grid-template-areas:
    '. slash . minus'
    'k7 k8 k9 plus'
    'k4 k5 k6 plus'
    'k1 k2 k3 .'
    'k0 k0 . .';
  gap: 0.4rem;
  max-width: 22rem;
}
.keypad-key {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.2rem;
  min-height: 3.75rem;
  padding: 0.4rem;
  border: 1px solid var(--color-rule);
  background: var(--color-ink-raised);
  font-size: 0.75rem;
  color: var(--color-bone-muted);
  text-align: center;
}
.keypad-key kbd {
  font-size: 1.1rem;
  color: var(--color-vermilion);
}
.key-slash { grid-area: slash; }
.key-minus { grid-area: minus; }
.key-plus { grid-area: plus; }
.key-7 { grid-area: k7; }
.key-8 { grid-area: k8; }
.key-9 { grid-area: k9; }
.key-4 { grid-area: k4; }
.key-5 { grid-area: k5; }
.key-6 { grid-area: k6; }
.key-1 { grid-area: k1; }
.key-2 { grid-area: k2; }
.key-3 { grid-area: k3; }
.key-0 { grid-area: k0; }
code,
kbd {
  overflow-wrap: anywhere;
}
</style>
