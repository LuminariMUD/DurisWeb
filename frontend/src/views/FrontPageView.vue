<script setup lang="ts">
import { computed, ref, watch, nextTick, onBeforeUnmount, createApp } from 'vue'
import DOMPurify from 'dompurify'
import { useSiteConfig } from '@/composables/useSiteConfig'
import { Button } from '@/components/ui/button'
import { Newspaper, Play } from 'lucide-vue-next'
import { RouterLink } from 'vue-router'
import CarouselDisplay from '@/components/forum/CarouselDisplay.vue'
import TopFraggerDisplay from '@/components/forum/widgets/TopFraggerDisplay.vue'
import RecentPvPDisplay from '@/components/forum/widgets/RecentPvPDisplay.vue'
import MapPreviewDisplay from '@/components/forum/widgets/MapPreviewDisplay.vue'

const {
  frontPageHeroEnabled,
  frontPageHeroTitle,
  frontPageHeroSubtitle,
  frontPageHeroImageUrl,
  frontPageContent,
} = useSiteConfig()

const contentRef = ref<HTMLElement | null>(null)
const carouselApps = ref<{ unmount: () => void }[]>([])
const widgetApps = ref<{ unmount: () => void }[]>([])
const lastMountedContent = ref<string>('')

// Sanitize HTML content to prevent XSS attacks
const sanitizedContent = computed(() => {
  return DOMPurify.sanitize(frontPageContent.value, {
    ALLOWED_TAGS: [
      'p',
      'br',
      'strong',
      'em',
      'u',
      's',
      'h1',
      'h2',
      'h3',
      'h4',
      'h5',
      'h6',
      'ul',
      'ol',
      'li',
      'a',
      'img',
      'blockquote',
      'code',
      'pre',
      'table',
      'thead',
      'tbody',
      'tr',
      'th',
      'td',
      'div',
      'span',
    ],
    ALLOWED_ATTR: [
      'href',
      'src',
      'alt',
      'title',
      'class',
      'style',
      'data-alignment',
      'data-columns',
      'data-bg-color',
      'data-rounded',
      'data-type',
      'data-images',
      'data-height',
      // widget types
    ],
  })
})

// mount carousel and widget components after content renders
// only remount if content actually changed to prevent map disappearing
function applyColumnStyles() {
  if (!contentRef.value) return
  const columnsWithBg = contentRef.value.querySelectorAll('[data-bg-color]')
  columnsWithBg.forEach((el) => {
    const color = el.getAttribute('data-bg-color')
    if (color) {
      ;(el as HTMLElement).style.backgroundColor = color
    }
  })
}

watch(
  sanitizedContent,
  async (newContent) => {
    if (newContent === lastMountedContent.value) return
    lastMountedContent.value = newContent
    await nextTick()
    applyColumnStyles()
    mountCarousels()
    mountWidgets()
  },
  { immediate: true },
)

function mountCarousels() {
  // unmount previous carousel apps
  carouselApps.value.forEach((app) => app.unmount())
  carouselApps.value = []

  if (!contentRef.value) return

  const carouselDivs = contentRef.value.querySelectorAll('[data-type="carousel"]')
  carouselDivs.forEach((div) => {
    const dataImages = div.getAttribute('data-images') || '[]'
    const dataHeight = div.getAttribute('data-height') || '300'
    // clear the div content (child img elements from html render)
    while (div.firstChild) {
      div.removeChild(div.firstChild)
    }

    const app = createApp(CarouselDisplay, { dataImages, dataHeight })
    app.mount(div)
    carouselApps.value.push(app)
  })
}

function mountWidgets() {
  // unmount previous widget apps
  widgetApps.value.forEach((app) => app.unmount())
  widgetApps.value = []

  if (!contentRef.value) return

  // mount Top Fragger widgets
  const topFraggerDivs = contentRef.value.querySelectorAll('[data-type="top-fragger"]')
  topFraggerDivs.forEach((div) => {
    while (div.firstChild) {
      div.removeChild(div.firstChild)
    }
    const app = createApp(TopFraggerDisplay)
    app.mount(div)
    widgetApps.value.push(app)
  })

  // mount Recent PvP widgets
  const recentPvPDivs = contentRef.value.querySelectorAll('[data-type="recent-pvp"]')
  recentPvPDivs.forEach((div) => {
    while (div.firstChild) {
      div.removeChild(div.firstChild)
    }
    const app = createApp(RecentPvPDisplay)
    app.mount(div)
    widgetApps.value.push(app)
  })

  // mount Map Preview widgets
  const mapPreviewDivs = contentRef.value.querySelectorAll('[data-type="map-preview"]')
  mapPreviewDivs.forEach((div) => {
    while (div.firstChild) {
      div.removeChild(div.firstChild)
    }
    const app = createApp(MapPreviewDisplay, { height: 300 })
    app.mount(div)
    widgetApps.value.push(app)
  })
}

onBeforeUnmount(() => {
  carouselApps.value.forEach((app) => app.unmount())
  widgetApps.value.forEach((app) => app.unmount())
})
</script>

<template>
  <div class="min-h-screen">
    <!-- Hero Banner -->
    <section
      v-if="frontPageHeroEnabled"
      class="relative h-[350px] flex items-center justify-center overflow-hidden"
    >
      <!-- Background Image or Gradient -->
      <div
        class="absolute inset-0 bg-cover bg-center"
        :style="frontPageHeroImageUrl
          ? { backgroundImage: `url(${frontPageHeroImageUrl})` }
          : { background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f0f23 100%)' }
        "
      />

      <!-- Dark Overlay for text readability -->
      <div class="absolute inset-0 bg-black/50" />

      <!-- Content -->
      <div class="relative z-10 text-center px-4 max-w-4xl mx-auto">
        <h1 class="text-4xl md:text-5xl lg:text-6xl font-bold text-white mb-4 drop-shadow-lg">
          {{ frontPageHeroTitle }}
        </h1>
        <p class="text-lg md:text-xl lg:text-2xl text-gray-200 mb-8 drop-shadow-md">
          {{ frontPageHeroSubtitle }}
        </p>
        <div class="flex flex-wrap items-center justify-center gap-3">
          <Button
            size="lg"
            class="bg-green-600 hover:bg-green-700 text-white font-semibold px-8 py-3 text-lg"
            as-child
          >
            <RouterLink to="/play">
              <Play class="w-5 h-5 mr-2" />
              Play Now
            </RouterLink>
          </Button>
          <Button
            variant="outline"
            size="lg"
            class="border-cyan-400/60 text-cyan-200 hover:bg-cyan-400/15 hover:text-white font-semibold px-8 py-3 text-lg"
            as-child
          >
            <RouterLink to="/news">
              <Newspaper class="w-5 h-5 mr-2" />
              News &amp; Updates
            </RouterLink>
          </Button>
        </div>
      </div>
    </section>

    <!-- Main Content -->
    <main class="w-full px-6 md:px-12 lg:px-16 py-12">
      <div
        ref="contentRef"
        class="prose prose-lg dark:prose-invert max-w-none
               prose-headings:text-gray-100
               prose-p:text-gray-300
               prose-a:text-cyan-400 prose-a:no-underline hover:prose-a:underline
               prose-strong:text-gray-200
               prose-code:text-cyan-400 prose-code:bg-gray-800 prose-code:px-1 prose-code:py-0.5 prose-code:rounded
               prose-img:rounded-lg prose-img:max-w-full"
        v-html="sanitizedContent"
      />
    </main>
  </div>
</template>

<style scoped>
/* Heading styles for TipTap content (tailwind typography plugin not installed) */
:deep(h1) {
  font-size: 2rem;
  font-weight: bold;
  color: rgb(243 244 246);
  margin-bottom: 1rem;
  line-height: 1.2;
}

:deep(h2) {
  font-size: 1.5rem;
  font-weight: bold;
  color: rgb(243 244 246);
  margin-bottom: 0.75rem;
  line-height: 1.3;
}

:deep(h3) {
  font-size: 1.25rem;
  font-weight: bold;
  color: rgb(243 244 246);
  margin-bottom: 0.5rem;
  line-height: 1.4;
}

:deep(h4) {
  font-size: 1.125rem;
  font-weight: 600;
  color: rgb(243 244 246);
  margin-bottom: 0.5rem;
}

:deep(h5) {
  font-size: 1rem;
  font-weight: 600;
  color: rgb(243 244 246);
  margin-bottom: 0.5rem;
}

:deep(h6) {
  font-size: 0.875rem;
  font-weight: 600;
  color: rgb(243 244 246);
  margin-bottom: 0.5rem;
}

/* Image alignment styles for TipTap content */
:deep(.prose img[data-alignment="left"]) {
  float: left;
  margin-right: 1rem;
  margin-bottom: 0.5rem;
  max-width: 50%;
}

:deep(.prose img[data-alignment="right"]) {
  float: right;
  margin-left: 1rem;
  margin-bottom: 0.5rem;
  max-width: 50%;
}

:deep(.prose img[data-alignment="center"]) {
  display: block;
  margin-left: auto;
  margin-right: auto;
  float: none;
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

/* Clear floats after content */
:deep(.prose)::after {
  content: '';
  display: table;
  clear: both;
}

/* Table styles */
:deep(.prose table) {
  border-collapse: collapse;
  width: 100%;
  margin: 1.5rem 0;
}

:deep(.prose th),
:deep(.prose td) {
  border: 1px solid rgb(55 65 81);
  padding: 0.75rem 1rem;
  text-align: left;
  vertical-align: top;
}

:deep(.prose th) {
  background-color: rgb(31 41 55);
  font-weight: 600;
  color: rgb(229 231 235);
}

:deep(.prose td) {
  background-color: rgb(17 24 39);
  color: rgb(209 213 219);
}

:deep(.prose tr:hover td) {
  background-color: rgb(31 41 55);
}

/* Column layout styles */
:deep(.prose .columns) {
  display: grid;
  gap: 1.5rem;
  margin: 1.5rem 0;
  align-items: stretch;
}

:deep(.prose .columns[data-columns="2"]) {
  grid-template-columns: 1fr 1fr;
}

:deep(.prose .columns[data-columns="3"]) {
  grid-template-columns: 1fr 1fr 1fr;
}

:deep(.prose .column) {
  padding: 1rem;
  display: flex;
  flex-direction: column;
}

:deep(.prose .column[data-bg-color]) {
  border-radius: 0.5rem;
}

/* Responsive columns */
@media (max-width: 640px) {
  :deep(.prose .columns[data-columns="2"]),
  :deep(.prose .columns[data-columns="3"]) {
    grid-template-columns: 1fr;
  }
}

/* Widget container styling */
:deep([data-type="recent-pvp"]),
:deep([data-type="top-fragger"]),
:deep([data-type="map-preview"]) {
  border-radius: 0.5rem;
  overflow: hidden;
  height: 100%;
}

/* Reset prose margins inside widget containers */
:deep([data-type="recent-pvp"] *),
:deep([data-type="top-fragger"] *),
:deep([data-type="map-preview"] *) {
  margin: 0;
}

/* Remove bg color in widgets */
:deep(.top-fragger-widget [class*="bg-gray"]),
:deep(.map-preview-widget [class*="bg-gray"]) {
  background-color: transparent !important;
}

:deep([data-type="map-preview"]) {
  flex: 1;
  min-height: 0;
  position: relative;
}

/* Remove padding from column containing map so it fits edge to edge */
:deep(.prose .column:has([data-type="map-preview"])) {
  padding: 0;
}

:deep(.map-preview-widget) {
  position: absolute;
  inset: 0;
}

:deep(.map-preview-widget > div) {
  height: 100% !important;
}

:deep(.map-preview-widget .leaflet-container) {
  background: transparent !important;
}

:deep(.map-preview-widget .leaflet-tile-pane) {
  position: relative;
}

</style>
