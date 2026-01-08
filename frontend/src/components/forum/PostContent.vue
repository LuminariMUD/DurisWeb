<template>
  <div ref="contentRef" class="post-content-wrapper" v-html="renderContent"></div>
</template>

<script setup lang="ts">
import { computed, ref, watch, nextTick, onMounted, onUnmounted, onBeforeUnmount, createApp } from 'vue'
import { useRouter } from 'vue-router'
import { parseAnsiForVue } from '@/utils/ansiParser'
import { hasMentions } from '@/utils/mentionParser'
import CarouselDisplay from '@/components/forum/CarouselDisplay.vue'

const props = defineProps<{
  content: string
}>()

const router = useRouter()
const contentRef = ref<HTMLElement | null>(null)
const carouselApps = ref<{ unmount: () => void }[]>([])

// Global click handler for mention links
function handleMentionClick(e: MouseEvent) {
  const target = e.target as HTMLElement
  if (target.classList.contains('mention-link')) {
    e.preventDefault()
    const username = target.getAttribute('data-username')
    if (username) {
      router.push(`/user/${username}`)
    }
  }
}

onMounted(() => {
  document.addEventListener('click', handleMentionClick)
  mountCarousels()
})

onUnmounted(() => {
  document.removeEventListener('click', handleMentionClick)
})

// mount carousel components after content changes
watch(() => props.content, async () => {
  await nextTick()
  mountCarousels()
})

function mountCarousels() {
  // unmount previous carousel apps
  carouselApps.value.forEach(app => app.unmount())
  carouselApps.value = []

  if (!contentRef.value) return

  const carouselDivs = contentRef.value.querySelectorAll('[data-type="carousel"]')
  carouselDivs.forEach(div => {
    const dataImages = div.getAttribute('data-images') || '[]'
    const dataHeight = div.getAttribute('data-height') || '300'
    // clear the div content
    while (div.firstChild) {
      div.removeChild(div.firstChild)
    }

    const app = createApp(CarouselDisplay, { dataImages, dataHeight })
    app.mount(div)
    carouselApps.value.push(app)
  })
}

onBeforeUnmount(() => {
  carouselApps.value.forEach(app => app.unmount())
})

const renderContent = computed(() => {
  const content = props.content

  // Check if content is HTML from TipTap (starts with <p> or <h1> etc)
  const isHtml = content.trim().startsWith('<')

  if (isHtml) {
    // Content is already HTML from TipTap - just add mention link support
    return processMentionLinks(content)
  }

  // Legacy plain text content - parse ANSI and mentions
  if (hasMentions(content)) {
    return parseMentionsWithAnsi(content)
  }

  // Otherwise, just parse ANSI
  return parseAnsiForVue(content)
})

/**
 * Process HTML content from TipTap to add mention links
 * Finds @username patterns in text nodes and converts them to links
 */
function processMentionLinks(html: string): string {
  // Simple regex replacement for @mentions in HTML
  // This handles @username patterns that are not already inside tags
  return html.replace(/@([a-zA-Z0-9_-]+)(?![^<]*>)/g, (match, username) => {
    return `<a href="/user/${username}" class="mention-link text-primary hover:underline font-medium cursor-pointer" data-username="${username}">@${username}</a>`
  })
}

/**
 * Parse content that may have both mentions and ANSI codes
 * Strategy: Parse mentions first, convert them to HTML, then apply ANSI parsing to text segments
 */
function parseMentionsWithAnsi(text: string): string {
  const mentionRegex = /@([a-zA-Z0-9_-]+)/g
  const segments: Array<{ type: 'text' | 'mention'; content: string }> = []
  let lastIndex = 0
  let match: RegExpExecArray | null

  while ((match = mentionRegex.exec(text)) !== null) {
    // Add text before the mention
    if (match.index > lastIndex) {
      segments.push({
        type: 'text',
        content: text.slice(lastIndex, match.index),
      })
    }

    // Add the mention
    segments.push({
      type: 'mention',
      content: match[1] || '', // username without @
    })

    lastIndex = match.index + match[0].length
  }

  // Add remaining text
  if (lastIndex < text.length) {
    segments.push({
      type: 'text',
      content: text.slice(lastIndex),
    })
  }

  // Now render each segment to HTML
  let html = ''
  for (const segment of segments) {
    if (segment.type === 'mention') {
      // Render mention as link
      html += `<a href="/user/${segment.content}" class="mention-link text-primary hover:underline font-medium cursor-pointer" data-username="${segment.content}">@${segment.content}</a>`
    } else {
      // Render text with ANSI parsing
      html += parseAnsiForVue(segment.content)
    }
  }

  return html
}
</script>

<style scoped>
/* Wrapper to handle overflow */
.post-content-wrapper {
  max-width: 100%;
  word-wrap: break-word;
  overflow-wrap: break-word;
  word-break: break-word;
}

.mention-link {
  transition: opacity 0.2s;
}

.mention-link:hover {
  opacity: 0.8;
}

/* Attach click handler via global scope since v-html doesn't support @click */
:global(.mention-link) {
  cursor: pointer;
}

/* Prevent text overflow */
:deep(p),
:deep(div),
:deep(span) {
  max-width: 100%;
  word-wrap: break-word;
  overflow-wrap: break-word;
  word-break: break-word;
}

/* Pre/code blocks should scroll horizontally */
:deep(pre) {
  overflow-x: auto;
  max-width: 100%;
}

:deep(code) {
  word-wrap: break-word;
  overflow-wrap: break-word;
}

/* Table styles for forum posts */
:deep(table) {
  border-collapse: collapse;
  width: 100%;
  margin: 1rem 0;
  display: block;
  overflow-x: auto;
  max-width: 100%;
}

@media (min-width: 1024px) {
  :deep(table) {
    display: table;
  }
}

:deep(th),
:deep(td) {
  border: 1px solid rgb(55 65 81);
  padding: 0.5rem 0.75rem;
  text-align: left;
  vertical-align: top;
}

:deep(th) {
  background-color: rgb(31 41 55);
  font-weight: 600;
  color: rgb(229 231 235);
}

:deep(td) {
  background-color: rgb(17 24 39);
  color: rgb(209 213 219);
}

:deep(tr:hover td) {
  background-color: rgb(31 41 55);
}

/* Rounded corners for images */
:deep(img[data-rounded="true"]) {
  border-radius: 0.75rem;
}

/* Rounded corners for tables */
:deep(table[data-rounded="true"]) {
  border-radius: 0.5rem;
  overflow: hidden;
}

:deep(table[data-rounded="true"] th:first-child) {
  border-top-left-radius: 0.5rem;
}

:deep(table[data-rounded="true"] th:last-child) {
  border-top-right-radius: 0.5rem;
}

:deep(table[data-rounded="true"] tr:last-child td:first-child) {
  border-bottom-left-radius: 0.5rem;
}

:deep(table[data-rounded="true"] tr:last-child td:last-child) {
  border-bottom-right-radius: 0.5rem;
}

/* Column layout styles for forum posts */
:deep(.columns) {
  display: grid;
  gap: 1rem;
  margin: 1rem 0;
}

:deep(.columns[data-columns="2"]) {
  grid-template-columns: 1fr 1fr;
}

:deep(.columns[data-columns="3"]) {
  grid-template-columns: 1fr 1fr 1fr;
}

:deep(.column) {
  padding: 0.75rem;
}

:deep(.column[data-bg-color]) {
  border-radius: 0.375rem;
}

/* Responsive columns */
@media (max-width: 640px) {
  :deep(.columns[data-columns="2"]),
  :deep(.columns[data-columns="3"]) {
    grid-template-columns: 1fr;
  }
}

/* Heading styles for forum posts */
:deep(h1) {
  font-size: 1.5rem;
  font-weight: bold;
  color: rgb(229 231 235);
  margin-bottom: 0.5rem;
}

:deep(h2) {
  font-size: 1.25rem;
  font-weight: bold;
  color: rgb(229 231 235);
  margin-bottom: 0.5rem;
}

:deep(h3) {
  font-size: 1.125rem;
  font-weight: bold;
  color: rgb(229 231 235);
  margin-bottom: 0.5rem;
}

/* List styles for forum posts */
:deep(ul) {
  list-style-type: disc;
  padding-left: 1.5rem;
  margin: 0.5rem 0;
}

:deep(ol) {
  list-style-type: decimal;
  padding-left: 1.5rem;
  margin: 0.5rem 0;
}

:deep(li) {
  margin: 0.25rem 0;
}

:deep(li p) {
  margin: 0;
}

</style>
