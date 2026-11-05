<script setup lang="ts">
import { nextTick, ref, watch } from 'vue'
import { useMudStore } from '@/stores/mudStore'
import { parseAnsiToHtml } from '../../utils/ansiParser.js'
import { Button } from '@/components/ui/button'

const store = useMudStore()
const messagesElement = ref<HTMLElement | null>(null)

watch(
  () => store.approvalMessages?.at(-1),
  async () => {
    await nextTick()
    if (messagesElement.value) messagesElement.value.scrollTop = messagesElement.value.scrollHeight
  },
  { immediate: true },
)
</script>

<template>
  <section
    v-if="store.approvalMessages?.length"
    aria-label="Application updates"
    class="space-y-3 rounded-lg border bg-muted/30 p-4"
  >
    <div class="flex flex-wrap items-center justify-between gap-2">
      <h3 class="font-semibold">Application updates</h3>
      <Button
        v-if="!store.waitingForApproval"
        variant="outline"
        size="sm"
        @click="store.clearApprovalMessages"
      >
        Dismiss updates
      </Button>
    </div>
    <div
      ref="messagesElement"
      role="log"
      aria-label="Messages from the server about your application"
      tabindex="0"
      class="max-h-48 space-y-2 overflow-y-auto whitespace-pre-wrap break-words [overflow-wrap:anywhere] text-sm"
    >
      <p
        v-for="(message, index) in store.approvalMessages"
        :key="index"
        v-html="parseAnsiToHtml(message)"
      ></p>
    </div>
  </section>
</template>
