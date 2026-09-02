<script setup lang="ts">
import { useInstallPrompt } from '@/composables/useInstallPrompt'
import { useSiteConfig } from '@/composables/useSiteConfig'
import { Download, X } from 'lucide-vue-next'

const { canInstall, install, dismiss } = useInstallPrompt()
const { siteTitle, isAvailable } = useSiteConfig()

const handleInstall = async () => {
  await install()
}
</script>

<template>
  <Transition name="float-up">
    <div
      v-if="canInstall && isAvailable"
      data-testid="install-banner"
      role="region"
      :aria-label="`Install ${siteTitle} app`"
      class="install-banner fixed left-3 right-3 z-50 max-w-md mx-auto pointer-events-none"
    >
      <div class="pointer-events-auto bg-gray-900 border border-gray-700 rounded-xl shadow-2xl p-3 sm:p-4 flex items-center gap-3 sm:gap-4">
        <!-- icon -->
        <div class="flex-shrink-0 w-10 h-10 sm:w-12 sm:h-12 bg-gradient-to-br from-cyan-500 to-cyan-600 rounded-xl flex items-center justify-center shadow-lg">
          <Download class="w-5 h-5 sm:w-6 sm:h-6 text-white" />
        </div>

        <!-- text -->
        <div class="flex-1 min-w-0">
          <p class="text-sm font-semibold text-gray-100">
            install {{ siteTitle }}
          </p>
          <p class="text-xs text-gray-400">
            quick access & offline support
          </p>
        </div>

        <!-- buttons -->
        <div class="flex items-center gap-2 flex-shrink-0">
          <button
            type="button"
            @click="handleInstall"
            class="min-h-11 min-w-20 px-4 py-2 bg-cyan-600 hover:bg-cyan-500 text-white text-sm font-medium rounded-lg transition-colors"
          >
            install
          </button>
          <button
            type="button"
            @click="dismiss"
            class="inline-flex min-h-11 min-w-11 items-center justify-center p-1.5 text-gray-500 hover:text-gray-300 hover:bg-gray-800 rounded-lg transition-colors"
            aria-label="Dismiss install prompt"
          >
            <X class="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.install-banner {
  bottom: calc(4rem + 0.5rem + env(safe-area-inset-bottom, 0px));
}

@media (min-width: 1024px) {
  .install-banner {
    bottom: 1rem;
  }
}

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
