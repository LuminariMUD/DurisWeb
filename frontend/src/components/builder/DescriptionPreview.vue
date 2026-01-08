<script setup lang="ts">
import { computed } from 'vue'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Eye } from 'lucide-vue-next'

const props = defineProps<{
  text: string
  title?: string
}>()

// MUD color code to CSS class mapping
const colorMap: Record<string, string> = {
  // Lowercase (normal)
  '&+r': 'color: #aa0000',
  '&+g': 'color: #00aa00',
  '&+b': 'color: #0000aa',
  '&+y': 'color: #aaaa00',
  '&+m': 'color: #aa00aa',
  '&+c': 'color: #00aaaa',
  '&+w': 'color: #aaaaaa',
  '&+l': 'color: #555555',
  // Uppercase (bright)
  '&+R': 'color: #ff5555',
  '&+G': 'color: #55ff55',
  '&+B': 'color: #5555ff',
  '&+Y': 'color: #ffff55',
  '&+M': 'color: #ff55ff',
  '&+C': 'color: #55ffff',
  '&+W': 'color: #ffffff',
  '&+L': 'color: #808080',
  // Special
  '&N': 'color: #404040',
  '&n': 'color: #aaaaaa',
}

// Convert MUD color codes to HTML spans
function parseColorCodes(text: string): string {
  if (!text) return ''

  let result = ''
  let i = 0
  let currentStyle = ''

  while (i < text.length) {
    // Check for color code starting with &
    if (text[i] === '&' && i + 1 < text.length) {
      // Check for &+X pattern (3 chars)
      if (text[i + 1] === '+' && i + 2 < text.length) {
        const code = text.substring(i, i + 3)
        if (colorMap[code]) {
          // Close previous span if open
          if (currentStyle) {
            result += '</span>'
          }
          currentStyle = colorMap[code]
          result += `<span style="${currentStyle}">`
          i += 3
          continue
        }
      }
      // Check for &X pattern (2 chars) - &n, &N
      const code2 = text.substring(i, i + 2)
      if (colorMap[code2]) {
        if (currentStyle) {
          result += '</span>'
        }
        if (code2 === '&n') {
          // Reset - no new span
          currentStyle = ''
        } else {
          currentStyle = colorMap[code2]
          result += `<span style="${currentStyle}">`
        }
        i += 2
        continue
      }
    }

    // Escape HTML special characters
    if (text[i] === '<') {
      result += '&lt;'
    } else if (text[i] === '>') {
      result += '&gt;'
    } else if (text[i] === '&') {
      result += '&amp;'
    } else if (text[i] === '\n') {
      result += '<br>'
    } else {
      result += text[i]
    }
    i++
  }

  // Close any open span
  if (currentStyle) {
    result += '</span>'
  }

  return result
}

const renderedHtml = computed(() => parseColorCodes(props.text))
</script>

<template>
  <Card>
    <CardHeader class="py-3">
      <CardTitle class="text-sm flex items-center gap-2">
        <Eye class="h-4 w-4" />
        {{ title || 'Preview' }}
      </CardTitle>
    </CardHeader>
    <CardContent>
      <div
        class="font-mono text-sm bg-black text-gray-300 p-4 rounded-md whitespace-pre-wrap min-h-[100px] max-h-[300px] overflow-y-auto"
        v-html="renderedHtml"
      />
    </CardContent>
  </Card>
</template>
