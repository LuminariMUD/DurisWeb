<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue';
import { useTerminal } from '@/composables/useTerminal';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { PlugZap, Unplug, Trash2, Maximize2 } from 'lucide-vue-next';

const terminalContainer = ref<HTMLElement | null>(null);
const isFullscreen = ref(false);

const {
  isConnected,
  sessionId,
  error,
  initTerminal,
  connect,
  disconnect,
  fit,
  clear,
  cleanup
} = useTerminal();

onMounted(() => {
  if (terminalContainer.value) {
    initTerminal(terminalContainer.value);
  }
});

onUnmounted(() => {
  cleanup();
});

function handleConnect() {
  connect();
}

function handleDisconnect() {
  disconnect();
}

function handleClear() {
  clear();
}

function toggleFullscreen() {
  isFullscreen.value = !isFullscreen.value;
  // Wait for DOM update then fit
  setTimeout(() => fit(), 100);
}
</script>

<template>
  <div
    :class="[
      'flex flex-col bg-zinc-900 rounded-lg overflow-hidden',
      isFullscreen ? 'fixed inset-0 z-50' : 'h-full'
    ]"
  >
    <!-- Terminal Header -->
    <div class="flex items-center justify-between px-4 py-2 bg-zinc-800 border-b border-zinc-700">
      <div class="flex items-center gap-3">
        <!-- Connection Status -->
        <div class="flex items-center gap-2">
          <div
            :class="[
              'w-2.5 h-2.5 rounded-full',
              isConnected ? 'bg-green-500 animate-pulse' : 'bg-zinc-500'
            ]"
          />
          <span class="text-sm text-zinc-400">
            {{ isConnected ? 'Connected' : 'Disconnected' }}
          </span>
        </div>

        <!-- Session ID -->
        <Badge v-if="sessionId" variant="outline" class="text-xs">
          Session #{{ sessionId }}
        </Badge>
      </div>

      <!-- Actions -->
      <div class="flex items-center gap-2">
        <Button
          v-if="!isConnected"
          size="sm"
          variant="default"
          @click="handleConnect"
          class="gap-1.5"
        >
          <PlugZap class="w-4 h-4" />
          Connect
        </Button>

        <Button
          v-else
          size="sm"
          variant="destructive"
          @click="handleDisconnect"
          class="gap-1.5"
        >
          <Unplug class="w-4 h-4" />
          Disconnect
        </Button>

        <Button
          size="sm"
          variant="ghost"
          @click="handleClear"
          class="gap-1.5"
          title="Clear terminal"
        >
          <Trash2 class="w-4 h-4" />
        </Button>

        <Button
          size="sm"
          variant="ghost"
          @click="toggleFullscreen"
          class="gap-1.5"
          title="Toggle fullscreen"
        >
          <Maximize2 class="w-4 h-4" />
        </Button>
      </div>
    </div>

    <!-- Error Display -->
    <div
      v-if="error"
      class="px-4 py-2 bg-red-900/30 border-b border-red-800 text-red-300 text-sm"
    >
      {{ error }}
    </div>

    <!-- Terminal Container -->
    <div
      ref="terminalContainer"
      class="flex-1 p-2 min-h-0"
      @click="() => {}"
    />

    <!-- Instructions (when disconnected) -->
    <div
      v-if="!isConnected && !error"
      class="absolute inset-0 flex items-center justify-center pointer-events-none"
    >
      <div class="text-center text-zinc-500 p-6">
        <p class="text-lg mb-2">MUD Server Terminal</p>
        <p class="text-sm">Click "Connect" to start a terminal session</p>
        <p class="text-xs mt-2 text-zinc-600">
          Restricted to MUD folder - Auto-attaches to screen session
        </p>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* Ensure terminal fills container properly */
:deep(.xterm) {
  height: 100%;
  padding: 8px;
}

:deep(.xterm-viewport) {
  overflow-y: auto !important;
}

:deep(.xterm-screen) {
  height: 100%;
}
</style>
