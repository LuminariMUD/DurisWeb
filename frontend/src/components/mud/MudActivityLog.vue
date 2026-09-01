<script setup lang="ts">
import { ref, computed, watch, nextTick, onMounted } from 'vue'
import { useMudStore } from '@/stores/mudStore'
import { useMudChatNotifications } from '@/composables/useMudChatNotifications'
import { useFontSettings } from '@/composables/useFontSettings'
import { Button } from '@/components/ui/button'
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from '@/components/ui/resizable'
import { parseAnsiToHtml } from '@/utils/ansiParser'
import {
  Trash2,
  ArrowDown,
  Terminal,
  Zap,
  Clock,
  Settings,
  Activity,
  Merge,
  FolderTree,
} from 'lucide-vue-next'
import type { MudLogEntry } from '@/types/mud'
import AliasManager from './AliasManager.vue'
import TriggerManager from './TriggerManager.vue'
import TimerManager from './TimerManager.vue'
import SettingsDialog from './SettingsDialog.vue'
import GroupManager from './GroupManager.vue'
import ActionHotbar from './ActionHotbar.vue'

// Initialize MUD chat notifications watcher (must be called in a mounted component)
useMudChatNotifications()

// Font settings (initializes watcher for dynamic style injection)
useFontSettings()

const props = withDefaults(
  defineProps<{
    filter?: MudLogEntry['category'] | 'all'
    maxHeight?: string
    showControls?: boolean
  }>(),
  {
    filter: 'all',
    maxHeight: '400px',
    showControls: true,
  },
)

const store = useMudStore()
const scrollContainerRef = ref<HTMLElement | null>(null)
const autoScroll = ref(true)
const isAtBottom = ref(true)
const aliasManagerOpen = ref(false)
const triggerManagerOpen = ref(false)
const timerManagerOpen = ref(false)
const settingsDialogOpen = ref(false)
const groupManagerOpen = ref(false)

// Split-screen state
const isSplitView = ref(false)
const splitIndex = ref(0)
const liveScrollRef = ref<HTMLElement | null>(null)
const historyScrollRef = ref<HTMLElement | null>(null)

const filteredLog = computed(() => {
  if (props.filter === 'all') {
    return store.activityLog
  }
  return store.activityLog.filter((entry) => entry.category === props.filter)
})

// Split view computed properties
const historyLog = computed(() =>
  isSplitView.value ? filteredLog.value.slice(0, splitIndex.value) : [],
)
// Live pane shows ALL current messages (tail view - overflow hidden, aligned to bottom)
const liveLog = computed(() => filteredLog.value)

const character = computed(() => store.character)
const latency = computed(() => store.latency)

const scrollToBottom = () => {
  if (isSplitView.value) {
    // In split view, rejoin instead
    rejoinLive()
    return
  }
  if (scrollContainerRef.value) {
    scrollContainerRef.value.scrollTop = scrollContainerRef.value.scrollHeight
  }
}

const scrollToTop = () => {
  const container = isSplitView.value ? historyScrollRef.value : scrollContainerRef.value
  if (container) {
    container.scrollTop = 0
    autoScroll.value = false
  }
}

const scrollPageUp = () => {
  const container = isSplitView.value ? historyScrollRef.value : scrollContainerRef.value
  if (container) {
    const pageHeight = container.clientHeight * 0.9
    container.scrollTop -= pageHeight
    autoScroll.value = false
  }
}

const scrollPageDown = () => {
  const container = isSplitView.value ? historyScrollRef.value : scrollContainerRef.value
  if (container) {
    const pageHeight = container.clientHeight * 0.9
    container.scrollTop += pageHeight
  }
}

// Store scroll position before split
const savedScrollTop = ref(0)
const pendingWheelDelta = ref(0)

// instant split on wheel up (before scroll happens)
const handleWheel = (e: WheelEvent) => {
  if (e.deltaY < 0 && !isSplitView.value && scrollContainerRef.value) {
    e.preventDefault()
    savedScrollTop.value = scrollContainerRef.value.scrollTop
    pendingWheelDelta.value = e.deltaY
    splitIndex.value = filteredLog.value.length
    isSplitView.value = true
  }
}

const handleScroll = () => {
  if (scrollContainerRef.value) {
    const el = scrollContainerRef.value
    const threshold = 50
    isAtBottom.value = el.scrollHeight - el.scrollTop - el.clientHeight < threshold
    autoScroll.value = isAtBottom.value
  }
}

// Restore scroll position when split view activates and apply pending scroll
watch(isSplitView, async (newVal) => {
  if (newVal) {
    await nextTick()
    await nextTick()
    if (historyScrollRef.value) {
      const el = historyScrollRef.value
      // scroll up from bottom by a visible amount
      el.scrollTop = el.scrollHeight - el.clientHeight - 150
    }
    pendingWheelDelta.value = 0
  }
})

// Auto-rejoin when scrolling to bottom of history pane
const handleHistoryScroll = () => {
  if (historyScrollRef.value) {
    const el = historyScrollRef.value
    const threshold = 50
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < threshold
    if (atBottom) {
      rejoinLive()
    }
  }
}

// Rejoin live feed (exit split view)
const rejoinLive = () => {
  isSplitView.value = false
  autoScroll.value = true
  nextTick(() => {
    if (scrollContainerRef.value) {
      scrollContainerRef.value.scrollTop = scrollContainerRef.value.scrollHeight
    }
  })
}

const clearLog = () => {
  store.clearLog()
  isSplitView.value = false
}

// Initial scroll to bottom
onMounted(() => {
  nextTick(() => {
    if (scrollContainerRef.value) {
      scrollContainerRef.value.scrollTop = scrollContainerRef.value.scrollHeight
    }
  })
})

// Auto-scroll when new entries are added (normal mode only, live pane uses overflow-hidden)
watch(
  () => store.activityLog[store.activityLog.length - 1]?.id,
  async () => {
    if (!isSplitView.value && autoScroll.value) {
      await nextTick()
      if (scrollContainerRef.value) {
        scrollContainerRef.value.scrollTop = scrollContainerRef.value.scrollHeight
      }
    }
  },
)

// Expose scroll methods for keyboard bindings
defineExpose({
  scrollToTop,
  scrollToBottom,
  scrollPageUp,
  scrollPageDown,
})
</script>

<template>
  <div class="flex flex-col h-full">
    <div v-if="showControls" class="flex items-center justify-between px-2 py-1 border-b bg-muted/30">
      <span class="text-xs text-muted-foreground min-w-0 lg:min-w-[80px] hidden lg:inline">
        {{ filteredLog.length }} entries
      </span>
      <!-- Character Name -->
      <span v-if="character" class="font-semibold text-sm">{{ character.name }}</span>
      <div class="flex items-center gap-1 min-w-[80px] justify-end">
        <Button
          v-if="!isAtBottom"
          variant="ghost"
          size="sm"
          class="h-6 px-2"
          @click="scrollToBottom"
        >
          <ArrowDown class="h-3 w-3" />
        </Button>
        <!-- Latency indicator -->
        <span
          class="flex items-center gap-1 text-xs px-1"
          :class="{
            'text-muted-foreground': latency === null,
            'text-green-500': latency !== null && latency < 100,
            'text-yellow-500': latency !== null && latency >= 100 && latency < 300,
            'text-red-500': latency !== null && latency >= 300
          }"
          :title="latency !== null ? `Latency: ${latency}ms` : 'Measuring...'"
        >
          <Activity class="h-3 w-3" />
          {{ latency !== null ? `${latency}ms` : '...' }}
        </span>
        <Button
          variant="ghost"
          size="sm"
          class="h-6 px-2"
          title="Manage Aliases"
          @click="aliasManagerOpen = true"
        >
          <Terminal class="h-3 w-3" />
        </Button>
        <Button
          variant="ghost"
          size="sm"
          class="h-6 px-2"
          title="Manage Triggers"
          @click="triggerManagerOpen = true"
        >
          <Zap class="h-3 w-3" />
        </Button>
        <Button
          variant="ghost"
          size="sm"
          class="h-6 px-2"
          title="Manage Timers"
          @click="timerManagerOpen = true"
        >
          <Clock class="h-3 w-3" />
        </Button>
        <Button
          variant="ghost"
          size="sm"
          class="h-6 px-2"
          title="Settings (Export/Import)"
          @click="settingsDialogOpen = true"
        >
          <Settings class="h-3 w-3" />
        </Button>
        <Button
          variant="ghost"
          size="sm"
          class="h-6 px-2"
          title="Manage Groups"
          @click="groupManagerOpen = true"
        >
          <FolderTree class="h-3 w-3" />
        </Button>
        <Button variant="ghost" size="sm" class="h-6 px-2" title="Clear Log" @click="clearLog">
          <Trash2 class="h-3 w-3" />
        </Button>
      </div>
    </div>

    <!-- Alias Manager Dialog -->
    <AliasManager v-model:open="aliasManagerOpen" />

    <!-- Trigger Manager Dialog -->
    <TriggerManager v-model:open="triggerManagerOpen" />

    <!-- Timer Manager Dialog -->
    <TimerManager v-model:open="timerManagerOpen" />

    <!-- Settings Dialog -->
    <SettingsDialog v-model:open="settingsDialogOpen" />

    <!-- Group Manager Dialog -->
    <GroupManager v-model:open="groupManagerOpen" />

    <!-- Normal single-pane view -->
    <div v-if="!isSplitView" class="flex-1 relative">
      <div
        ref="scrollContainerRef"
        class="absolute inset-0 overflow-y-auto bg-black"
        @scroll="handleScroll"
        @wheel="handleWheel"
      >
        <div class="p-2 space-y-0.5 mud-output">
          <div
            v-if="filteredLog.length === 0"
            class="text-center py-8 text-gray-500"
          >
            No activity yet...
          </div>

          <div
            v-for="entry in filteredLog"
            :key="entry.id"
            class="px-1 rounded-sm min-h-[1.25em]"
            :class="entry.highlightClass"
          >
            <span
              v-if="entry.text"
              class="break-words whitespace-pre-wrap"
              v-html="parseAnsiToHtml(entry.text)"
            />
            <span v-else>&nbsp;</span>
          </div>
        </div>
      </div>
      <ActionHotbar />
    </div>

    <!-- Split-screen view (history + live) -->
    <ResizablePanelGroup v-else direction="vertical" class="flex-1">
      <!-- History pane (top) - frozen scrollback -->
      <ResizablePanel :default-size="70" :min-size="20">
        <div
          ref="historyScrollRef"
          class="h-full overflow-y-auto bg-black"
          @scroll="handleHistoryScroll"
          @mousedown.middle.prevent="rejoinLive"
        >
          <div class="p-2 space-y-0.5 mud-output">
            <div
              v-for="entry in historyLog"
              :key="entry.id"
              class="px-1 rounded-sm min-h-[1.25em]"
              :class="entry.highlightClass"
            >
              <span
                v-if="entry.text"
                class="break-words whitespace-pre-wrap"
                v-html="parseAnsiToHtml(entry.text)"
              />
              <span v-else>&nbsp;</span>
            </div>
          </div>
        </div>
      </ResizablePanel>

      <!-- Resizable handle with rejoin button -->
      <ResizableHandle with-handle class="bg-yellow-500/20 hover:bg-yellow-500/40 transition-colors">
        <Button
          variant="ghost"
          size="sm"
          class="h-5 px-2 text-xs text-yellow-400 hover:text-yellow-300 hover:bg-yellow-500/20"
          @click="rejoinLive"
        >
          <Merge class="h-3 w-3 mr-1" />
          Rejoin Live
        </Button>
      </ResizableHandle>

      <!-- Live pane (bottom) - fixed tail view, not scrollable -->
      <ResizablePanel :default-size="30" :min-size="10">
        <div
          ref="liveScrollRef"
          class="h-full overflow-hidden bg-black border-t border-yellow-500/30 flex flex-col justify-end"
          @mousedown.middle.prevent="rejoinLive"
        >
          <div class="p-2 space-y-0.5 mud-output">
            <div
              v-for="entry in liveLog"
              :key="entry.id"
              class="px-1 rounded-sm min-h-[1.25em]"
              :class="entry.highlightClass"
            >
              <span
                v-if="entry.text"
                class="break-words whitespace-pre-wrap"
                v-html="parseAnsiToHtml(entry.text)"
              />
              <span v-else>&nbsp;</span>
            </div>
          </div>
        </div>
      </ResizablePanel>
    </ResizablePanelGroup>
  </div>
</template>

<style scoped>
/* Ensure ANSI colors are visible */
:deep(.ansi-text) {
  display: inline;
}
</style>

