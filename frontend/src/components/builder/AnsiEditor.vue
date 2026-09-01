<template>
  <div class="ansi-editor border border-gray-700 rounded-lg bg-gray-900">
    <!-- Toolbar -->
    <div
      v-if="editor"
      class="flex items-center gap-1 border-b border-gray-700 bg-gray-800 p-2"
    >
      <!-- MUD Colors Dropdown -->
      <div class="relative" ref="colorDropdownRef">
        <button
          type="button"
          @click="showColorDropdown = !showColorDropdown"
          class="flex items-center gap-1 rounded bg-gray-700 px-2 py-1.5 text-gray-300 transition-colors hover:bg-gray-600"
          title="MUD Colors"
        >
          <Palette class="h-4 w-4" />
          <span class="text-xs">Colors</span>
          <ChevronDown class="h-3 w-3" />
        </button>

        <!-- Color Dropdown -->
        <div
          v-if="showColorDropdown"
          class="absolute left-0 top-full z-50 mt-1 w-48 rounded-lg border border-gray-700 bg-gray-800 p-2 shadow-xl"
        >
          <div class="grid grid-cols-1 gap-1">
            <button
              v-for="color in MUD_COLORS"
              :key="color.code"
              type="button"
              @click="applyMudColor(color.code)"
              class="flex items-center gap-2 rounded px-2 py-1 text-left text-sm transition-colors hover:bg-gray-700"
            >
              <span :class="[color.class, 'font-semibold']">A</span>
              <span class="text-gray-300">{{ color.name }}</span>
              <span class="ml-auto font-mono text-xs text-gray-500">{{
                color.code
              }}</span>
            </button>
          </div>

          <!-- Remove Color -->
          <div class="mt-2 border-t border-gray-700 pt-2">
            <button
              type="button"
              @click="removeMudColor"
              class="flex w-full items-center gap-2 rounded px-2 py-1 text-left text-sm text-gray-400 transition-colors hover:bg-gray-700"
            >
              <X class="h-4 w-4" />
              <span>Remove Color</span>
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- Editor Content -->
    <EditorContent
      :editor="editor"
      class="prose prose-invert max-w-none"
      :style="{ minHeight: minHeight }"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, watch, onMounted, onBeforeUnmount } from 'vue'
import { useEditor, EditorContent } from '@tiptap/vue-3'
import StarterKit from '@tiptap/starter-kit'
import { TextStyle } from '@tiptap/extension-text-style'
import { MudColor, MUD_COLORS } from '@/components/forum/editor/MudColorExtension'
import { htmlToAnsi, ansiToHtmlWithStyles } from '@/utils/ansiParser'
import { Palette, ChevronDown, X } from 'lucide-vue-next'

const props = withDefaults(
  defineProps<{
    modelValue: string
    placeholder?: string
    minHeight?: string
    singleLine?: boolean
  }>(),
  {
    placeholder: 'Enter text...',
    minHeight: '100px',
    singleLine: false,
  },
)

const emit = defineEmits<{
  (e: 'update:modelValue', value: string): void
}>()

// Color dropdown state
const showColorDropdown = ref(false)
const colorDropdownRef = ref<HTMLElement>()

// Initialize editor
const editor = useEditor({
  content: ansiToHtmlWithStyles(props.modelValue),
  extensions: [
    StarterKit.configure({
      // Disable all formatting except paragraphs
      bold: false,
      italic: false,
      strike: false,
      code: false,
      codeBlock: false,
      blockquote: false,
      bulletList: false,
      orderedList: false,
      heading: false,
      horizontalRule: false,
      hardBreak: props.singleLine ? false : undefined,
    }),
    TextStyle,
    MudColor,
  ],
  editorProps: {
    attributes: {
      class: 'min-h-[50px] focus:outline-none p-3 text-gray-300',
    },
    handleKeyDown: props.singleLine
      ? (view, event) => {
          // Prevent Enter key in single-line mode
          if (event.key === 'Enter') {
            return true
          }
          return false
        }
      : undefined,
  },
  onUpdate: ({ editor }) => {
    const ansi = htmlToAnsi(editor.getHTML())
    emit('update:modelValue', ansi)
  },
})

// Watch for external changes to modelValue
watch(
  () => props.modelValue,
  (newValue) => {
    if (editor.value) {
      const currentAnsi = htmlToAnsi(editor.value.getHTML())
      if (currentAnsi !== newValue) {
        editor.value.commands.setContent(ansiToHtmlWithStyles(newValue))
      }
    }
  },
)

// Apply MUD color to selection
function applyMudColor(colorCode: string) {
  if (editor.value) {
    editor.value.chain().focus().setMudColor(colorCode).run()
    showColorDropdown.value = false
  }
}

// Remove MUD color from selection
function removeMudColor() {
  if (editor.value) {
    editor.value.chain().focus().unsetMudColor().run()
    showColorDropdown.value = false
  }
}

// Close dropdown when clicking outside
function handleClickOutside(event: MouseEvent) {
  if (colorDropdownRef.value && !colorDropdownRef.value.contains(event.target as Node)) {
    showColorDropdown.value = false
  }
}

onMounted(() => {
  document.addEventListener('click', handleClickOutside)
})

onBeforeUnmount(() => {
  document.removeEventListener('click', handleClickOutside)
  editor.value?.destroy()
})
</script>

<style scoped>
/* TipTap Editor Styles */
.ansi-editor :deep(.tiptap) {
  color: rgb(209 213 219);
}

.ansi-editor :deep(.tiptap p.is-editor-empty:first-child::before) {
  color: #6b7280;
  content: attr(data-placeholder);
  float: left;
  height: 0;
  pointer-events: none;
}

.ansi-editor :deep(.tiptap p) {
  margin: 0;
}
</style>
