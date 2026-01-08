<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useMudStore } from '@/stores/mudStore'
import { Button } from '@/components/ui/button'
import { Zap } from 'lucide-vue-next'
import GodCommandDialog from './GodCommandDialog.vue'

const store = useMudStore()
const isOpen = ref(false)

// Only show FAB for level 57+ (immortal)
const isVisible = computed(() => (store.character?.level ?? 0) >= 57)

// Keyboard shortcut handler (Ctrl+G)
function handleKeydown(e: KeyboardEvent) {
  if (e.ctrlKey && e.key === 'g' && isVisible.value) {
    e.preventDefault()
    isOpen.value = true
  }
}

onMounted(() => {
  window.addEventListener('keydown', handleKeydown)
})

onUnmounted(() => {
  window.removeEventListener('keydown', handleKeydown)
})
</script>

<template>
  <div v-if="isVisible">
    <!-- Floating Action Button -->
    <Button
      class="fixed bottom-20 right-6 h-14 w-14 rounded-full shadow-lg z-50 hover:scale-105 transition-transform"
      variant="default"
      size="icon"
      @click="isOpen = true"
      title="God Commands (Ctrl+G)"
    >
      <Zap class="h-6 w-6" />
    </Button>

    <!-- Command Dialog -->
    <GodCommandDialog v-model:open="isOpen" />
  </div>
</template>
