<script setup lang="ts">
// Design and CMS contract: [Design guide](../../../docs/DESIGN.md#homepage-assets-and-configuration).
import { computed, createApp, onBeforeUnmount, ref, watch, type ObjectDirective } from 'vue'
import DOMPurify from 'dompurify'
import { ArrowDown, ArrowUpRight, Compass, Flag, Pause, Play, Swords } from '@lucide/vue'
import { RouterLink } from 'vue-router'
import { useIntersectionObserver, usePreferredReducedMotion } from '@vueuse/core'
import { useHead } from '@unhead/vue'
import defaultHeroImage from '@/assets/eclipse/duris-eclipse.webp'
import { BrandActionLink, BrandTextLink, DisplayHeading, IndexLabel } from '@/components/brand'
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
// The corona is registered to the default artwork's eclipse; other images get atmosphere only.
const hasCustomArt = computed(() => frontPageHeroImageUrl.value !== '')

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

// Embers: x (% of stage), size (px), seconds per ascent, start offset (s), rise (% of stage
// height), leftward wind (rem), peak opacity. `near` embers are large, soft and close to the eye.
const embers = (
  [
    [5, 2, 21, -3, 72, 4, 0.75],
    [12, 3, 17, -11, 88, 6, 0.9],
    [19, 2, 23, -7, 64, 3, 0.7],
    [26, 3, 19, -15, 96, 7, 0.8],
    [33, 3, 16, -2, 80, 5, 0.95],
    [40, 2, 22, -18, 70, 4, 0.7],
    [46, 4, 18, -9, 92, 8, 0.85],
    [52, 3, 20, -5, 84, 5, 0.8],
    [57, 3, 15, -12, 76, 6, 1],
    [62, 2, 24, -20, 100, 7, 0.7],
    [67, 4, 18, -1, 68, 4, 0.9],
    [72, 2, 21, -14, 90, 6, 0.75],
    [77, 4, 17, -6, 82, 8, 0.85],
    [82, 3, 19, -16, 74, 5, 0.75],
    [87, 3, 22, -10, 98, 7, 0.95],
    [92, 2, 16, -4, 66, 3, 0.8],
    [97, 3, 20, -13, 86, 9, 0.85],
    [36, 9, 13, -8, 112, 14, 0.3, true],
    [70, 7, 15, -3, 108, 12, 0.34, true],
    [90, 10, 12, -10, 116, 16, 0.26, true],
  ] as const
).map(([x, size, time, delay, rise, wind, peak, near = false]) => ({
  near,
  style: {
    '--x': `${x}%`,
    '--s': `${size}px`,
    '--t': `${time}s`,
    '--d': `${delay}s`,
    '--rise': `${rise}cqh`,
    '--wind': `${-wind}rem`,
    '--o': peak,
  },
}))

// Ambient loops rest while the hero is scrolled out of view.
const heroRef = ref<HTMLElement | null>(null)
const heroOffstage = ref(false)
useIntersectionObserver(heroRef, (entries) => {
  const entry = entries.at(-1)
  if (entry) heroOffstage.value = !entry.isIntersecting
})

// Depth on a fine pointer: the layers lean a few pixels away from the cursor.
let pointerFrame = 0
function setLean(hero: HTMLElement, x: number, y: number) {
  hero.style.setProperty('--px', x.toFixed(3))
  hero.style.setProperty('--py', y.toFixed(3))
}
function trackPointer(event: PointerEvent) {
  if (event.pointerType !== 'mouse' || isMotionPaused.value || pointerFrame) return
  const hero = event.currentTarget as HTMLElement
  const { clientX, clientY } = event
  pointerFrame = requestAnimationFrame(() => {
    pointerFrame = 0
    const box = hero.getBoundingClientRect()
    if (box.width === 0 || box.height === 0) return
    setLean(
      hero,
      ((clientX - box.left) / box.width) * 2 - 1,
      ((clientY - box.top) / box.height) * 2 - 1,
    )
  })
}
function releasePointer(event: PointerEvent) {
  cancelAnimationFrame(pointerFrame)
  pointerFrame = 0
  setLean(event.currentTarget as HTMLElement, 0, 0)
}

// Sections below the hero settle into place once, as they are first scrolled into view. The
// threshold is a share of the element with no root margin, so the last element on the page can
// always reach it.
const revealObserver =
  typeof IntersectionObserver === 'undefined'
    ? null
    : new IntersectionObserver(
        (entries, observer) => {
          for (const entry of entries) {
            if (!entry.isIntersecting) continue
            ;(entry.target as HTMLElement).dataset.reveal = 'shown'
            observer.unobserve(entry.target)
          }
        },
        { threshold: 0.15 },
      )
const vReveal: ObjectDirective<HTMLElement> = {
  beforeMount(el) {
    if (revealObserver) el.dataset.reveal = 'pending'
  },
  mounted(el) {
    revealObserver?.observe(el)
  },
  unmounted(el) {
    revealObserver?.unobserve(el)
  },
}

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
  cancelAnimationFrame(pointerFrame)
  revealObserver?.disconnect()
})
</script>

<template>
  <div v-if="isLoading" class="front-page-state" role="status">Loading site configuration…</div>
  <div v-else-if="!isAvailable" role="alert" class="front-page-state front-page-state--error">
    {{ error }}
  </div>
  <div v-else class="duris-home" :class="{ 'motion-paused': isMotionPaused }">
    <section
      v-if="frontPageHeroEnabled"
      ref="heroRef"
      class="hero"
      :class="{ 'hero--offstage': heroOffstage }"
      aria-labelledby="duris-home-title"
      @pointermove="trackPointer"
      @pointerleave="releasePointer"
    >
      <div class="hero-stage" aria-hidden="true">
        <div class="hero-scene" :class="{ 'hero-scene--custom': hasCustomArt }">
          <img
            class="hero-art"
            :src="heroImage"
            alt=""
            width="1672"
            height="941"
            fetchpriority="high"
          />
          <div v-if="!hasCustomArt" class="corona">
            <div class="corona-ring">
              <span class="corona-breath" />
              <span class="corona-plasma" />
              <span class="corona-plasma corona-plasma--counter" />
              <span class="corona-bead" />
              <span class="corona-ignite" />
            </div>
          </div>
        </div>
        <span class="mist" />
        <span class="mist mist--near" />
        <span class="hero-shade" />
        <div class="ember-field">
          <span
            v-for="(ember, index) in embers"
            :key="index"
            class="ember"
            :class="{ 'ember--near': ember.near }"
            :style="ember.style"
          />
        </div>
        <span class="hero-veil" />
      </div>
      <div class="hero-inner">
        <div class="hero-copy">
          <h1 id="duris-home-title" class="hero-title" :class="{ 'hero-title--custom': !isDefaultTitle }">
            <template v-if="isDefaultTitle">
              <span class="title-line arrive" style="--i: 0">A world </span>
              <span class="title-line arrive" style="--i: 1">written in </span>
              <span class="title-line arrive" style="--i: 2"><em data-text="blood.">blood.</em></span>
            </template>
            <span v-else class="title-line arrive" style="--i: 0">{{ heroTitle }}</span>
          </h1>
          <p class="hero-subtitle arrive" style="--i: 3">{{ heroSubtitle }}</p>
          <div class="hero-actions arrive" style="--i: 4">
            <BrandActionLink to="/play">Enter the world</BrandActionLink>
            <BrandTextLink to="/news">News &amp; Updates</BrandTextLink>
          </div>
          <p class="play-note arrive" style="--i: 5">Free to play. Played in your browser.</p>
        </div>
      </div>
      <div class="hero-rail">
        <IndexLabel as="p" class="rail-label">Words build worlds. Players make history.</IndexLabel>
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
          <DisplayHeading id="world-heading" v-reveal :level="2" size="none">The world is text.<br /><em>The stakes are real.</em></DisplayHeading>
          <p v-reveal style="--i: 1">No quest marker can tell you who to trust. Learn the lands, follow the rivalries, and find the people who will stand beside you.</p>
        </div>
        <div class="pathways">
          <article v-reveal class="pathway" style="--i: 0">
            <div class="pathway-index"><span>01 / Explore</span><Compass aria-hidden="true" /></div>
            <h3>Know the world.</h3>
            <p>Every zone has a story. Every path has a price. Start with the map.</p>
            <RouterLink to="/wiki/map" class="pathway-link"><span>Open the wiki</span><ArrowUpRight aria-hidden="true" /></RouterLink>
          </article>
          <article v-reveal class="pathway" style="--i: 1">
            <div class="pathway-index"><span>02 / Witness</span><Swords aria-hidden="true" /></div>
            <h3>Read the rivalries.</h3>
            <p>Ambushes, victories, and names worth remembering. The latest from the battlefield.</p>
            <RouterLink to="/pvp" class="pathway-link"><span>View PvP logs</span><ArrowUpRight aria-hidden="true" /></RouterLink>
          </article>
          <article v-reveal class="pathway" style="--i: 2">
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
        <DisplayHeading id="final-call-heading" v-reveal :level="2" size="none">What will your<br /><em>next command <span class="command-end">be?<span class="command-caret" aria-hidden="true" /></span></em></DisplayHeading>
        <div v-reveal class="final-action" style="--i: 1">
          <BrandActionLink to="/play">Enter Duris</BrandActionLink>
          <p>Free to play. No download required.</p>
        </div>
        <div v-reveal class="colophon" style="--i: 2"><span>Duris</span><p>A world made by its players.</p></div>
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
  --ease-arrive: cubic-bezier(0.16, 1, 0.3, 1);
  --ease-settle: cubic-bezier(0.22, 0.61, 0.36, 1);
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
/* The stage clips the artwork and its atmosphere. `--focus-*` is the artwork's object-position. */
.hero-stage {
  --focus-x: 0.5;
  --focus-y: 0;
  position: absolute;
  z-index: -1;
  inset: 0 0 3.5rem;
  overflow: clip;
  container-type: size;
  pointer-events: none;
}
/* A cover-fitted box with the artwork's own proportions, so overlays share its coordinates. */
.hero-scene {
  --scene-w: max(100cqw, 100cqh * 1672 / 941);
  position: absolute;
  left: calc((100cqw - var(--scene-w)) * var(--focus-x));
  top: calc((100cqh - var(--scene-w) * 941 / 1672) * var(--focus-y));
  width: var(--scene-w);
  aspect-ratio: 1672 / 941;
  transform-origin: 70.12% 24.36%;
  translate: calc(var(--px, 0) * -8px) calc(var(--py, 0) * -4px);
  transition: translate 1.4s var(--ease-settle);
  animation:
    world-drift 34s ease-in-out infinite alternate,
    scene-arrive 3.2s var(--ease-arrive) backwards;
}
.hero-scene--custom {
  inset: 0;
  width: 100%;
  height: 100%;
  aspect-ratio: auto;
  transform-origin: 60% 35%;
}
.hero-art {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
  object-position: center top;
}
/*
 * The eclipse sits at 70.12% / 24.36% of the artwork and is 19.37% of its width across. The
 * corona is three discs wide, which puts the rim at a third of its gradient radius. Its colors
 * are dark on purpose: under color-dodge a color is a gain, so the layers lift light the
 * painting already has and leave the moon and the silhouettes dark.
 */
.corona {
  position: absolute;
  left: 70.12%;
  top: 24.36%;
  width: 58.11%;
  aspect-ratio: 1;
  translate: -50% -50%;
  mix-blend-mode: color-dodge;
  /* The castle stands in front of the eclipse, so its sector takes no glow. */
  mask-image: conic-gradient(#000 0deg 98deg, transparent 124deg 226deg, #000 250deg);
}
.corona-ring {
  position: absolute;
  inset: 0;
  /* Clear of the moon's face, fading out into the sky. */
  mask-image: radial-gradient(closest-side, transparent 32.2%, #000 34%, #000 60%, transparent);
}
.corona-ring > * {
  position: absolute;
  inset: 0;
  border-radius: 50%;
  mix-blend-mode: plus-lighter;
}
.corona-breath {
  background: radial-gradient(
    closest-side,
    rgb(72 44 22) 34.5%,
    rgb(72 44 22 / 0.6) 47%,
    rgb(72 44 22 / 0.2) 72%,
    transparent
  );
  opacity: 0.6;
  animation: corona-breath 9s ease-in-out infinite;
}
.corona-plasma {
  background: conic-gradient(
    transparent 0deg,
    rgb(84 46 20 / 0.9) 24deg,
    transparent 53deg 84deg,
    rgb(84 46 20 / 0.7) 121deg,
    transparent 152deg,
    rgb(84 46 20 / 0.85) 199deg,
    transparent 238deg 266deg,
    rgb(84 46 20 / 0.75) 303deg,
    transparent 340deg
  );
  animation: corona-turn 120s linear infinite;
}
.corona-plasma--counter {
  background: conic-gradient(
    from 40deg,
    rgb(84 46 20 / 0.75) 0deg,
    transparent 37deg 71deg,
    rgb(84 46 20 / 0.9) 104deg,
    transparent 139deg,
    rgb(84 46 20 / 0.65) 187deg,
    transparent 221deg 259deg,
    rgb(84 46 20 / 0.85) 291deg,
    transparent 327deg,
    rgb(84 46 20 / 0.75) 360deg
  );
  animation-duration: 190s;
  animation-direction: reverse;
}
/* A bead of light that circles the rim and is lost behind the castle. */
.corona-bead {
  background: radial-gradient(ellipse 6% 2.2% at 50% 33.33%, rgb(146 98 58), transparent);
  animation: corona-turn 48s linear infinite;
}
.corona-ignite {
  background: radial-gradient(
    closest-side,
    rgb(120 70 34) 34%,
    rgb(120 70 34 / 0.5) 52%,
    transparent 90%
  );
  opacity: 0;
  animation: corona-ignite 3s var(--ease-settle) 120ms backwards;
}
/* Two banks of the same tileable texture; the nearer one is larger, lower and faster. */
.mist {
  --tile: 145cqh;
  position: absolute;
  left: -3rem;
  bottom: 0;
  width: calc(100% + 6rem + var(--tile));
  height: 50cqh;
  background: url('@/assets/eclipse/mist.webp') left bottom / var(--tile) 100% repeat-x;
  mix-blend-mode: screen;
  opacity: 0.36;
  translate: calc(var(--px, 0) * -14px) calc(var(--py, 0) * -6px);
  transition: translate 1.4s var(--ease-settle);
  animation: mist-drift 110s linear infinite;
}
.mist--near {
  --tile: 198cqh;
  bottom: -12cqh;
  height: 62cqh;
  background-position: 61cqh bottom;
  opacity: 0.44;
  translate: calc(var(--px, 0) * -22px) calc(var(--py, 0) * -9px);
  animation-duration: 72s;
}
/* Holds the copy's side of the stage dark while the mist passes behind it. */
.hero-shade {
  position: absolute;
  inset: 0;
  background: linear-gradient(90deg, rgb(17 19 16 / 0.72), rgb(17 19 16 / 0.36) 30%, transparent 52%);
}
.ember-field {
  position: absolute;
  inset: 0;
  translate: calc(var(--px, 0) * -28px) calc(var(--py, 0) * -12px);
  transition: translate 1.4s var(--ease-settle);
}
.ember {
  position: absolute;
  left: var(--x);
  bottom: -0.75rem;
  width: var(--s);
  height: var(--s);
  border-radius: 50%;
  background: #ffc591;
  box-shadow: 0 0 calc(var(--s) * 3) var(--s) rgb(255 106 40 / 0.7);
  opacity: 0;
  animation:
    ember-rise var(--t) linear var(--d) infinite,
    ember-sway calc(var(--t) / 3.4) ease-in-out var(--d) infinite alternate,
    ember-flicker 2.6s ease-in-out var(--d) infinite;
}
.ember--near {
  background: #ff9a55;
  box-shadow: none;
  filter: blur(3px);
}
.hero-veil {
  position: absolute;
  inset: 0;
  background: var(--ink);
  opacity: 0;
  animation: veil-lift 2.6s ease-out backwards;
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
}
/* Arrivals hold their first frame through the delay and leave nothing behind once they land. */
.arrive {
  animation: arrival 1.1s var(--ease-arrive) calc(160ms + var(--i, 0) * 95ms) backwards;
}
.title-line {
  display: block;
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
  position: relative;
  display: inline-block;
  color: var(--red);
  font-weight: 400;
}
/*
 * A brighter, glowing copy of the accent word, faded over it in time with the corona. Opacity
 * stays on the compositor, which an animated glow on the word itself would not. The empty
 * alternative text keeps the copy out of the accessibility tree; without that syntax there is
 * simply no copy.
 */
.hero-title em::after {
  content: attr(data-text) / '';
  position: absolute;
  inset: 0;
  color: #ff7a52;
  text-shadow: 0 0 0.2em rgb(255 92 40 / 0.55);
  opacity: 0;
  animation: blood-pulse 9s ease-in-out infinite;
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
.rail-label {
  letter-spacing: 0.2em;
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
  animation: beckon 2.8s ease-in-out infinite;
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
  color: inherit;
  font: 400 clamp(3.3rem, 6.2vw, 6.5rem) / 0.98 var(--display);
  letter-spacing: -0.04em;
}
.world-intro em {
  color: inherit;
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
}
.pathway {
  position: relative;
  padding: 2.5rem 2.25rem 1.5rem;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
}
/* Rules are drawn rather than bordered so they can be ruled in as the pathway arrives. */
.pathway::before,
.pathway + .pathway::after {
  content: '';
  position: absolute;
  background: #838476;
}
.pathway::before {
  inset: 0 0 auto;
  height: 1px;
  transform-origin: left;
}
.pathway + .pathway::after {
  inset: 0 auto 0 0;
  width: 1px;
  background: #999a8d;
  transform-origin: top;
}
.pathway:first-child {
  padding-left: 0;
}
.pathway:last-child {
  padding-right: 0;
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
.final-action .brand-action {
  width: 100%;
  padding: 1.5rem 2.5rem;
  font-size: 3rem;
}
.final-action :deep(.brand-action svg) {
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
.command-end {
  white-space: nowrap;
}
.command-caret {
  display: inline-block;
  width: 0.2em;
  height: 0.66em;
  margin-left: 0.14em;
  background: var(--red);
  animation: caret-blink 0.95s ease-in-out infinite alternate;
}

/*
 * Sections settle in once, when the reveal directive first sees them. Every rule is scoped to a
 * page that is in motion, so pausing or preferring reduced motion shows the final state at once.
 */
.duris-home:not(.motion-paused) [data-reveal] {
  --reveal-delay: calc(var(--i, 0) * 120ms);
}
.duris-home:not(.motion-paused) [data-reveal]:not(.pathway) {
  transition:
    opacity 1s var(--ease-arrive) var(--reveal-delay),
    translate 1s var(--ease-arrive) var(--reveal-delay);
}
.duris-home:not(.motion-paused) [data-reveal='pending']:not(.pathway) {
  opacity: 0;
  translate: 0 1.75rem;
}
.duris-home:not(.motion-paused) .pathway > * {
  transition:
    opacity 0.9s var(--ease-arrive) calc(var(--reveal-delay) + var(--step, 0) * 80ms + 120ms),
    translate 0.9s var(--ease-arrive) calc(var(--reveal-delay) + var(--step, 0) * 80ms + 120ms);
}
.pathway > :nth-child(2) {
  --step: 1;
}
.pathway > :nth-child(3) {
  --step: 2;
}
.pathway > :nth-child(4) {
  --step: 3;
}
.duris-home:not(.motion-paused) .pathway[data-reveal='pending'] > * {
  opacity: 0;
  translate: 0 1.25rem;
}
.duris-home:not(.motion-paused) .pathway::before {
  transition: scale 1.2s var(--ease-arrive) var(--reveal-delay);
}
.duris-home:not(.motion-paused) .pathway + .pathway::after {
  transition: scale 1.2s var(--ease-arrive) calc(var(--reveal-delay) + 180ms);
}
.duris-home:not(.motion-paused) .pathway[data-reveal='pending']::before {
  scale: 0 1;
}
.duris-home:not(.motion-paused) .pathway[data-reveal='pending']::after {
  scale: 1 0;
}
/* The icons are inked in; every Lucide stroke used here is shorter than the dash. */
.duris-home:not(.motion-paused) .pathway-index :deep(svg *) {
  stroke-dasharray: 120;
  transition: stroke-dashoffset 1.7s ease calc(var(--reveal-delay) + 320ms);
}
.duris-home:not(.motion-paused) .pathway[data-reveal='pending'] .pathway-index :deep(svg *) {
  stroke-dashoffset: 120;
}

@keyframes world-drift {
  from {
    transform: scale(1.04);
  }
  to {
    transform: scale(1.1);
  }
}
@keyframes scene-arrive {
  from {
    scale: 1.07;
  }
  to {
    scale: 1;
  }
}
@keyframes veil-lift {
  from {
    opacity: 0.6;
  }
  to {
    opacity: 0;
  }
}
@keyframes corona-breath {
  0%,
  100% {
    opacity: 0.22;
  }
  42% {
    opacity: 1;
  }
  58% {
    opacity: 0.7;
  }
  70% {
    opacity: 0.86;
  }
}
@keyframes corona-turn {
  to {
    rotate: 1turn;
  }
}
@keyframes corona-ignite {
  0% {
    opacity: 0;
    scale: 0.96;
  }
  26% {
    opacity: 1;
  }
  100% {
    opacity: 0;
    scale: 1.14;
  }
}
/* Keeps time with corona-breath, so the word answers the eclipse. */
@keyframes blood-pulse {
  0%,
  100% {
    opacity: 0;
  }
  42% {
    opacity: 1;
  }
  58% {
    opacity: 0.55;
  }
  70% {
    opacity: 0.8;
  }
}
@keyframes mist-drift {
  to {
    transform: translateX(calc(-1 * var(--tile)));
  }
}
@keyframes ember-rise {
  0% {
    opacity: 0;
    translate: 0 0;
  }
  9% {
    opacity: var(--o);
  }
  72% {
    opacity: calc(var(--o) * 0.6);
  }
  100% {
    opacity: 0;
    translate: var(--wind) calc(-1 * var(--rise));
  }
}
@keyframes ember-sway {
  from {
    transform: translateX(-0.85rem);
  }
  to {
    transform: translateX(0.85rem);
  }
}
@keyframes ember-flicker {
  0%,
  100% {
    scale: 1;
  }
  38% {
    scale: 0.55;
  }
  61% {
    scale: 1.15;
  }
}
@keyframes arrival {
  from {
    opacity: 0;
    transform: translateY(1.5rem);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
@keyframes beckon {
  0%,
  100% {
    transform: translateY(-0.12rem);
  }
  50% {
    transform: translateY(0.22rem);
  }
}
@keyframes caret-blink {
  0%,
  35% {
    opacity: 1;
  }
  100% {
    opacity: 0.06;
  }
}
@keyframes hero-recede {
  to {
    translate: 0 7rem;
  }
}
/* The artwork falls behind the page as the hero scrolls away. */
@supports (animation-timeline: view()) {
  .hero-stage {
    animation: hero-recede linear both;
    animation-timeline: view();
    animation-range: exit;
  }
}
/* Without container units the overlays cannot be registered to the artwork. */
@supports not (width: 1cqw) {
  .hero-scene {
    inset: 0;
    width: 100%;
    height: 100%;
    aspect-ratio: auto;
  }
  .corona,
  .mist,
  .ember-field {
    display: none;
  }
}

/* Pause control, and rest while the hero is out of view. Arrivals always finish. */
.motion-paused :is(.corona-breath, .corona-plasma, .corona-bead, .mist, .ember, .explore-link svg),
.hero--offstage :is(.corona-breath, .corona-plasma, .corona-bead, .mist, .ember, .explore-link svg),
.motion-paused .hero-title em::after,
.hero--offstage .hero-title em::after {
  animation-play-state: paused;
}
.motion-paused .hero-scene,
.hero--offstage .hero-scene {
  animation-play-state: paused, running;
}
.motion-paused .hero-stage,
.motion-paused .command-caret {
  animation: none;
}
.motion-paused :is(.hero-scene, .mist, .ember-field) {
  translate: none;
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
  .brand-action {
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
  .final-action .brand-action {
    font-size: 2.4rem;
  }
}
@media (max-width: 760px) {
  .hero-stage {
    --focus-x: 0.72;
    --focus-y: 0.5;
    inset: 0 0 auto;
    height: 29rem;
  }
  .hero-art {
    object-position: 72% center;
  }
  /* The copy sits below the artwork here, so the shade dissolves its lower edge instead. */
  .hero-shade {
    background: linear-gradient(transparent 72%, var(--ink));
  }
  /* A lighter scene for small, dense screens. */
  .corona-plasma--counter,
  .ember:nth-child(even) {
    display: none;
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
  .brand-action {
    padding-inline: 1.1rem;
    gap: 1.25rem;
    font-size: 1.3rem;
  }
  .brand-text-link {
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
  .rail-label {
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
  .pathway + .pathway::before {
    background: #999a8d;
  }
  .pathway + .pathway::after {
    display: none;
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
  .final-action .brand-action {
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
  .hero-stage,
  .hero-scene,
  .corona-ring > *,
  .mist,
  .ember,
  .hero-veil,
  .arrive,
  .hero-title em::after,
  .explore-link svg,
  .command-caret {
    animation: none;
  }
  .corona-bead {
    display: none;
  }
  .hero-scene,
  .mist,
  .ember-field {
    translate: none;
    transition: none;
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

:deep(.tiptap-content :is(th, td)) {
  padding: 0.75rem 1rem;
  vertical-align: top;
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
