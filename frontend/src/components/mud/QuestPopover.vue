<script setup lang="ts">
import { ref, computed } from 'vue'
import { Beer, ZoomIn, ZoomOut, RotateCcw, X } from 'lucide-vue-next'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { parseAnsiToHtml } from '@/utils/ansiParser'
import type { MudQuest } from '@/types/mud'

defineProps<{
  quest: MudQuest
  questMap: string | null
}>()

// Popover open state
const isOpen = ref(false)

// Map zoom controls
const mapZoom = ref(1.0)
const mapFontSize = computed(() => `${12 * mapZoom.value}px`)

function zoomIn() {
  mapZoom.value = Math.min(2.0, mapZoom.value + 0.25)
}

function zoomOut() {
  mapZoom.value = Math.max(0.5, mapZoom.value - 0.25)
}

function resetZoom() {
  mapZoom.value = 1.0
}

function closePopover() {
  isOpen.value = false
}

// Prevent closing on outside click or escape
function preventClose(event: Event) {
  event.preventDefault()
}
</script>

<template>
  <TooltipProvider>
    <Tooltip>
      <Popover v-model:open="isOpen">
        <TooltipTrigger as-child>
          <PopoverTrigger as-child>
            <div class="flex items-center gap-1 cursor-pointer hover:opacity-80 transition-opacity">
              <Beer class="h-4 w-4 text-amber-400" />
              <Badge variant="secondary" class="text-xs">{{ quest.remaining }}</Badge>
            </div>
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent v-if="!isOpen">
          <p class="font-semibold">Bartender Quest</p>
          <p class="text-xs text-muted-foreground">Click for details</p>
        </TooltipContent>
    <PopoverContent
      class="w-[500px] p-4"
      side="bottom"
      align="start"
      :side-offset="8"
      @interact-outside="preventClose"
      @escape-key-down="preventClose"
    >
      <!-- Header with close button -->
      <div class="flex items-center justify-between mb-2">
        <h4 class="font-semibold text-amber-400">Bartender Quest</h4>
        <Button
          variant="ghost"
          size="icon"
          class="h-6 w-6 -mr-2 -mt-2"
          @click="closePopover"
        >
          <X class="h-4 w-4" />
        </Button>
      </div>

      <!-- Quest Info Section -->
      <div class="space-y-2">
        <template v-if="quest.active">
          <p v-html="parseAnsiToHtml(quest.target)" class="text-sm" />
          <p v-if="quest.type === 'kill'" class="text-sm text-muted-foreground">
            Progress: {{ quest.killCount }} / {{ quest.killRequired }}
          </p>
        </template>
        <template v-else>
          <p class="text-muted-foreground">No active quest</p>
        </template>
        <p class="text-xs text-muted-foreground">
          {{ quest.remaining }} quests remaining today
        </p>
      </div>

      <!-- Map Section (if bought) -->
      <div v-if="questMap" class="mt-4 border-t border-border pt-4">
        <div class="flex items-center justify-between mb-2">
          <h4 class="font-semibold text-sm">Quest Map</h4>
          <div class="flex gap-1">
            <Button
              variant="ghost"
              size="icon"
              class="h-6 w-6"
              @click="zoomOut"
              :disabled="mapZoom <= 0.5"
            >
              <ZoomOut class="h-3 w-3" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              class="h-6 w-6"
              @click="resetZoom"
            >
              <RotateCcw class="h-3 w-3" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              class="h-6 w-6"
              @click="zoomIn"
              :disabled="mapZoom >= 2.0"
            >
              <ZoomIn class="h-3 w-3" />
            </Button>
          </div>
        </div>
        <div class="bg-black rounded overflow-auto max-h-[300px] scrollbar-thin scrollbar-thumb-gray-700 scrollbar-track-transparent">
          <pre
            class="font-mono leading-tight whitespace-pre p-2"
            :style="{ fontSize: mapFontSize }"
            v-html="parseAnsiToHtml(questMap)"
          />
        </div>
      </div>
    </PopoverContent>
      </Popover>
    </Tooltip>
  </TooltipProvider>
</template>
