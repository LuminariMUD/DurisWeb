<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { Button } from '@/components/ui/button'

const emit = defineEmits<{
  quote: [data: { selectedText: string; postId: number }]
}>()

const showButton = ref(false)
const buttonPosition = ref({ top: 0, left: 0 })
const selectedText = ref('')
const selectedPostId = ref<number | null>(null)

function handleSelection() {
  const selection = window.getSelection()
  const text = selection?.toString().trim()

  if (text && text.length > 0) {
    selectedText.value = text

    // Find the post ID from the selected element's parent
    const range = selection!.getRangeAt(0)
    const container = range.commonAncestorContainer
    const element = container.nodeType === Node.TEXT_NODE
      ? container.parentElement
      : container as HTMLElement

    // Find the closest post container (has data-post-id attribute)
    const postContainer = element?.closest('[data-post-id]') as HTMLElement
    if (postContainer) {
      selectedPostId.value = parseInt(postContainer.dataset.postId || '0')
    }

    // Get the position of the selection
    const rect = range.getBoundingClientRect()

    buttonPosition.value = {
      top: rect.bottom + window.scrollY + 8,
      left: rect.left + window.scrollX + (rect.width / 2) - 40 // Center the button
    }

    showButton.value = true
  } else {
    showButton.value = false
    selectedText.value = ''
    selectedPostId.value = null
  }
}

function handleQuoteClick() {
  if (selectedPostId.value) {
    emit('quote', {
      selectedText: selectedText.value,
      postId: selectedPostId.value
    })
  }
  showButton.value = false
  selectedText.value = ''
  selectedPostId.value = null

  // Clear selection
  window.getSelection()?.removeAllRanges()
}

function handleClickOutside(event: MouseEvent) {
  const target = event.target as HTMLElement
  if (!target.closest('.selection-quote-button')) {
    showButton.value = false
  }
}

onMounted(() => {
  document.addEventListener('mouseup', handleSelection)
  document.addEventListener('mousedown', handleClickOutside)
})

onUnmounted(() => {
  document.removeEventListener('mouseup', handleSelection)
  document.removeEventListener('mousedown', handleClickOutside)
})
</script>

<template>
  <Teleport to="body">
    <Transition name="fade">
      <div
        v-if="showButton"
        class="selection-quote-button fixed z-50"
        :style="{
          top: `${buttonPosition.top}px`,
          left: `${buttonPosition.left}px`
        }"
      >
        <Button
          size="sm"
          @click="handleQuoteClick"
          class="shadow-lg"
        >
          <span class="mr-1">📋</span>
          Quote
        </Button>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
