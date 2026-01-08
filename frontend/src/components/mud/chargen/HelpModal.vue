<script setup lang="ts">
import { ref, watch } from 'vue'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { HelpCircle, Loader2 } from 'lucide-vue-next'
import { parseAnsiToHtml } from '@/utils/ansiParser'

const props = defineProps<{
  type: 'race' | 'class'
  name: string
}>()

const isOpen = ref(false)
const helpText = ref('')
const helpTitle = ref('')
const loading = ref(false)
const error = ref<string | null>(null)

// Cache for help text
const helpCache = new Map<string, { title: string; text: string }>()

async function fetchHelp() {
  const cacheKey = `${props.type}:${props.name}`

  // Check cache first
  if (helpCache.has(cacheKey)) {
    const cached = helpCache.get(cacheKey)!
    helpTitle.value = cached.title
    helpText.value = cached.text
    return
  }

  loading.value = true
  error.value = null

  try {
    const response = await fetch(`/api/help/${props.type}/${encodeURIComponent(props.name)}`)
    if (response.ok) {
      const data = await response.json()
      helpTitle.value = data.title
      helpText.value = data.text
      helpCache.set(cacheKey, { title: data.title, text: data.text })
    } else {
      error.value = 'Help not available'
    }
  } catch {
    error.value = 'Failed to load help'
  } finally {
    loading.value = false
  }
}

// Format help text with wiki-style markup
function formatHelpText(text: string): string {
  if (!text) return ''

  // Process line by line
  const lines = text.split('\n')
  const processedLines: string[] = []

  for (const line of lines) {
    // Check for wiki headers (==Header==)
    const headerMatch = line.match(/^==([^=]+)==$/)
    if (headerMatch) {
      processedLines.push(`<div class="text-lg font-bold text-primary mt-4 mb-2 border-b border-border pb-1">${headerMatch[1]}</div>`)
      continue
    }

    // Check for section separators (====...====)
    if (/^={4,}$/.test(line.trim())) {
      processedLines.push('<hr class="my-2 border-border" />')
      continue
    }

    // Check for bullet points (* item)
    const bulletMatch = line.match(/^\* (.+)$/)
    if (bulletMatch && bulletMatch[1]) {
      const content = parseAnsiToHtml(bulletMatch[1])
      processedLines.push(`<div class="flex gap-2 ml-2"><span class="text-muted-foreground">•</span><span>${content}</span></div>`)
      continue
    }

    // Regular line - parse ANSI codes
    processedLines.push(parseAnsiToHtml(line))
  }

  return processedLines.join('<br />')
}

watch(isOpen, (open) => {
  if (open) {
    fetchHelp()
  }
})
</script>

<template>
  <Dialog v-model:open="isOpen">
    <Button
      variant="ghost"
      size="icon"
      class="h-6 w-6 shrink-0"
      @click.stop="isOpen = true"
    >
      <HelpCircle class="h-4 w-4 text-muted-foreground hover:text-primary" />
    </Button>

    <DialogContent class="sm:!max-w-4xl max-h-[80vh] overflow-hidden flex flex-col">
      <DialogHeader>
        <DialogTitle class="flex items-center gap-2">
          <span v-html="parseAnsiToHtml(helpTitle || name)" />
          <span class="text-sm font-normal text-muted-foreground capitalize">({{ type }})</span>
        </DialogTitle>
        <DialogDescription class="sr-only">
          Help information for {{ name }}
        </DialogDescription>
      </DialogHeader>

      <div class="flex-1 overflow-y-auto pr-2">
        <div v-if="loading" class="flex items-center justify-center py-8">
          <Loader2 class="h-6 w-6 animate-spin text-muted-foreground" />
        </div>

        <div v-else-if="error" class="text-center text-muted-foreground py-8">
          {{ error }}
        </div>

        <div
          v-else
          class="text-sm leading-relaxed font-mono help-content"
          v-html="formatHelpText(helpText)"
        />
      </div>
    </DialogContent>
  </Dialog>
</template>
