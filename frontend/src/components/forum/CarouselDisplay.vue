<template>
  <div
    class="carousel-display relative rounded-lg overflow-hidden"
    @mouseenter="pauseAutoSlide"
    @mouseleave="resumeAutoSlide"
  >
    <!-- main image area -->
    <div
      class="relative flex items-center justify-center"
      :style="{ height: `${height}px` }"
    >
      <!-- left arrow -->
      <button
        v-if="images.length > 1"
        @click="prevImage"
        class="absolute left-2 z-10 p-2 bg-gray-900/80 rounded-full text-white hover:bg-gray-700 transition-colors"
        type="button"
      >
        <ChevronLeft class="h-6 w-6" />
      </button>

      <!-- current image -->
      <transition name="fade" mode="out-in">
        <img
          v-if="images.length > 0"
          :key="currentIndex"
          :src="images[currentIndex]?.src"
          :alt="images[currentIndex]?.alt || 'Carousel image'"
          class="h-full w-auto max-w-full rounded object-contain"
        />
      </transition>

      <!-- right arrow -->
      <button
        v-if="images.length > 1"
        @click="nextImage"
        class="absolute right-2 z-10 p-2 bg-gray-900/80 rounded-full text-white hover:bg-gray-700 transition-colors"
        type="button"
      >
        <ChevronRight class="h-6 w-6" />
      </button>
    </div>

    <!-- image indicators -->
    <div v-if="images.length > 1" class="flex justify-center gap-2 pb-3">
      <button
        v-for="(_, index) in images"
        :key="index"
        @click="currentIndex = index"
        :class="[
          'w-2 h-2 rounded-full transition-colors',
          index === currentIndex ? 'bg-cyan-500' : 'bg-gray-600 hover:bg-gray-500'
        ]"
        type="button"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { ChevronLeft, ChevronRight } from 'lucide-vue-next'

const props = defineProps<{
  dataImages: string
  dataHeight?: string
}>()

const currentIndex = ref(0)
const height = computed(() => parseInt(props.dataHeight || '300', 10))

interface CarouselImage {
  src: string
  alt?: string
}

const images = ref<CarouselImage[]>([])
let autoSlideTimer: ReturnType<typeof setInterval> | null = null
const AUTO_SLIDE_INTERVAL = 5000 // 5 seconds

onMounted(() => {
  try {
    images.value = JSON.parse(props.dataImages)
  } catch {
    images.value = []
  }
  startAutoSlide()
})

onUnmounted(() => {
  stopAutoSlide()
})

function startAutoSlide() {
  if (images.value.length > 1) {
    autoSlideTimer = setInterval(() => {
      nextImage()
    }, AUTO_SLIDE_INTERVAL)
  }
}

function stopAutoSlide() {
  if (autoSlideTimer) {
    clearInterval(autoSlideTimer)
    autoSlideTimer = null
  }
}

function pauseAutoSlide() {
  stopAutoSlide()
}

function resumeAutoSlide() {
  startAutoSlide()
}

function prevImage() {
  currentIndex.value = currentIndex.value > 0 ? currentIndex.value - 1 : images.value.length - 1
}

function nextImage() {
  currentIndex.value = currentIndex.value < images.value.length - 1 ? currentIndex.value + 1 : 0
}
</script>

<style scoped>
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.3s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
