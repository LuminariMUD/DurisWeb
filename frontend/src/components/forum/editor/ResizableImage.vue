<script setup lang="ts">
import { ref, computed } from 'vue'
import { NodeViewWrapper, type NodeViewProps } from '@tiptap/vue-3'

const props = defineProps<NodeViewProps>()

const imageRef = ref<HTMLImageElement>()
const isResizing = ref(false)
const startX = ref(0)
const startWidth = ref(0)

const imageWidth = computed(() => props.node.attrs.width || null)
const alignment = computed(() => props.node.attrs.alignment || 'center')
const isRounded = computed(() => props.node.attrs.rounded || false)

const wrapperClass = computed(() => {
  const classes = ['resizable-image-wrapper']
  if (props.selected) classes.push('selected')
  classes.push(`align-${alignment.value}`)
  return classes.join(' ')
})

const imageClass = computed(() => {
  const classes = ['resizable-image']
  if (isRounded.value) classes.push('rounded-xl')
  return classes.join(' ')
})

function startResize(event: MouseEvent, direction: 'left' | 'right') {
  event.preventDefault()
  event.stopPropagation()

  isResizing.value = true
  startX.value = event.clientX
  startWidth.value = imageRef.value?.offsetWidth || 200

  const onMouseMove = (e: MouseEvent) => {
    if (!isResizing.value) return

    const diff = direction === 'right' ? e.clientX - startX.value : startX.value - e.clientX

    const newWidth = Math.max(50, Math.min(800, startWidth.value + diff))
    props.updateAttributes({ width: newWidth })
  }

  const onMouseUp = () => {
    isResizing.value = false
    document.removeEventListener('mousemove', onMouseMove)
    document.removeEventListener('mouseup', onMouseUp)
  }

  document.addEventListener('mousemove', onMouseMove)
  document.addEventListener('mouseup', onMouseUp)
}

// Touch support
function startTouchResize(event: TouchEvent, direction: 'left' | 'right') {
  event.preventDefault()
  event.stopPropagation()

  const touch = event.touches[0]
  if (!touch) return

  isResizing.value = true
  startX.value = touch.clientX
  startWidth.value = imageRef.value?.offsetWidth || 200

  const onTouchMove = (e: TouchEvent) => {
    if (!isResizing.value) return

    const t = e.touches[0]
    if (!t) return

    const diff = direction === 'right' ? t.clientX - startX.value : startX.value - t.clientX

    const newWidth = Math.max(50, Math.min(800, startWidth.value + diff))
    props.updateAttributes({ width: newWidth })
  }

  const onTouchEnd = () => {
    isResizing.value = false
    document.removeEventListener('touchmove', onTouchMove)
    document.removeEventListener('touchend', onTouchEnd)
  }

  document.addEventListener('touchmove', onTouchMove, { passive: false })
  document.addEventListener('touchend', onTouchEnd)
}
</script>

<template>
  <NodeViewWrapper :class="wrapperClass">
    <div class="image-container" :style="{ width: imageWidth ? `${imageWidth}px` : 'auto' }">
      <img
        ref="imageRef"
        :src="node.attrs.src"
        :alt="node.attrs.alt || ''"
        :title="node.attrs.title || ''"
        :class="imageClass"
        :style="{ width: '100%', height: 'auto' }"
        draggable="false"
      />

      <!-- Resize handles (visible when selected) -->
      <template v-if="selected">
        <!-- Left handle -->
        <div
          class="resize-handle left"
          @mousedown="startResize($event, 'left')"
          @touchstart="startTouchResize($event, 'left')"
        >
          <div class="handle-bar" />
        </div>

        <!-- Right handle -->
        <div
          class="resize-handle right"
          @mousedown="startResize($event, 'right')"
          @touchstart="startTouchResize($event, 'right')"
        >
          <div class="handle-bar" />
        </div>

        <!-- Size indicator -->
        <div v-if="imageWidth" class="size-indicator">
          {{ imageWidth }}px
        </div>
      </template>
    </div>
  </NodeViewWrapper>
</template>

<style scoped>
.resizable-image-wrapper {
  display: block;
  width: 100%;
}

.resizable-image-wrapper.align-left {
  text-align: left;
}

.resizable-image-wrapper.align-center {
  text-align: center;
}

.resizable-image-wrapper.align-right {
  text-align: right;
}

.image-container {
  display: inline-block;
  position: relative;
  max-width: 100%;
}

.resizable-image-wrapper.selected .resizable-image {
  outline: 2px solid rgb(34 211 238);
  outline-offset: 2px;
}

.resizable-image {
  display: block;
  width: 100%;
  height: auto;
}

.resize-handle {
  position: absolute;
  top: 0;
  bottom: 0;
  width: 12px;
  cursor: ew-resize;
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 0;
  transition: opacity 0.15s;
}

.resizable-image-wrapper.selected .resize-handle {
  opacity: 1;
}

.resize-handle.left {
  left: -6px;
}

.resize-handle.right {
  right: -6px;
}

.handle-bar {
  width: 4px;
  height: 40px;
  max-height: 50%;
  background: rgb(34 211 238);
  border-radius: 2px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.3);
}

.resize-handle:hover .handle-bar {
  background: rgb(103 232 249);
}

.size-indicator {
  position: absolute;
  bottom: -24px;
  left: 50%;
  transform: translateX(-50%);
  background: rgb(17 24 39);
  border: 1px solid rgb(55 65 81);
  color: rgb(156 163 175);
  font-size: 11px;
  padding: 2px 6px;
  border-radius: 4px;
  white-space: nowrap;
}
</style>
