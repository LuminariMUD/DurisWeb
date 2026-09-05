<script setup lang="ts">
import { computed, createApp, onBeforeUnmount, ref, watch } from 'vue'
import DOMPurify from 'dompurify'
import {
  ArrowDown,
  ArrowRight,
  ArrowUpRight,
  Compass,
  Flag,
  Pause,
  Play,
  Swords,
} from 'lucide-vue-next'
import { RouterLink } from 'vue-router'
import { usePreferredReducedMotion } from '@vueuse/core'
import { useHead } from '@unhead/vue'
import defaultHeroImage from '@/assets/home/duris-eclipse.webp'
import '@/assets/home/typography.css'
import CarouselDisplay from '@/components/forum/CarouselDisplay.vue'
import MapPreviewDisplay from '@/components/forum/widgets/MapPreviewDisplay.vue'
import RecentPvPDisplay from '@/components/forum/widgets/RecentPvPDisplay.vue'
import TopFraggerDisplay from '@/components/forum/widgets/TopFraggerDisplay.vue'
import { useSiteConfig } from '@/composables/useSiteConfig'

const LEGACY_HERO_TITLE = 'Welcome to DurisMUD'
const LEGACY_HERO_SUBTITLE = 'The Premier PvP MUD Since 1994'
const LEGACY_FRONT_PAGE_CONTENT =
  'Welcome to the official DurisMUD website. Edit this content in Web Settings.'

const {
  siteTitle,
  frontPageHeroEnabled,
  frontPageHeroTitle,
  frontPageHeroSubtitle,
  frontPageHeroImageUrl,
  frontPageContent,
  isLoading,
  isAvailable,
  error,
} = useSiteConfig()

useHead(() => ({ title: siteTitle.value || 'Site unavailable' }))

const contentRef = ref<HTMLElement | null>(null)
const carouselApps = ref<{ unmount: () => void }[]>([])
const widgetApps = ref<{ unmount: () => void }[]>([])
const motionPaused = ref(false)
const reducedMotion = usePreferredReducedMotion()
const isMotionPaused = computed(() => motionPaused.value || reducedMotion.value === 'reduce')
const worldRef = ref<HTMLElement | null>(null)
const isDefaultTitle = computed(() => frontPageHeroTitle.value === LEGACY_HERO_TITLE)

function exploreWorld() {
  worldRef.value?.scrollIntoView({ behavior: isMotionPaused.value ? 'instant' : 'smooth' })
  worldRef.value?.focus({ preventScroll: true })
}

const heroTitle = computed(() =>
  frontPageHeroTitle.value === LEGACY_HERO_TITLE
    ? 'A world written in blood.'
    : frontPageHeroTitle.value,
)
const heroSubtitle = computed(() =>
  frontPageHeroSubtitle.value === LEGACY_HERO_SUBTITLE
    ? 'A text-based world of rival kingdoms, dangerous alliances, and player-versus-player war. Your next command could change everything.'
    : frontPageHeroSubtitle.value,
)
const heroImage = computed(() => frontPageHeroImageUrl.value || defaultHeroImage)

const sanitizedContent = computed(() =>
  DOMPurify.sanitize(frontPageContent.value, {
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
    ],
  }),
)

const hasEditorialContent = computed(() => {
  const plainText = sanitizedContent.value
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  const hasMedia =
    /<(?:img|table)\b|data-type=["'](?:carousel|top-fragger|recent-pvp|map-preview)["']/i.test(
      sanitizedContent.value,
    )
  return hasMedia || (plainText.length > 0 && plainText !== LEGACY_FRONT_PAGE_CONTENT)
})

const ashParticles = [
  { left: '7%', delay: '-3s', duration: '15s', size: '2px' },
  { left: '14%', delay: '-9s', duration: '19s', size: '1px' },
  { left: '28%', delay: '-6s', duration: '17s', size: '2px' },
  { left: '41%', delay: '-12s', duration: '21s', size: '1px' },
  { left: '52%', delay: '-5s', duration: '16s', size: '2px' },
  { left: '61%', delay: '-14s', duration: '23s', size: '1px' },
  { left: '69%', delay: '-8s', duration: '18s', size: '2px' },
  { left: '76%', delay: '-1s', duration: '20s', size: '1px' },
  { left: '84%', delay: '-11s', duration: '17s', size: '2px' },
  { left: '92%', delay: '-4s', duration: '22s', size: '1px' },
] as const

function applyColumnStyles() {
  if (!contentRef.value) return
  const columnsWithBackground = contentRef.value.querySelectorAll('[data-bg-color]')
  columnsWithBackground.forEach((element) => {
    const color = element.getAttribute('data-bg-color')
    if (color) (element as HTMLElement).style.backgroundColor = color
  })
}

function mountCarousels() {
  carouselApps.value.forEach((app) => app.unmount())
  carouselApps.value = []

  if (!contentRef.value) return
  const carouselElements = contentRef.value.querySelectorAll('[data-type="carousel"]')
  carouselElements.forEach((element) => {
    const dataImages = element.getAttribute('data-images') || '[]'
    const dataHeight = element.getAttribute('data-height') || '300'
    element.replaceChildren()

    const app = createApp(CarouselDisplay, { dataImages, dataHeight })
    app.mount(element)
    carouselApps.value.push(app)
  })
}

function mountWidgets() {
  widgetApps.value.forEach((app) => app.unmount())
  widgetApps.value = []

  if (!contentRef.value) return
  contentRef.value.querySelectorAll('[data-type="top-fragger"]').forEach((element) => {
    element.replaceChildren()
    const app = createApp(TopFraggerDisplay)
    app.mount(element)
    widgetApps.value.push(app)
  })
  contentRef.value.querySelectorAll('[data-type="recent-pvp"]').forEach((element) => {
    element.replaceChildren()
    const app = createApp(RecentPvPDisplay)
    app.mount(element)
    widgetApps.value.push(app)
  })
  contentRef.value.querySelectorAll('[data-type="map-preview"]').forEach((element) => {
    element.replaceChildren()
    const app = createApp(MapPreviewDisplay, { height: 300 })
    app.mount(element)
    widgetApps.value.push(app)
  })
}

// The container can appear after loading even when its HTML has not changed.
watch(
  [sanitizedContent, contentRef],
  () => {
    applyColumnStyles()
    mountCarousels()
    mountWidgets()
  },
  { flush: 'post' },
)

onBeforeUnmount(() => {
  carouselApps.value.forEach((app) => app.unmount())
  widgetApps.value.forEach((app) => app.unmount())
})
</script>

<template>
  <div v-if="isLoading" class="front-page-state" role="status">Loading site configuration…</div>
  <div v-else-if="!isAvailable" role="alert" class="front-page-state front-page-state--error">
    {{ error }}
  </div>
  <div v-else class="duris-home" :class="{ 'motion-paused': isMotionPaused }">
    <section v-if="frontPageHeroEnabled" class="hero" aria-labelledby="duris-home-title">
      <img
        class="hero-art"
        :src="heroImage"
        alt=""
        width="1672"
        height="941"
        fetchpriority="high"
      />
      <div class="ash-field" aria-hidden="true">
        <span
          v-for="(particle, index) in ashParticles"
          :key="index"
          class="ash"
          :style="{
            left: particle.left,
            animationDelay: particle.delay,
            animationDuration: particle.duration,
            width: particle.size,
            height: particle.size,
          }"
        />
      </div>
      <div class="hero-inner">
        <div class="hero-copy">
          <h1 id="duris-home-title" class="hero-title" :class="{ 'hero-title--custom': !isDefaultTitle }">
            <template v-if="isDefaultTitle">A world<br />written in<br /><em>blood.</em></template>
            <template v-else>{{ heroTitle }}</template>
          </h1>
          <p class="hero-subtitle">{{ heroSubtitle }}</p>
          <div class="hero-actions">
            <RouterLink to="/play" class="action-link">
              <span>Enter the world</span><ArrowRight aria-hidden="true" />
            </RouterLink>
            <RouterLink to="/news" class="text-link">News &amp; Updates</RouterLink>
          </div>
          <p class="play-note">Free to play. Played in your browser.</p>
        </div>
      </div>
      <div class="hero-rail">
        <p>Words build worlds. Players make history.</p>
        <div class="rail-controls">
          <button type="button" class="explore-link" @click="exploreWorld">
            Explore Duris <ArrowDown aria-hidden="true" />
          </button>
          <button
            v-if="reducedMotion !== 'reduce'"
            type="button"
            class="motion-control"
            :aria-pressed="motionPaused"
            @click="motionPaused = !motionPaused"
          >
            <Play v-if="motionPaused" aria-hidden="true" />
            <Pause v-else aria-hidden="true" />
            {{ motionPaused ? 'Resume motion' : 'Pause motion' }}
          </button>
        </div>
      </div>
    </section>

    <section v-if="hasEditorialContent" class="editorial-content" aria-label="Latest from Duris">
      <div ref="contentRef" class="prose tiptap-content" v-html="sanitizedContent" />
    </section>

    <section id="world" ref="worldRef" class="world-section" aria-labelledby="world-heading" tabindex="-1">
      <div class="world-inner">
        <div class="world-intro">
          <h2 id="world-heading">The world is text.<br /><em>The stakes are real.</em></h2>
          <p>No quest marker can tell you who to trust. Learn the lands, follow the rivalries, and find the people who will stand beside you.</p>
        </div>
        <div class="pathways">
          <article class="pathway">
            <div class="pathway-index"><span>01 / Explore</span><Compass aria-hidden="true" /></div>
            <h3>Know the world.</h3>
            <p>Every zone has a story. Every path has a price. Start with the map.</p>
            <RouterLink to="/wiki/map" class="pathway-link"><span>Open the wiki</span><ArrowUpRight aria-hidden="true" /></RouterLink>
          </article>
          <article class="pathway">
            <div class="pathway-index"><span>02 / Witness</span><Swords aria-hidden="true" /></div>
            <h3>Read the rivalries.</h3>
            <p>Ambushes, victories, and names worth remembering. The latest from the battlefield.</p>
            <RouterLink to="/pvp" class="pathway-link"><span>View PvP logs</span><ArrowUpRight aria-hidden="true" /></RouterLink>
          </article>
          <article class="pathway">
            <div class="pathway-index"><span>03 / Belong</span><Flag aria-hidden="true" /></div>
            <h3>Find your people.</h3>
            <p>Trade knowledge. Talk strategy. Meet the community behind the characters.</p>
            <RouterLink to="/forum" class="pathway-link"><span>Join the forum</span><ArrowUpRight aria-hidden="true" /></RouterLink>
          </article>
        </div>
      </div>
    </section>

    <section class="final-call" aria-labelledby="final-call-heading">
      <div class="final-call-inner">
        <h2 id="final-call-heading">What will your<br /><em>next command be?</em></h2>
        <div class="final-action">
          <RouterLink to="/play" class="action-link"><span>Enter Duris</span><ArrowRight aria-hidden="true" /></RouterLink>
          <p>Free to play. No download required.</p>
        </div>
        <div class="colophon"><span>Duris</span><p>A world made by its players.</p></div>
      </div>
    </section>
  </div>
</template>

<style scoped>
.duris-home {
  --ink: #111310;
  --bone: #ece8dd;
  --muted: #b8b5a8;
  --red: #df583d;
  --rule: #575743;
  --display: "Cormorant Garamond", Georgia, serif;
  --gutter: clamp(1.5rem, 5.2vw, 6rem);
  margin: -1rem -1rem -5rem;
  padding-bottom: 5rem;
  background: var(--ink);
  color: var(--bone);
  overflow: clip;
  font-family: Arial, Helvetica, sans-serif;
}
.front-page-state {
  display: grid;
  min-height: 24rem;
  place-items: center;
  color: #a8a8a0;
}
.front-page-state--error {
  color: #fca5a5;
}
.hero {
  position: relative;
  isolation: isolate;
  overflow: clip;
}
.hero-art {
  position: absolute;
  z-index: -2;
  inset: 0 0 3.5rem;
  width: 100%;
  height: calc(100% - 3.5rem);
  object-fit: cover;
  object-position: center top;
  animation: world-drift 24s ease-in-out infinite alternate;
}
.hero-inner {
  max-width: 105rem;
  margin: auto;
  min-height: 47.5rem;
  padding: 5.25rem var(--gutter) 4.5rem;
  display: flex;
  align-items: center;
}
.hero-copy {
  width: 43%;
  animation: arrival 800ms ease-out both;
}
.hero-title {
  font-family: var(--display);
  font-size: clamp(5.5rem, 8.8vw, 9.4rem);
  font-weight: 400;
  line-height: 0.82;
  letter-spacing: -0.045em;
  margin: 0;
}
.hero-title em {
  color: var(--red);
  font-weight: 400;
}
.hero-title--custom {
  font-size: clamp(3.6rem, 6.8vw, 7rem);
  line-height: 0.95;
  overflow-wrap: anywhere;
}
.hero-subtitle {
  max-width: 28rem;
  color: #d0cec2;
  margin: 2rem 0 0;
  font-size: 1.125rem;
  line-height: 1.75;
}
.hero-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 1.75rem;
  margin-top: 2.5rem;
}
.action-link {
  display: inline-flex;
  justify-content: space-between;
  align-items: center;
  gap: 2rem;
  min-height: 3.875rem;
  padding: 0.875rem 1.5rem;
  background: #b92e1c;
  color: #fff4e8;
  font: 400 1.5rem / 1.2 var(--display);
  transition: background 180ms ease;
}
.action-link:hover {
  background: #d03b26;
}
.action-link svg {
  width: 1.65rem;
  height: 1.65rem;
  stroke-width: 1;
  transition: transform 180ms ease;
}
.action-link:hover svg {
  transform: translateX(0.25rem);
}
.text-link {
  font: 400 1.5rem / 1.3 var(--display);
  text-decoration: underline;
  text-underline-offset: 0.35rem;
  text-decoration-color: #898879;
}
.text-link:hover {
  color: var(--red);
}
.play-note {
  font-size: 0.875rem;
  color: var(--muted);
  margin-top: 1.25rem;
}
.hero-rail {
  position: relative;
  min-height: 3.5rem;
  border-block: 1px solid var(--rule);
  padding: 0.5rem var(--gutter);
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 1.5rem;
  background: var(--ink);
}
.hero-rail > p {
  font:
    0.6875rem / 1.5 ui-monospace,
    monospace;
  text-transform: uppercase;
  letter-spacing: 0.2em;
  color: #b3b086;
}
.rail-controls {
  display: flex;
  align-items: center;
  gap: 1.5rem;
}
.explore-link {
  display: inline-flex;
  align-items: center;
  gap: 1rem;
  font: 1.35rem var(--display);
  cursor: pointer;
  white-space: nowrap;
}
.explore-link svg {
  width: 1.2rem;
  stroke-width: 1;
}
.motion-control {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  border: 1px solid var(--rule);
  padding: 0.55rem 0.75rem;
  font:
    0.75rem Arial,
    sans-serif;
  cursor: pointer;
  color: #d1cdb4;
  white-space: nowrap;
  min-height: 2.5rem;
}
.motion-control svg {
  width: 0.75rem;
  height: 0.75rem;
}
button:hover {
  color: var(--red);
}
.duris-home :is(a, button):focus-visible {
  outline: 2px solid var(--red);
  outline-offset: 5px;
}
.ash-field {
  position: absolute;
  inset: 0;
  z-index: -1;
  overflow: hidden;
  pointer-events: none;
}
.ash {
  position: absolute;
  bottom: 3.5rem;
  border-radius: 50%;
  background: #f79250;
  opacity: 0;
  animation: ash-rise linear infinite;
}
.world-section {
  color: #171a15;
  background: var(--bone);
  scroll-margin-top: 0;
}
.world-section:focus {
  outline: none;
}
.world-section:focus-visible {
  outline: 2px solid var(--red);
  outline-offset: -5px;
}
.world-inner {
  max-width: 105rem;
  margin: auto;
  padding: 3.75rem var(--gutter) 2rem;
}
.world-intro {
  display: grid;
  grid-template-columns: 1.7fr 1fr;
  gap: 4rem;
  align-items: center;
  padding-bottom: 3rem;
}
.world-intro h2 {
  font: 400 clamp(3.3rem, 6.2vw, 6.5rem) / 0.98 var(--display);
  letter-spacing: -0.04em;
}
.world-intro em {
  font-weight: 400;
}
.world-intro > p {
  font-size: 1.125rem;
  line-height: 1.85;
  max-width: 28rem;
}
.pathways {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  border-top: 1px solid #838476;
}
.pathway {
  padding: 2.5rem 2.25rem 1.5rem;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
}
.pathway:first-child {
  padding-left: 0;
}
.pathway:last-child {
  padding-right: 0;
}
.pathway + .pathway {
  border-left: 1px solid #999a8d;
}
.pathway-index {
  display: flex;
  width: 100%;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  font:
    0.75rem ui-monospace,
    monospace;
  text-transform: uppercase;
  letter-spacing: 0.1em;
}
.pathway-index svg {
  width: 3.5rem;
  height: 3.5rem;
  stroke-width: 0.75;
}
.pathway h3 {
  font: 400 clamp(2.15rem, 3.4vw, 3.75rem) / 1.05 var(--display);
  letter-spacing: -0.04em;
  margin-top: 1.1rem;
}
.pathway > p {
  margin-top: 1.25rem;
  max-width: 20rem;
  font-size: 1.0625rem;
  line-height: 1.7;
}
.pathway-link {
  display: inline-flex;
  align-items: center;
  gap: 1rem;
  font:
    1rem ui-monospace,
    monospace;
  margin-top: auto;
  padding-top: 2rem;
  min-height: 2.75rem;
}
.pathway-link span {
  text-decoration: underline;
  text-underline-offset: 0.5rem;
  text-decoration-thickness: 1px;
}
.pathway-link svg {
  width: 1.5rem;
  height: 1.5rem;
  stroke-width: 1;
  transition: transform 180ms ease;
}
.pathway-link:hover {
  color: #a3281b;
}
.pathway-link:hover svg {
  transform: translate(0.2rem, -0.2rem);
}
.final-call-inner {
  max-width: 105rem;
  margin: auto;
  padding: 3rem var(--gutter) 1.75rem;
  display: grid;
  grid-template-columns: 1.7fr 1fr;
  gap: 2.5rem 4rem;
  align-items: center;
}
.final-call h2 {
  font: 400 clamp(3.5rem, 6.5vw, 7rem) / 0.9 var(--display);
  letter-spacing: -0.04em;
}
.final-call h2 em {
  color: var(--red);
  font-weight: 400;
}
.final-action .action-link {
  width: 100%;
  padding: 1.5rem 2.5rem;
  font-size: 3rem;
}
.final-action .action-link svg {
  width: 3rem;
  height: 3rem;
}
.final-action > p {
  margin-top: 1rem;
  text-align: center;
  font: 1.4rem var(--display);
}
.colophon {
  grid-column: 1 / -1;
  display: flex;
  justify-content: space-between;
  gap: 1.5rem;
  border-top: 1px solid var(--rule);
  padding-top: 1.5rem;
  font: 1.5rem var(--display);
}
.colophon > span {
  text-transform: uppercase;
  letter-spacing: 0.4em;
}
.editorial-content {
  padding: 3rem var(--gutter);
  border-block: 1px solid var(--rule);
  overflow-wrap: anywhere;
}
@keyframes world-drift {
  from {
    transform: scale(1);
  }
  to {
    transform: scale(1.035);
  }
}
@keyframes arrival {
  from {
    opacity: 0;
    transform: translateY(0.75rem);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
@keyframes ash-rise {
  0% {
    opacity: 0;
    transform: translate(0, 0);
  }
  15% {
    opacity: 0.6;
  }
  85% {
    opacity: 0.2;
  }
  100% {
    opacity: 0;
    transform: translate(3rem, -35rem);
  }
}
.motion-paused :is(.hero-art, .hero-copy, .ash) {
  animation-play-state: paused;
}
@media (min-width: 1024px) {
  .duris-home {
    margin-bottom: -1rem;
    padding-bottom: 0;
  }
}
@media (max-width: 1199px) and (min-width: 761px) {
  .hero-inner {
    min-height: 42rem;
    padding-top: 4rem;
    padding-bottom: 4rem;
  }
  .hero-copy {
    width: 49%;
  }
  .hero-title {
    font-size: 8.7vw;
  }
  .hero-subtitle {
    font-size: 1rem;
  }
  .hero-actions {
    gap: 1.2rem;
  }
  .action-link {
    gap: 1rem;
    padding-inline: 1rem;
  }
  .world-intro {
    gap: 2rem;
  }
  .pathway {
    padding-inline: 1.5rem;
  }
  .final-call-inner {
    gap: 2rem;
  }
  .final-action .action-link {
    font-size: 2.4rem;
  }
}
@media (max-width: 760px) {
  .hero-art {
    inset: 0 0 auto;
    height: 29rem;
    object-position: 72% center;
    mask-image: linear-gradient(#000 72%, transparent);
  }
  .hero-inner {
    min-height: auto;
    padding-top: 23rem;
    padding-bottom: 2.5rem;
  }
  .hero-copy {
    width: 100%;
  }
  .hero-title {
    font-size: clamp(4.5rem, 15.7vw, 7.25rem);
    line-height: 0.88;
  }
  .hero-title--custom {
    font-size: clamp(3rem, 11vw, 5rem);
  }
  .hero-subtitle {
    margin-top: 1.5rem;
    max-width: 32rem;
    font-size: 1rem;
    line-height: 1.65;
  }
  .hero-actions {
    gap: 1.5rem;
    margin-top: 1.75rem;
  }
  .action-link {
    padding-inline: 1.1rem;
    gap: 1.25rem;
    font-size: 1.3rem;
  }
  .text-link {
    font-size: 1.3rem;
  }
  .play-note {
    font-size: 0.8125rem;
  }
  .hero-rail {
    align-items: flex-start;
    flex-direction: column;
    padding-block: 1rem;
    gap: 0.75rem;
  }
  .hero-rail > p {
    font-size: 0.6rem;
    letter-spacing: 0.13em;
  }
  .rail-controls {
    width: 100%;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: 0.75rem;
  }
  .world-inner {
    padding-top: 3rem;
  }
  .world-intro {
    grid-template-columns: 1fr;
    gap: 1.5rem;
    padding-bottom: 2rem;
  }
  .world-intro h2 {
    font-size: clamp(2.5rem, 9.4vw, 4.5rem);
  }
  .world-intro > p {
    font-size: 1rem;
    line-height: 1.7;
  }
  .pathways {
    grid-template-columns: 1fr;
  }
  .pathway {
    padding: 2rem 0;
  }
  .pathway + .pathway {
    border-left: 0;
    border-top: 1px solid #999a8d;
  }
  .pathway-index svg {
    width: 2.5rem;
    height: 2.5rem;
  }
  .pathway h3 {
    margin-top: 0.75rem;
    font-size: 2.75rem;
  }
  .pathway > p {
    max-width: 100%;
    margin-top: 0.75rem;
    font-size: 1rem;
  }
  .pathway-link {
    padding-top: 1.5rem;
  }
  .final-call-inner {
    grid-template-columns: 1fr;
    gap: 2rem;
    padding-top: 3rem;
  }
  .final-call h2 {
    font-size: clamp(2.8rem, 10.5vw, 5rem);
  }
  .final-action .action-link {
    font-size: 2rem;
    padding: 1.25rem 1.5rem;
  }
  .final-action > p {
    font-size: 1.15rem;
  }
  .colophon {
    font-size: 1.1rem;
    flex-wrap: wrap;
  }
}
@media (prefers-reduced-motion: reduce) {
  .hero-art,
  .hero-copy,
  .ash {
    animation: none;
  }
  .duris-home :is(a, button, svg) {
    transition: none;
  }
}

:deep(.tiptap-content) {
  color: var(--muted);
  font-size: 1.1rem;
  line-height: 1.75;
}

:deep(.tiptap-content h1),
:deep(.tiptap-content h2),
:deep(.tiptap-content h3),
:deep(.tiptap-content h4),
:deep(.tiptap-content h5),
:deep(.tiptap-content h6) {
  margin: 1.5em 0 0.6em;
  color: var(--bone);
  font-family: Georgia, 'Times New Roman', serif;
  line-height: 1.15;
}

:deep(.tiptap-content h1) {
  font-size: 2.75rem;
}

:deep(.tiptap-content h2) {
  font-size: 2.25rem;
}

:deep(.tiptap-content h3) {
  font-size: 1.75rem;
}

:deep(.tiptap-content a) {
  color: var(--red);
  text-underline-offset: 0.2em;
}

:deep(.tiptap-content img) {
  max-width: 100%;
  height: auto;
  margin: 1rem 0;
}

:deep(.tiptap-content img[data-alignment='left']) {
  float: left;
  max-width: 50%;
  margin-right: 2rem;
}

:deep(.tiptap-content img[data-alignment='right']) {
  float: right;
  max-width: 50%;
  margin-left: 2rem;
}

:deep(.tiptap-content img[data-alignment='center']) {
  display: block;
  float: none;
  margin-right: auto;
  margin-left: auto;
}

:deep(.tiptap-content img[data-rounded='true']) {
  border-radius: 0.75rem;
}

:deep(.tiptap-content)::after {
  display: table;
  clear: both;
  content: '';
}

:deep(.tiptap-content table) {
  width: 100%;
  margin: 1.5rem 0;
  border-collapse: collapse;
}

:deep(.tiptap-content th),
:deep(.tiptap-content td) {
  padding: 0.75rem 1rem;
  border: 1px solid var(--rule);
  text-align: left;
  vertical-align: top;
}

:deep(.tiptap-content th) {
  background: #17110e;
  color: var(--bone);
}

:deep(.tiptap-content td) {
  background: #0b0908;
}

:deep(.tiptap-content .columns) {
  margin: 1.5rem 0;
  display: grid;
  gap: 1.5rem;
  align-items: stretch;
}

:deep(.tiptap-content .columns[data-columns='2']) {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

:deep(.tiptap-content .columns[data-columns='3']) {
  grid-template-columns: repeat(3, minmax(0, 1fr));
}

:deep(.tiptap-content .column) {
  padding: 1rem;
  display: flex;
  flex-direction: column;
}

:deep(.tiptap-content [data-type='recent-pvp']),
:deep(.tiptap-content [data-type='top-fragger']),
:deep(.tiptap-content [data-type='map-preview']) {
  height: 100%;
  overflow: hidden;
}

:deep(.tiptap-content [data-type='map-preview']) {
  position: relative;
  min-height: 18.75rem;
  flex: 1;
}

@media (max-width: 640px) {
  :deep(.tiptap-content .columns[data-columns='2']),
  :deep(.tiptap-content .columns[data-columns='3']) {
    grid-template-columns: 1fr;
  }
}
</style>
