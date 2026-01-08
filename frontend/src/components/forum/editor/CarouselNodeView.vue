<template>
  <NodeViewWrapper class="carousel-node-wrapper my-4">
    <div
      class="carousel-container bg-gray-800 rounded-lg border overflow-hidden transition-colors"
      :class="isDragging ? 'border-cyan-500 border-2' : 'border-gray-600'"
      @dragover.prevent="onDragOver"
      @dragleave.prevent="onDragLeave"
      @drop.prevent="onDrop"
    >

      <!-- pending images warning -->
      <div
        v-if="pendingCount >= maxImages"
        class="bg-yellow-900/50 border-b border-yellow-700 px-3 py-2 text-xs text-yellow-400 flex items-center justify-between"
      >
        <div class="flex items-center gap-2">
          <AlertCircle class="h-4 w-4 flex-shrink-0" />
          <span>{{ pendingCount }}/{{ maxImages }} pending images.</span>
        </div>
        <button
          @click="clearOrphans"
          :disabled="isClearing"
          class="px-2 py-0.5 bg-yellow-700 text-yellow-200 rounded text-xs hover:bg-yellow-600 transition-colors disabled:opacity-50"
          type="button"
        >
          {{ isClearing ? 'clearing...' : 'clear all' }}
        </button>
      </div>

      <!-- carousel display area -->
      <div
        class="relative flex items-center justify-center p-4"
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
        <div v-if="images.length > 0" class="flex items-center justify-center max-w-full h-full">
          <img
            :src="images[currentIndex]?.src"
            :alt="images[currentIndex]?.alt || 'Carousel image'"
            class="h-full w-auto max-w-full rounded object-contain"
          />
        </div>
        <div v-else class="text-gray-400 text-center py-8">
          <ImageIcon class="h-12 w-12 mx-auto mb-2 opacity-50" />
          <p class="text-sm">Drop images here or click "Add Image"</p>
          <p class="text-xs mt-2 text-gray-500">recommended: landscape images with same aspect ratio (e.g. 800x400)</p>
        </div>

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

      <!-- controls -->
      <div class="border-t border-gray-700 bg-gray-900 px-3 py-2 flex items-center justify-between">
        <div class="flex items-center gap-3">
          <div class="text-xs text-gray-400">
            {{ images.length }} image{{ images.length !== 1 ? 's' : '' }}
            <span v-if="images.length > 1" class="ml-2">
              ({{ currentIndex + 1 }}/{{ images.length }})
            </span>
          </div>
          <select
            :value="height"
            @change="updateHeight"
            class="bg-gray-700 text-gray-300 rounded text-xs px-2 py-1 border-none outline-none"
          >
            <option :value="200">200px</option>
            <option :value="300">300px</option>
            <option :value="400">400px</option>
            <option :value="500">500px</option>
          </select>
        </div>
        <div class="flex gap-2">
          <input
            ref="imageInput"
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif"
            class="hidden"
            @change="handleAddImage"
          />
          <button
            @click="triggerFileInput"
            :disabled="isUploading"
            class="px-2 py-1 bg-gray-700 text-gray-300 rounded text-xs hover:bg-gray-600 transition-colors flex items-center gap-1 disabled:opacity-50"
            type="button"
          >
            <Loader2 v-if="isUploading" class="h-3 w-3 animate-spin" />
            <Plus v-else class="h-3 w-3" />
            Add Image
          </button>
          <button
            v-if="images.length > 0"
            @click="removeCurrentImage"
            class="px-2 py-1 bg-red-900/50 text-red-400 rounded text-xs hover:bg-red-900 transition-colors flex items-center gap-1"
            type="button"
          >
            <Trash2 class="h-3 w-3" />
            Remove
          </button>
          <button
            @click="deleteNode"
            class="px-2 py-1 bg-gray-700 text-gray-400 rounded text-xs hover:bg-gray-600 hover:text-red-400 transition-colors"
            type="button"
            title="Delete carousel"
          >
            <X class="h-3 w-3" />
          </button>
        </div>
      </div>

      <!-- error message -->
      <div
        v-if="errorMessage"
        class="bg-red-900/50 border-t border-red-700 px-3 py-2 text-xs text-red-400"
      >
        {{ errorMessage }}
      </div>
    </div>
  </NodeViewWrapper>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { NodeViewWrapper, nodeViewProps } from '@tiptap/vue-3'
import { ChevronLeft, ChevronRight, Plus, Trash2, ImageIcon, X, Loader2, AlertCircle } from 'lucide-vue-next'
import { forumApi } from '@/services/api'

const props = defineProps(nodeViewProps)

const imageInput = ref<HTMLInputElement>()
const currentIndex = ref(0)
const isUploading = ref(false)
const isClearing = ref(false)
const errorMessage = ref<string | null>(null)
const isDragging = ref(false)
const pendingCount = ref(0)
const maxImages = ref(5)

const MAX_IMAGE_SIZE = 350 * 1024 // 350KB
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']

// check pending image status on mount
onMounted(async () => {
  await checkImageStatus()
})

async function checkImageStatus() {
  try {
    const status = await forumApi.getImageUploadStatus()
    pendingCount.value = status.pendingImages
    maxImages.value = status.maxImages
  } catch {
    // ignore errors
  }
}

async function clearOrphans() {
  isClearing.value = true
  try {
    await forumApi.clearOrphanImages()
    await checkImageStatus()
  } catch {
    errorMessage.value = 'Failed to clear orphan images'
    setTimeout(() => { errorMessage.value = null }, 3000)
  } finally {
    isClearing.value = false
  }
}

const images = computed(() => (props.node.attrs.images as Array<{ src: string; alt?: string }>) || [])
const height = computed(() => (props.node.attrs.height as number) || 300)

function updateHeight(event: Event) {
  const target = event.target as HTMLSelectElement
  props.updateAttributes({ height: parseInt(target.value, 10) })
}

function deleteNode() {
  props.deleteNode()
}

function prevImage() {
  currentIndex.value = currentIndex.value > 0 ? currentIndex.value - 1 : images.value.length - 1
}

function nextImage() {
  currentIndex.value = currentIndex.value < images.value.length - 1 ? currentIndex.value + 1 : 0
}

function triggerFileInput() {
  imageInput.value?.click()
}

// drag and drop handlers
function onDragOver() {
  isDragging.value = true
}

function onDragLeave() {
  isDragging.value = false
}

async function onDrop(event: DragEvent) {
  isDragging.value = false
  const file = event.dataTransfer?.files?.[0]
  if (file) {
    await uploadImage(file)
  }
}

async function handleAddImage(event: Event) {
  const target = event.target as HTMLInputElement
  const file = target.files?.[0]
  target.value = '' // clear input for re-selection

  if (file) {
    await uploadImage(file)
  }
}

async function uploadImage(file: File) {
  errorMessage.value = null

  // validate file type
  if (!ALLOWED_TYPES.includes(file.type)) {
    errorMessage.value = 'Only JPG, PNG, WebP, and GIF images are allowed'
    setTimeout(() => { errorMessage.value = null }, 3000)
    return
  }

  // validate file size
  if (file.size > MAX_IMAGE_SIZE) {
    errorMessage.value = `Image must be under ${MAX_IMAGE_SIZE / 1024}KB`
    setTimeout(() => { errorMessage.value = null }, 3000)
    return
  }

  isUploading.value = true

  try {
    const result = await forumApi.uploadPostImage(file)

    if (result.imageUrl) {
      const newImages = [...images.value, { src: result.imageUrl, alt: file.name }]
      props.updateAttributes({ images: newImages })
      // navigate to the new image
      currentIndex.value = newImages.length - 1
      // refresh pending status
      await checkImageStatus()
    }
  } catch (error: unknown) {
    const err = error as { response?: { data?: { error?: string } } }
    errorMessage.value = err.response?.data?.error || 'Failed to upload image'
    setTimeout(() => { errorMessage.value = null }, 5000)
    // refresh status to show current count
    await checkImageStatus()
  } finally {
    isUploading.value = false
  }
}

function removeCurrentImage() {
  if (images.value.length === 0) return

  const newImages = images.value.filter((_, i) => i !== currentIndex.value)
  props.updateAttributes({ images: newImages })

  // adjust current index if needed
  if (currentIndex.value >= newImages.length && newImages.length > 0) {
    currentIndex.value = newImages.length - 1
  }
}
</script>

<style scoped>
.carousel-node-wrapper {
  user-select: none;
}
</style>
