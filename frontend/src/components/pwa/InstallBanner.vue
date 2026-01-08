<script setup lang="ts">
import { useInstallPrompt } from '@/composables/useInstallPrompt'
import { Download, X } from 'lucide-vue-next'

const { canInstall, install, dismiss } = useInstallPrompt()

const handleInstall = async () => {
  await install()
}
</script>

<template>
  <Transition name="float-up">
    <div
      v-if="canInstall"
      class="fixed bottom-20 lg:bottom-4 left-4 right-4 z-50 max-w-md mx-auto"
    >
      <div class="bg-gray-900 border border-gray-700 rounded-xl shadow-2xl p-4 flex items-center gap-4">
        <!-- icon -->
        <div class="flex-shrink-0 w-12 h-12 bg-gradient-to-br from-cyan-500 to-cyan-600 rounded-xl flex items-center justify-center shadow-lg">
          <Download class="w-6 h-6 text-white" />
        </div>

        <!-- text -->
        <div class="flex-1 min-w-0">
          <p class="text-sm font-semibold text-gray-100">
            install newduris
          </p>
          <p class="text-xs text-gray-400">
            quick access & offline support
          </p>
        </div>

        <!-- buttons -->
        <div class="flex items-center gap-2 flex-shrink-0">
          <button
            @click="handleInstall"
            class="px-4 py-2 bg-cyan-600 hover:bg-cyan-500 text-white text-sm font-medium rounded-lg transition-colors"
          >
            install
          </button>
          <button
            @click="dismiss"
            class="p-1.5 text-gray-500 hover:text-gray-300 hover:bg-gray-800 rounded-lg transition-colors"
            aria-label="dismiss"
          >
            <X class="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.float-up-enter-active,
.float-up-leave-active {
  transition: transform 0.3s ease, opacity 0.3s ease;
}

.float-up-enter-from,
.float-up-leave-to {
  transform: translateY(100%);
  opacity: 0;
}
</style>
