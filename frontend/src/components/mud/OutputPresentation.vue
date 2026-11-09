<script setup lang="ts">
import { computed } from 'vue'
import { parseOutputPresentation } from '../../utils/outputPresentation.js'
import { outputColorClasses } from '../../utils/ansiParser.js'
import { chatColor } from '../../utils/chatPalette.js'

const props = withDefaults(
  defineProps<{
    presentation?: unknown
    palette?: 'console' | 'authored' | 'chat'
  }>(),
  { palette: 'console' },
)
const emit = defineEmits<{ command: [target: string] }>()
const snapshot = computed(() => parseOutputPresentation(props.presentation))
const groups = computed(() => {
  const value = snapshot.value
  if (!value) return []
  const text = Array.from(value.text)
  const result = []
  let offset = 0,
    runIndex = 0,
    linkIndex = 0
  while (offset < text.length) {
    const link = value.links?.[linkIndex]
    const active = link?.start === offset ? link : undefined
    const end = active?.end ?? link?.start ?? text.length
    const parts = []
    while (offset < end) {
      const run = value.runs[runIndex]!
      const last = Math.min(end, run[1])
      parts.push({
        start: offset,
        text: text.slice(offset, last).join(''),
        class:
          props.palette === 'chat'
            ? undefined
            : outputColorClasses(run[2], run[3], value.underline, props.palette === 'console'),
        style:
          props.palette !== 'chat'
            ? undefined
            : {
                color: chatColor(run[2]),
                backgroundColor: chatColor(run[3] ? (run[3] & 7) + 16 : 0, true),
                fontWeight: run[2] >= 24 ? 'bold' : 'normal',
                textDecoration: run[3] >= 24 && value.underline ? 'underline' : 'none',
              },
      })
      offset = last
      if (offset === run[1]) runIndex++
    }
    result.push({ start: parts[0]!.start, link: active, parts })
    if (active) linkIndex++
  }
  return result
})
</script>

<template>
  <span v-if="snapshot" class="whitespace-pre-wrap break-words" data-output-presentation>
    <template v-for="group in groups" :key="group.start">
      <button v-if="group.link?.kind === 'command'" type="button"
        class="inline-block max-w-full cursor-pointer bg-transparent p-0 text-left align-baseline text-inherit underline decoration-dotted underline-offset-2 [font:inherit]"
        :title="group.link.target" @click.stop="emit('command', group.link.target)" @keydown.stop>
        <span v-for="part in group.parts" :key="part.start" :class="part.class" :style="part.style">{{ part.text }}</span>
      </button>
      <a v-else-if="group.link?.kind === 'url'" :href="group.link.target" target="_blank"
        rel="noopener noreferrer" :title="group.link.target"
        class="cursor-pointer text-inherit underline decoration-dotted underline-offset-2" @click.stop @keydown.stop>
        <span v-for="part in group.parts" :key="part.start" :class="part.class" :style="part.style">{{ part.text }}</span>
      </a>
      <span v-else><span v-for="part in group.parts" :key="part.start" :class="part.class" :style="part.style">{{ part.text }}</span></span>
    </template>
  </span>
  <slot v-else />
</template>
