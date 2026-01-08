<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useMudStore } from '@/stores/mudStore'
import { useMudConnection } from '@/composables/useMudConnection'
import { useKeypadBindings } from '@/composables/useKeypadBindings'
import { useTimers } from '@/composables/useTimers'
import MudStatusBar from './MudStatusBar.vue'
import MudRoomDisplay from './MudRoomDisplay.vue'
import MudActivityLog from './MudActivityLog.vue'
import MudCommandInput from './MudCommandInput.vue'
import MudChatPanel from './MudChatPanel.vue'
import MudAffects from './MudAffects.vue'
import MudMap from './MudMap.vue'
import ShipRadar from './ShipRadar.vue'
import FloatingMapWindow from './FloatingMapWindow.vue'
import GodCommandFab from './GodCommandFab.vue'
import GmcpDebugModal from './GmcpDebugModal.vue'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useRouter } from 'vue-router'
import { Map, MapPin, Sparkles, DoorOpen, Info, Star, Coins, Home, Swords, MessageSquare, Menu, Gavel, User, Bell, BookOpen, BarChart3 } from 'lucide-vue-next'
import { Progress } from '@/components/ui/progress'
import QuestPopover from './QuestPopover.vue'

const emit = defineEmits<{
  (e: 'logout'): void
}>()

import { useAuth } from '@/composables/useAuth'

const router = useRouter()
const { accountName } = useAuth()
const { disconnect } = useMudConnection()
const mudStore = useMudStore()
const { startAllTimers } = useTimers()

// Refs for keypad bindings
const commandInputRef = ref<InstanceType<typeof MudCommandInput> | null>(null)
const activityLogRef = ref<InstanceType<typeof MudActivityLog> | null>(null)

// Initialize keypad bindings (numpad + arrow keys for movement, scroll keys for log)
useKeypadBindings({
  onFocusInput: () => commandInputRef.value?.focus(),
  onScrollPageUp: () => activityLogRef.value?.scrollPageUp(),
  onScrollPageDown: () => activityLogRef.value?.scrollPageDown(),
  onScrollToTop: () => activityLogRef.value?.scrollToTop(),
  onScrollToBottom: () => activityLogRef.value?.scrollToBottom(),
})

const handleLogout = () => {
  disconnect()
  emit('logout')
}

// Map detach state
const isMapDetached = ref(false)

// Panel minimized states
const isChatMinimized = ref(false)
const isMapMinimized = ref(false)
const isAffectsMinimized = ref(false)
const isRoomMinimized = ref(false)

function handleMapDetach() {
  isMapDetached.value = true
}

function handleMapDock() {
  isMapDetached.value = false
}

// Radar state
const isRadarOpen = ref(false)

function handleOpenRadar() {
  isRadarOpen.value = true
}

function handleCloseRadar() {
  isRadarOpen.value = false
}

// Mobile sheet state
const isMobileSheetOpen = ref(false)
const mobileActiveTab = ref('info')

// Draggable FAB state
const FAB_STORAGE_KEY = 'mud-fab-position'
const fabPosition = ref({ x: 16, y: 64 }) // bottom-right offset from edges
const isDraggingFab = ref(false)
const dragStart = ref({ x: 0, y: 0 })
const fabStartPos = ref({ x: 0, y: 0 })
const longPressTimer = ref<ReturnType<typeof setTimeout> | null>(null)
const LONG_PRESS_DURATION = 400 // ms

// Load FAB position from localStorage
const loadFabPosition = () => {
  const saved = localStorage.getItem(FAB_STORAGE_KEY)
  if (saved) {
    try {
      const pos = JSON.parse(saved)
      fabPosition.value = pos
    } catch {}
  }
}

// Save FAB position to localStorage
const saveFabPosition = () => {
  localStorage.setItem(FAB_STORAGE_KEY, JSON.stringify(fabPosition.value))
}

// FAB long-press and drag handlers
const startFabTouch = (e: MouseEvent | TouchEvent) => {
  const clientX = 'touches' in e ? (e.touches[0]?.clientX ?? 0) : e.clientX
  const clientY = 'touches' in e ? (e.touches[0]?.clientY ?? 0) : e.clientY
  dragStart.value = { x: clientX, y: clientY }
  fabStartPos.value = { ...fabPosition.value }

  // Start long-press timer
  longPressTimer.value = setTimeout(() => {
    isDraggingFab.value = true
    // Haptic feedback if available
    if (navigator.vibrate) navigator.vibrate(50)
  }, LONG_PRESS_DURATION)

  document.addEventListener('mousemove', handleFabDrag)
  document.addEventListener('mouseup', stopFabTouch)
  document.addEventListener('touchmove', handleFabDrag, { passive: false })
  document.addEventListener('touchend', stopFabTouch)
}

const handleFabDrag = (e: MouseEvent | TouchEvent) => {
  const clientX = 'touches' in e ? (e.touches[0]?.clientX ?? 0) : e.clientX
  const clientY = 'touches' in e ? (e.touches[0]?.clientY ?? 0) : e.clientY

  // Cancel long-press if moved before timer fires
  const moved = Math.abs(clientX - dragStart.value.x) > 10 || Math.abs(clientY - dragStart.value.y) > 10
  if (moved && longPressTimer.value && !isDraggingFab.value) {
    clearTimeout(longPressTimer.value)
    longPressTimer.value = null
  }

  if (!isDraggingFab.value) return
  e.preventDefault()

  const deltaX = dragStart.value.x - clientX
  const deltaY = dragStart.value.y - clientY

  // Calculate new position (from bottom-right)
  const newX = Math.max(16, Math.min(window.innerWidth - 64, fabStartPos.value.x + deltaX))
  const newY = Math.max(80, Math.min(window.innerHeight - 64, fabStartPos.value.y + deltaY))

  fabPosition.value = { x: newX, y: newY }
}

const stopFabTouch = () => {
  // Clear long-press timer
  if (longPressTimer.value) {
    clearTimeout(longPressTimer.value)
    longPressTimer.value = null
  }

  // If was dragging, save position
  if (isDraggingFab.value) {
    isDraggingFab.value = false
    saveFabPosition()
  }

  document.removeEventListener('mousemove', handleFabDrag)
  document.removeEventListener('mouseup', stopFabTouch)
  document.removeEventListener('touchmove', handleFabDrag)
  document.removeEventListener('touchend', stopFabTouch)
}

const handleFabClick = () => {
  // Only open sheet if not dragging
  if (!isDraggingFab.value) {
    isMobileSheetOpen.value = true
  }
}

// Computed values for mobile info tab
const vitals = computed(() => mudStore.vitals)
const expPercent = computed(() => mudStore.expPercent)
const quest = computed(() => mudStore.quest)

// Format large numbers with commas
const formatNumber = (num: number): string => {
  return num.toLocaleString()
}

// Navigate to a page and close sheet
const navigateTo = (path: string) => {
  isMobileSheetOpen.value = false
  router.push(path)
}

// Check if we're on mobile (for responsive behavior)
const isMobile = ref(false)
const checkMobile = () => {
  isMobile.value = window.innerWidth < 1024
}
onMounted(() => {
  checkMobile()
  loadFabPosition()
  window.addEventListener('resize', checkMobile)
})
onUnmounted(() => {
  window.removeEventListener('resize', checkMobile)
})

// GMCP Debug modal (triggered from dev console)
const showGmcpDebug = ref(false)

// Resizable panel state
const STORAGE_KEY_WIDTH = 'mud-panel-width'
const STORAGE_KEY_HEIGHTS = 'mud-panel-heights'
const STORAGE_KEY_CHAT_HEIGHT = 'mud-chat-height'

const DEFAULT_WIDTH = 400
const MIN_WIDTH = 280
const MAX_WIDTH = 600

// Height percentages (map + affects + room = 100%)
const DEFAULT_MAP_PERCENT = 30
const DEFAULT_ROOM_PERCENT = 30
const MIN_PERCENT = 2
const MAX_PERCENT = 98

// Chat panel height
const DEFAULT_CHAT_HEIGHT = 176 // h-44 = 11rem = 176px
const MIN_CHAT_HEIGHT = 50
// No max - calculated dynamically based on viewport

const rightPanelWidth = ref(DEFAULT_WIDTH)
const mapPercent = ref(DEFAULT_MAP_PERCENT)
const roomPercent = ref(DEFAULT_ROOM_PERCENT)
const chatHeight = ref(DEFAULT_CHAT_HEIGHT)

const isResizingWidth = ref(false)
const isResizingMap = ref(false)
const isResizingRoom = ref(false)
const isResizingChat = ref(false)

const containerRef = ref<HTMLElement | null>(null)
const rightPanelRef = ref<HTMLElement | null>(null)
const chatPanelRef = ref<HTMLElement | null>(null)

// Load saved sizes from localStorage
onMounted(() => {
  // Start enabled timers when game client mounts (handles page navigation)
  startAllTimers()

  // Expose debug function to window for dev console
  // @ts-expect-error - Debug function for dev console
  window.tunjuk_gcmp = () => {
    showGmcpDebug.value = true
  }

  const savedWidth = localStorage.getItem(STORAGE_KEY_WIDTH)
  if (savedWidth) {
    const width = parseInt(savedWidth, 10)
    if (width >= MIN_WIDTH && width <= MAX_WIDTH) {
      rightPanelWidth.value = width
    }
  }

  const savedHeights = localStorage.getItem(STORAGE_KEY_HEIGHTS)
  if (savedHeights) {
    try {
      const heights = JSON.parse(savedHeights)
      if (heights.mapPercent >= MIN_PERCENT && heights.mapPercent <= MAX_PERCENT) {
        mapPercent.value = heights.mapPercent
      }
      if (heights.roomPercent >= MIN_PERCENT && heights.roomPercent <= MAX_PERCENT) {
        roomPercent.value = heights.roomPercent
      }
    } catch {
      // Ignore parse errors
    }
  }

  const savedChatHeight = localStorage.getItem(STORAGE_KEY_CHAT_HEIGHT)
  if (savedChatHeight) {
    const height = parseInt(savedChatHeight, 10)
    if (height >= MIN_CHAT_HEIGHT && height <= window.innerHeight - 150) {
      chatHeight.value = height
    }
  }
})

const saveHeights = () => {
  localStorage.setItem(STORAGE_KEY_HEIGHTS, JSON.stringify({
    mapPercent: mapPercent.value,
    roomPercent: roomPercent.value,
  }))
}

// Computed affects percent (remaining space)
const affectsPercent = computed(() => 100 - mapPercent.value - roomPercent.value)

// Width resize handlers
const startWidthResize = (e: MouseEvent) => {
  e.preventDefault()
  isResizingWidth.value = true
  document.addEventListener('mousemove', handleWidthResize)
  document.addEventListener('mouseup', stopWidthResize)
  document.body.style.cursor = 'col-resize'
  document.body.style.userSelect = 'none'
}

const handleWidthResize = (e: MouseEvent) => {
  if (!isResizingWidth.value || !containerRef.value) return

  const containerRect = containerRef.value.getBoundingClientRect()
  const newWidth = containerRect.right - e.clientX

  if (newWidth >= MIN_WIDTH && newWidth <= MAX_WIDTH) {
    rightPanelWidth.value = newWidth
  }
}

const stopWidthResize = () => {
  isResizingWidth.value = false
  document.removeEventListener('mousemove', handleWidthResize)
  document.removeEventListener('mouseup', stopWidthResize)
  document.body.style.cursor = ''
  document.body.style.userSelect = ''
  localStorage.setItem(STORAGE_KEY_WIDTH, rightPanelWidth.value.toString())
}

// Map height resize handlers
const startMapResize = (e: MouseEvent) => {
  e.preventDefault()
  isResizingMap.value = true
  document.addEventListener('mousemove', handleMapResize)
  document.addEventListener('mouseup', stopMapResize)
  document.body.style.cursor = 'row-resize'
  document.body.style.userSelect = 'none'
}

const handleMapResize = (e: MouseEvent) => {
  if (!isResizingMap.value || !rightPanelRef.value) return

  const panelRect = rightPanelRef.value.getBoundingClientRect()
  const panelHeight = panelRect.height
  const newHeight = e.clientY - panelRect.top
  const newPercent = Math.round((newHeight / panelHeight) * 100)

  if (newPercent >= MIN_PERCENT && newPercent <= MAX_PERCENT) {
    mapPercent.value = newPercent
  }
}

const stopMapResize = () => {
  isResizingMap.value = false
  document.removeEventListener('mousemove', handleMapResize)
  document.removeEventListener('mouseup', stopMapResize)
  document.body.style.cursor = ''
  document.body.style.userSelect = ''
  saveHeights()
}

// Room height resize handlers
const startRoomResize = (e: MouseEvent) => {
  e.preventDefault()
  isResizingRoom.value = true
  document.addEventListener('mousemove', handleRoomResize)
  document.addEventListener('mouseup', stopRoomResize)
  document.body.style.cursor = 'row-resize'
  document.body.style.userSelect = 'none'
}

const handleRoomResize = (e: MouseEvent) => {
  if (!isResizingRoom.value || !rightPanelRef.value) return

  const panelRect = rightPanelRef.value.getBoundingClientRect()
  const panelHeight = panelRect.height
  const newHeight = panelRect.bottom - e.clientY
  const newPercent = Math.round((newHeight / panelHeight) * 100)

  if (newPercent >= MIN_PERCENT && newPercent <= MAX_PERCENT) {
    roomPercent.value = newPercent
  }
}

const stopRoomResize = () => {
  isResizingRoom.value = false
  document.removeEventListener('mousemove', handleRoomResize)
  document.removeEventListener('mouseup', stopRoomResize)
  document.body.style.cursor = ''
  document.body.style.userSelect = ''
  saveHeights()
}

// Chat height resize handlers
const startChatResize = (e: MouseEvent) => {
  e.preventDefault()
  isResizingChat.value = true
  document.addEventListener('mousemove', handleChatResize)
  document.addEventListener('mouseup', stopChatResize)
  document.body.style.cursor = 'row-resize'
  document.body.style.userSelect = 'none'
}

const handleChatResize = (e: MouseEvent) => {
  if (!isResizingChat.value || !chatPanelRef.value) return

  const panelRect = chatPanelRef.value.getBoundingClientRect()
  const newHeight = e.clientY - panelRect.top

  const maxChatHeight = window.innerHeight - 150
  if (newHeight >= MIN_CHAT_HEIGHT && newHeight <= maxChatHeight) {
    chatHeight.value = newHeight
  }
}

const stopChatResize = () => {
  isResizingChat.value = false
  document.removeEventListener('mousemove', handleChatResize)
  document.removeEventListener('mouseup', stopChatResize)
  document.body.style.cursor = ''
  document.body.style.userSelect = ''
  localStorage.setItem(STORAGE_KEY_CHAT_HEIGHT, chatHeight.value.toString())
}

onUnmounted(() => {
  // Cleanup debug function
  // @ts-expect-error - Debug function cleanup
  delete window.tunjuk_gcmp

  document.removeEventListener('mousemove', handleWidthResize)
  document.removeEventListener('mouseup', stopWidthResize)
  document.removeEventListener('mousemove', handleMapResize)
  document.removeEventListener('mouseup', stopMapResize)
  document.removeEventListener('mousemove', handleRoomResize)
  document.removeEventListener('mouseup', stopRoomResize)
  document.removeEventListener('mousemove', handleChatResize)
  document.removeEventListener('mouseup', stopChatResize)
})
</script>

<template>
  <div ref="containerRef" class="h-full flex flex-col bg-background">
    <!-- Main Content -->
    <div class="flex-1 flex overflow-hidden">
      <!-- Left Panel - Chat & Activity -->
      <div class="flex-1 flex flex-col min-w-0">
        <!-- Chat Panel (shoutbox style at top) -->
        <div
          ref="chatPanelRef"
          class="m-2 mb-0 shrink-0"
          :class="isChatMinimized ? '' : (isMobile ? 'h-28' : '')"
          :style="isChatMinimized || isMobile ? {} : { height: `${chatHeight}px` }"
        >
          <MudChatPanel v-model:minimized="isChatMinimized" class="h-full" />
        </div>

        <!-- Chat Resize Handle - hidden on mobile -->
        <div
          v-if="!isChatMinimized"
          class="hidden lg:block h-1 mx-2 bg-border hover:bg-primary/50 cursor-row-resize transition-colors shrink-0"
          :class="{ 'bg-primary/50': isResizingChat }"
          @mousedown="startChatResize"
        />

        <!-- Activity Log -->
        <div class="flex-1 m-2 border rounded-lg overflow-hidden flex flex-col min-h-0">
          <MudActivityLog ref="activityLogRef" filter="all" max-height="100%" class="flex-1" />
        </div>

        <!-- Status Bar (above command input) -->
        <MudStatusBar @logout="handleLogout" />

        <!-- Command Input -->
        <MudCommandInput ref="commandInputRef" />
      </div>

      <!-- Resize Handle (Width) - hidden on mobile -->
      <div
        class="hidden lg:block w-1 bg-border hover:bg-primary/50 cursor-col-resize transition-colors shrink-0"
        :class="{ 'bg-primary/50': isResizingWidth }"
        @mousedown="startWidthResize"
      />

      <!-- Right Panel - Map, Affects, Room - hidden on mobile -->
      <div
        ref="rightPanelRef"
        class="hidden lg:flex flex-col shrink-0"
        :style="{ width: `${rightPanelWidth}px` }"
      >
        <!-- Live Map (docked) -->
        <div
          v-if="!isMapDetached"
          class="m-2 mb-0 overflow-hidden"
          :class="[
            isMapMinimized ? 'h-auto shrink-0' : 'shrink-0',
            !isMapMinimized && (isAffectsMinimized || isRoomMinimized) ? 'flex-1' : ''
          ]"
          :style="isMapMinimized || isAffectsMinimized || isRoomMinimized ? {} : { height: `${mapPercent}%` }"
        >
          <MudMap v-model:minimized="isMapMinimized" class="h-full" @detach="handleMapDetach" />
        </div>
        <!-- Map placeholder when detached -->
        <div
          v-else
          class="m-2 mb-0 shrink-0 flex items-center justify-center border border-dashed border-border rounded-lg"
          :style="{ height: `${mapPercent}%` }"
        >
          <Button variant="outline" size="sm" class="gap-2" @click="handleMapDock">
            <Map class="h-4 w-4" />
            Dock Map
          </Button>
        </div>

        <!-- Resize Handle (Map) -->
        <div
          class="h-1 mx-2 bg-border hover:bg-primary/50 cursor-row-resize transition-colors shrink-0"
          :class="{ 'bg-primary/50': isResizingMap }"
          @mousedown="startMapResize"
        />

        <!-- Affects -->
        <div
          class="m-2 my-0 overflow-hidden"
          :class="[
            isAffectsMinimized ? 'h-auto shrink-0' : 'min-h-0',
            !isAffectsMinimized && (isMapMinimized || isRoomMinimized) ? 'flex-1' : ''
          ]"
          :style="isAffectsMinimized || isMapMinimized || isRoomMinimized ? {} : { height: `${affectsPercent}%` }"
        >
          <MudAffects v-model:minimized="isAffectsMinimized" class="h-full" @open-radar="handleOpenRadar" />
        </div>

        <!-- Resize Handle (Room) -->
        <div
          class="h-1 mx-2 bg-border hover:bg-primary/50 cursor-row-resize transition-colors shrink-0"
          :class="{ 'bg-primary/50': isResizingRoom }"
          @mousedown="startRoomResize"
        />

        <!-- Room Display -->
        <div
          class="m-2 mt-0 overflow-auto"
          :class="[
            isRoomMinimized ? 'h-auto shrink-0' : 'shrink-0',
            !isRoomMinimized && (isMapMinimized || isAffectsMinimized) ? 'flex-1' : ''
          ]"
          :style="isRoomMinimized || isMapMinimized || isAffectsMinimized ? {} : { height: `${roomPercent}%` }"
        >
          <MudRoomDisplay v-model:minimized="isRoomMinimized" />
        </div>
      </div>
    </div>

    <!-- Floating Map Window (when detached) -->
    <FloatingMapWindow v-model="isMapDetached">
      <MudMap class="h-full" @detach="handleMapDock" />
    </FloatingMapWindow>

    <!-- Floating Radar Window -->
    <FloatingMapWindow v-model="isRadarOpen" storage-key="mud-floating-radar" title="Ship Radar">
      <ShipRadar class="h-full" @detach="handleCloseRadar" />
    </FloatingMapWindow>

    <!-- God Command FAB (visible for level 57+) -->
    <GodCommandFab />

    <!-- GMCP Debug Modal (triggered from dev console) -->
    <GmcpDebugModal v-model:open="showGmcpDebug" />

    <!-- Mobile FAB Button - long-press to drag, tap to open sheet -->
    <div
      class="lg:hidden fixed z-30 touch-none select-none"
      :style="{ right: `${fabPosition.x}px`, bottom: `${fabPosition.y}px` }"
    >
      <Button
        class="h-12 w-12 rounded-full shadow-lg transition-transform"
        :class="{ 'scale-110 shadow-xl': isDraggingFab }"
        @mousedown="startFabTouch"
        @touchstart.prevent="startFabTouch"
        @click="handleFabClick"
      >
        <MapPin class="h-5 w-5" />
      </Button>
    </div>

    <!-- Mobile Bottom Sheet with Tabs -->
    <Sheet v-model:open="isMobileSheetOpen">
      <SheetContent side="bottom" class="h-[70vh] p-0">
        <SheetHeader class="sr-only">
          <SheetTitle>Game Panels</SheetTitle>
        </SheetHeader>
        <Tabs v-model="mobileActiveTab" class="h-full flex flex-col">
          <TabsList class="grid w-full grid-cols-5 rounded-none border-b">
            <TabsTrigger value="info" class="gap-1 data-[state=active]:bg-background">
              <Info class="h-4 w-4" />
              <span class="text-xs">Info</span>
            </TabsTrigger>
            <TabsTrigger value="map" class="gap-1 data-[state=active]:bg-background">
              <Map class="h-4 w-4" />
              <span class="text-xs">Map</span>
            </TabsTrigger>
            <TabsTrigger value="affects" class="gap-1 data-[state=active]:bg-background">
              <Sparkles class="h-4 w-4" />
              <span class="text-xs">Affects</span>
            </TabsTrigger>
            <TabsTrigger value="room" class="gap-1 data-[state=active]:bg-background">
              <DoorOpen class="h-4 w-4" />
              <span class="text-xs">Room</span>
            </TabsTrigger>
            <TabsTrigger value="menu" class="gap-1 data-[state=active]:bg-background">
              <Menu class="h-4 w-4" />
              <span class="text-xs">Menu</span>
            </TabsTrigger>
          </TabsList>
          <TabsContent value="info" class="flex-1 m-0 overflow-auto p-3">
            <div class="space-y-4">
              <!-- Experience -->
              <div class="space-y-2">
                <div class="flex items-center gap-2">
                  <Star class="h-4 w-4 text-purple-400" />
                  <span class="text-sm font-semibold">Experience</span>
                </div>
                <div class="relative">
                  <Progress :model-value="expPercent" class="h-6 bar-exp" />
                  <span class="absolute inset-0 flex items-center justify-center text-xs font-mono text-white drop-shadow-md">
                    {{ formatNumber(vitals.exp) }} / {{ formatNumber(vitals.tnl) }} ({{ expPercent }}%)
                  </span>
                </div>
              </div>

              <!-- Coins -->
              <div class="space-y-2">
                <div class="flex items-center gap-2">
                  <Coins class="h-4 w-4 text-yellow-400" />
                  <span class="text-sm font-semibold">Coins</span>
                </div>
                <div class="flex items-center gap-3 text-sm font-mono">
                  <span v-if="vitals.platinum" class="text-cyan-300">{{ vitals.platinum }}p</span>
                  <span v-if="vitals.gold" class="text-yellow-300">{{ vitals.gold }}g</span>
                  <span v-if="vitals.silver" class="text-gray-300">{{ vitals.silver }}s</span>
                  <span v-if="vitals.copper" class="text-orange-300">{{ vitals.copper }}c</span>
                  <span v-if="!vitals.platinum && !vitals.gold && !vitals.silver && !vitals.copper" class="text-gray-500">None</span>
                </div>
              </div>

              <!-- Quest -->
              <div v-if="quest" class="space-y-2">
                <QuestPopover :quest="quest" :quest-map="mudStore.questMap" />
              </div>
            </div>
          </TabsContent>
          <TabsContent value="map" class="flex-1 m-0 overflow-hidden p-2">
            <MudMap class="h-full" />
          </TabsContent>
          <TabsContent value="affects" class="flex-1 m-0 overflow-auto p-2">
            <MudAffects @open-radar="handleOpenRadar" />
          </TabsContent>
          <TabsContent value="room" class="flex-1 m-0 overflow-auto p-2">
            <MudRoomDisplay />
          </TabsContent>
          <TabsContent value="menu" class="flex-1 m-0 overflow-auto p-3">
            <div class="grid grid-cols-3 gap-2">
              <Button variant="outline" class="h-14 flex-col gap-1" @click="navigateTo('/')">
                <Home class="h-5 w-5" />
                <span class="text-xs">Home</span>
              </Button>
              <Button variant="outline" class="h-14 flex-col gap-1" @click="navigateTo('/pvp')">
                <Swords class="h-5 w-5" />
                <span class="text-xs">PvP</span>
              </Button>
              <Button variant="outline" class="h-14 flex-col gap-1" @click="navigateTo('/forum')">
                <MessageSquare class="h-5 w-5" />
                <span class="text-xs">Forum</span>
              </Button>
              <Button variant="outline" class="h-14 flex-col gap-1" @click="navigateTo('/auction')">
                <Gavel class="h-5 w-5" />
                <span class="text-xs">Auction</span>
              </Button>
              <Button variant="outline" class="h-14 flex-col gap-1" @click="navigateTo('/wiki/map')">
                <Map class="h-5 w-5" />
                <span class="text-xs">Wiki</span>
              </Button>
              <Button variant="outline" class="h-14 flex-col gap-1" @click="navigateTo('/guide')">
                <BookOpen class="h-5 w-5" />
                <span class="text-xs">Guide</span>
              </Button>
              <Button variant="outline" class="h-14 flex-col gap-1" @click="navigateTo('/pvp/stats')">
                <BarChart3 class="h-5 w-5" />
                <span class="text-xs">Stats</span>
              </Button>
              <Button variant="outline" class="h-14 flex-col gap-1" @click="navigateTo(`/user/${accountName}`)">
                <User class="h-5 w-5" />
                <span class="text-xs">Profile</span>
              </Button>
              <Button variant="outline" class="h-14 flex-col gap-1" @click="navigateTo('/status')">
                <Bell class="h-5 w-5" />
                <span class="text-xs">Status</span>
              </Button>
            </div>
          </TabsContent>
        </Tabs>
      </SheetContent>
    </Sheet>
  </div>
</template>

<style scoped>
/* Exp bar color */
:deep(.bar-exp [data-slot="progress-indicator"]) {
  background-color: rgb(168 85 247) !important; /* purple-500 */
}
</style>
