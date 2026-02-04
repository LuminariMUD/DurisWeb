<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, nextTick } from 'vue'
import { useHotbarSettings } from '@/composables/useHotbarSettings'
import { useMudConnection } from '@/composables/useMudConnection'
import * as icons from 'lucide-vue-next'
import type { Component } from 'vue'

const { settings, enabledButtons, isVertical, setPosition, setSnapEdge, saveSettings } = useHotbarSettings()
const { sendGameCommand } = useMudConnection()

// clamp position to container on mount (fixes off-screen positioning)
onMounted(async () => {
  await nextTick()
  const container = hotbarRef.value?.parentElement
  if (!container) return

  const hotbarSize = 50
  const maxX = container.offsetWidth - hotbarSize
  const maxY = container.offsetHeight - hotbarSize
  let needsSave = false

  if (settings.value.position.x > maxX || settings.value.position.x < 0) {
    settings.value.position.x = Math.max(8, Math.min(settings.value.position.x, maxX - 8))
    needsSave = true
  }
  if (settings.value.position.y > maxY || settings.value.position.y < 0) {
    settings.value.position.y = Math.max(8, Math.min(settings.value.position.y, maxY - 8))
    needsSave = true
  }

  if (needsSave) {
    saveSettings()
  }
})

// button size classes
const sizeClasses = computed(() => {
  switch (settings.value.buttonSize) {
    case 'small': return { button: 'h-7 w-7', icon: 'h-3 w-3' }
    case 'large': return { button: 'h-12 w-12', icon: 'h-6 w-6' }
    default: return { button: 'h-9 w-9', icon: 'h-4 w-4' }
  }
})

// drag state
const isDragging = ref(false)
const dragStart = ref({ x: 0, y: 0 })
const hotbarRef = ref<HTMLElement | null>(null)

// get icon component by name
function getIcon(name: string): Component {
  const iconName = name as keyof typeof icons
  return (icons[iconName] as Component) || icons.CircleDot
}

// execute button command
function executeCommand(command: string) {
  if (command && !isDragging.value) {
    sendGameCommand(command)
  }
}

// get client coordinates from mouse or touch event
function getClientCoords(e: MouseEvent | TouchEvent): { x: number; y: number } {
  if ('touches' in e && e.touches.length > 0) {
    const touch = e.touches[0]
    if (touch) {
      return { x: touch.clientX, y: touch.clientY }
    }
  }
  if ('clientX' in e) {
    return { x: e.clientX, y: e.clientY }
  }
  return { x: 0, y: 0 }
}

// start drag
function startDrag(e: MouseEvent | TouchEvent) {
  // ignore if clicking a button
  if ((e.target as HTMLElement).closest('button')) return

  e.preventDefault()
  isDragging.value = true

  const coords = getClientCoords(e)
  dragStart.value = {
    x: coords.x - settings.value.position.x,
    y: coords.y - settings.value.position.y,
  }

  document.addEventListener('mousemove', onDrag)
  document.addEventListener('mouseup', endDrag)
  document.addEventListener('touchmove', onDrag, { passive: false })
  document.addEventListener('touchend', endDrag)
  document.body.style.userSelect = 'none'
}

// handle drag - full 2D movement within container
function onDrag(e: MouseEvent | TouchEvent) {
  if (!isDragging.value) return
  e.preventDefault()

  const coords = getClientCoords(e)
  let newX = coords.x - dragStart.value.x
  let newY = coords.y - dragStart.value.y

  // clamp to container
  const container = hotbarRef.value?.parentElement
  const barWidth = hotbarRef.value?.offsetWidth || 50
  const barHeight = hotbarRef.value?.offsetHeight || 120
  const maxX = container ? container.offsetWidth - barWidth - 8 : 500
  const maxY = container ? container.offsetHeight - barHeight - 8 : 500
  newX = Math.max(8, Math.min(newX, maxX))
  newY = Math.max(8, Math.min(newY, maxY))

  setPosition(newX, newY)
}

// end drag and detect snap edge
function endDrag() {
  isDragging.value = false

  document.removeEventListener('mousemove', onDrag)
  document.removeEventListener('mouseup', endDrag)
  document.removeEventListener('touchmove', onDrag)
  document.removeEventListener('touchend', endDrag)
  document.body.style.userSelect = ''

  // detect snap edge and align to edge
  const container = hotbarRef.value?.parentElement
  if (container) {
    let { x, y } = settings.value.position
    const currentWidth = hotbarRef.value?.offsetWidth || 50
    const currentHeight = hotbarRef.value?.offsetHeight || 120
    const threshold = 50
    const padding = 8

    const distLeft = x
    const distRight = container.offsetWidth - x - currentWidth
    const distTop = y
    const distBottom = container.offsetHeight - y - currentHeight

    const minDist = Math.min(distLeft, distRight, distTop, distBottom)

    if (minDist < threshold) {
      // predict dimensions after orientation change
      const willBeVertical = distLeft === minDist || distRight === minDist
      const isAutoMode = settings.value.orientation === 'auto'
      const currentlyVertical = isVertical.value

      // calculate what dimensions will be after snap
      let barWidth = currentWidth
      let barHeight = currentHeight

      if (isAutoMode && willBeVertical !== currentlyVertical) {
        // orientation will change, swap dimensions
        barWidth = currentHeight
        barHeight = currentWidth
      }

      if (distLeft === minDist) {
        setSnapEdge('left')
        x = padding
      } else if (distRight === minDist) {
        setSnapEdge('right')
        x = container.offsetWidth - barWidth - padding
      } else if (distTop === minDist) {
        setSnapEdge('top')
        y = padding
      } else if (distBottom === minDist) {
        setSnapEdge('bottom')
        y = container.offsetHeight - barHeight - padding
      }
      setPosition(x, y)
    } else {
      setSnapEdge('none')
    }
  }

  saveSettings()
}

// computed styles
const barStyle = computed(() => ({
  left: `${settings.value.position.x}px`,
  top: `${settings.value.position.y}px`,
  cursor: isDragging.value ? 'grabbing' : 'grab',
}))

// cleanup if component unmounts during drag
onUnmounted(() => {
  document.removeEventListener('mousemove', onDrag)
  document.removeEventListener('mouseup', endDrag)
  document.removeEventListener('touchmove', onDrag)
  document.removeEventListener('touchend', endDrag)
})
</script>

<template>
  <div
    v-if="settings.visible && enabledButtons.length > 0"
    ref="hotbarRef"
    :class="[
      'absolute z-10 flex gap-1 p-1 bg-black/60 rounded-lg border border-white/10',
      isVertical ? 'flex-col' : 'flex-row',
      isDragging ? 'shadow-lg shadow-white/10' : '',
    ]"
    :style="barStyle"
    @mousedown="startDrag"
    @touchstart="startDrag"
  >
    <button
      v-for="btn in enabledButtons"
      :key="btn.id"
      :title="btn.command"
      :class="[sizeClasses.button, 'rounded flex items-center justify-center text-white hover:brightness-125 active:brightness-75 transition-all touch-manipulation']"
      :style="{ backgroundColor: btn.color || '#6b7280' }"
      @click="executeCommand(btn.command)"
    >
      <component :is="getIcon(btn.icon)" :class="sizeClasses.icon" />
    </button>
  </div>
</template>
