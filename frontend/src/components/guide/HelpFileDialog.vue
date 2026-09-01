<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useRouter } from 'vue-router'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { Skeleton } from '@/components/ui/skeleton'
import { Button } from '@/components/ui/button'
import { parseAnsiForVue, stripAnsiCodes } from '@/utils/ansiParser'
import { guideApi } from '@/services/api'
import { useAuth } from '@/composables/useAuth'
import type { PublicHelpFile } from '@/types'
import { BookOpen, Calendar, User, ArrowLeft, Pencil } from 'lucide-vue-next'

const router = useRouter()
const { isAuthenticated } = useAuth()

interface Props {
  open: boolean
  helpFile: PublicHelpFile | null
  loading?: boolean
}

const props = defineProps<Props>()
const emit = defineEmits<{
  close: []
}>()

// Navigation history for back button
const history = ref<PublicHelpFile[]>([])
const currentFile = ref<PublicHelpFile | null>(null)
const isNavigating = ref(false)

// Sync currentFile with prop
watch(
  () => props.helpFile,
  (newFile) => {
    if (newFile && !isNavigating.value) {
      currentFile.value = newFile
      history.value = [] // Reset history when opening a new file from outside
    }
  },
  { immediate: true },
)

// Reset when dialog closes
watch(
  () => props.open,
  (open) => {
    if (!open) {
      history.value = []
      currentFile.value = null
      isNavigating.value = false
    }
  },
)

// Helper to convert a single item into a placeholder marker
function markItem(item: string): string {
  let trimmed = item.trim()
  if (!trimmed) return ''
  // Strip bullet points (*, -, •) from the beginning
  trimmed = trimmed.replace(/^[\*\-•]\s*/, '')
  if (!trimmed) return ''
  // Don't link "None" or "None."
  if (trimmed.toLowerCase() === 'none' || trimmed.toLowerCase() === 'none.') {
    return trimmed
  }
  return `{{HELPLINK:${trimmed}}}`
}

// Helper to convert comma-separated items into placeholder markers
function markCommaItems(items: string): string {
  return items.split(/,\s*/).map(markItem).filter(Boolean).join(', ')
}

// Helper to convert line-separated items into placeholder markers
// Also handles comma-separated items within each line
function markLineItems(items: string): string {
  return items
    .split('\n')
    .map((line) => {
      const trimmed = line.trim()
      if (!trimmed) return line
      // If line has commas, split by comma; otherwise treat whole line as one item
      if (trimmed.includes(',')) {
        return markCommaItems(trimmed)
      }
      return markItem(trimmed)
    })
    .join('\n')
}

// Convert placeholder markers to actual HTML links
function convertPlaceholdersToLinks(html: string): string {
  return html.replace(/\{\{HELPLINK:([^}]+)\}\}/g, (_match, title) => {
    const escaped = title.replace(/"/g, '&quot;')
    return `<a href="#" class="help-link text-cyan-400 hover:text-cyan-300 hover:underline" data-help-title="${escaped}">${title}</a>`
  })
}

// Parse ANSI content to HTML and add clickable links for "See also"
const parsedContent = computed(() => {
  if (!currentFile.value?.text) return ''

  // Step 1: Mark "See also" items with placeholders BEFORE ANSI parsing
  let text = currentFile.value.text

  // Format 1: "See also: items" (colon format, comma-separated on same line)
  text = text.replace(
    /(See\s+also:\s*)([^\n]+)/gi,
    (_match, prefix, items) => `${prefix}${markCommaItems(items)}`,
  )

  // Format 2: "==See also==" followed by items on subsequent lines
  // Match until we hit an empty line or "The following help topics"
  text = text.replace(
    /(==\s*See\s+also\s*==\s*\n)([\s\S]*?)(?=\n\s*\n|\nThe following|$)/gi,
    (_match, prefix, items) => `${prefix}${markLineItems(items)}`,
  )

  // Format 3: "The following help topics also matched your search:" followed by items
  text = text.replace(
    /(The following help topics also matched your search:\s*\n)([\s\S]*?)(?=\n\s*\n|$)/gi,
    (_match, prefix, items) => `${prefix}${markLineItems(items)}`,
  )

  // Step 2: Parse ANSI codes to HTML
  let html = parseAnsiForVue(text)

  // Step 3: Convert placeholders to actual links
  html = convertPlaceholdersToLinks(html)

  return html
})

// Handle click on help links
async function handleContentClick(event: MouseEvent) {
  const target = event.target as HTMLElement
  if (target.classList.contains('help-link')) {
    event.preventDefault()
    const title = target.dataset.helpTitle
    if (title) {
      await navigateToHelpFile(title)
    }
  }
}

// Navigate to a help file by title
async function navigateToHelpFile(title: string) {
  try {
    isNavigating.value = true

    // Search for the help file
    const result = await guideApi.searchHelpFiles(title, 10)

    // Find exact match (case-insensitive)
    const match = result.results.find((r) => r.title?.toLowerCase() === title.toLowerCase())

    if (match) {
      // Save current file to history before navigating
      if (currentFile.value) {
        history.value.push(currentFile.value)
      }

      // Load the full content
      const fullFile = await guideApi.getHelpFile(match.id)
      currentFile.value = fullFile
    } else {
      // No exact match found - could show a toast or message
      console.warn(`Help file not found: ${title}`)
    }
  } catch (error) {
    console.error('Failed to navigate to help file:', error)
  } finally {
    isNavigating.value = false
  }
}

// Go back to previous help file
function goBack() {
  if (history.value.length > 0) {
    isNavigating.value = true
    currentFile.value = history.value.pop() || null
    isNavigating.value = false
  }
}

// Format date
function formatDate(dateStr: string | null): string {
  if (!dateStr) return 'Unknown'
  const date = new Date(dateStr)
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
}

// Get category color
function getCategoryColor(categoryName: string): string {
  const colors: Record<string, string> = {
    General: 'bg-blue-500/20 text-blue-400',
    Class: 'bg-purple-500/20 text-purple-400',
    'Class Skillsets': 'bg-violet-500/20 text-violet-400',
    Spec: 'bg-amber-500/20 text-amber-400',
    Race: 'bg-green-500/20 text-green-400',
    Redirect: 'bg-gray-500/20 text-gray-400',
  }
  return colors[categoryName] || 'bg-cyan-500/20 text-cyan-400'
}

// Handle close
function handleOpenChange(open: boolean) {
  if (!open) {
    emit('close')
  }
}

// Navigate to suggestion page with this file pre-selected
function goToSuggestEdit() {
  if (currentFile.value) {
    emit('close')
    router.push({ name: 'guide-suggest', query: { edit: currentFile.value.id } })
  }
}
</script>

<template>
  <Dialog :open="open" @update:open="handleOpenChange">
    <DialogContent class="sm:!max-w-6xl max-h-[90vh] overflow-y-auto overflow-x-hidden">
      <!-- Loading State -->
      <template v-if="loading || isNavigating">
        <div class="space-y-3">
          <Skeleton class="h-7 w-64" />
          <div class="flex items-center gap-3">
            <Skeleton class="h-5 w-20 rounded-full" />
            <Skeleton class="h-4 w-32" />
          </div>
          <div class="space-y-2 pt-4">
            <Skeleton class="h-4 w-full" />
            <Skeleton class="h-4 w-full" />
            <Skeleton class="h-4 w-3/4" />
            <Skeleton class="h-4 w-full" />
            <Skeleton class="h-4 w-5/6" />
          </div>
        </div>
      </template>

      <!-- Content -->
      <template v-else-if="currentFile">
        <DialogHeader>
          <div class="flex items-center gap-2">
            <!-- Back Button -->
            <Button
              v-if="history.length > 0"
              variant="ghost"
              size="sm"
              class="h-8 w-8 p-0"
              @click="goBack"
            >
              <ArrowLeft class="h-4 w-4" />
            </Button>
            <DialogTitle class="text-xl flex items-center gap-2 flex-1">
              <BookOpen class="h-5 w-5 text-cyan-400" />
              {{ stripAnsiCodes(currentFile.title || 'Untitled') }}
            </DialogTitle>
            <!-- Suggest Edit Button -->
            <Button
              v-if="isAuthenticated"
              variant="outline"
              size="sm"
              class="gap-1.5"
              @click="goToSuggestEdit"
            >
              <Pencil class="h-3.5 w-3.5" />
              Suggest Edit
            </Button>
          </div>
          <DialogDescription as="div" class="flex flex-wrap items-center gap-3 mt-2">
            <span
              :class="[
                'px-2 py-1 text-xs rounded-full',
                getCategoryColor(currentFile.category_name)
              ]"
            >
              {{ currentFile.category_name }}
            </span>
            <span v-if="currentFile.last_update_by" class="flex items-center gap-1 text-xs text-muted-foreground">
              <User class="h-3 w-3" />
              {{ currentFile.last_update_by }}
            </span>
            <span class="flex items-center gap-1 text-xs text-muted-foreground">
              <Calendar class="h-3 w-3" />
              {{ formatDate(currentFile.last_update) }}
            </span>
          </DialogDescription>
        </DialogHeader>

        <div
          class="mt-4 font-mono text-sm leading-relaxed whitespace-pre-wrap break-words overflow-hidden"
          style="word-break: break-word; overflow-wrap: break-word;"
          v-html="parsedContent"
          @click="handleContentClick"
        />
      </template>

      <!-- Empty State -->
      <template v-else>
        <div class="py-12 text-center text-muted-foreground">
          <BookOpen class="h-12 w-12 mx-auto mb-4 opacity-50" />
          <p>No content available</p>
        </div>
      </template>
    </DialogContent>
  </Dialog>
</template>

<style scoped>
/* Ensure ANSI colors display properly */
:deep(.ansi-text) {
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
  word-break: break-word;
  overflow-wrap: break-word;
}

/* Style for help links */
:deep(.help-link) {
  cursor: pointer;
  transition: color 0.15s ease;
}
</style>
