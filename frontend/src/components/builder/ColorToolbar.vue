<script setup lang="ts">
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Palette } from 'lucide-vue-next'

const emit = defineEmits<{
  (e: 'insert', code: string): void
}>()

// MUD color codes with their display colors
const colorCodes = [
  // Normal colors
  { code: '&+r', name: 'Red', color: '#ff5555', dark: false },
  { code: '&+g', name: 'Green', color: '#55ff55', dark: false },
  { code: '&+b', name: 'Blue', color: '#5555ff', dark: false },
  { code: '&+y', name: 'Yellow', color: '#ffff55', dark: false },
  { code: '&+m', name: 'Magenta', color: '#ff55ff', dark: false },
  { code: '&+c', name: 'Cyan', color: '#55ffff', dark: false },
  { code: '&+w', name: 'White', color: '#ffffff', dark: false },
  // Bright colors (uppercase)
  { code: '&+R', name: 'Bright Red', color: '#ff0000', dark: false },
  { code: '&+G', name: 'Bright Green', color: '#00ff00', dark: false },
  { code: '&+B', name: 'Bright Blue', color: '#0000ff', dark: false },
  { code: '&+Y', name: 'Bright Yellow', color: '#ffff00', dark: false },
  { code: '&+M', name: 'Bright Magenta', color: '#ff00ff', dark: false },
  { code: '&+C', name: 'Bright Cyan', color: '#00ffff', dark: false },
  { code: '&+W', name: 'Bright White', color: '#ffffff', dark: false },
  // Dark colors
  { code: '&+L', name: 'Gray', color: '#808080', dark: false },
  { code: '&N', name: 'Dark Gray', color: '#404040', dark: true },
  // Reset
  { code: '&n', name: 'Reset', color: '#aaaaaa', dark: false },
]

function insertCode(code: string) {
  emit('insert', code)
}
</script>

<template>
  <TooltipProvider>
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" class="h-8">
          <Palette class="h-4 w-4 mr-2" />
          Colors
        </Button>
      </PopoverTrigger>
      <PopoverContent class="w-80" align="start">
        <div class="space-y-3">
          <div class="text-sm font-medium">Insert Color Code</div>

          <!-- Color grid -->
          <div class="grid grid-cols-6 gap-1">
            <Tooltip v-for="item in colorCodes" :key="item.code">
              <TooltipTrigger asChild>
                <button
                  class="w-10 h-8 rounded border text-xs font-mono flex items-center justify-center hover:ring-2 hover:ring-primary transition-all"
                  :style="{
                    backgroundColor: item.dark ? item.color : 'transparent',
                    color: item.dark ? '#ffffff' : item.color,
                    borderColor: item.color,
                  }"
                  @click="insertCode(item.code)"
                >
                  {{ item.code.replace('&', '') }}
                </button>
              </TooltipTrigger>
              <TooltipContent>
                <p>{{ item.name }} ({{ item.code }})</p>
              </TooltipContent>
            </Tooltip>
          </div>

          <!-- Quick reference -->
          <div class="text-xs text-muted-foreground border-t pt-2">
            <p class="font-medium mb-1">Usage:</p>
            <p>&+R = Red, &+G = Green, &+B = Blue</p>
            <p>&n = Reset to default color</p>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  </TooltipProvider>
</template>
