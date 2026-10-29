<script setup lang="ts">
import history from '@/content/clientChangelog.json'
import { mudletGuiLinks } from '@/config/links'
import { sanitizeChangelogContent } from '@/utils/sanitizeChangelogContent'
import { Button } from '@/components/ui/button'

function formatDate(date: string) {
  return new Date(`${date}T00:00:00Z`).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  })
}
</script>

<template>
  <section aria-labelledby="client-changelog-heading" class="space-y-6">
    <header class="space-y-3">
      <h2 id="client-changelog-heading" class="text-3xl text-foreground">Mudlet Client Changelog</h2>
      <p class="max-w-prose text-muted-foreground">
        Changes to the Duris Mudlet package, maintained by LuminariMUD and originally
        created by Arjinius / Arjin. Expand a version to read its changes.
      </p>
      <div class="flex flex-wrap items-center gap-4">
        <Button as-child variant="outline" size="sm">
          <a :href="mudletGuiLinks.releases">Download client</a>
        </Button>
        <RouterLink to="/mudlet-gui" class="text-link">Installation guide</RouterLink>
        <a :href="history.sourceUrl" class="text-link">Source changelog</a>
      </div>
      <p class="max-w-prose text-sm text-muted-foreground">
        Dates follow the client changelog. Historical notes without a published package
        link to the source instead of a release.
      </p>
    </header>

    <div class="space-y-3">
      <details
        v-for="(entry, index) in history.entries"
        :key="entry.version"
        :open="index === 0"
        class="border border-border bg-background"
      >
        <summary class="cursor-pointer p-4 text-foreground hover:bg-card/50">
          <h3 class="inline font-medium">Version {{ entry.version }}</h3>
          <span class="ml-3 text-sm text-muted-foreground">
            <time v-if="entry.date" :datetime="entry.date">{{ formatDate(entry.date) }}</time>
            <template v-else>Date not recorded</template>
          </span>
        </summary>
        <div class="space-y-4 border-t border-border p-4">
          <div
            class="tiptap-content max-w-prose break-words text-sm leading-relaxed"
            v-html="sanitizeChangelogContent(entry.content)"
          ></div>
          <a :href="entry.releaseUrl || history.sourceUrl" class="text-link text-sm">
            {{ entry.releaseUrl ? 'View release on GitHub' : 'View historical source notes' }}
          </a>
        </div>
      </details>
    </div>
  </section>
</template>
