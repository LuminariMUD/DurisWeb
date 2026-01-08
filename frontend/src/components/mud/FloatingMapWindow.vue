<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { X, Minimize2, Maximize2, GripHorizontal } from 'lucide-vue-next'
import { Button } from '@/components/ui/button'

const props = withDefaults(defineProps<{
  modelValue: boolean
  storageKey?: string
  title?: string
}>(), {
  storageKey: 'mud-floating-map',
  title: 'Map',
})

const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void
}>()

// Window state (use prop for storage key)
const windowRef = ref<HTMLElement | null>(null)

const position = ref({ x: 100, y: 100 })
const size = ref({ width: 500, height: 400 })
const isMaximized = ref(false)

// Dragging
const isDragging = ref(false)
const dragStart = ref({ x: 0, y: 0 })

// Resizing
const isResizing = ref(false)
const resizeStart = ref({ x: 0, y: 0, width: 0, height: 0 })

// Load saved state
onMounted(() => {
  const saved = localStorage.getItem(props.storageKey)
  if (saved) {
    try {
      const state = JSON.parse(saved)
      if (state.position) position.value = state.position
      if (state.size) size.value = state.size
    } catch {
      // Ignore parse errors
    }
  }
})

// Save state
function saveState() {
  localStorage.setItem(props.storageKey, JSON.stringify({
    position: position.value,
    size: size.value,
  }))
}

// Drag handlers
function startDrag(e: MouseEvent) {
  if (isMaximized.value) return
  isDragging.value = true
  dragStart.value = {
    x: e.clientX - position.value.x,
    y: e.clientY - position.value.y,
  }
  document.addEventListener('mousemove', onDrag)
  document.addEventListener('mouseup', stopDrag)
  document.body.style.cursor = 'move'
  document.body.style.userSelect = 'none'
}

function onDrag(e: MouseEvent) {
  if (!isDragging.value) return
  position.value = {
    x: Math.max(0, Math.min(window.innerWidth - 100, e.clientX - dragStart.value.x)),
    y: Math.max(0, Math.min(window.innerHeight - 50, e.clientY - dragStart.value.y)),
  }
}

function stopDrag() {
  isDragging.value = false
  document.removeEventListener('mousemove', onDrag)
  document.removeEventListener('mouseup', stopDrag)
  document.body.style.cursor = ''
  document.body.style.userSelect = ''
  saveState()
}

// Resize handlers
function startResize(e: MouseEvent) {
  if (isMaximized.value) return
  e.preventDefault()
  e.stopPropagation()
  isResizing.value = true
  resizeStart.value = {
    x: e.clientX,
    y: e.clientY,
    width: size.value.width,
    height: size.value.height,
  }
  document.addEventListener('mousemove', onResize)
  document.addEventListener('mouseup', stopResize)
  document.body.style.cursor = 'se-resize'
  document.body.style.userSelect = 'none'
}

function onResize(e: MouseEvent) {
  if (!isResizing.value) return
  size.value = {
    width: Math.max(150, Math.min(window.innerWidth - position.value.x - 20, resizeStart.value.width + (e.clientX - resizeStart.value.x))),
    height: Math.max(100, Math.min(window.innerHeight - position.value.y - 20, resizeStart.value.height + (e.clientY - resizeStart.value.y))),
  }
}

function stopResize() {
  isResizing.value = false
  document.removeEventListener('mousemove', onResize)
  document.removeEventListener('mouseup', stopResize)
  document.body.style.cursor = ''
  document.body.style.userSelect = ''
  saveState()
}

// Maximize/restore
function toggleMaximize() {
  isMaximized.value = !isMaximized.value
}

function close() {
  emit('update:modelValue', false)
}

onUnmounted(() => {
  document.removeEventListener('mousemove', onDrag)
  document.removeEventListener('mouseup', stopDrag)
  document.removeEventListener('mousemove', onResize)
  document.removeEventListener('mouseup', stopResize)
})
</script>

<template>
  <Teleport to="body">
    <div
      v-if="modelValue"
      ref="windowRef"
      class="fixed z-50 bg-background border border-border rounded-lg shadow-2xl flex flex-col overflow-hidden"
      :class="{ 'inset-4': isMaximized }"
      :style="isMaximized ? {} : {
        left: `${position.x}px`,
        top: `${position.y}px`,
        width: `${size.width}px`,
        height: `${size.height}px`,
      }"
    >
      <!-- Title bar -->
      <div
        class="h-8 bg-muted flex items-center justify-between px-2 shrink-0 select-none"
        :class="{ 'cursor-move': !isMaximized }"
        @mousedown="startDrag"
      >
        <div class="flex items-center gap-2 text-sm font-medium">
          <GripHorizontal class="h-4 w-4 text-muted-foreground" />
          <span>{{ title }}</span>
        </div>
        <div class="flex items-center gap-1" @mousedown.stop>
          <Button
            variant="ghost"
            size="icon"
            class="h-6 w-6"
            :title="isMaximized ? 'Restore' : 'Maximize'"
            @click="toggleMaximize"
          >
            <Minimize2 v-if="isMaximized" class="h-3 w-3" />
            <Maximize2 v-else class="h-3 w-3" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            class="h-6 w-6 hover:bg-destructive hover:text-destructive-foreground"
            title="Close"
            @click="close"
          >
            <X class="h-3 w-3" />
          </Button>
        </div>
      </div>

      <!-- Content -->
      <div class="flex-1 overflow-hidden">
        <slot />
      </div>

      <!-- Resize handle -->
      <div
        v-if="!isMaximized"
        class="absolute bottom-0 right-0 w-4 h-4 cursor-se-resize"
        @mousedown="startResize"
      >
        <div class="absolute bottom-1 right-1 w-2 h-2 border-r-2 border-b-2 border-muted-foreground/50" />
      </div>
    </div>
  </Teleport>
</template>
